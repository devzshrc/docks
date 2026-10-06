ALTER TABLE "github_identity" ADD COLUMN "access_token_encrypted" text NOT NULL;--> statement-breakpoint
ALTER TABLE "github_identity" ADD COLUMN "access_token_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "github_identity" ADD COLUMN "refresh_token_encrypted" text;--> statement-breakpoint
ALTER TABLE "github_identity" ADD COLUMN "refresh_token_expires_at" timestamp with time zone;