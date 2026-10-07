CREATE TABLE "linear_integration" (
	"workspace_id" text PRIMARY KEY NOT NULL,
	"api_key_encrypted" text NOT NULL,
	"org_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pull_request" ADD COLUMN "applied_rules" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "repository" ADD COLUMN "routing_rules" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "linear_integration" ADD CONSTRAINT "linear_integration_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;