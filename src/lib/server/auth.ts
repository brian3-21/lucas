import { hash, verify } from '@node-rs/argon2';
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { RequestEvent } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { db } from '$lib/server/db';
import { sessions, users } from '$lib/server/db/schema';
import type { Session, User } from '$lib/server/db/schema';

const DAY_MS = 1000 * 60 * 60 * 24;

export const SESSION_COOKIE_NAME = 'lucas_session';

/** 30 días */
const SESSION_LIFETIME_MS = 30 * DAY_MS;

/** Renovar la cookie si le quedan menos de 15 días de vida */
const SESSION_RENEWAL_THRESHOLD_MS = 15 * DAY_MS;

/* ------------------------------------------------------------------ */
/* Contraseñas                                                         */
/* ------------------------------------------------------------------ */

/**
 * argon2id con los parámetros por defecto de @node-rs/argon2, que coinciden
 * con los que recomienda OWASP: m=19456 KiB, t=2, p=1.
 *
 * No los expongas como variable de entorno: bajarlos en producción
 * convierte el argon2 en un KDF débil.
 */
export async function hashPassword(password: string): Promise<string> {
	return hash(password);
}

export async function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
	try {
		return await verify(passwordHash, password);
	} catch {
		return false;
	}
}

/* ------------------------------------------------------------------ */
/* Sesiones                                                            */
/* ------------------------------------------------------------------ */

function generateSessionToken(): string {
	return randomBytes(32).toString('base64url');
}

/**
 * El token va en claro en la cookie, pero en la tabla `sessions` solo se
 * guarda su SHA-256. Si alguien lee la base de datos no puede suplantarte,
 * porque el hash no se puede revertir ni es lo que viaja en la cookie.
 *
 * Esto también evita necesitar timingSafeEqual: la validación es una
 * búsqueda por el hash en el índice de Postgres, no un string compare.
 */
function hashToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
	userId: string,
	token: string = generateSessionToken()
): Promise<{ session: Session; token: string }> {
	const session: Session = {
		id: hashToken(token),
		userId,
		expiresAt: new Date(Date.now() + SESSION_LIFETIME_MS)
	};

	await db.insert(sessions).values(session);
	return { session, token };
}

type SessionValidationResult = { session: Session; user: User } | { session: null; user: null };

export async function validateSessionToken(token: string): Promise<SessionValidationResult> {
	const [row] = await db
		.select({ session: sessions, user: users })
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, hashToken(token)))
		.limit(1);

	if (!row) return { session: null, user: null };

	const { session, user } = row;

	if (Date.now() >= session.expiresAt.getTime()) {
		// Caducada: se limpia y se trata como si no hubiera sesión.
		await db.delete(sessions).where(eq(sessions.id, session.id));
		return { session: null, user: null };
	}

	// Sliding renewal: si le queda poco, se renueva en la BD y en la cookie.
	if (Date.now() >= session.expiresAt.getTime() - SESSION_RENEWAL_THRESHOLD_MS) {
		session.expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);
		await db
			.update(sessions)
			.set({ expiresAt: session.expiresAt })
			.where(eq(sessions.id, session.id));
	}

	return { session, user };
}

export async function invalidateSession(sessionId: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, sessionId));
}

/** Cierra todas las sesiones de un usuario. Útil si más adelante hay cambio de contraseña. */
export async function invalidateUserSessions(userId: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.userId, userId));
}

/* ------------------------------------------------------------------ */
/* Cookies                                                             */
/* ------------------------------------------------------------------ */

function sessionCookieOptions(expiresAt?: Date) {
	return {
		path: '/',
		httpOnly: true,
		sameSite: 'lax' as const,
		secure: !dev,
		...(expiresAt ? { expires: expiresAt } : {})
	};
}

export function setSessionTokenCookie(event: RequestEvent, token: string, session: Session): void {
	event.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(session.expiresAt));
}

/** Reescribe la cookie con la expiración renovada (sliding renewal). */
export function refreshSessionTokenCookie(
	event: RequestEvent,
	token: string,
	session: Session
): void {
	event.cookies.set(SESSION_COOKIE_NAME, token, sessionCookieOptions(session.expiresAt));
}

export function clearSessionTokenCookie(event: RequestEvent): void {
	event.cookies.delete(SESSION_COOKIE_NAME, sessionCookieOptions());
}

/* ------------------------------------------------------------------ */
/* Redirecciones                                                       */
/* ------------------------------------------------------------------ */

/**
 * Solo permite rutas internas. Sin esto, un atacante te manda este enlace:
 *   /login?redirectTo=https://su-sitio.com
 * inicias sesión en Lucas y aterrizas en su página clonada con phishing.
 *
 * Regla: una sola barra inicial, y nada de barras invertidas ni esquemas.
 */
export function safeRedirect(target: string | null | undefined, fallback = '/'): string {
	if (!target) return fallback;
	if (!target.startsWith('/')) return fallback;
	if (target.startsWith('//')) return fallback;
	if (target.includes('\\')) return fallback;
	return target;
}
