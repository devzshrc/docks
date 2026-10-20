CREATE INDEX "pr_review_submitted_idx" ON "pr_review" USING btree ("repo_id","submitted_at");--> statement-breakpoint
CREATE INDEX "pull_request_created_idx" ON "pull_request" USING btree ("repo_id","gh_created_at");--> statement-breakpoint
CREATE INDEX "pull_request_merged_idx" ON "pull_request" USING btree ("repo_id","merged_at");