CREATE TABLE "promo_attempt" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"outcome" text NOT NULL,
	"promo_id" text,
	"surface" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "credit_grant" ADD COLUMN "promo_id" text;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD COLUMN "note" text;--> statement-breakpoint
CREATE UNIQUE INDEX "credit_grant_user_promo_idx" ON "credit_grant" ("user_id","promo_id");--> statement-breakpoint
CREATE INDEX "promo_attempt_user_idx" ON "promo_attempt" ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "promo_attempt" ADD CONSTRAINT "promo_attempt_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;