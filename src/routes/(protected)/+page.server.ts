import { fail, redirect } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { categories, movements } from '$lib/server/db/schema';
import { incomeSchema } from '$lib/validation/movements';
import { fieldErrors, pick, type FieldErrors } from '$lib/forms';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// El hook ya redirige a /login si no hay sesión; esto solo satisface a TS.
	if (!locals.user) redirect(303, '/login');
	const userId = locals.user.id;

	const [incomeCategories, recentMovements] = await Promise.all([
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
		})
	]);

	return { incomeCategories, recentMovements };
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

		await db.insert(movements).values({
			userId,
			type: 'income',
			// numeric se guarda como string; toFixed fija los 2 decimales.
			amount: amount.toFixed(2),
			date,
			description: description ?? null,
			categoryId: categoryId ?? null
		});

		return { success: true };
	}
};
