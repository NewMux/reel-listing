-- One listing-level style choice, applied to every shot.
--
-- Per-photo controls ask a customer to make ten decisions about something they have no
-- opinion on. The pacing of the reel as a whole is something an estate agent does have an
-- opinion on, so it lives here: the style sets clip length for every shot and the crossfade
-- the browser stitches with, and has to persist because assembly can happen in a later
-- session than approval.
ALTER TABLE "video_projects" ADD COLUMN IF NOT EXISTS "reelStyle" varchar(32) DEFAULT 'balanced' NOT NULL;
