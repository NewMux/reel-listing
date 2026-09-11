import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import { FAL_CLIP_SECONDS } from "@shared/video";
import { withRetry } from "@shared/retry";

export type StitchProgress = {
  progress: number;
  currentStep: string;
};

// Fallback crossfade, used when no reel style is supplied. The style normally decides this
// (see shared/reelStyles.ts): long enough to read as a dissolve rather than a flicker, short
// enough not to eat into each room's own shot.
const TRANSITION_SECONDS = 0.6;

let ffmpeg: FFmpeg | null = null;
let loadPromise: Promise<FFmpeg> | null = null;

async function getFFmpeg() {
  if (ffmpeg?.loaded) return ffmpeg;
  if (!loadPromise) {
    const instance = new FFmpeg();
    loadPromise = instance.load({ coreURL, wasmURL }).then(() => {
      ffmpeg = instance;
      return instance;
    });
  }
  return loadPromise;
}

async function fetchClip(url: string) {
  return withRetry(async () => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`A generated clip could not be downloaded (${response.status}).`);
    return response.blob();
  }, { label: "clip download", retries: 3, baseDelayMs: 500, maxDelayMs: 5_000 });
}

// Keeps the tail of ffmpeg's own log output alongside the exit code -- a bare exit code gives
// no way to tell "unsupported filter" apart from "out of memory" apart from anything else, so
// callers that need to diagnose or report a failure can surface what ffmpeg actually said.
const LOG_TAIL_LINES = 20;

async function runWithProgress(
  engine: FFmpeg,
  args: string[],
  onProgress: (progress: StitchProgress) => void,
  start: number,
  end: number,
  currentStep: string,
) {
  const progressHandler = ({ progress }: { progress: number }) => {
    const normalized = Math.max(0, Math.min(1, progress));
    onProgress({ progress: Math.round(start + normalized * (end - start)), currentStep });
  };
  const logLines: string[] = [];
  const logHandler = ({ message }: { message: string }) => {
    logLines.push(message);
    if (logLines.length > LOG_TAIL_LINES) logLines.shift();
  };
  engine.on("progress", progressHandler);
  engine.on("log", logHandler);
  try {
    const exitCode = await engine.exec(args);
    return { exitCode, logTail: logLines.join("\n") };
  } catch (error) {
    // engine.exec() can reject instead of resolving with a non-zero code (e.g. a WASM-level
    // abort on a malformed filter graph). Every call site branches on exitCode !== 0 to decide
    // whether to retry with a fallback encoder or a simpler filter -- a thrown exception would
    // skip all of that and blow straight through stitchClips(), so normalize it into the same
    // shape a failed exec() already produces instead of letting it propagate uncaught.
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { exitCode: -1, logTail: [...logLines, errorMessage].join("\n") };
  } finally {
    engine.off("progress", progressHandler);
    engine.off("log", logHandler);
  }
}

// Chains xfade transitions across every clip: [0:v][1:v]xfade=...offset=O1[v1];[v1][2:v]xfade=...offset=O2[v2];...
// Clips can now have different lengths (per-photo 5s/10s), so offsets are no longer a flat
// i * (duration - transitionSeconds) -- each offset is where, in the merged stream built so
// far, the next clip's transition should start: the running total of clip durations already
// merged, minus one transitionSeconds overlap per transition already applied.
function buildCrossfadeFilter(durations: number[], transitionSeconds: number) {
  const stages: string[] = [];
  let previousLabel = "0:v";
  let cumulative = durations[0];
  for (let index = 1; index < durations.length; index += 1) {
    const offset = cumulative - transitionSeconds;
    const outputLabel = index === durations.length - 1 ? "vout" : `v${index}`;
    stages.push(`[${previousLabel}][${index}:v]xfade=transition=fade:duration=${transitionSeconds}:offset=${offset.toFixed(2)}[${outputLabel}]`);
    previousLabel = outputLabel;
    cumulative = cumulative + durations[index] - transitionSeconds;
  }
  return stages.join(";");
}

function concatManifest(files: string[]) {
  return files.map(filename => `file '${filename}'`).join("\n");
}

async function normalizeClip(
  engine: FFmpeg,
  source: string,
  output: string,
  duration: number,
  onProgress: (progress: StitchProgress) => void,
  start: number,
  end: number,
) {
  const commonArgs = [
    "-y",
    "-i", source,
    "-an",
    "-vf", "scale=720:-2:flags=lanczos,setsar=1,format=yuv420p",
    "-r", "24",
    "-t", String(duration),
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    output,
  ];
  const h264Args = [
    ...commonArgs.slice(0, commonArgs.length - 1),
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-b:v", "1800k",
    "-maxrate", "2200k",
    "-bufsize", "3600k",
    commonArgs[commonArgs.length - 1],
  ];
  const primary = await runWithProgress(engine, h264Args, onProgress, start, end, "Optimizing the next full-length clip for final delivery…");
  if (primary.exitCode === 0) return;

  const mpeg4Args = [
    ...commonArgs.slice(0, commonArgs.length - 1),
    "-c:v", "mpeg4",
    "-b:v", "1800k",
    "-maxrate", "2200k",
    "-bufsize", "3600k",
    commonArgs[commonArgs.length - 1],
  ];
  const fallback = await runWithProgress(engine, mpeg4Args, onProgress, start, end, "Using the compatible browser video encoder for the next clip…");
  if (fallback.exitCode !== 0) {
    throw new Error(`A clip could not be normalized for final assembly (FFmpeg exit code ${fallback.exitCode}).`);
  }
}

