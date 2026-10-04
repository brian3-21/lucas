import { fail, redirect } from '@sveltejs/kit';
import { and, desc, eq, sum } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	bucketAllocations,
	bucketTransfers,
	categories,
	movements,
	users,
	type BucketKind
} from '$lib/server/db/schema';
import { splitAmount } from '$lib/buckets';
import { BUCKET_LABELS } from '$lib/bucket-meta';
import {
	incomeSchema,
	movementIdSchema,
	movementUpdateSchema
} from '$lib/validation/movements';
import { transferSchema } from '$lib/validation/transfers';
import { fieldErrors, pick, type FieldErrors } from '$lib/forms';
import type { Actions, PageServerLoad } from './$types';

// Marca para abortar la transacción cuando el bolsillo de origen no tiene saldo.
// Va en el mensaje de la excepción porque es lo único que llega intacto al catch:
// cualquier otra cosa se propaga como error de verdad.
const SIN_SALDO = 'SIN_SALDO';

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

// Las tres filas que van a bucket_allocations para un ingreso. Alta y edición las
// necesitan igual y, escritas por separado, acabarían divergiendo.
function filasReparto(userId: string, movementId: string, amount: number, pcts: {
	short: number;
	medium: number;
}) {
	const reparto = splitAmount(amount, pcts);
	return [
		{ userId, movementId, bucket: 'short_term' as const, amount: reparto.short_term.toFixed(2) },
		{ userId, movementId, bucket: 'medium_term' as const, amount: reparto.medium_term.toFixed(2) },
		{ userId, movementId, bucket: 'long_term' as const, amount: reparto.long_term.toFixed(2) }
	];
}

export const load: PageServerLoad = async ({ locals }) => {
	// El hook ya redirige a /login si no hay sesión; esto solo satisface a TS.
	if (!locals.user) redirect(303, '/login');
	const userId = locals.user.id;

	const [categoriasUsuario, recentMovements, sumasPorBolsillo, recentTransfers] = await Promise.all([
		// Las de los dos tipos, no solo las de ingreso: al editar un gasto hay que
		// ofrecer las suyas. El diálogo filtra por el tipo del movimiento.
		db
			.select()
			.from(categories)
			.where(eq(categories.userId, userId))
			.orderBy(categories.name),
		db.query.movements.findMany({
			where: eq(movements.userId, userId),
			with: { category: true },
			orderBy: [desc(movements.date), desc(movements.createdAt)],
			limit: 10
		}),
		// Suma con signo: los ingresos suman y las salidas de una transferencia
		// restan, así que el saldo de cada tarjeta sale de aquí sin más contabilidad.
		db
			.select({
				bucket: bucketAllocations.bucket,
				total: sum(bucketAllocations.amount).mapWith(Number)
			})
			.from(bucketAllocations)
			.where(eq(bucketAllocations.userId, userId))
			.groupBy(bucketAllocations.bucket),
		// Los traslados no son movimientos, pero forman parte del mismo historial:
		// sin ellos no se ve por dónde pasó el dinero.
		db
			.select()
			.from(bucketTransfers)
			.where(eq(bucketTransfers.userId, userId))
			.orderBy(desc(bucketTransfers.date), desc(bucketTransfers.createdAt))
			.limit(10)
	]);

	const bucketTotals: Record<BucketKind, number> = {
		short_term: 0,
		medium_term: 0,
		long_term: 0
	};
	for (const fila of sumasPorBolsillo) {
		bucketTotals[fila.bucket] = fila.total;
	}

	// La clave del return no puede llamarse `categories`: la importaría la tabla de
	// Drizzle y se colaría en `data` en vez de las filas del usuario.
	return { categories: categoriasUsuario, recentMovements, recentTransfers, bucketTotals };
};

