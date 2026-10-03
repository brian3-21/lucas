import { error, redirect, type Handle, type HandleServerError } from '@sveltejs/kit';
import {
	DATABASE_UNAVAILABLE_CODE,
	DATABASE_UNAVAILABLE_TEXT,
	isDatabaseUnavailable
} from '$lib/database-unavailable';
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
	try {
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

		// `resolve` es lo que ejecuta los load, las form actions y los endpoints,
		// así que el try lo convierte en el único sitio donde atrapar "no hay BD".
		return await resolve(event);
	} catch (err) {
		throw friendlyError(err, `${event.request.method} ${event.url.pathname}`);
	}
};

/**
 * Convierte un fallo de conexión a Postgres en un 503 explicativo en lugar del
 * 500 genérico de SvelteKit.
 *
 * El 503 es el status que corresponde: el servidor de Lucas está de pie, lo que
 * no está de pie es su dependencia. También es lo que ven los navegadores y los
 * proxies para saber que tiene sentido reintentar más tarde.
 *
 * Un `HttpError` lo muestra SvelteKit sin pasar por `handleError` (ver
 * `handle_error_and_jsonify`), así que el log lo hacemos nosotros a mano.
 *
 * Cualquier otro error se devuelve intacto: los `Redirect` también son excepciones
 * lanzadas, y convertir un 303 en 503 sería un bug.
 */
function friendlyError(err: unknown, context: string): unknown {
	if (!isDatabaseUnavailable(err)) return err;

	console.error(`[503] ${context} · ${DATABASE_UNAVAILABLE_TEXT}`, err);

	return error(503, {
		message: DATABASE_UNAVAILABLE_TEXT,
		code: DATABASE_UNAVAILABLE_CODE
	});
}

/**
 * SvelteKit captura cualquier excepción no controlada de un load o de una form
 * action y la pasa por aquí. Sin esto, un fallo en producción llega al
 * navegador como una página en blanco y al log del servidor como un WARNING.
 */
export const handleError: HandleServerError = ({ error, event, status }) => {
	// Red de seguridad: `handle` ya convierte la BD caída en un 503, pero si algún
	// día sale por otro camino, al menos el mensaje le dice al usuario qué pasó.
	const baseDeDatosCaida = isDatabaseUnavailable(error);

	// Los 404 son ruido esperado (enlaces viejos, escáneres) y no interesa
	// ensuciar el log. Todo lo demás sí: es un error que hay que mirar.
	if (status !== 404) {
		console.error(`[${status}] ${event.request.method} ${event.url.pathname}`, error);
	}

	if (baseDeDatosCaida) {
		return { message: DATABASE_UNAVAILABLE_TEXT, code: DATABASE_UNAVAILABLE_CODE };
	}

	// Lo que se devuelve es lo que ve el usuario, así que nunca el detalle
	// interno: en producción `error.message` puede traer datos de la consulta.
	return { message: status === 404 ? 'Página no encontrada' : 'Error inesperado' };
};