export async function stitchClips(
  clipUrls: string[],
  clipDurations: (number | null)[],
  onProgress: (progress: StitchProgress) => void,
  transitionSeconds: number = TRANSITION_SECONDS,
) {
  if (clipUrls.length === 0 || clipUrls.some(url => !url)) {
    throw new Error("All generated clips must be ready before assembly.");
  }
  const durations = clipUrls.map((_, index) => clipDurations[index] || FAL_CLIP_SECONDS);

  const engine = await getFFmpeg();
  const normalizedFiles: string[] = [];
  for (let index = 0; index < clipUrls.length; index += 1) {
    onProgress({ progress: Math.round((index / clipUrls.length) * 12), currentStep: `Preparing clip ${index + 1} of ${clipUrls.length} for assembly…` });
    const sourceFilename = `clip-${String(index).padStart(2, "0")}.mp4`;
    const normalizedFilename = `normalized-${String(index).padStart(2, "0")}.mp4`;
    await engine.writeFile(sourceFilename, await fetchFile(await fetchClip(clipUrls[index])));
    await normalizeClip(
      engine,
      sourceFilename,
      normalizedFilename,
      durations[index],
      onProgress,
      12 + Math.round((index / clipUrls.length) * 72),
      12 + Math.round(((index + 1) / clipUrls.length) * 72),
    );
    await engine.deleteFile(sourceFilename);
    normalizedFiles.push(normalizedFilename);
  }

  if (normalizedFiles.length === 1) {
    onProgress({ progress: 86, currentStep: "Finalizing your reel…" });
    const singleClipArgs = ["-y", "-i", normalizedFiles[0], "-c", "copy", "-movflags", "+faststart", "final-reel.mp4"];
    const singleClip = await runWithProgress(engine, singleClipArgs, onProgress, 86, 94, "Finalizing your reel…");
    if (singleClip.exitCode !== 0) {
      throw new Error(`The final reel could not be assembled (FFmpeg exit code ${singleClip.exitCode}).`);
    }
  } else {
    onProgress({ progress: 86, currentStep: "Blending clips into a cinematic dissolve…" });
    const filterComplex = buildCrossfadeFilter(durations, transitionSeconds);
    const inputArgs = normalizedFiles.flatMap(filename => ["-i", filename]);
    const commonArgs = [
      "-y",
      ...inputArgs,
      "-filter_complex", filterComplex,
      "-map", "[vout]",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "final-reel.mp4",
    ];
    const h264Args = [
      ...commonArgs.slice(0, commonArgs.length - 1),
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-b:v", "1800k",
      "-maxrate", "2200k",
      "-bufsize", "3600k",
      commonArgs[commonArgs.length - 1],
    ];
    const primary = await runWithProgress(engine, h264Args, onProgress, 86, 94, "Blending clips into a cinematic dissolve…");
    let blended = primary.exitCode === 0;
    let lastLog = primary.logTail;

    if (!blended) {
      const mpeg4Args = [
        ...commonArgs.slice(0, commonArgs.length - 1),
        "-c:v", "mpeg4",
        "-b:v", "1800k",
        "-maxrate", "2200k",
        "-bufsize", "3600k",
        commonArgs[commonArgs.length - 1],
      ];
      const fallback = await runWithProgress(engine, mpeg4Args, onProgress, 86, 94, "Using the compatible browser encoder to blend the clips…");
      blended = fallback.exitCode === 0;
      lastLog = fallback.logTail;
    }

    // The crossfade dissolve is a nice-to-have; delivering a video at all is not optional. If
    // both blend attempts failed, fall back to the plain hard-cut join instead of failing the
    // whole render -- one broken filter graph shouldn't take down every multi-photo project.
    if (!blended) {
      console.warn(`[Stitch] Crossfade blend failed, falling back to a hard cut between clips. Last ffmpeg output:\n${lastLog}`);
      onProgress({ progress: 88, currentStep: "Falling back to a direct cut between clips…" });
      await engine.writeFile("concat.txt", new TextEncoder().encode(concatManifest(normalizedFiles)));
      const concatArgs = ["-y", "-f", "concat", "-safe", "0", "-i", "concat.txt", "-an", "-c", "copy", "-movflags", "+faststart", "final-reel.mp4"];
      const concatResult = await runWithProgress(engine, concatArgs, onProgress, 88, 94, "Combining the clips in order…");
      if (concatResult.exitCode !== 0) {
        throw new Error(`The clips could not be blended into the final reel (FFmpeg exit code ${concatResult.exitCode}). ${concatResult.logTail.slice(-300)}`);
      }
    }
  }

  onProgress({ progress: 96, currentStep: "Final silent reel assembled and ready for download…" });
  const output = await engine.readFile("final-reel.mp4");
  const bytes = typeof output === "string" ? new TextEncoder().encode(output) : output;
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: "video/mp4" });
}
