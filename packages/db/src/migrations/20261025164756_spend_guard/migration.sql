CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY,
	"key" text NOT NULL UNIQUE,
	"count" integer NOT NULL,
	"last_request" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage" (
	"cost_usd" real NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"kind" text NOT NULL,
	"run_id" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "usage_created_idx" ON "usage" ("created_at");--> statement-breakpoint
CREATE INDEX "usage_user_created_idx" ON "usage" ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "usage" ADD CONSTRAINT "usage_run_id_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "run"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "usage" ADD CONSTRAINT "usage_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;