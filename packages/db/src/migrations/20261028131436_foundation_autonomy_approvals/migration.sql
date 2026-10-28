CREATE TABLE "ad_optimizer_state" (
	"alpha" real DEFAULT 1 NOT NULL,
	"beta" real DEFAULT 1 NOT NULL,
	"campaign_id" text,
	"clicks" integer DEFAULT 0 NOT NULL,
	"conversions" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"impressions" integer DEFAULT 0 NOT NULL,
	"learning" boolean DEFAULT true NOT NULL,
	"meta_ad_id" text NOT NULL,
	"meta_ad_set_id" text NOT NULL,
	"params" jsonb DEFAULT '{}' NOT NULL,
	"spend_cents" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL,
	"weight" real DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval" (
	"action_type" text NOT NULL,
	"cost_preview" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"decided_at" timestamp,
	"decided_by" text,
	"decision_note" text,
	"domain" text NOT NULL,
	"drop_id" text,
	"error" text,
	"expires_at" timestamp,
	"id" text PRIMARY KEY,
	"idempotency_key" text,
	"inverse" jsonb,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"policy_reason" text NOT NULL,
	"proposed_by" text NOT NULL,
	"reason" text,
	"result" jsonb,
	"risk" text NOT NULL,
	"run_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"suggestion_id" text,
	"title" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_event" (
	"actor" text NOT NULL,
	"after" jsonb,
	"approval_id" text,
	"before" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"event" text NOT NULL,
	"id" text PRIMARY KEY,
	"note" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autonomy_setting" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"daily_spend_cap_cents" integer DEFAULT 0 NOT NULL,
	"id" text PRIMARY KEY,
	"level" text DEFAULT 'suggest' NOT NULL,
	"monthly_spend_cap_cents" integer DEFAULT 0 NOT NULL,
	"paused" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL UNIQUE
);
--> statement-breakpoint
CREATE TABLE "brand_profile" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"demographics" jsonb DEFAULT '{}' NOT NULL,
	"display_name" text,
	"id" text PRIMARY KEY,
	"niches" jsonb DEFAULT '[]' NOT NULL,
	"palette" jsonb DEFAULT '[]' NOT NULL,
	"qloo_entities" jsonb DEFAULT '[]' NOT NULL,
	"taste_references" jsonb DEFAULT '[]' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL UNIQUE,
	"voice" text
);
--> statement-breakpoint
CREATE TABLE "decision_trace" (
	"agent" text NOT NULL,
	"approval_id" text,
	"at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"drop_id" text,
	"id" text PRIMARY KEY,
	"input_summary" text NOT NULL,
	"model" text,
	"ms" integer,
	"ok" boolean DEFAULT true NOT NULL,
	"output" jsonb,
	"run_id" text,
	"seq" integer NOT NULL,
	"sources" jsonb DEFAULT '[]' NOT NULL,
	"step" text NOT NULL,
	"suggestion_id" text,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "device" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"platform" text NOT NULL,
	"token" text NOT NULL UNIQUE,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drop" (
	"brief" jsonb,
	"collection_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"name" text NOT NULL,
	"palette" jsonb DEFAULT '[]' NOT NULL,
	"qloo_tags" jsonb DEFAULT '[]' NOT NULL,
	"run_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"style_family" text,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "drop_item" (
	"catalog_product_id" text NOT NULL,
	"colors" jsonb DEFAULT '[]' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"design_id" text,
	"drop_id" text NOT NULL,
	"id" text PRIMARY KEY,
	"position" integer DEFAULT 0 NOT NULL,
	"price_cents" integer,
	"product_id" text,
	"regions" jsonb DEFAULT '{}' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_snapshot" (
	"add_to_carts" integer DEFAULT 0 NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"date" date NOT NULL,
	"entity_id" text NOT NULL,
	"id" text PRIMARY KEY,
	"impressions" integer DEFAULT 0 NOT NULL,
	"level" text NOT NULL,
	"product_id" text,
	"purchases" integer DEFAULT 0 NOT NULL,
	"raw" jsonb,
	"revenue_cents" integer DEFAULT 0 NOT NULL,
	"sessions" integer DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"spend_cents" integer DEFAULT 0 NOT NULL,
	"units" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suggestion" (
	"approval_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"id" text PRIMARY KEY,
	"kind" text NOT NULL,
	"payload" jsonb DEFAULT '{}' NOT NULL,
	"rationale" text NOT NULL,
	"run_id" text,
	"sources" jsonb DEFAULT '[]' NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"title" text NOT NULL,
	"trigger" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "ad_optimizer_state_ad_idx" ON "ad_optimizer_state" ("user_id","meta_ad_id");--> statement-breakpoint
CREATE INDEX "approval_user_status_idx" ON "approval" ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_user_idempotency_idx" ON "approval" ("user_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "audit_event_user_idx" ON "audit_event" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_event_approval_idx" ON "audit_event" ("approval_id");--> statement-breakpoint
CREATE INDEX "decision_trace_run_idx" ON "decision_trace" ("run_id");--> statement-breakpoint
CREATE INDEX "decision_trace_approval_idx" ON "decision_trace" ("approval_id");--> statement-breakpoint
CREATE INDEX "decision_trace_drop_idx" ON "decision_trace" ("drop_id");--> statement-breakpoint
CREATE INDEX "decision_trace_user_idx" ON "decision_trace" ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "device_user_idx" ON "device" ("user_id");--> statement-breakpoint
CREATE INDEX "drop_user_idx" ON "drop" ("user_id");--> statement-breakpoint
CREATE INDEX "drop_item_drop_idx" ON "drop_item" ("drop_id");--> statement-breakpoint
CREATE UNIQUE INDEX "performance_snapshot_entity_day_idx" ON "performance_snapshot" ("user_id","source","level","entity_id","date");--> statement-breakpoint
CREATE INDEX "suggestion_user_status_idx" ON "suggestion" ("user_id","status");--> statement-breakpoint
ALTER TABLE "ad_optimizer_state" ADD CONSTRAINT "ad_optimizer_state_campaign_id_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaign"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "ad_optimizer_state" ADD CONSTRAINT "ad_optimizer_state_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_drop_id_drop_id_fkey" FOREIGN KEY ("drop_id") REFERENCES "drop"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_run_id_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "run"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_suggestion_id_suggestion_id_fkey" FOREIGN KEY ("suggestion_id") REFERENCES "suggestion"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_approval_id_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "approval"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "audit_event" ADD CONSTRAINT "audit_event_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "autonomy_setting" ADD CONSTRAINT "autonomy_setting_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "brand_profile" ADD CONSTRAINT "brand_profile_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "decision_trace" ADD CONSTRAINT "decision_trace_approval_id_approval_id_fkey" FOREIGN KEY ("approval_id") REFERENCES "approval"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "decision_trace" ADD CONSTRAINT "decision_trace_drop_id_drop_id_fkey" FOREIGN KEY ("drop_id") REFERENCES "drop"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "decision_trace" ADD CONSTRAINT "decision_trace_run_id_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "run"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "decision_trace" ADD CONSTRAINT "decision_trace_suggestion_id_suggestion_id_fkey" FOREIGN KEY ("suggestion_id") REFERENCES "suggestion"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "decision_trace" ADD CONSTRAINT "decision_trace_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "device" ADD CONSTRAINT "device_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "drop" ADD CONSTRAINT "drop_run_id_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "run"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "drop" ADD CONSTRAINT "drop_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "drop_item" ADD CONSTRAINT "drop_item_design_id_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "design"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "drop_item" ADD CONSTRAINT "drop_item_drop_id_drop_id_fkey" FOREIGN KEY ("drop_id") REFERENCES "drop"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "drop_item" ADD CONSTRAINT "drop_item_product_id_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "drop_item" ADD CONSTRAINT "drop_item_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "performance_snapshot" ADD CONSTRAINT "performance_snapshot_product_id_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "performance_snapshot" ADD CONSTRAINT "performance_snapshot_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "suggestion" ADD CONSTRAINT "suggestion_run_id_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "run"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "suggestion" ADD CONSTRAINT "suggestion_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;