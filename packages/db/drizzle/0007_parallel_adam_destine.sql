ALTER TABLE "workspace" ADD COLUMN "billing_customer_id" text;--> statement-breakpoint
ALTER TABLE "workspace" ADD COLUMN "billing_subscription_id" text;--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_billing_customer_id_unique" UNIQUE("billing_customer_id");--> statement-breakpoint
ALTER TABLE "workspace" ADD CONSTRAINT "workspace_billing_subscription_id_unique" UNIQUE("billing_subscription_id");