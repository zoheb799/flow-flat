ALTER TABLE "audit_logs" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "common_expenses" ADD COLUMN "idempotency_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "common_fund_contributions" ADD COLUMN "idempotency_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_household_idempotency_unique" UNIQUE("household_id","idempotency_key");--> statement-breakpoint
ALTER TABLE "common_expenses" ADD CONSTRAINT "common_expenses_household_idempotency_unique" UNIQUE("household_id","idempotency_key");--> statement-breakpoint
ALTER TABLE "common_fund_contributions" ADD CONSTRAINT "common_contributions_household_idempotency_unique" UNIQUE("household_id","idempotency_key");