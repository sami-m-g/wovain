CREATE TABLE "alert_delivery" (
	"channel" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"error" text,
	"id" text PRIMARY KEY,
	"key" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "telegram_chat" (
	"chat_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"id" text PRIMARY KEY,
	"link_expires_at" timestamp,
	"link_token_hash" text UNIQUE,
	"linked_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"user_id" text NOT NULL UNIQUE,
	"username" text
);
--> statement-breakpoint
ALTER TABLE "autonomy_setting" ADD COLUMN "alerts" jsonb;--> statement-breakpoint
CREATE UNIQUE INDEX "alert_delivery_key_idx" ON "alert_delivery" ("user_id","key","channel");--> statement-breakpoint
ALTER TABLE "alert_delivery" ADD CONSTRAINT "alert_delivery_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "telegram_chat" ADD CONSTRAINT "telegram_chat_user_id_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE;