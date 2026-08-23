CREATE TYPE "project_status" AS ENUM ('Uploading', 'Processing', 'Review', 'Done');
CREATE TYPE "render_phase" AS ENUM ('idle', 'generating', 'assembly', 'complete', 'failed');

CREATE TABLE "video_projects" (
  "id" serial PRIMARY KEY,
  "userId" integer NOT NULL,
  "title" varchar(160) NOT NULL,
  "description" text,
  "location" varchar(180) NOT NULL,
  "mediaUrls" jsonb NOT NULL,
  "mediaKeys" jsonb NOT NULL,
  "mediaNames" jsonb NOT NULL,
  "mediaTypes" jsonb NOT NULL,
  "status" "project_status" NOT NULL DEFAULT 'Review',
  "revisionNotes" text,
  "finalVideoUrl" text,
  "falRequestIds" jsonb DEFAULT '[]'::jsonb,
  "clipUrls" jsonb DEFAULT '[]'::jsonb,
  "renderProgress" integer NOT NULL DEFAULT 0,
  "renderPhase" "render_phase" NOT NULL DEFAULT 'idle',
  "renderError" text,
  "createdAt" timestamptz NOT NULL DEFAULT now(),
  "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX "video_projects_user_idx" ON "video_projects" ("userId");
