CREATE TABLE "webhook_delivery" (
	"id" serial PRIMARY KEY NOT NULL,
	"delivery_id" text,
	"installation_id" bigint,
	"event" text NOT NULL,
	"result" text NOT NULL,
	"reason" text,
	"duration_ms" integer DEFAULT 0 NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "webhook_delivery_received_at_idx" ON "webhook_delivery" USING btree ("received_at");--> statement-breakpoint
CREATE INDEX "webhook_delivery_installation_idx" ON "webhook_delivery" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "webhook_delivery_result_idx" ON "webhook_delivery" USING btree ("result");