import { relations, sql } from 'drizzle-orm';
import {
	check,
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
export const adjustmentMode = pgEnum('adjustment_mode', ['manual', 'difference']);

export const users = pgTable(
	'users',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		email: text('email').notNull(),
		passwordHash: text('password_hash').notNull(),
		name: text('name').notNull(),
		baseCurrency: text('base_currency').notNull().default('CUP'),
		// Porcentajes de reparto de cada ingreso entre los bolsillos. Siempre
		// múltiplos de 10 y sumando 100; la BD lo exige con dos CHECK, así que
		// cualquier escritura que se salga de ahí revienta en vez de colarse.
		splitShort: numeric('split_short', { precision: 5, scale: 2 }).notNull().default('60'),
		splitMedium: numeric('split_medium', { precision: 5, scale: 2 }).notNull().default('30'),
		splitLong: numeric('split_long', { precision: 5, scale: 2 }).notNull().default('10'),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow()
	},
	(t) => [
		uniqueIndex('users_email_idx').on(sql`lower(${t.email})`),
		check(
			'users_split_multiples_of_10',
			sql`${t.splitShort} % 10 = 0 AND ${t.splitMedium} % 10 = 0 AND ${t.splitLong} % 10 = 0`
		),
		check('users_split_sums_to_100', sql`${t.splitShort} + ${t.splitMedium} + ${t.splitLong} = 100`)
	]
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

// Mover dinero de un bolsillo a otro. No es un ingreso ni un gasto: el dinero
// solo cambia de sitio, así que vive en su propia tabla en vez de colgarse de
// `movements`. El CHECK de origen != destino y el saldo (que comprueba la
// acción, no la BD) hacen que nunca se pueda crear un traslado sin destino.
export const bucketTransfers = pgTable(
	'bucket_transfers',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		// `from` es palabra reservada en Postgres, de ahí el sufijo en la columna.
		from: bucketKind('from_bucket').notNull(),
		to: bucketKind('to_bucket').notNull(),
		currency: currencyCode('currency').notNull().default('CUP'),
		amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
		description: text('description'),
		date: date('date').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow()
	},
	(t) => [
		index('bucket_transfers_user_id_idx').on(t.userId),
		index('bucket_transfers_date_idx').on(t.date),
		check('bucket_transfers_distinct_buckets', sql`${t.from} <> ${t.to}`),
		check('bucket_transfers_amount_positive', sql`${t.amount} > 0`)
	]
);

// Ajuste de un bolsillo: dinero que sale (gasto real) o una corrección de lo
// que el sistema creía que había. A diferencia de un traslado, aquí el dinero sí
// desaparece de los tres bolsillos, así que no puede colgarse de
// `bucket_transfers`: necesita su propio origen en el libro mayor.
//
// `mode` guarda cómo se decidió el monto. En 'manual' es un gasto directo
// (siempre negativo). En 'difference' el usuario contó cuánta plata tiene y el
// servidor calculó la resta, que puede salir positiva (contó más de lo que decía
// el sistema); se guardan `countedAmount` y `previousBalance` para poder auditar
// esa diferencia más adelante.
export const bucketAdjustments = pgTable(
	'bucket_adjustments',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		bucket: bucketKind('bucket').notNull(),
		currency: currencyCode('currency').notNull().default('CUP'),
		// Con signo: nunca 0. Negativo = sale dinero, positivo = había más de lo
		// que el sistema tenía anotado.
		amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
		mode: adjustmentMode('mode').notNull(),
		// Solo se rellenan en mode = 'difference': qué contó el usuario y sobre qué
		// saldo se hizo la resta. Son la prueba de por qué se aplicó ese delta.
		countedAmount: numeric('counted_amount', { precision: 14, scale: 2 }),
		previousBalance: numeric('previous_balance', { precision: 14, scale: 2 }),
		description: text('description'),
		date: date('date').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow()
	},
	(t) => [
		index('bucket_adjustments_user_id_idx').on(t.userId),
		index('bucket_adjustments_date_idx').on(t.date),
		// Un ajuste que no cambia nada es un error de dedo, no un evento.
		check('bucket_adjustments_amount_nonzero', sql`${t.amount} <> 0`),
		// Un retiro manual solo puede restar: para sumar está la forma 'difference'.
		check('bucket_adjustments_manual_is_negative', sql`${t.mode} <> 'manual' OR ${t.amount} < 0`),
		// Si el monto salió de contar la plata, tiene que quedar registrado qué se
		// contó y sobre qué saldo, o la diferencia no es verificable.
		check(
			'bucket_adjustments_difference_keeps_evidence',
			sql`${t.mode} <> 'difference' OR (${t.countedAmount} IS NOT NULL AND ${t.previousBalance} IS NOT NULL)`
		)
	]
);

