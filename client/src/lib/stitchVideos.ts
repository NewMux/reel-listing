import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";
import { FAL_CLIP_SECONDS } from "@shared/video";

export type StitchProgress = {
  progress: number;
  currentStep: string;
};

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
  const response = await fetch(url);
  if (!response.ok) throw new Error(`A generated clip could not be downloaded (${response.status}).`);
  return response.blob();
}

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
  engine.on("progress", progressHandler);
  try {
    return await engine.exec(args);
  } finally {
    engine.off("progress", progressHandler);
  }
}

function concatManifest(files: string[]) {
  return files.map(filename => `file '${filename}'`).join("\n");
}

async function normalizeClip(
  engine: FFmpeg,
  source: string,
  output: string,
  onProgress: (progress: StitchProgress) => void,
  start: number,
  end: number,
) {
  const commonArgs = [
    "-i", source,
    "-an",
    "-vf", "scale=720:-2:flags=lanczos,setsar=1,format=yuv420p",
    "-r", "24",
    "-t", String(FAL_CLIP_SECONDS),
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
  const primaryExitCode = await runWithProgress(engine, h264Args, onProgress, start, end, "Optimizing the next full-length clip for final delivery…");
  if (primaryExitCode === 0) return;

  const mpeg4Args = [
    ...commonArgs.slice(0, commonArgs.length - 1),
    "-c:v", "mpeg4",
    "-b:v", "1800k",
    "-maxrate", "2200k",
    "-bufsize", "3600k",
    commonArgs[commonArgs.length - 1],
  ];
  const fallbackExitCode = await runWithProgress(engine, mpeg4Args, onProgress, start, end, "Using the compatible browser video encoder for the next clip…");
  if (fallbackExitCode !== 0) {
    throw new Error(`A clip could not be normalized for final assembly (FFmpeg exit code ${fallbackExitCode}).`);
  }
}

export async function stitchClips(
  clipUrls: string[],
  onProgress: (progress: StitchProgress) => void,
) {
  if (clipUrls.length === 0 || clipUrls.some(url => !url)) {
    throw new Error("All generated clips must be ready before assembly.");
  }

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
      onProgress,
      12 + Math.round((index / clipUrls.length) * 72),
      12 + Math.round(((index + 1) / clipUrls.length) * 72),
    );
    await engine.deleteFile(sourceFilename);
    normalizedFiles.push(normalizedFilename);
  }

  onProgress({ progress: 86, currentStep: "Combining the complete silent clips in order…" });
  await engine.writeFile("concat.txt", new TextEncoder().encode(concatManifest(normalizedFiles)));
  const copyArgs = [
    "-f", "concat",
    "-safe", "0",
    "-i", "concat.txt",
    "-an",
    "-c", "copy",
    "-movflags", "+faststart",
    "final-reel.mp4",
  ];
  const copyExitCode = await runWithProgress(engine, copyArgs, onProgress, 86, 94, "Combining the complete silent clips in order…");
  if (copyExitCode !== 0) {
    throw new Error(`The normalized clips could not be combined (FFmpeg exit code ${copyExitCode}).`);
  }

  onProgress({ progress: 96, currentStep: "Final silent reel assembled and ready for download…" });
  const output = await engine.readFile("final-reel.mp4");
  const bytes = typeof output === "string" ? new TextEncoder().encode(output) : output;
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: "video/mp4" });
}
