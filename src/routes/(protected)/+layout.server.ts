import type { LayoutServerLoad } from './$types';

/**
 * La seguridad ya está resuelta en hooks.server.ts. Aquí solo se pasa el
 * usuario a la interfaz, que es lo que los componentes necesitan.
 */
export const load: LayoutServerLoad = async ({ locals }) => {
	return { user: locals.user };
};
