CREATE TABLE "ai_call" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"workspace_id" text,
	"repo_id" bigint,
	"operation" text NOT NULL,
	"model" text NOT NULL,
	"outcome" text NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"latency_ms" integer NOT NULL,
	"cached" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "billing_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"delivery_id" text NOT NULL,
	"workspace_id" text,
	"kind" text NOT NULL,
	"amount_cents" bigint,
	"currency" text,
	"subscription_id" text,
	"outcome" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deploy_mark" (
	"id" text PRIMARY KEY NOT NULL,
	"sha" text NOT NULL,
	"environment" text NOT NULL,
	"actor" text NOT NULL,
	"run_url" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "ai_call_at_idx" ON "ai_call" USING btree ("at");--> statement-breakpoint
CREATE INDEX "ai_call_workspace_at_idx" ON "ai_call" USING btree ("workspace_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "billing_event_delivery_unique" ON "billing_event" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX "billing_event_at_idx" ON "billing_event" USING btree ("at");--> statement-breakpoint
CREATE INDEX "deploy_mark_at_idx" ON "deploy_mark" USING btree ("at");