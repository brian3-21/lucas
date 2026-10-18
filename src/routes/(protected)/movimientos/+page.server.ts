import { fail, redirect } from '@sveltejs/kit';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	bucketAdjustments,
	bucketAllocations,
	bucketTransfers,
	categories,
	movements,
	users
} from '$lib/server/db/schema';
import { filasReparto } from '$lib/server/allocations';
import { movementIdSchema, movementUpdateSchema } from '$lib/validation/movements';
import { fieldErrors, pick, type FieldErrors } from '$lib/forms';
import { getOffset, PAGE_SIZE } from '$lib/server/pagination';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url }) => {
	// El hook ya redirige a /login si no hay sesión; esto solo satisface a TS.
	if (!locals.user) redirect(303, '/login');
	const userId = locals.user.id;
	const offset = getOffset(url);

	const [categoriasUsuario, recentMovements, recentTransfers, recentAdjustments, ...totalCounts] =
		await Promise.all([
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
			limit: PAGE_SIZE + 1,
			offset
		}),
		// Los traslados no son movimientos, pero forman parte del mismo historial:
		// sin ellos no se ve por dónde pasó el dinero.
		db
			.select()
			.from(bucketTransfers)
			.where(eq(bucketTransfers.userId, userId))
			.orderBy(desc(bucketTransfers.date), desc(bucketTransfers.createdAt))
			.limit(PAGE_SIZE + 1)
			.offset(offset),
		// Los ajustes (gastos y correcciones por conteo) también son parte del
		// historial: sin ellos el saldo de una tarjeta baja sin explicación visible.
		db
			.select()
			.from(bucketAdjustments)
			.where(eq(bucketAdjustments.userId, userId))
			.orderBy(desc(bucketAdjustments.date), desc(bucketAdjustments.createdAt))
			.limit(PAGE_SIZE + 1)
			.offset(offset),
		// Conteo total para la paginación por número de página
		db
			.select({ count: sql<number>`count(*)`.mapWith(Number) })
			.from(movements)
			.where(eq(movements.userId, userId)),
		db
			.select({ count: sql<number>`count(*)`.mapWith(Number) })
			.from(bucketTransfers)
			.where(eq(bucketTransfers.userId, userId)),
		db
			.select({ count: sql<number>`count(*)`.mapWith(Number) })
			.from(bucketAdjustments)
			.where(eq(bucketAdjustments.userId, userId))
	]);

	const totalItems = totalCounts.reduce((total, rows) => total + (rows[0]?.count ?? 0), 0);

	const fusionado = [
		...recentMovements.map((movimiento) => ({
			tipo: 'movimiento' as const,
			clave: `movimiento-${movimiento.id}`,
			orden: `${movimiento.date} ${movimiento.createdAt.toISOString()}`,
			movimiento
		})),
		...recentTransfers.map((traslado) => ({
			tipo: 'traslado' as const,
			clave: `traslado-${traslado.id}`,
			orden: `${traslado.date} ${traslado.createdAt.toISOString()}`,
			traslado
		})),
		...recentAdjustments.map((ajuste) => ({
			tipo: 'ajuste' as const,
			clave: `ajuste-${ajuste.id}`,
			orden: `${ajuste.date} ${ajuste.createdAt.toISOString()}`,
			ajuste
		}))
	].sort((a, b) => b.orden.localeCompare(a.orden));

	const historialPaginado = fusionado.slice(0, PAGE_SIZE);
	const hasMore = fusionado.length > PAGE_SIZE;
	const nextOffset = hasMore ? offset + PAGE_SIZE : null;
	const prevOffset = offset > 0 ? Math.max(0, offset - PAGE_SIZE) : null;

	// La clave del return no puede llamarse `categories`: la importaría la tabla de
	// Drizzle y se colaría en `data` en vez de las filas del usuario.
	return {
		categories: categoriasUsuario,
		historialPaginado,
		hasMore,
		nextOffset,
		prevOffset,
		totalItems,
		page: Math.floor(offset / PAGE_SIZE) + 1
	};
};

export const actions: Actions = {
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
