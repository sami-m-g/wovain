CREATE TABLE "milestone" (
	"at" timestamp DEFAULT now() NOT NULL,
	"name" text NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "milestone_user_name_idx" ON "milestone" ("user_id","name");--> statement-breakpoint
ALTER TABLE "milestone" ADD CONSTRAINT "milestone_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;