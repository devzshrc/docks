ALTER TABLE "slack_integration" ADD COLUMN "team_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "slack_integration" ADD COLUMN "channel_name" text NOT NULL;--> statement-breakpoint
ALTER TABLE "slack_integration" ADD COLUMN "webhook_url_encrypted" text NOT NULL;--> statement-breakpoint
ALTER TABLE "slack_integration" ADD COLUMN "timezone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "slack_integration" ADD COLUMN "last_digest_on" text;