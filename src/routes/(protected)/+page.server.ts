import { fail, redirect } from '@sveltejs/kit';
import { and, eq, sum } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	bucketAdjustments,
	bucketAllocations,
	bucketTransfers,
	categories,
	movements,
	users,
	type BucketKind
} from '$lib/server/db/schema';
import { filasReparto } from '$lib/server/allocations';
import { BUCKET_LABELS } from '$lib/bucket-meta';
import { incomeSchema } from '$lib/validation/movements';
import { transferSchema } from '$lib/validation/transfers';
import { adjustmentSchema } from '$lib/validation/adjustments';
import { fieldErrors, pick, type FieldErrors } from '$lib/forms';
import type { Actions, PageServerLoad } from './$types';

// Marca para abortar la transacción cuando el bolsillo de origen no tiene saldo.
// Va en el mensaje de la excepción porque es lo único que llega intacto al catch:
// cualquier otra cosa se propaga como error de verdad.
const SIN_SALDO = 'SIN_SALDO';

// Igual que SIN_SALDO pero para un ajuste que no cambia nada: contar exactamente
// lo que el sistema ya tiene anotado no es un evento, es un error de dedo.
const SIN_CAMBIO = 'SIN_CAMBIO';

function round2(n: number): number {
	return Math.round(n * 100) / 100;
}

export const load: PageServerLoad = async ({ locals }) => {
	// El hook ya redirige a /login si no hay sesión; esto solo satisface a TS.
	if (!locals.user) redirect(303, '/login');
	const userId = locals.user.id;

	const [categoriasUsuario, sumasPorBolsillo] = await Promise.all([
		// El diálogo de alta filtra por el tipo del movimiento; se traen todas
		// para no atar la consulta a un solo tipo.
		db
			.select()
			.from(categories)
			.where(eq(categories.userId, userId))
			.orderBy(categories.name),
		// Suma con signo: los ingresos suman y las salidas de una transferencia
		// restan, así que el saldo de cada tarjeta sale de aquí sin más contabilidad.
		db
			.select({
				bucket: bucketAllocations.bucket,
				total: sum(bucketAllocations.amount).mapWith(Number)
			})
			.from(bucketAllocations)
			.where(eq(bucketAllocations.userId, userId))
			.groupBy(bucketAllocations.bucket)
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
	return {
		categories: categoriasUsuario,
		bucketTotals
	};
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
	},

	// Quita dinero de un bolsillo, de las dos maneras que ofrece la UI: un gasto
	// directo ('manual') o la diferencia entre lo que el usuario cuenta tener y lo
	// que el sistema tiene anotado ('difference'). Ambas escriben un único delta
	// con signo en el libro mayor, así que un gasto baja la tarjeta y una corrección
	// al alza la sube.
	adjustBucket: async (event) => {
		if (!event.locals.user) redirect(303, '/login');
		const userId = event.locals.user.id;

		const formData = await event.request.formData();
		const values = pick(formData, ['bucket', 'mode', 'amount', 'countedAmount', 'date', 'description']);

		const parsed = adjustmentSchema.safeParse({
			...values,
			description: values.description || undefined
		});

		if (!parsed.success) {
			return fail(400, { errors: fieldErrors(parsed.error), values });
		}

		const { bucket, mode, amount, countedAmount, date, description } = parsed.data;

		try {
			await db.transaction(async (tx) => {

				await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for('update');

				const [saldo] = await tx
					.select({ total: sum(bucketAllocations.amount).mapWith(Number) })
					.from(bucketAllocations)
					.where(
						and(eq(bucketAllocations.userId, userId), eq(bucketAllocations.bucket, bucket))
					);

				const saldoActual = round2(saldo?.total ?? 0);

				// El delta se calcula aquí y no antes, con el saldo de verdad. En modo
				// 'manual' el cliente no puede fijarlo; en 'difference' no podría
				// calcularlo sin conocer estas mismas filas.
				const delta =
					mode === 'manual'
						? round2(-(amount as number))
						: round2((countedAmount as number) - saldoActual);

				if (delta === 0) throw new Error(SIN_CAMBIO);

				// round2 en los dos lados: sin él, un saldo como 1000.005 podría
				// rechazar un gasto de 1000.00 por un decimal de más o de menos.
				if (round2(saldoActual + delta) < 0) throw new Error(SIN_SALDO);

				const [ajuste] = await tx
					.insert(bucketAdjustments)
					.values({
						userId,
						bucket,
						amount: delta.toFixed(2),
						mode,
						// La evidencia de la resta solo tiene sentido si el monto salió
						// de contar la plata; en un gasto manual queda nula.
						countedAmount:
							mode === 'difference' ? (countedAmount as number).toFixed(2) : null,
						previousBalance: mode === 'difference' ? saldoActual.toFixed(2) : null,
						date,
						description: description ?? null
					})
					.returning({ id: bucketAdjustments.id });

				await tx.insert(bucketAllocations).values({
					userId,
					adjustmentId: ajuste.id,
					bucket,
					amount: delta.toFixed(2)
				});
			});
		} catch (error) {
			// Las comprobaciones viven dentro de la transacción y la única forma de
			// abortarla es lanzar. Solo estas dos marcas se traducen a un mensaje;
			// cualquier otro error se propaga.
			if (error instanceof Error && error.message === SIN_SALDO) {
				const sinSaldo: FieldErrors = {
					amount: [`No hay saldo suficiente en ${BUCKET_LABELS[bucket]}`]
				};
				return fail(400, { errors: sinSaldo, values });
			}
			if (error instanceof Error && error.message === SIN_CAMBIO) {
				const sinCambio: FieldErrors =
					mode === 'manual'
						? { amount: ['El monto debe ser mayor que 0'] }
						: { countedAmount: ['Esa es justo la plata que ya tenías anotada'] };
				return fail(400, { errors: sinCambio, values });
			}
			throw error;
		}

		return { success: true };
	}
};
