import { redirect } from '@sveltejs/kit';
import { clearSessionTokenCookie, invalidateSession } from '$lib/server/auth';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// Logout es una acción con efeito: nunca por GET.
	redirect(303, '/');
};

export const actions: Actions = {
	default: async (event) => {
		if (event.locals.session) {
			await invalidateSession(event.locals.session.id);
		}
		clearSessionTokenCookie(event);
		redirect(303, '/login');
	}
};
