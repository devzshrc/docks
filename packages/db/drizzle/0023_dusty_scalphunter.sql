CREATE TABLE "server_error" (
	"hash" text PRIMARY KEY NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"total" integer DEFAULT 1 NOT NULL,
	"first_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "server_error_last_at_idx" ON "server_error" USING btree ("last_at");