// Libro mayor de repartos: cada ingreso genera una fila por bolsillo con el
// signo + y cada transferencia genera dos, una − y otra +, de forma que el
// saldo de cada tarjeta es SUM(amount) GROUP BY bucket. El dinero nunca queda
// "en el aire": las dos filas de un traslado siempre suman cero.
export const bucketAllocations = pgTable(
	'bucket_allocations',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		// Exactamente uno de los tres: una fila viene de un ingreso, de una
		// transferencia o de un ajuste, nunca de dos y nunca de ninguno.
		movementId: uuid('movement_id').references(() => movements.id, { onDelete: 'cascade' }),
		transferId: uuid('transfer_id').references(() => bucketTransfers.id, {
			onDelete: 'cascade'
		}),
		adjustmentId: uuid('adjustment_id').references(() => bucketAdjustments.id, {
			onDelete: 'cascade'
		}),
		bucket: bucketKind('bucket').notNull(),
		currency: currencyCode('currency').notNull().default('CUP'),
		// Con signo: negativo en la salida de una transferencia y en un ajuste de
		// gasto, positivo en un ingreso y en un ajuste que suma.
		amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow()
	},
	(t) => [
		index('bucket_allocations_user_id_idx').on(t.userId),
		index('bucket_allocations_movement_id_idx').on(t.movementId),
		index('bucket_allocations_transfer_id_idx').on(t.transferId),
		index('bucket_allocations_adjustment_id_idx').on(t.adjustmentId),
		// Una fila por bolsillo y traslado: impide que un traslado registre dos
		// salidas y con ello alguien se invente dinero. Las filas de ingreso no se
		// ven afectadas: en Postgres los NULL no chocan en un índice único.
		uniqueIndex('bucket_allocations_transfer_bucket_idx').on(t.transferId, t.bucket),
		// Lo mismo para los ajustes: un solo delta por bolsillo ajustado.
		uniqueIndex('bucket_allocations_adjustment_bucket_idx').on(t.adjustmentId, t.bucket),
		check(
			'bucket_allocations_single_origin',
			sql`num_nonnulls(${t.movementId}, ${t.transferId}, ${t.adjustmentId}) = 1`
		),
		// El signo negativo solo tiene sentido en las dos filas de un traslado y en
		// un ajuste: una fila de ingreso siempre suma.
		check(
			'bucket_allocations_origin_sign',
			sql`${t.transferId} IS NOT NULL OR ${t.adjustmentId} IS NOT NULL OR ${t.amount} > 0`
		)
	]
);

export const usersRelations = relations(users, ({ many }) => ({
	sessions: many(sessions),
	categories: many(categories),
	movements: many(movements),
	goals: many(goals),
	bucketAllocations: many(bucketAllocations),
	bucketTransfers: many(bucketTransfers),
	bucketAdjustments: many(bucketAdjustments)
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
	// movementId, transferId y adjustmentId son nullables (solo se rellena uno de
	// los tres), así que Drizzle ya marca estas relaciones como anulables por su cuenta.
	movement: one(movements, {
		fields: [bucketAllocations.movementId],
		references: [movements.id]
	}),
	transfer: one(bucketTransfers, {
		fields: [bucketAllocations.transferId],
		references: [bucketTransfers.id]
	}),
	adjustment: one(bucketAdjustments, {
		fields: [bucketAllocations.adjustmentId],
		references: [bucketAdjustments.id]
	})
}));

export const bucketTransfersRelations = relations(bucketTransfers, ({ one, many }) => ({
	user: one(users, { fields: [bucketTransfers.userId], references: [users.id] }),
	bucketAllocations: many(bucketAllocations)
}));

export const bucketAdjustmentsRelations = relations(bucketAdjustments, ({ one, many }) => ({
	user: one(users, { fields: [bucketAdjustments.userId], references: [users.id] }),
	bucketAllocations: many(bucketAllocations)
}));

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Movement = typeof movements.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type BucketAllocation = typeof bucketAllocations.$inferSelect;
export type BucketTransfer = typeof bucketTransfers.$inferSelect;
export type BucketAdjustment = typeof bucketAdjustments.$inferSelect;
export type TransactionType = (typeof transactionType.enumValues)[number];
export type BucketKind = (typeof bucketKind.enumValues)[number];
export type AdjustmentMode = (typeof adjustmentMode.enumValues)[number];
export type CurrencyCode = (typeof currencyCode.enumValues)[number];

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
	income: 'Ingreso',
	expense: 'Gasto'
};

// Las etiquetas de los bolsillos están en $lib/bucket-meta: el cliente no puede
// importar este módulo.

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
