CREATE TYPE "public"."household_role" AS ENUM('ADMIN', 'MEMBER');--> statement-breakpoint
CREATE TYPE "public"."ledger_type" AS ENUM('CONTRIBUTION', 'MEAL_DEBIT', 'MEAL_REFUND', 'MANUAL_CREDIT', 'MANUAL_DEBIT', 'ADJUSTMENT', 'MONTHLY_OPENING_BALANCE');--> statement-breakpoint
CREATE TYPE "public"."meal_category" AS ENUM('BREAKFAST', 'LUNCH', 'DINNER', 'SNACKS', 'TEA_COFFEE', 'GROCERIES', 'OTHER');--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"action" text NOT NULL,
	"resource_type" text NOT NULL,
	"resource_id" uuid,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "common_expenses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"fund_id" uuid NOT NULL,
	"category" text NOT NULL,
	"amount_paise" bigint NOT NULL,
	"description" text NOT NULL,
	"purchased_by" uuid NOT NULL,
	"receipt_url" text,
	"purchased_at" timestamp with time zone NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "common_expenses_amount_positive" CHECK ("common_expenses"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "common_fund_contributions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"fund_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"amount_paise" bigint NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "common_contributions_amount_positive" CHECK ("common_fund_contributions"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "common_funds" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"period_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "common_funds_household_period_unique" UNIQUE("household_id","period_id"),
	CONSTRAINT "common_funds_household_id_unique" UNIQUE("household_id","id")
);
--> statement-breakpoint
CREATE TABLE "household_members" (
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "household_role" DEFAULT 'MEMBER' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_members_household_id_user_id_pk" PRIMARY KEY("household_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_by" uuid NOT NULL,
	"allow_overdrafts" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "households_id_creator_unique" UNIQUE("id","created_by")
);
--> statement-breakpoint
CREATE TABLE "invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"email" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "meal_participants" (
	"household_id" uuid NOT NULL,
	"meal_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"share_paise" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_participants_meal_id_member_id_pk" PRIMARY KEY("meal_id","member_id"),
	CONSTRAINT "meal_participants_share_nonnegative" CHECK ("meal_participants"."share_paise" >= 0)
);
--> statement-breakpoint
CREATE TABLE "meals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"category" "meal_category" NOT NULL,
	"total_paise" bigint NOT NULL,
	"payer_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"description" text,
	"eaten_at" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meals_household_id_unique" UNIQUE("household_id","id"),
	CONSTRAINT "meals_household_idempotency_unique" UNIQUE("household_id","idempotency_key"),
	CONSTRAINT "meals_total_positive" CHECK ("meals"."total_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "monthly_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "monthly_periods_household_id_unique" UNIQUE("household_id","id"),
	CONSTRAINT "monthly_periods_household_start_unique" UNIQUE("household_id","starts_at"),
	CONSTRAINT "monthly_periods_valid_range" CHECK ("monthly_periods"."ends_at" > "monthly_periods"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"href" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"subscription" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "wallet_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"wallet_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"transaction_type" "ledger_type" NOT NULL,
	"amount_paise" bigint NOT NULL,
	"description" text NOT NULL,
	"reference_type" text,
	"reference_id" uuid,
	"idempotency_key" text NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallet_transactions_household_idempotency_unique" UNIQUE("household_id","idempotency_key"),
	CONSTRAINT "wallet_transactions_amount_positive" CHECK ("wallet_transactions"."amount_paise" > 0)
);
--> statement-breakpoint
CREATE TABLE "wallets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"balance_paise" bigint DEFAULT 0 NOT NULL,
	"low_balance_paise" bigint DEFAULT 10000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "wallets_household_member_unique" UNIQUE("household_id","member_id"),
	CONSTRAINT "wallets_household_id_unique" UNIQUE("household_id","id"),
	CONSTRAINT "wallets_balance_nonnegative" CHECK ("wallets"."balance_paise" >= 0),
	CONSTRAINT "wallets_low_balance_nonnegative" CHECK ("wallets"."low_balance_paise" >= 0)
);
--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_membership_fk" FOREIGN KEY ("household_id","actor_id") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "common_expenses" ADD CONSTRAINT "common_expenses_fund_household_fk" FOREIGN KEY ("household_id","fund_id") REFERENCES "public"."common_funds"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "common_expenses" ADD CONSTRAINT "common_expenses_purchaser_membership_fk" FOREIGN KEY ("household_id","purchased_by") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "common_expenses" ADD CONSTRAINT "common_expenses_creator_membership_fk" FOREIGN KEY ("household_id","created_by") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "common_fund_contributions" ADD CONSTRAINT "common_contributions_fund_household_fk" FOREIGN KEY ("household_id","fund_id") REFERENCES "public"."common_funds"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "common_fund_contributions" ADD CONSTRAINT "common_contributions_member_membership_fk" FOREIGN KEY ("household_id","member_id") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "common_fund_contributions" ADD CONSTRAINT "common_contributions_creator_membership_fk" FOREIGN KEY ("household_id","created_by") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "common_funds" ADD CONSTRAINT "common_funds_period_household_fk" FOREIGN KEY ("household_id","period_id") REFERENCES "public"."monthly_periods"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "households" ADD CONSTRAINT "households_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_creator_membership_fk" FOREIGN KEY ("household_id","created_by") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_participants" ADD CONSTRAINT "meal_participants_meal_household_fk" FOREIGN KEY ("household_id","meal_id") REFERENCES "public"."meals"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_participants" ADD CONSTRAINT "meal_participants_member_membership_fk" FOREIGN KEY ("household_id","member_id") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_payer_membership_fk" FOREIGN KEY ("household_id","payer_id") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meals" ADD CONSTRAINT "meals_creator_membership_fk" FOREIGN KEY ("household_id","created_by") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_periods" ADD CONSTRAINT "monthly_periods_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_membership_fk" FOREIGN KEY ("household_id","user_id") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_membership_fk" FOREIGN KEY ("household_id","user_id") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_wallet_household_fk" FOREIGN KEY ("household_id","wallet_id") REFERENCES "public"."wallets"("household_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_member_membership_fk" FOREIGN KEY ("household_id","member_id") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallet_transactions" ADD CONSTRAINT "wallet_transactions_creator_membership_fk" FOREIGN KEY ("household_id","created_by") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wallets" ADD CONSTRAINT "wallets_member_membership_fk" FOREIGN KEY ("household_id","member_id") REFERENCES "public"."household_members"("household_id","user_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_logs_household_created_idx" ON "audit_logs" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE INDEX "common_expenses_fund_idx" ON "common_expenses" USING btree ("household_id","fund_id");--> statement-breakpoint
CREATE INDEX "common_contributions_fund_idx" ON "common_fund_contributions" USING btree ("household_id","fund_id");--> statement-breakpoint
CREATE INDEX "household_members_user_idx" ON "household_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "invitations_household_idx" ON "invitations" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "meal_participants_member_idx" ON "meal_participants" USING btree ("household_id","member_id");--> statement-breakpoint
CREATE INDEX "meals_household_eaten_idx" ON "meals" USING btree ("household_id","eaten_at");--> statement-breakpoint
CREATE INDEX "monthly_periods_household_idx" ON "monthly_periods" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "notifications_user_created_idx" ON "notifications" USING btree ("household_id","user_id","created_at");--> statement-breakpoint
CREATE INDEX "push_subscriptions_household_user_idx" ON "push_subscriptions" USING btree ("household_id","user_id");--> statement-breakpoint
CREATE INDEX "wallet_transactions_wallet_created_idx" ON "wallet_transactions" USING btree ("wallet_id","created_at");--> statement-breakpoint
CREATE INDEX "wallet_transactions_household_created_idx" ON "wallet_transactions" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE INDEX "wallets_member_idx" ON "wallets" USING btree ("member_id");