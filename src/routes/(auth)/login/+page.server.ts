import { fail, redirect } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { createSession, safeRedirect, setSessionTokenCookie, verifyPassword } from '$lib/server/auth';
import { loginSchema } from '$lib/validation/auth';
import { fieldErrors, pick, type FieldErrors } from '$lib/forms';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) redirect(303, '/');
	return {};
};

export const actions: Actions = {
	default: async (event) => {
		const formData = await event.request.formData();

		// Solo devolvemos el email, nunca la contraseña: lo que se reenvía al
		// navegador acaba en el HTML y en el historial del cliente.
		const values = pick(formData, ['email']);

		const parsed = loginSchema.safeParse({
			...pick(formData, ['email', 'password'])
		});

		if (!parsed.success) {
			return fail(400, { errors: fieldErrors(parsed.error), values, message: null });
		}

		const { email, password } = parsed.data;

		const [user] = await db
			.select()
			.from(users)
			.where(eq(sql`lower(${users.email})`, email))
			.limit(1);

		// Mismo mensaje tanto si el email no existe como si la contraseña falla,
		// y en ambos casos se ejecuta un hash argon2. Así nadie puede usar el
		// login para averiguar qué emails están registrados, ni saber si un
		// email existe por lo que tarda la respuesta.
		if (!user || !(await verifyPassword(user.passwordHash, password))) {
			// `sinErrores` mantiene el mismo tipo que devuelve fieldErrors(), para
			// que ActionData no se parta en dos formas incompatibles.
			const sinErrores: FieldErrors = {};
			return fail(400, {
				errors: sinErrores,
				values,
				message: 'Email o contraseña incorrectos'
			});
		}

		const { session, token } = await createSession(user.id);
		setSessionTokenCookie(event, token, session);

		redirect(303, safeRedirect(event.url.searchParams.get('redirectTo')));
	}
};
