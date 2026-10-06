ALTER TABLE "pull_request" ADD COLUMN "claimed_by" text;--> statement-breakpoint
ALTER TABLE "pull_request" ADD COLUMN "auto_assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "repository" ADD COLUMN "auto_assign" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "pull_request" ADD CONSTRAINT "pull_request_claimed_by_user_id_fk" FOREIGN KEY ("claimed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;