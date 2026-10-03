import { fail, redirect } from '@sveltejs/kit';
import { and, desc, eq, sum } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	bucketAllocations,
	categories,
	movements,
	users,
	type BucketKind
} from '$lib/server/db/schema';
import { splitAmount } from '$lib/buckets';
import {
	incomeSchema,
	movementIdSchema,
	movementUpdateSchema
} from '$lib/validation/movements';
import { fieldErrors, pick, type FieldErrors } from '$lib/forms';
import type { Actions, PageServerLoad } from './$types';

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

	const [categoriasUsuario, recentMovements, sumasPorBolsillo] = await Promise.all([
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
	return { categories: categoriasUsuario, recentMovements, bucketTotals };
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
	}
};
