ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "shotAnalysis" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "customCameraMoves" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "clipDurations" jsonb DEFAULT '[]'::jsonb;
