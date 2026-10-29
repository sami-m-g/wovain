CREATE TABLE "direction_cache" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "direction_cache_user_key_idx" ON "direction_cache" ("user_id","key");--> statement-breakpoint
ALTER TABLE "direction_cache" ADD CONSTRAINT "direction_cache_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;