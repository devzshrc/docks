CREATE TABLE "review_inbox_state" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" bigint NOT NULL,
	"pr_number" integer NOT NULL,
	"user_id" text NOT NULL,
	"snoozed_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "review_inbox_state" ADD CONSTRAINT "review_inbox_state_repo_id_repository_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_inbox_state" ADD CONSTRAINT "review_inbox_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "review_inbox_state_owner_pr_idx" ON "review_inbox_state" USING btree ("user_id","repo_id","pr_number");