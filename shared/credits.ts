import { FAL_CLIP_SECONDS } from "./video";

/**
 * One credit buys five seconds of generated video.
 *
 * Credit used to be counted per clip, which charged a five-second shot the same as a
 * ten-second one despite costing half as much to produce. That was fine for the business --
 * short clips were pure margin -- but it made the "Bright and quick" style cost exactly as
 * much as "Calm and luxurious" while using half the compute, which a customer would rightly
 * find odd. Pricing in seconds tracks what the video model actually bills.
 */
export const CREDIT_SECONDS = 5;

/** Credits a single shot of this length costs. The model only renders 5s or 10s. */
export function creditsForClip(seconds: number | null | undefined) {
  return Math.ceil((seconds || FAL_CLIP_SECONDS) / CREDIT_SECONDS);
}

/**
 * Credits a whole reel costs: every shot's length, in five-second units.
 *
 * `clipCount` rather than `clipDurations.length` because a project's duration overrides are
 * a sparse array -- an untouched photo has no entry and falls back to the default length.
 */
export function creditsForReel(clipCount: number, clipDurations: (number | null)[] = []) {
  let total = 0;
  for (let index = 0; index < clipCount; index += 1) total += creditsForClip(clipDurations[index]);
  return total;
}
