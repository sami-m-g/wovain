ALTER TABLE "design" ADD COLUMN "mockup_status" text;--> statement-breakpoint
ALTER TABLE "design" ADD COLUMN "mockups" jsonb DEFAULT '[]' NOT NULL;