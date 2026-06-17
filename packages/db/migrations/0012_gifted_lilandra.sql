CREATE INDEX "decisions_project_id_idx" ON "decisions" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "documents_project_id_idx" ON "documents" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "features_project_id_idx" ON "features" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ideas_project_id_idx" ON "ideas" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "objectives_project_id_idx" ON "objectives" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "plans_project_id_idx" ON "plans" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "releases_project_id_idx" ON "releases" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "share_tokens_project_id_idx" ON "share_tokens" USING btree ("project_id");