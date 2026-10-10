CREATE TABLE "repository_knowledge" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" bigint NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"body" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "repository_knowledge_revision" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"category" text NOT NULL,
	"body" text NOT NULL,
	"archived" boolean NOT NULL,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_follow_up" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" bigint NOT NULL,
	"pr_number" integer NOT NULL,
	"head_sha" text NOT NULL,
	"comment_id" bigint,
	"path" text,
	"line" integer,
	"target_repo_id" bigint NOT NULL,
	"issue_number" integer NOT NULL,
	"creation_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_question" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" bigint NOT NULL,
	"pr_number" integer NOT NULL,
	"user_id" text NOT NULL,
	"head_sha" text NOT NULL,
	"question" text NOT NULL,
	"answer" text NOT NULL,
	"path" text,
	"citations" jsonb NOT NULL,
	"knowledge" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repository_knowledge" ADD CONSTRAINT "repository_knowledge_repo_id_repository_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_knowledge_revision" ADD CONSTRAINT "repository_knowledge_revision_document_id_repository_knowledge_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."repository_knowledge"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "repository_knowledge_revision" ADD CONSTRAINT "repository_knowledge_revision_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_follow_up" ADD CONSTRAINT "review_follow_up_repo_id_repository_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_follow_up" ADD CONSTRAINT "review_follow_up_target_repo_id_repository_id_fk" FOREIGN KEY ("target_repo_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_question" ADD CONSTRAINT "review_question_repo_id_repository_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_question" ADD CONSTRAINT "review_question_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "repository_knowledge_repo_idx" ON "repository_knowledge" USING btree ("repo_id");--> statement-breakpoint
CREATE UNIQUE INDEX "repository_knowledge_revision_version_idx" ON "repository_knowledge_revision" USING btree ("document_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "review_follow_up_creation_idx" ON "review_follow_up" USING btree ("creation_id");--> statement-breakpoint
CREATE INDEX "review_follow_up_pr_idx" ON "review_follow_up" USING btree ("repo_id","pr_number");--> statement-breakpoint
CREATE INDEX "review_question_owner_pr_idx" ON "review_question" USING btree ("user_id","repo_id","pr_number");