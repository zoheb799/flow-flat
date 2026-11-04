import {
  bigint,
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

export const householdRole = pgEnum("household_role", ["ADMIN", "MEMBER"]);
export const ledgerType = pgEnum("ledger_type", [
  "CONTRIBUTION",
  "MEAL_DEBIT",
  "MEAL_REFUND",
  "MANUAL_CREDIT",
  "MANUAL_DEBIT",
  "ADJUSTMENT",
  "MONTHLY_OPENING_BALANCE",
]);
export const mealCategory = pgEnum("meal_category", [
  "BREAKFAST",
  "LUNCH",
  "DINNER",
  "SNACKS",
  "TEA_COFFEE",
  "GROCERIES",
  "OTHER",
]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    phone: text("phone"),
    email: text("email"),
    passwordHash: text("password_hash"),
    authVersion: integer("auth_version").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    unique("users_phone_unique").on(table.phone),
    unique("users_email_unique").on(table.email),
  ],
);

export const households = pgTable(
  "households",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    createdBy: uuid("created_by").notNull().references(() => users.id),
    allowOverdrafts: boolean("allow_overdrafts").notNull().default(false),
    ...timestamps,
  },
  (table) => [unique("households_id_creator_unique").on(table.id, table.createdBy)],
);

export const householdMembers = pgTable(
  "household_members",
  {
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: householdRole("role").notNull().default("MEMBER"),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.householdId, table.userId] }),
    index("household_members_user_idx").on(table.userId),
  ],
);

export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull(),
    email: text("email").notNull(),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdBy: uuid("created_by").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.householdId, table.createdBy],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
      name: "invitations_creator_membership_fk",
    }),
    unique("invitations_token_hash_unique").on(table.tokenHash),
    index("invitations_household_idx").on(table.householdId),
  ],
);

export const monthlyPeriods = pgTable(
  "monthly_periods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    unique("monthly_periods_household_id_unique").on(table.householdId, table.id),
    unique("monthly_periods_household_start_unique").on(table.householdId, table.startsAt),
    check("monthly_periods_valid_range", sql`${table.endsAt} > ${table.startsAt}`),
    index("monthly_periods_household_idx").on(table.householdId),
  ],
);

export const wallets = pgTable(
  "wallets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull(),
    memberId: uuid("member_id").notNull(),
    balancePaise: bigint("balance_paise", { mode: "number" }).notNull().default(0),
    lowBalancePaise: bigint("low_balance_paise", { mode: "number" }).notNull().default(10_000),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.householdId, table.memberId],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
      name: "wallets_member_membership_fk",
    }),
    unique("wallets_household_member_unique").on(table.householdId, table.memberId),
    unique("wallets_household_id_unique").on(table.householdId, table.id),
    check("wallets_balance_nonnegative", sql`${table.balancePaise} >= 0`),
    check("wallets_low_balance_nonnegative", sql`${table.lowBalancePaise} >= 0`),
    index("wallets_member_idx").on(table.memberId),
  ],
);

export const walletTransactions = pgTable(
  "wallet_transactions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull(),
    walletId: uuid("wallet_id").notNull(),
    memberId: uuid("member_id").notNull(),
    type: ledgerType("transaction_type").notNull(),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    description: text("description").notNull(),
    referenceType: text("reference_type"),
    referenceId: uuid("reference_id"),
    idempotencyKey: text("idempotency_key").notNull(),
    createdBy: uuid("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.householdId, table.walletId],
      foreignColumns: [wallets.householdId, wallets.id],
      name: "wallet_transactions_wallet_household_fk",
    }),
    foreignKey({
      columns: [table.householdId, table.memberId],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
      name: "wallet_transactions_member_membership_fk",
    }),
    foreignKey({
      columns: [table.householdId, table.createdBy],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
      name: "wallet_transactions_creator_membership_fk",
    }),
    unique("wallet_transactions_household_idempotency_unique").on(
      table.householdId,
      table.idempotencyKey,
    ),
    check("wallet_transactions_amount_positive", sql`${table.amountPaise} > 0`),
    index("wallet_transactions_wallet_created_idx").on(table.walletId, table.createdAt),
    index("wallet_transactions_household_created_idx").on(table.householdId, table.createdAt),
  ],
);

export const meals = pgTable(
  "meals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull(),
    name: text("name").notNull(),
    category: mealCategory("category").notNull(),
    totalPaise: bigint("total_paise", { mode: "number" }).notNull(),
    payerId: uuid("payer_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    description: text("description"),
    eatenAt: timestamp("eaten_at", { withTimezone: true }).notNull(),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    createdBy: uuid("created_by").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.householdId, table.payerId],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
      name: "meals_payer_membership_fk",
    }),
    foreignKey({
      columns: [table.householdId, table.createdBy],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
      name: "meals_creator_membership_fk",
    }),
    unique("meals_household_id_unique").on(table.householdId, table.id),
    unique("meals_household_idempotency_unique").on(table.householdId, table.idempotencyKey),
    check("meals_total_positive", sql`${table.totalPaise} > 0`),
    index("meals_household_eaten_idx").on(table.householdId, table.eatenAt),
  ],
);

