CREATE INDEX IF NOT EXISTS "video_projects_prompt_request_ids_gin_idx" ON "video_projects" USING gin ("promptRequestIds");
CREATE INDEX IF NOT EXISTS "video_projects_fal_request_ids_gin_idx" ON "video_projects" USING gin ("falRequestIds");
