import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";
import coreURL from "@ffmpeg/core?url";
import wasmURL from "@ffmpeg/core/wasm?url";

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

  onProgress({ progress: 28, currentStep: "Cutting the cinematic sequence in upload order…" });
  const transitions = ["fadeblack", "fade", "smoothup", "fadeblack"];
  const transitionDurations = [0.45, 0.35, 0.4, 0.45];
  const filterParts: string[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const ending = index === files.length - 1 ? ",fade=t=out:st=4.55:d=0.45" : "";
    filterParts.push(`[${index}:v]trim=duration=5,setpts=PTS-STARTPTS,fps=24,scale=1280:-2,setsar=1,format=yuv420p${index === 0 ? ",fade=t=in:st=0:d=0.35" : ""}${ending}[v${index}]`);
  }
  let previousLabel = "v0";
  let timelineDuration = 5;
  for (let index = 1; index < files.length; index += 1) {
    const transitionDuration = transitionDurations[(index - 1) % transitionDurations.length];
    const offset = Math.max(0, timelineDuration - transitionDuration);
    const nextLabel = `x${index}`;
    filterParts.push(`[${previousLabel}][v${index}]xfade=transition=${transitions[(index - 1) % transitions.length]}:duration=${transitionDuration}:offset=${offset.toFixed(2)}[${nextLabel}]`);
    previousLabel = nextLabel;
    timelineDuration += 5 - transitionDuration;
  }
  const filterGraph = filterParts.join(";");
  const inputs = files.flatMap(filename => ["-i", filename]);
  const encodeArgs = [
    ...inputs,
    "-filter_complex", filterGraph,
    "-map", `[${previousLabel}]`,
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
  try {
    await engine.exec(encodeArgs);
  } catch {
    const fallbackArgs = encodeArgs.slice();
    const codecIndex = fallbackArgs.indexOf("libx264");
    if (codecIndex >= 0) fallbackArgs[codecIndex] = "mpeg4";
    fallbackArgs.splice(fallbackArgs.indexOf("-crf"), 2, "-q:v", "6");
    await engine.exec(fallbackArgs);
  }

  onProgress({ progress: 96, currentStep: "Polishing the final editorial cut for download…" });
  const output = await engine.readFile("final-reel.mp4");
  const bytes = typeof output === "string" ? new TextEncoder().encode(output) : output;
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: "video/mp4" });
}
