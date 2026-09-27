import { fail, redirect } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { categories, users, DEFAULT_CATEGORIES } from '$lib/server/db/schema';
import { createSession, hashPassword, safeRedirect, setSessionTokenCookie } from '$lib/server/auth';
import { registerSchema } from '$lib/validation/auth';
import { fieldErrors, pick, type FieldErrors } from '$lib/forms';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Si ya hay sesión, no tiene sentido quedarse aquí.
	if (locals.user) redirect(303, '/');
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();

		// Nunca devolvemos contraseñas al navegador.
		const values = pick(formData, ['name', 'email']);

		const parsed = registerSchema.safeParse(pick(formData, [
			'name',
			'email',
			'password',
			'confirmPassword'
		]));

		if (!parsed.success) {
			return fail(400, { errors: fieldErrors(parsed.error), values, message: null });
		}

		const { name, email, password } = parsed.data;

		const existing = await db
			.select({ id: users.id })
			.from(users)
			.where(eq(sql`lower(${users.email})`, email))
			.limit(1);

		if (existing.length > 0) {
			// Mismo tipo que fieldErrors() para no romper la unión de ActionData.
			const sinErrores: FieldErrors = {};
			return fail(409, { errors: sinErrores, values, message: 'Ya hay una cuenta con ese email' });
		}

		const passwordHash = await hashPassword(password);

		// Usuario y categorías van en la misma transacción: o entra todo, o no
		// entra nada. Un usuario sin categorías se quedaría roto.
		const [newUser] = await db.transaction(async (tx) => {
			const inserted = await tx
				.insert(users)
				.values({ name, email, passwordHash })
				.returning({ id: users.id });

			const [user] = inserted;

			await tx.insert(categories).values(
				DEFAULT_CATEGORIES.map((c) => ({
					userId: user.id,
					name: c.name,
					kind: c.kind,
					color: c.color
				}))
			);

			return inserted;
		});

		const { session, token } = await createSession(newUser.id);
		setSessionTokenCookie(event, token, session);

		redirect(303, safeRedirect(event.url.searchParams.get('redirectTo')));
	}
};
