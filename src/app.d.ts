import type { User } from '$lib/server/db/schema';

declare global {
	namespace App {
		interface Locals {
			user: User | null;
			session: { id: string; userId: string; expiresAt: Date } | null;
		}
		interface Error {
			/**
			 * Identifica el tipo de fallo, para que `+error.svelte` pueda adaptar la
			 * página. Hoy solo lo usa `DATABASE_UNAVAILABLE`.
			 */
			code?: string;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {}