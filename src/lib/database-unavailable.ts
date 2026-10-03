/**
 * Detección y mensajes del caso "Postgres no responde".
 *
 * Vive fuera de `src/lib/server` porque lo usan tres mundos: el hook del servidor
 * (que decide el status), la página de error de Svelte (`+error.svelte`) y la
 * plantilla estática `src/error.html`.
 */

/** `App.Error.code` que identifica este fallo en la página de error. */
export const DATABASE_UNAVAILABLE_CODE = 'DATABASE_UNAVAILABLE';

export const DATABASE_UNAVAILABLE_MESSAGE = 'No se pudo conectar con la base de datos.';

export const DATABASE_UNAVAILABLE_HINT =
	'Lo más probable es que el contenedor de Docker esté parado. Arráncalo con `docker compose up -d` y recarga la página.';

/**
 * Los dos mensajes unidos, porque `src/error.html` solo tiene un hueco de texto y
 * es la página que se ve cuando el fallo salta en `handle` (validar la sesión).
 */
export const DATABASE_UNAVAILABLE_TEXT = `${DATABASE_UNAVAILABLE_MESSAGE} ${DATABASE_UNAVAILABLE_HINT}`;

/**
 * El error real viene enterrado: `postgres` lanza el error de socket, drizzle lo
 * envuelve en `DrizzleQueryError` y Node agrupa los intentos de IPv4/IPv6 de
 * `localhost` en un `AggregateError`. Por eso hay que recorrer toda la cadena de
 * `cause`, y también la lista `errors` de los AggregateError.
 *
 * - Códigos de red: los de `node:net`.
 * - SQLSTATE de Postgres: la clase 08 es "connection exception", más los estados
 *   de apagado y de configuración que también significa "no hay Postgres aquí".
 */
const CONNECTION_CODES = new Set([
	// Red
	'ECONNREFUSED',
	'ECONNRESET',
	'ECONNABORTED',
	'EPIPE',
	'EAGAIN',
	'ETIMEDOUT',
	'ENOTFOUND',
	'EAI_AGAIN',
	'EHOSTUNREACH',
	'ENETUNREACH',
	'EADDRNOTAVAIL',
	// Postgres: connection_exception
	'08000',
	'08001',
	'08003',
	'08004',
	'08006',
	'08007',
	'08P01',
	// Postgres: apagado / no disponible / mal configurada
	'57P01', // admin_shutdown
	'57P02', // crash_shutdown
	'57P03', // cannot_connect_now
	'3D000', // invalid_catalog_name: la BD de DATABASE_URL no existe
	'53300' // too_many_connections
]);

/** Suficiente para desenredar drizzle → postgres → socket, sin riesgo de ciclo infinito. */
const MAX_CAUSE_DEPTH = 10;

function hasConnectionCode(value: unknown, depth: number): boolean {
	if (!value || typeof value !== 'object' || depth > MAX_CAUSE_DEPTH) return false;

	const node = value as { code?: unknown; errors?: unknown; cause?: unknown };

	if (typeof node.code === 'string' && CONNECTION_CODES.has(node.code)) return true;

	// `AggregateError` de Node: un error por cada dirección que intentó.
	if (Array.isArray(node.errors) && node.errors.some((inner) => hasConnectionCode(inner, depth + 1))) {
		return true;
	}

	return hasConnectionCode(node.cause, depth + 1);
}

/**
 * ¿Este error es "no hay Postgres"? Si lo es, la respuesta al usuario no puede
 * ser el 500 genérico, sino un 503 que diga qué hacer.
 */
export function isDatabaseUnavailable(value: unknown): boolean {
	return hasConnectionCode(value, 0);
}