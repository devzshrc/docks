CREATE TABLE "repository_rules" (
	"repo_id" bigint PRIMARY KEY NOT NULL,
	"file_sha" text,
	"rules" jsonb,
	"error" text,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "repository_rules" ADD CONSTRAINT "repository_rules_repo_id_repository_id_fk" FOREIGN KEY ("repo_id") REFERENCES "public"."repository"("id") ON DELETE cascade ON UPDATE no action;