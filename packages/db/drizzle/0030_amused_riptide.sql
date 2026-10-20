CREATE TABLE "guide_feedback" (
	"user_id" text NOT NULL,
	"repo" text NOT NULL,
	"pr_number" integer NOT NULL,
	"head_sha" text NOT NULL,
	"item" text NOT NULL,
	"vote" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "guide_feedback_user_id_repo_pr_number_head_sha_item_pk" PRIMARY KEY("user_id","repo","pr_number","head_sha","item")
);
--> statement-breakpoint
ALTER TABLE "guide_feedback" ADD CONSTRAINT "guide_feedback_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;