export const actions: Actions = {
	addIncome: async (event) => {
		if (!event.locals.user) redirect(303, '/login');
		const userId = event.locals.user.id;

		const formData = await event.request.formData();
		const values = pick(formData, ['amount', 'date', 'description', 'categoryId']);

		// Los opcionales llegan como "" desde el formulario; el schema quiere undefined.
		const parsed = incomeSchema.safeParse({
			...values,
			description: values.description || undefined,
			categoryId: values.categoryId || undefined
		});

		if (!parsed.success) {
			return fail(400, { errors: fieldErrors(parsed.error), values });
		}

		const { amount, date, description, categoryId } = parsed.data;

		// La categoría debe existir, ser del usuario y ser de ingresos. Sin esta
		// comprobación, cualquiera podría etiquetar sus movimientos con la
		// categoría de otro usuario con solo cambiar el value del <select>.
		if (categoryId) {
			const [owned] = await db
				.select({ id: categories.id })
				.from(categories)
				.where(
					and(
						eq(categories.id, categoryId),
						eq(categories.userId, userId),
						eq(categories.kind, 'income')
					)
				)
				.limit(1);

			if (!owned) {
				// Tipado como FieldErrors (igual que fieldErrors()) para que
				// ActionData no se parta en dos formas incompatibles.
				const categoriaInvalida: FieldErrors = { categoryId: ['Categoría no válida'] };
				return fail(400, { errors: categoriaInvalida, values });
			}
		}

		const [usuario] = await db
			.select({ splitShort: users.splitShort, splitMedium: users.splitMedium })
			.from(users)
			.where(eq(users.id, userId))
			.limit(1);

		// numeric llega como string; fallback a los defaults por robustez.
		const pcts = {
			short: Number(usuario?.splitShort ?? 60),
			medium: Number(usuario?.splitMedium ?? 30)
		};

		// El movimiento y sus tres repartos se guardan juntos o no se guarda nada.
		await db.transaction(async (tx) => {
			const [movimiento] = await tx
				.insert(movements)
				.values({
					userId,
					type: 'income',
					// numeric se guarda como string; toFixed fija los 2 decimales.
					amount: amount.toFixed(2),
					date,
					description: description ?? null,
					categoryId: categoryId ?? null
				})
				.returning({ id: movements.id });

			await tx.insert(bucketAllocations).values(filasReparto(userId, movimiento.id, amount, pcts));
		});

		return { success: true };
	},

	updateMovement: async (event) => {
		if (!event.locals.user) redirect(303, '/login');
		const userId = event.locals.user.id;

		const formData = await event.request.formData();
		const values = pick(formData, ['id', 'amount', 'date', 'description', 'categoryId']);

		const parsed = movementUpdateSchema.safeParse({
			...values,
			description: values.description || undefined,
			categoryId: values.categoryId || undefined
		});

		if (!parsed.success) {
			return fail(400, { errors: fieldErrors(parsed.error), values });
		}

		const { id, amount, date, description, categoryId } = parsed.data;

		// El movimiento se lee antes de tocar nada: de aquí salen el tipo (para validar
		// la categoría) y el monto anterior (para saber si hay que rehacer el reparto).
		const [actual] = await db
			.select({ type: movements.type, amount: movements.amount })
			.from(movements)
			.where(and(eq(movements.id, id), eq(movements.userId, userId)))
			.limit(1);

		if (!actual) {
			return fail(404, { errors: {}, values, message: 'Ese movimiento ya no está' });
		}

		// Misma comprobación que al dar de alta, pero además la categoría tiene que
		// ser del mismo tipo que el movimiento: un gasto no se etiqueta como ingreso.
		if (categoryId) {
			const [owned] = await db
				.select({ id: categories.id })
				.from(categories)
				.where(
					and(
						eq(categories.id, categoryId),
						eq(categories.userId, userId),
						eq(categories.kind, actual.type)
					)
				)
				.limit(1);

			if (!owned) {
				const categoriaInvalida: FieldErrors = { categoryId: ['Categoría no válida'] };
				return fail(400, { errors: categoriaInvalida, values });
			}
		}

		// Solo se rehace el reparto si el monto cambió: corregir una descripción no
		// debe tocar las tarjetas de los bolsillos.
		const cambiaMonto = actual.amount !== amount.toFixed(2);

		let pcts = { short: 60, medium: 30 };
		if (cambiaMonto && actual.type === 'income') {
			const [usuario] = await db
				.select({ splitShort: users.splitShort, splitMedium: users.splitMedium })
				.from(users)
				.where(eq(users.id, userId))
				.limit(1);

			pcts = {
				short: Number(usuario?.splitShort ?? 60),
				medium: Number(usuario?.splitMedium ?? 30)
			};
		}

		// El movimiento y su reparto se escriben juntos: un ingreso con el monto
		// viejo en las tarjetas y el nuevo en el historial sería peor que no guardar.
		await db.transaction(async (tx) => {
			await tx
				.update(movements)
				.set({ amount: amount.toFixed(2), date, description: description ?? null, categoryId: categoryId ?? null })
				.where(and(eq(movements.id, id), eq(movements.userId, userId)));

			if (cambiaMonto && actual.type === 'income') {
				await tx.delete(bucketAllocations).where(eq(bucketAllocations.movementId, id));
				await tx.insert(bucketAllocations).values(filasReparto(userId, id, amount, pcts));
			}
		});

		return { success: true };
	},

	deleteMovement: async (event) => {
		if (!event.locals.user) redirect(303, '/login');
		const userId = event.locals.user.id;

		// Esta acción no repinta ningún campo del formulario de ingreso, pero las
		// dos formas de fallo comparten su estructura con addIncome: si no, el
		// ActionData se parte en una unión y `form?.errors` deja de compilar.
		const sinValores = { errors: {} as FieldErrors, values: {} as Record<string, string> };

		const formData = await event.request.formData();
		const parsed = movementIdSchema.safeParse(formData.get('id'));

		if (!parsed.success) {
			return fail(400, { ...sinValores, message: 'Movimiento no válido' });
		}

		// El userId va en el where y no solo como filtro posterior: sin él, cambiando
		// el id del <input hidden> se podría borrar el movimiento de otro usuario.
		// Los repartos por bolsillos caen en cascada (bucket_allocations.movement_id).
		const [borrado] = await db
			.delete(movements)
			.where(and(eq(movements.id, parsed.data), eq(movements.userId, userId)))
			.returning({ id: movements.id });

		// 0 filas = el id no existe o no es de este usuario. No se distingue cuál
		// de los dos casos: responder distinto revelaría ids ajenos.
		if (!borrado) {
			return fail(404, { ...sinValores, message: 'Ese movimiento ya no está' });
		}

		return { success: true };
	},

	// Mueve dinero de un bolsillo a otro. El total entre los tres no cambia: solo
	// se escriben las dos filas del traslado (una − y otra +) y, como van en la
	// misma transacción, el dinero nunca se queda a medio camino.
	transferBuckets: async (event) => {
		if (!event.locals.user) redirect(303, '/login');
		const userId = event.locals.user.id;

		const formData = await event.request.formData();
		const values = pick(formData, ['from', 'to', 'amount', 'date', 'description']);

		const parsed = transferSchema.safeParse({
			...values,
			description: values.description || undefined
		});

		if (!parsed.success) {
			return fail(400, { errors: fieldErrors(parsed.error), values });
		}

		const { from, to, amount, date, description } = parsed.data;

		// El saldo del bolsillo no lo puede imponer ningún CHECK: depende de todas
		// las filas anteriores. Sale del propio libro mayor dentro de la
		// transacción, y con la fila del usuario bloqueada para que dos traslados
		// simultáneos no puedan leer el mismo saldo y vaciar un bolsillo.
		try {
			await db.transaction(async (tx) => {
				await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');

				const [saldo] = await tx
					.select({ total: sum(bucketAllocations.amount).mapWith(Number) })
					.from(bucketAllocations)
					.where(
						and(eq(bucketAllocations.userId, userId), eq(bucketAllocations.bucket, from))
					);

				// round2 en los dos lados: sin él, un saldo como 1000.005 podría
				// rechazar un retiro de 1000.00 por un decimal de más o de menos.
				if (round2(amount) > round2(saldo?.total ?? 0)) {
					throw new Error(SIN_SALDO);
				}

				const [traslado] = await tx
					.insert(bucketTransfers)
					.values({
						userId,
						from,
						to,
						amount: amount.toFixed(2),
						date,
						description: description ?? null
					})
					.returning({ id: bucketTransfers.id });

				await tx.insert(bucketAllocations).values([
					{
						userId,
						transferId: traslado.id,
						bucket: from,
						amount: round2(-amount).toFixed(2)
					},
					{
						userId,
						transferId: traslado.id,
						bucket: to,
						amount: amount.toFixed(2)
					}
				]);
			});
		} catch (error) {
			// La comprobación del saldo vive dentro de la transacción y la única
			// forma de abortarla es lanzar. Solo esta marca se traduce a un
			// mensaje; cualquier otro error se propaga.
			if (error instanceof Error && error.message === SIN_SALDO) {
				const sinSaldo: FieldErrors = {
					amount: [`No hay saldo suficiente en ${BUCKET_LABELS[from]}`]
				};
				return fail(400, { errors: sinSaldo, values });
			}
			throw error;
		}

		return { success: true };
	}
};
