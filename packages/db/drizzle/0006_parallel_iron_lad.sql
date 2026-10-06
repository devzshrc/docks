ALTER TABLE "workspace" DROP CONSTRAINT "workspace_stripe_customer_id_unique";--> statement-breakpoint
ALTER TABLE "workspace" DROP CONSTRAINT "workspace_stripe_subscription_id_unique";--> statement-breakpoint
ALTER TABLE "workspace" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
ALTER TABLE "workspace" DROP COLUMN "stripe_subscription_id";