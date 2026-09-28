import { redirect, type Handle, type HandleServerError } from '@sveltejs/kit';
import {
	SESSION_COOKIE_NAME,
	refreshSessionTokenCookie,
	validateSessionToken
} from '$lib/server/auth';

/**
 * Route group protegido. Todo lo que cuelgue de `(protected)` —páginas,
 * endpoints y form actions— queda cubierto por esta guarda.
 *
 * Importante: la guarda va AQUÍ y no en un `+layout.server.ts` porque las
 * form actions no pasan por los load del layout. Un `load` protegería la
 * navegación, pero dejaría los actions abiertos.
 */
const PROTECTED_PREFIX = '/(protected)';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE_NAME);

	if (token) {
		const { session, user } = await validateSessionToken(token);

		if (session) {
			// Refleja el sliding renewal: la cookie se renueva con la nueva expiración.
			refreshSessionTokenCookie(event, token, session);
		}

		event.locals.session = session;
		event.locals.user = user;
	} else {
		event.locals.session = null;
		event.locals.user = null;
	}

	if (!event.locals.user && event.route.id?.startsWith(PROTECTED_PREFIX)) {
		// Guardamos a dónde quería ir para devolvérselo tras el login.
		const from = event.url.pathname + event.url.search;
		redirect(303, `/login?redirectTo=${encodeURIComponent(from)}`);
	}

	return resolve(event);
};

/**
 * SvelteKit captura cualquier excepción no controlada de un load o de una form
 * action y la pasa por aquí. Sin esto, un fallo en producción llega al
 * navegador como una página en blanco y al log del servidor como un WARNING.
 */
export const handleError: HandleServerError = ({ error, event, status }) => {
	// Los 404 son ruido esperado (enlaces viejos, escáneres) y no interesa
	// ensuciar el log. Todo lo demás sí: es un error que hay que mirar.
	if (status !== 404) {
		console.error(`[${status}] ${event.request.method} ${event.url.pathname}`, error);
	}

	// Lo que se devuelve es lo que ve el usuario, así que nunca el detalle
	// interno: en producción `error.message` puede traer datos de la consulta.
	return { message: status === 404 ? 'Página no encontrada' : 'Error inesperado' };
};
