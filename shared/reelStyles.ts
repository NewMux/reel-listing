/**
 * One decision that shapes the whole reel, rather than ten per-photo ones.
 *
 * This is where a non-technical customer actually has an opinion: they know whether a listing
 * wants an unhurried luxury feel or a quick social teaser. They do not have an opinion about
 * the crossfade length, so the style carries that too.
 *
 * `clipSeconds` is the only duration the video model accepts (5 or 10), and `transitionSeconds`
 * is the crossfade the browser stitches with.
 */
export const REEL_STYLES = [
  {
    id: "calm",
    clipSeconds: 10,
    // Long enough to read as a deliberate dissolve rather than a cut.
    transitionSeconds: 0.9,
  },
  {
    id: "balanced",
    clipSeconds: 10,
    transitionSeconds: 0.6,
  },
  {
    id: "quick",
    clipSeconds: 5,
    // A short reel with a long dissolve loses too much of each room to the overlap.
    transitionSeconds: 0.35,
  },
] as const;

export type ReelStyleId = (typeof REEL_STYLES)[number]["id"];
export const reelStyleIds = REEL_STYLES.map(style => style.id) as [ReelStyleId, ...ReelStyleId[]];
export const DEFAULT_REEL_STYLE: ReelStyleId = "balanced";

export function getReelStyle(id: string | null | undefined) {
  return REEL_STYLES.find(style => style.id === id) ?? REEL_STYLES.find(style => style.id === DEFAULT_REEL_STYLE)!;
}

/** Finished length in seconds: every clip, minus the overlap each crossfade eats. */
export function reelDurationSeconds(clipCount: number, styleId: string | null | undefined) {
  if (clipCount < 1) return 0;
  const style = getReelStyle(styleId);
  return clipCount * style.clipSeconds - Math.max(0, clipCount - 1) * style.transitionSeconds;
}
