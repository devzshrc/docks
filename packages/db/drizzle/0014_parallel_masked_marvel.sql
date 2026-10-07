ALTER TABLE "workspace" ADD COLUMN "last_weekly_report_on" text;--> statement-breakpoint
ALTER TABLE "pull_request" ADD COLUMN "gh_created_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pull_request" ADD COLUMN "merged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "pull_request" ADD COLUMN "first_review_at" timestamp with time zone;