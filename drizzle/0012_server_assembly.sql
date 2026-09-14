-- Server-side final assembly.
--
-- Until now the finished reel was stitched in the customer's browser with ffmpeg.wasm,
-- which meant closing the tab lost the video: the clips completed and were paid for on
-- fal.ai, but nothing ever joined them. That was a workaround for Vercel's 10s function
-- limit and stops being necessary on a long-running host.
--
-- These columns let a worker claim a project for assembly exactly once, and reclaim it if
-- the process dies mid-stitch.
alter table "video_projects" add column if not exists "assemblyStartedAt" timestamp with time zone;
alter table "video_projects" add column if not exists "assemblyAttempts" integer default 0 not null;

-- Serves the worker's claim query, which scans for Processing + assembly projects.
create index if not exists "video_projects_assembly_claim_idx"
  on "video_projects" ("status", "renderPhase", "assemblyStartedAt");
