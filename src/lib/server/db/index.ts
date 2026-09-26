import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

const globalForDb = globalThis as unknown as {
	__lucasSql?: ReturnType<typeof postgres>;
};

const client = globalForDb.__lucasSql ?? postgres(env.DATABASE_URL, { max: 10 });

if (env.NODE_ENV !== 'production') globalForDb.__lucasSql = client;

export const db = drizzle(client, { schema });
export { schema };
