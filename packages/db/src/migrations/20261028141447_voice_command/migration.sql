CREATE TABLE "voice_command" (
	"confirmed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE INDEX "voice_command_user_idx" ON "voice_command" ("user_id","created_at");--> statement-breakpoint
ALTER TABLE "voice_command" ADD CONSTRAINT "voice_command_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;