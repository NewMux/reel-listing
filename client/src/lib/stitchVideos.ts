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

export async function stitchClips(
  clipUrls: string[],
  onProgress: (progress: StitchProgress) => void,
) {
  if (clipUrls.length === 0 || clipUrls.some(url => !url)) {
    throw new Error("All generated clips must be ready before assembly.");
  }

  const engine = await getFFmpeg();
  const files: string[] = [];
  for (let index = 0; index < clipUrls.length; index += 1) {
    onProgress({ progress: Math.round((index / clipUrls.length) * 12), currentStep: `Preparing clip ${index + 1} of ${clipUrls.length} for assembly…` });
    const filename = `clip-${String(index).padStart(2, "0")}.mp4`;
    await engine.writeFile(filename, await fetchFile(await fetchClip(clipUrls[index])));
    files.push(filename);
  }

  onProgress({ progress: 28, currentStep: "Clips are ready. Starting the silent final assembly…" });
  await engine.writeFile("concat.txt", new TextEncoder().encode(concatManifest(files)));

  // The pilot clips share the same H.264 video format. Try a stream-copy concat
  // first because it preserves the source motion and uses dramatically less memory
  // than decoding and re-encoding ten large clips in a browser worker.
  const copyArgs = [
    "-f", "concat",
    "-safe", "0",
    "-i", "concat.txt",
    "-an",
    "-c", "copy",
    "-movflags", "+faststart",
    "final-reel.mp4",
  ];
  const copyExitCode = await runWithProgress(engine, copyArgs, onProgress, 30, 90, "Combining the full-length clips without re-encoding…");

  if (copyExitCode !== 0) {
    onProgress({ progress: 30, currentStep: "Normalizing the clips for a compatible silent export…" });
    const videoFilterParts: string[] = [];
    const videoLabels: string[] = [];
    for (let index = 0; index < files.length; index += 1) {
      const videoLabel = `v${index}`;
      videoLabels.push(videoLabel);
      videoFilterParts.push(`[${index}:v]trim=start=0:duration=${FAL_CLIP_SECONDS},setpts=PTS-STARTPTS,fps=24,scale=1280:-2:flags=lanczos,setsar=1,format=yuv420p[${videoLabel}]`);
    }

    const videoInputs = videoLabels.map(label => `[${label}]`).join("");
    const videoFilterGraph = [...videoFilterParts, `${videoInputs}concat=n=${files.length}:v=1:a=0,format=yuv420p[edited]`].join(";");
    const inputs = files.flatMap(filename => ["-i", filename]);
    const encodeArgs = [
      ...inputs,
      "-filter_complex", videoFilterGraph,
      "-map", "[edited]",
      "-an",
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "27",
      "-maxrate", "4M",
      "-bufsize", "8M",
      "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "final-reel.mp4",
    ];
    const primaryExitCode = await runWithProgress(engine, encodeArgs, onProgress, 32, 90, "Encoding the final silent reel…");
    if (primaryExitCode !== 0) {
      const fallbackArgs = encodeArgs.slice();
      const codecIndex = fallbackArgs.indexOf("libx264");
      if (codecIndex >= 0) fallbackArgs[codecIndex] = "mpeg4";
      fallbackArgs.splice(fallbackArgs.indexOf("-crf"), 2, "-q:v", "6");
      const fallbackExitCode = await runWithProgress(engine, fallbackArgs, onProgress, 32, 90, "Using the compatible browser video encoder…");
      if (fallbackExitCode !== 0) {
        throw new Error(`The final reel could not be assembled (FFmpeg exit code ${fallbackExitCode}).`);
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
