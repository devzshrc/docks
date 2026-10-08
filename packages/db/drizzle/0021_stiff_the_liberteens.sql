CREATE TABLE "release" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" text NOT NULL,
	"name" text NOT NULL,
	"target_date" timestamp with time zone,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_pr" (
	"release_id" uuid NOT NULL,
	"repo_id" bigint NOT NULL,
	"pr_number" integer NOT NULL,
	"readiness" jsonb,
	"refresh_requested_at" timestamp with time zone,
	CONSTRAINT "release_pr_release_id_repo_id_pr_number_pk" PRIMARY KEY("release_id","repo_id","pr_number")
);
--> statement-breakpoint
CREATE TABLE "review_cycle" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" bigint NOT NULL,
	"pr_number" integer NOT NULL,
	"kind" text NOT NULL,
	"reviewer" text NOT NULL,
	"head_sha" text NOT NULL,
	"source_key" text NOT NULL,
	"rules" jsonb NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"remind_at" timestamp with time zone NOT NULL,
	"paused_at" timestamp with time zone,
	"remaining_minutes" integer,
	"completed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"backup_login" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_cycle_source_key_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE TABLE "review_delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cycle_id" uuid NOT NULL,
	"stage" text NOT NULL,
	"inbox_at" timestamp with time zone,
	"slack_at" timestamp with time zone,
	"skipped_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"repo_id" bigint NOT NULL,
	"pr_number" integer NOT NULL,
	"source_key" text NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"collected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data" jsonb NOT NULL,
	CONSTRAINT "review_evidence_source_key_unique" UNIQUE("source_key")
);
--> statement-breakpoint
CREATE TABLE "review_policy" (
	"repo_id" bigint PRIMARY KEY NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"rules" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pr_review" ADD COLUMN "commit_sha" text;--> statement-breakpoint
ALTER TABLE "pr_review" ADD COLUMN "user_type" text;--> statement-breakpoint
ALTER TABLE "release" ADD CONSTRAINT "release_workspace_id_workspace_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspace"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_pr" ADD CONSTRAINT "release_pr_release_id_release_id_fk" FOREIGN KEY ("release_id") REFERENCES "public"."release"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "release_pr" ADD CONSTRAINT "release_pr_repo_id_repository_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_cycle" ADD CONSTRAINT "review_cycle_repo_id_repository_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_delivery" ADD CONSTRAINT "review_delivery_cycle_id_review_cycle_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."review_cycle"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_evidence" ADD CONSTRAINT "review_evidence_repo_id_repository_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_policy" ADD CONSTRAINT "review_policy_repo_id_repository_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "release_workspace_idx" ON "release" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "review_cycle_due_idx" ON "review_cycle" USING btree ("due_at");--> statement-breakpoint
CREATE INDEX "review_cycle_pr_idx" ON "review_cycle" USING btree ("repo_id","pr_number");--> statement-breakpoint
CREATE UNIQUE INDEX "review_delivery_stage_idx" ON "review_delivery" USING btree ("cycle_id","stage");--> statement-breakpoint
CREATE INDEX "review_evidence_pr_idx" ON "review_evidence" USING btree ("repo_id","pr_number","occurred_at");