export const mealParticipants = pgTable(
  "meal_participants",
  {
    householdId: uuid("household_id").notNull(),
    mealId: uuid("meal_id").notNull(),
    memberId: uuid("member_id").notNull(),
    sharePaise: bigint("share_paise", { mode: "number" }).notNull(),
    ...timestamps,
  },
  (table) => [
    primaryKey({ columns: [table.mealId, table.memberId] }),
    foreignKey({
      columns: [table.householdId, table.mealId],
      foreignColumns: [meals.householdId, meals.id],
      name: "meal_participants_meal_household_fk",
    }),
    foreignKey({
      columns: [table.householdId, table.memberId],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
      name: "meal_participants_member_membership_fk",
    }),
    check("meal_participants_share_nonnegative", sql`${table.sharePaise} >= 0`),
    index("meal_participants_member_idx").on(table.householdId, table.memberId),
  ],
);

export const commonFunds = pgTable(
  "common_funds",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull(),
    periodId: uuid("period_id").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.householdId, table.periodId],
      foreignColumns: [monthlyPeriods.householdId, monthlyPeriods.id],
      name: "common_funds_period_household_fk",
    }),
    unique("common_funds_household_period_unique").on(table.householdId, table.periodId),
    unique("common_funds_household_id_unique").on(table.householdId, table.id),
  ],
);

export const commonFundContributions = pgTable(
  "common_fund_contributions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull(),
    fundId: uuid("fund_id").notNull(),
    memberId: uuid("member_id").notNull(),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    createdBy: uuid("created_by").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.householdId, table.fundId],
      foreignColumns: [commonFunds.householdId, commonFunds.id],
      name: "common_contributions_fund_household_fk",
    }),
    foreignKey({
      columns: [table.householdId, table.memberId],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
      name: "common_contributions_member_membership_fk",
    }),
    foreignKey({
      columns: [table.householdId, table.createdBy],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
      name: "common_contributions_creator_membership_fk",
    }),
    check("common_contributions_amount_positive", sql`${table.amountPaise} > 0`),
    unique("common_contributions_household_idempotency_unique").on(table.householdId, table.idempotencyKey),
    index("common_contributions_fund_idx").on(table.householdId, table.fundId),
  ],
);

export const commonExpenses = pgTable(
  "common_expenses",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull(),
    fundId: uuid("fund_id").notNull(),
    category: text("category").notNull(),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    description: text("description").notNull(),
    purchasedBy: uuid("purchased_by").notNull(),
    receiptUrl: text("receipt_url"),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull(),
    createdBy: uuid("created_by").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.householdId, table.fundId],
      foreignColumns: [commonFunds.householdId, commonFunds.id],
      name: "common_expenses_fund_household_fk",
    }),
    foreignKey({
      columns: [table.householdId, table.purchasedBy],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
      name: "common_expenses_purchaser_membership_fk",
    }),
    foreignKey({
      columns: [table.householdId, table.createdBy],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
      name: "common_expenses_creator_membership_fk",
    }),
    check("common_expenses_amount_positive", sql`${table.amountPaise} > 0`),
    unique("common_expenses_household_idempotency_unique").on(table.householdId, table.idempotencyKey),
    index("common_expenses_fund_idx").on(table.householdId, table.fundId),
  ],
);

export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull(),
    userId: uuid("user_id").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    message: text("message").notNull(),
    href: text("href"),
    readAt: timestamp("read_at", { withTimezone: true }),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.householdId, table.userId],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
      name: "notifications_user_membership_fk",
    }),
    index("notifications_user_created_idx").on(table.householdId, table.userId, table.createdAt),
  ],
);

export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull(),
    userId: uuid("user_id").notNull(),
    endpoint: text("endpoint").notNull(),
    subscription: jsonb("subscription").notNull(),
    ...timestamps,
  },
  (table) => [
    foreignKey({
      columns: [table.householdId, table.userId],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
      name: "push_subscriptions_user_membership_fk",
    }),
    unique("push_subscriptions_household_endpoint_unique").on(table.householdId, table.endpoint),
    index("push_subscriptions_household_user_idx").on(table.householdId, table.userId),
  ],
);

export const passwordResetTokens = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique("password_reset_tokens_hash_unique").on(table.tokenHash),
    index("password_reset_tokens_user_idx").on(table.userId),
  ],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    requestCount: integer("request_count").notNull(),
    resetAt: timestamp("reset_at", { withTimezone: true }).notNull(),
  },
  (table) => [index("rate_limits_reset_at_idx").on(table.resetAt)],
);

export const phoneOtps = pgTable(
  "phone_otps",
  {
    phone: text("phone").primaryKey(),
    otpHash: text("otp_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("phone_otps_expires_at_idx").on(table.expiresAt)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    householdId: uuid("household_id").notNull(),
    actorId: uuid("actor_id").notNull(),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: uuid("resource_id"),
    idempotencyKey: text("idempotency_key"),
    details: jsonb("details").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.householdId, table.actorId],
      foreignColumns: [householdMembers.householdId, householdMembers.userId],
      name: "audit_logs_actor_membership_fk",
    }),
    unique("audit_logs_household_idempotency_unique").on(table.householdId, table.idempotencyKey),
    index("audit_logs_household_created_idx").on(table.householdId, table.createdAt),
  ],
);
