import { relations, sql } from 'drizzle-orm';
import {
	boolean,
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

export const transactionType = pgEnum('transaction_type', ['income', 'expense', 'transfer']);
export const accountType = pgEnum('account_type', [
	'checking',
	'savings',
	'cash',
	'credit',
	'investment'
]);

export const users = pgTable(
	'users',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		email: text('email').notNull(),
		passwordHash: text('password_hash').notNull(),
		name: text('name').notNull(),
		baseCurrency: text('base_currency').notNull().default('EUR'),
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

export const accounts = pgTable(
	'accounts',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		type: accountType('type').notNull().default('checking'),
		// Nullable: si es null, el saldo se calcula sumando sus movimientos.
		initialBalance: numeric('initial_balance', { precision: 14, scale: 2 })
			.notNull()
			.default('0'),
		icon: text('icon'),
		archived: boolean('archived').notNull().default(false),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow()
	},
	(t) => [index('accounts_user_id_idx').on(t.userId)]
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

export const transactions = pgTable(
	'transactions',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		accountId: uuid('account_id')
			.notNull()
			.references(() => accounts.id, { onDelete: 'cascade' }),
		categoryId: uuid('category_id').references(() => categories.id, { onDelete: 'set null' }),
		// Para transferencias entre cuentas propias.
		destinationAccountId: uuid('destination_account_id').references(() => accounts.id, {
			onDelete: 'set null'
		}),
		type: transactionType('type').notNull(),
		// Siempre positivo. El signo lo determina `type`.
		amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
		description: text('description'),
		notes: text('notes'),
		date: date('date').notNull(),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow()
	},
	(t) => [
		index('transactions_user_id_idx').on(t.userId),
		index('transactions_account_id_idx').on(t.accountId),
		index('transactions_category_id_idx').on(t.categoryId),
		index('transactions_date_idx').on(t.date)
	]
);

export const budgets = pgTable(
	'budgets',
	{
		id: uuid('id').primaryKey().defaultRandom(),
		userId: uuid('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		categoryId: uuid('category_id')
			.notNull()
			.references(() => categories.id, { onDelete: 'cascade' }),
		// Formato YYYY-MM
		month: text('month').notNull(),
		amount: numeric('amount', { precision: 14, scale: 2 }).notNull(),
		createdAt: timestamp('created_at', { withTimezone: true })
			.notNull()
			.defaultNow()
	},
	(t) => [
		uniqueIndex('budgets_user_category_month_idx').on(t.userId, t.categoryId, t.month),
		index('budgets_user_id_idx').on(t.userId)
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

export const usersRelations = relations(users, ({ many }) => ({
	sessions: many(sessions),
	accounts: many(accounts),
	categories: many(categories),
	transactions: many(transactions),
	budgets: many(budgets),
	goals: many(goals)
}));

export const sessionsRelations = relations(sessions, ({ one }) => ({
	user: one(users, { fields: [sessions.userId], references: [users.id] })
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
	user: one(users, { fields: [accounts.userId], references: [users.id] }),
	transactions: many(transactions, { relationName: 'account' }),
	incomingTransfers: many(transactions, { relationName: 'destinationAccount' })
}));

export const categoriesRelations = relations(categories, ({ one, many }) => ({
	user: one(users, { fields: [categories.userId], references: [users.id] }),
	transactions: many(transactions),
	budgets: many(budgets)
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
	user: one(users, { fields: [transactions.userId], references: [users.id] }),
	account: one(accounts, {
		fields: [transactions.accountId],
		references: [accounts.id],
		relationName: 'account'
	}),
	destinationAccount: one(accounts, {
		fields: [transactions.destinationAccountId],
		references: [accounts.id],
		relationName: 'destinationAccount'
	}),
	category: one(categories, {
		fields: [transactions.categoryId],
		references: [categories.id]
	})
}));

export const budgetsRelations = relations(budgets, ({ one }) => ({
	user: one(users, { fields: [budgets.userId], references: [users.id] }),
	category: one(categories, { fields: [budgets.categoryId], references: [categories.id] })
}));

export const goalsRelations = relations(goals, ({ one }) => ({
	user: one(users, { fields: [goals.userId], references: [users.id] })
}));

export type User = typeof users.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Transaction = typeof transactions.$inferSelect;
export type Budget = typeof budgets.$inferSelect;
export type Goal = typeof goals.$inferSelect;
export type TransactionType = (typeof transactionType.enumValues)[number];
export type AccountType = (typeof accountType.enumValues)[number];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
	checking: 'Corriente',
	savings: 'Ahorro',
	cash: 'Efectivo',
	credit: 'Crédito',
	investment: 'Inversión'
};

export const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
	income: 'Ingreso',
	expense: 'Gasto',
	transfer: 'Transferencia'
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
