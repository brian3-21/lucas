import { relations, sql } from 'drizzle-orm';
import {
	date,
	index,
	numeric,
	pgEnum,
	pgTable,
	text,
	timestamp,
	uniqueIndex,
	uuid
} from 'drizzle-orm/pg-core';

export const transactionType = pgEnum('transaction_type', ['income', 'expense']);
export const bucketKind = pgEnum('bucket_kind', ['short_term', 'medium_term', 'long_term']);
// USD ya está en el enum aunque la UI aún no lo use: cuando llegue, no hará
// falta migración de datos, solo interfaz.
export const currencyCode = pgEnum('currency_code', ['CUP', 'USD']);

export const users = pgTable(
	'users',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		email: text('email').notNull(),
		passwordHash: text('password_hash').notNull(),
		name: text('name').notNull(),
		baseCurrency: text('base_currency').notNull().default('CUP'),
		// Porcentajes de reparto de cada ingreso entre los bolsillos.
		splitShort: numeric('split_short', { precision: 5, scale: 2 }).notNull().default('60'),
		splitMedium: numeric('split_medium', { precision: 5, scale: 2 }).notNull().default('25'),
		splitLong: numeric('split_long', { precision: 5, scale: 2 }).notNull().default('15'),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow()
	},
	(t) => [uniqueIndex('users_email_idx').on(sql`lower(${t.email})`)]
);

export const sessions = pgTable(
	'sessions',
	{
		id: text('id').primaryKey(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		expiresAt: timestamp('expires_at', { withTimezone: true }).notNull()
	},
	(t) => [index('sessions_user_id_idx').on(t.userId)]
);

export const categories = pgTable(
	'categories',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		kind: transactionType('kind').notNull(),
		color: text('color'),
		icon: text('icon'),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow()
	},
	(t) => [index('categories_user_id_idx').on(t.userId)]
);

export const movements = pgTable(
	'movements',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
		type: transactionType('type').notNull(),
		currency: currencyCode('currency').notNull().default('CUP'),
		// Siempre positivo. El signo lo determina `type`.
		amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
		description: text('description'),
		date: date('date').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow()
	},
	(t) => [
		index('movements_user_id_idx').on(t.userId),
		index('movements_category_id_idx').on(t.categoryId),
		index('movements_date_idx').on(t.date)
	]
);

export const goals = pgTable(
	'goals',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		targetAmount: numeric('target_amount', { precision: 14, scale: 2 }).notNull(),
		currentAmount: numeric('current_amount', { precision: 14, scale: 2 })
			.notNull()
			.default('0'),
		targetDate: date('target_date'),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow()
	},
	(t) => [index('goals_user_id_idx').on(t.userId)]
);

// Libro mayor de repartos: cada ingreso genera una fila por bolsillo.
// Los totales de las tarjetas son SUM(amount) GROUP BY bucket.
export const bucketAllocations = pgTable(
	'bucket_allocations',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		movementId: uuid('movement_id')
			.notNull()
			.references(() => movements.id, { onDelete: 'cascade' }),
		bucket: bucketKind('bucket').notNull(),
		currency: currencyCode('currency').notNull().default('CUP'),
		amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow()
	},
	(t) => [
		index('bucket_allocations_user_id_idx').on(t.userId),
		index('bucket_allocations_movement_id_idx').on(t.movementId)
	]
);

export const usersRelations = relations(users, ({ many }) => ({
	sessions: many(sessions),
	categories: many(categories),
	movements: many(movements),
	goals: many(goals),
	bucketAllocations: many(bucketAllocations)
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, { fields: [sessions.userId], references: [users.id] })
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
	user: one(users, { fields: [categories.userId], references: [users.id] }),
	movements: many(movements)
}));

export const movementsRelations = relations(movements, ({ one, many }) => ({
	user: one(users, { fields: [movements.userId], references: [users.id] }),
	category: one(categories, {
		fields: [movements.categoryId],
		references: [categories.id]
	}),
	bucketAllocations: many(bucketAllocations)
}));

export const goalsRelations = relations(goals, ({ one }) => ({
	user: one(users, { fields: [goals.userId], references: [users.id] })
}));

export const bucketAllocationsRelations = relations(bucketAllocations, ({ one }) => ({
	user: one(users, { fields: [bucketAllocations.userId], references: [users.id] }),
	movement: one(movements, {
		fields: [bucketAllocations.movementId],
		references: [movements.id]
	})
}));

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Movement = typeof movements.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type BucketAllocation = typeof bucketAllocations.$inferSelect;
export type TransactionType = (typeof transactionType.enumValues)[number];
export type BucketKind = (typeof bucketKind.enumValues)[number];
export type CurrencyCode = (typeof currencyCode.enumValues)[number];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
	income: 'Ingreso',
	expense: 'Gasto'
};

export const BUCKET_KIND_LABELS: Record<BucketKind, string> = {
	short_term: 'Corto plazo',
	medium_term: 'Mediano plazo',
	long_term: 'Largo plazo'
};

export const DEFAULT_CATEGORIES: { name: string; kind: TransactionType; color: string }[] = [
	{ name: 'Salario', kind: 'income', color: '#22c55e' },
	{ name: 'Freelance', kind: 'income', color: '#14b8a6' },
	{ name: 'Inversiones', kind: 'income', color: '#0ea5e9' },
	{ name: 'Comida', kind: 'expense', color: '#f97316' },
	{ name: 'Transporte', kind: 'expense', color: '#eab308' },
	{ name: 'Vivienda', kind: 'expense', color: '#ef4444' },
	{ name: 'Ocio', kind: 'expense', color: '#a855f7' },
	{ name: 'Salud', kind: 'expense', color: '#ec4899' },
	{ name: 'Suscripciones', kind: 'expense', color: '#6366f1' },
	{ name: 'Otros', kind: 'expense', color: '#64748b' }
];
