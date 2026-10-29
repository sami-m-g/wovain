ALTER TABLE "autonomy_setting" ADD COLUMN "ad_rules" jsonb DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "autonomy_setting" ADD COLUMN "loss_limit_cents" integer DEFAULT 5000 NOT NULL;