ALTER TABLE "review_guide" ADD COLUMN "input_tokens" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "review_guide" ADD COLUMN "output_tokens" integer DEFAULT 0 NOT NULL;