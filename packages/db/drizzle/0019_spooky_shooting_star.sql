CREATE TABLE "issue" (
	"repo_id" bigint NOT NULL,
	"number" integer NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"state" text NOT NULL,
	"state_reason" text,
	"author_login" text NOT NULL,
	"assignees" text[] DEFAULT '{}' NOT NULL,
	"labels" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"milestone" text,
	"comments_count" integer DEFAULT 0 NOT NULL,
	"gh_created_at" timestamp with time zone NOT NULL,
	"gh_updated_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "issue_repo_id_number_pk" PRIMARY KEY("repo_id","number")
);
--> statement-breakpoint
ALTER TABLE "repository" ADD COLUMN "issues_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "issue" ADD CONSTRAINT "issue_repo_id_repository_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "issue_state_idx" ON "issue" USING btree ("repo_id","state");--> statement-breakpoint
CREATE INDEX "issue_updated_idx" ON "issue" USING btree ("state","gh_updated_at");