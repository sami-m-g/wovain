CREATE TABLE "billing_subscription" (
	"cancel_at_period_end" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"current_period_end" timestamp,
	"id" text PRIMARY KEY,
	"plan" text NOT NULL,
	"polar_modified_at" timestamp NOT NULL,
	"product_id" text NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_grant" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"period_key" text NOT NULL,
	"remaining" bigint NOT NULL,
	"revoked_at" timestamp,
	"rollover" boolean NOT NULL,
	"source" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "credit_grant_remaining_check" CHECK ("remaining" >= 0)
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"delta" bigint NOT NULL,
	"grant_id" text,
	"id" text PRIMARY KEY,
	"idempotency_key" text NOT NULL UNIQUE,
	"reason" text NOT NULL,
	"reservation_id" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_reservation" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"credits" integer NOT NULL,
	"id" text PRIMARY KEY,
	"run_id" text,
	"status" text DEFAULT 'held' NOT NULL,
	"step" text NOT NULL,
	"takes" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "credit_reservation_credits_check" CHECK ("credits" > 0)
);
--> statement-breakpoint
CREATE INDEX "billing_subscription_user_idx" ON "billing_subscription" ("user_id");--> statement-breakpoint
CREATE INDEX "credit_grant_user_idx" ON "credit_grant" ("user_id");--> statement-breakpoint
CREATE INDEX "credit_ledger_user_idx" ON "credit_ledger" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_reservation_user_idx" ON "credit_reservation" ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "billing_subscription" ADD CONSTRAINT "billing_subscription_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credit_grant" ADD CONSTRAINT "credit_grant_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "credit_reservation" ADD CONSTRAINT "credit_reservation_run_id_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "run"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "credit_reservation" ADD CONSTRAINT "credit_reservation_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;