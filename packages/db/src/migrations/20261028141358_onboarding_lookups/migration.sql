CREATE TABLE "taste_reference" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"entities" jsonb DEFAULT '[]' NOT NULL,
	"failed" boolean DEFAULT false NOT NULL,
	"id" text PRIMARY KEY,
	"key" text NOT NULL UNIQUE,
	"reference" text NOT NULL,
	"resolved_at" timestamp DEFAULT now() NOT NULL,
	"resolved_by" text,
	"sources" jsonb DEFAULT '[]' NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "brand_profile" ADD COLUMN "onboarded_at" timestamp;--> statement-breakpoint
CREATE INDEX "taste_reference_resolved_by_idx" ON "taste_reference" ("resolved_by","resolved_at");--> statement-breakpoint
ALTER TABLE "taste_reference" ADD CONSTRAINT "taste_reference_resolved_by_user_id_fkey" FOREIGN KEY ("resolved_by") REFERENCES "user"("id") ON DELETE SET NULL;