CREATE TABLE "phone_otps" (
	"phone" text PRIMARY KEY NOT NULL,
	"otp_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "phone_otps_expires_at_idx" ON "phone_otps" USING btree ("expires_at");