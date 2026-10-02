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
import { incomeSchema, movementIdSchema } from '$lib/validation/movements';
import { fieldErrors, pick, type FieldErrors } from '$lib/forms';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// El hook ya redirige a /login si no hay sesión; esto solo satisface a TS.
	if (!locals.user) redirect(303, '/login');
	const userId = locals.user.id;

	const [incomeCategories, recentMovements, sumasPorBolsillo] = await Promise.all([
		db
			.select()
			.from(categories)
			.where(and(eq(categories.userId, userId), eq(categories.kind, 'income')))
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

	return { incomeCategories, recentMovements, bucketTotals };
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
		const reparto = splitAmount(amount, {
			short: Number(usuario?.splitShort ?? 60),
			medium: Number(usuario?.splitMedium ?? 30)
		});

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

			await tx.insert(bucketAllocations).values([
				{
					userId,
					movementId: movimiento.id,
					bucket: 'short_term',
					amount: reparto.short_term.toFixed(2)
				},
				{
					userId,
					movementId: movimiento.id,
					bucket: 'medium_term',
					amount: reparto.medium_term.toFixed(2)
				},
				{
					userId,
					movementId: movimiento.id,
					bucket: 'long_term',
					amount: reparto.long_term.toFixed(2)
				}
			]);
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
