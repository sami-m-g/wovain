CREATE TABLE "external_write" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"key" text PRIMARY KEY,
	"operation" text NOT NULL,
	"provider" text NOT NULL,
	"result" jsonb,
	"run_id" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "campaign" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "product" ADD COLUMN "idempotency_key" text;--> statement-breakpoint
ALTER TABLE "campaign" ADD CONSTRAINT "campaign_idempotency_key_key" UNIQUE("idempotency_key");--> statement-breakpoint
ALTER TABLE "design" ADD CONSTRAINT "design_idempotency_key_key" UNIQUE("idempotency_key");--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_idempotency_key_key" UNIQUE("idempotency_key");--> statement-breakpoint
CREATE INDEX "external_write_run_idx" ON "external_write" ("run_id");--> statement-breakpoint
ALTER TABLE "external_write" ADD CONSTRAINT "external_write_run_id_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "run"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "external_write" ADD CONSTRAINT "external_write_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;