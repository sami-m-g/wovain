CREATE TABLE "design_outcome" (
	"add_to_carts" integer DEFAULT 0 NOT NULL,
	"audience" text,
	"blank" text NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"design_id" text NOT NULL,
	"drop_id" text,
	"id" text PRIMARY KEY,
	"idea_id" text NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"launched_at" timestamp NOT NULL,
	"meta_read_at" timestamp,
	"palette" text,
	"price_cents" integer NOT NULL,
	"product_id" text NOT NULL,
	"profit_per_sale_cents" integer NOT NULL,
	"purchases" integer DEFAULT 0 NOT NULL,
	"qloo_entities" jsonb DEFAULT '[]' NOT NULL,
	"qloo_tags" jsonb DEFAULT '[]' NOT NULL,
	"revenue_cents" integer DEFAULT 0 NOT NULL,
	"sales_covered" boolean DEFAULT false NOT NULL,
	"spend_cents" integer DEFAULT 0 NOT NULL,
	"theme" text NOT NULL,
	"units" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "design_outcome_product_idx" ON "design_outcome" ("user_id","product_id");--> statement-breakpoint
ALTER TABLE "design_outcome" ADD CONSTRAINT "design_outcome_design_id_design_id_fkey" FOREIGN KEY ("design_id") REFERENCES "design"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "design_outcome" ADD CONSTRAINT "design_outcome_drop_id_drop_id_fkey" FOREIGN KEY ("drop_id") REFERENCES "drop"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "design_outcome" ADD CONSTRAINT "design_outcome_product_id_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "product"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "design_outcome" ADD CONSTRAINT "design_outcome_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;