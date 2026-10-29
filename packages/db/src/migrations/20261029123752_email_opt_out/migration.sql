CREATE TABLE "email_opt_out" (
	"created_at" timestamp DEFAULT now() NOT NULL,
	"email" text PRIMARY KEY
);
