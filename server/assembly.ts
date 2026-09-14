/**
 * Server-side final assembly with native ffmpeg.
 *
 * This mirrors client/src/lib/stitchVideos.ts, which stitched the reel in the customer's
 * browser with ffmpeg.wasm. That worked, but it meant the tab had to stay open from
 * Approve to download: close the laptop and the clips still completed (and were still paid
 * for) on fal.ai while nothing ever joined them. The browser was only ever doing this
 * because Vercel's 10s function limit ruled out doing it server-side; on a long-running
 * host that constraint is gone.
 *
 * Encoder settings are kept identical to the browser version so output is unchanged.
 */

import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { FAL_CLIP_SECONDS } from "@shared/video";
import { withRetry } from "@shared/retry";

/** Long enough to read as a dissolve, short enough not to eat into each room's own shot. */
export const TRANSITION_SECONDS = 0.6;

const FFMPEG_BIN = process.env.FFMPEG_PATH || "ffmpeg";
/** Keep the tail of ffmpeg's own output: a bare exit code cannot distinguish causes. */
const LOG_TAIL_LINES = 30;
/** A ten-clip reel encodes in well under this; past it something is wrong, not slow. */
const FFMPEG_TIMEOUT_MS = 15 * 60 * 1000;

export type AssemblyProgress = { progress: number; step: string };

/**
 * Chains xfade across every clip. Clips can have different lengths (the 5s/10s per-photo
 * toggle), so each offset is where in the merged stream built so far the next transition
 * begins: the running total of durations already merged, minus one overlap per transition.
 */
export function buildCrossfadeFilter(durations: number[], transitionSeconds = TRANSITION_SECONDS): string {
  const stages: string[] = [];
  let previousLabel = "0:v";
  let cumulative = durations[0];
  for (let index = 1; index < durations.length; index += 1) {
    const offset = cumulative - transitionSeconds;
    const outputLabel = index === durations.length - 1 ? "vout" : `v${index}`;
    stages.push(
      `[${previousLabel}][${index}:v]xfade=transition=fade:duration=${transitionSeconds}:offset=${offset.toFixed(2)}[${outputLabel}]`,
    );
    previousLabel = outputLabel;
    cumulative = cumulative + durations[index] - transitionSeconds;
  }
  return stages.join(";");
}

/** Every clip is re-encoded to one shape first; xfade requires matching geometry and rate. */
export function normalizeArgs(source: string, output: string, duration: number): string[] {
  return [
    "-y", "-i", source,
    "-an",
    "-vf", "scale=720:-2:flags=lanczos,setsar=1,format=yuv420p",
    "-r", "24",
    "-t", String(duration),
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-b:v", "1800k",
    "-maxrate", "2200k",
    "-bufsize", "3600k",
    output,
  ];
}

export function blendArgs(inputs: string[], filterComplex: string, output: string): string[] {
  return [
    "-y",
    ...inputs.flatMap(file => ["-i", file]),
    "-filter_complex", filterComplex,
    "-map", "[vout]",
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-b:v", "1800k",
    "-maxrate", "2200k",
    "-bufsize", "3600k",
    output,
  ];
}

export function concatManifest(files: string[]): string {
  return files.map(file => `file '${file}'`).join("\n");
}

export const resolveDurations = (count: number, clipDurations: (number | null)[]): number[] =>
  Array.from({ length: count }, (_, index) => clipDurations[index] || FAL_CLIP_SECONDS);

/**
 * Merges freshly archived clip keys into the project's existing `clipUrls`, at only the
 * indices that actually archived. An index that failed to persist (or was never attempted)
 * keeps its original value -- which, on the boundary this app enforces, means it simply
 * never becomes downloadable client-side (see isStoredKey in server/storage.ts and the
 * projects.downloadUrl procedure), not that a raw third-party URL leaks anywhere further.
 * A single failed clip must never take down delivery of the reel itself.
 */
export function mergeArchivedClipUrls(
  original: (string | null)[],
  archived: (string | null | undefined)[],
): (string | null)[] {
  return original.map((value, index) => archived[index] ?? value);
}

type FfmpegResult = { exitCode: number; logTail: string };

function runFfmpeg(args: string[], cwd: string): Promise<FfmpegResult> {
  return new Promise(resolve => {
    const child = spawn(FFMPEG_BIN, args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
    const lines: string[] = [];
    let settled = false;

    const finish = (result: FfmpegResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    child.stderr.on("data", chunk => {
      for (const line of String(chunk).split("\n")) {
        if (!line.trim()) continue;
        lines.push(line);
        if (lines.length > LOG_TAIL_LINES) lines.shift();
      }
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ exitCode: -2, logTail: [...lines, "ffmpeg timed out"].join("\n") });
    }, FFMPEG_TIMEOUT_MS);

    child.on("error", error => {
      clearTimeout(timer);
      // Most often ENOENT: ffmpeg is not installed in the image.
      finish({ exitCode: -1, logTail: [...lines, error.message].join("\n") });
    });
    child.on("close", code => {
      clearTimeout(timer);
      finish({ exitCode: code ?? -1, logTail: lines.join("\n") });
    });
  });
}

