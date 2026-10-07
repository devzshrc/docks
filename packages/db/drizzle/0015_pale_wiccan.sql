CREATE TABLE "event" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"workspace_id" text,
	"name" text NOT NULL,
	"props" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "event_name_at_idx" ON "event" USING btree ("name","at");--> statement-breakpoint
CREATE INDEX "event_user_idx" ON "event" USING btree ("user_id","name");