ALTER TABLE "video_projects"
  ADD COLUMN IF NOT EXISTS "promptRequestIds" jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "generatedPrompts" jsonb DEFAULT '[]'::jsonb;