/** True when a usable ffmpeg binary is on PATH. Checked once at boot so the failure is loud. */
export async function isFfmpegAvailable(): Promise<boolean> {
  const { exitCode } = await runFfmpeg(["-version"], os.tmpdir());
  return exitCode === 0;
}

async function downloadClip(url: string, destination: string): Promise<void> {
  await withRetry(
    async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`A generated clip could not be downloaded (${response.status}).`);
      await writeFile(destination, Buffer.from(await response.arrayBuffer()));
      return true;
    },
    { label: "clip download", retries: 3, baseDelayMs: 500, maxDelayMs: 5_000 },
  );
}

/**
 * Downloads every clip, normalizes them, and joins them into one reel.
 * Returns the finished MP4 as a Buffer. Cleans its scratch directory up either way.
 */
export type ClipDownloadedHandler = (index: number, filePath: string) => Promise<void> | void;

export async function assembleReel(
  clipUrls: string[],
  clipDurations: (number | null)[],
  onProgress: (progress: AssemblyProgress) => void = () => {},
  /**
   * Fired right after each clip is downloaded, before it is re-encoded for stitching -- so
   * a caller that wants to archive the original (server/assemblyWorker.ts does) gets the
   * unmodified fal.ai output, not the 720p/24fps/silent version built for crossfading.
   * Errors are the caller's to handle: assembleReel does not catch them, so a caller that
   * wants "archiving must never block delivery of the reel" (it does) has to enforce that
   * itself rather than relying on this function to swallow it silently.
   */
  onClipDownloaded?: ClipDownloadedHandler,
): Promise<Buffer> {
  if (clipUrls.length === 0 || clipUrls.some(url => !url)) {
    throw new Error("All generated clips must be ready before assembly.");
  }
  const durations = resolveDurations(clipUrls.length, clipDurations);
  const workDir = await mkdtemp(path.join(os.tmpdir(), "reel-assembly-"));

  try {
    const normalized: string[] = [];
    for (let index = 0; index < clipUrls.length; index += 1) {
      const stamp = String(index).padStart(2, "0");
      const source = `clip-${stamp}.mp4`;
      const output = `normalized-${stamp}.mp4`;
      onProgress({
        progress: Math.round((index / clipUrls.length) * 80),
        step: `Preparing clip ${index + 1} of ${clipUrls.length}`,
      });
      const sourcePath = path.join(workDir, source);
      await downloadClip(clipUrls[index], sourcePath);
      if (onClipDownloaded) await onClipDownloaded(index, sourcePath);
      const result = await runFfmpeg(normalizeArgs(source, output, durations[index]), workDir);
      if (result.exitCode !== 0) {
        throw new Error(`Clip ${index + 1} could not be normalized (ffmpeg ${result.exitCode}). ${result.logTail.slice(-400)}`);
      }
      normalized.push(output);
    }

    onProgress({ progress: 85, step: "Blending clips" });
    const finalName = "final-reel.mp4";

    if (normalized.length === 1) {
      const single = await runFfmpeg(["-y", "-i", normalized[0], "-c", "copy", "-movflags", "+faststart", finalName], workDir);
      if (single.exitCode !== 0) {
        throw new Error(`The final reel could not be assembled (ffmpeg ${single.exitCode}). ${single.logTail.slice(-400)}`);
      }
    } else {
      const blend = await runFfmpeg(blendArgs(normalized, buildCrossfadeFilter(durations), finalName), workDir);

      if (blend.exitCode !== 0) {
        // The dissolve is a nice-to-have; delivering a video at all is not optional. One
        // broken filter graph must not take down every multi-photo project.
        console.warn(`[Assembly] crossfade failed, falling back to a hard cut. ffmpeg said:\n${blend.logTail}`);
        onProgress({ progress: 88, step: "Falling back to a direct cut" });
        await writeFile(path.join(workDir, "concat.txt"), concatManifest(normalized));
        const concat = await runFfmpeg(
          ["-y", "-f", "concat", "-safe", "0", "-i", "concat.txt", "-an", "-c", "copy", "-movflags", "+faststart", finalName],
          workDir,
        );
        if (concat.exitCode !== 0) {
          throw new Error(`The clips could not be joined (ffmpeg ${concat.exitCode}). ${concat.logTail.slice(-400)}`);
        }
      }
    }

    onProgress({ progress: 96, step: "Reel assembled" });
    const { readFile } = await import("node:fs/promises");
    return await readFile(path.join(workDir, finalName));
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}
