CREATE TABLE "review_visit" (
	"user_id" text NOT NULL,
	"repo" text NOT NULL,
	"pr_number" integer NOT NULL,
	"reviewed_sha" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_visit_user_id_repo_pr_number_pk" PRIMARY KEY("user_id","repo","pr_number")
);
--> statement-breakpoint
ALTER TABLE "pull_request" ADD COLUMN "mergeable_state" text;--> statement-breakpoint
ALTER TABLE "repository" ADD COLUMN "checklist_template" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "review_visit" ADD CONSTRAINT "review_visit_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;