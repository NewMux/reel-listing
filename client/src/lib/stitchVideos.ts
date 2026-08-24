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

  onProgress({ progress: 28, currentStep: "Preserving each full-length cinematic shot…" });
  const videoFilterParts: string[] = [];
  const audioFilterParts: string[] = [];
  const videoLabels: string[] = [];
  const audioLabels: string[] = [];
  for (let index = 0; index < files.length; index += 1) {
    const videoFadeIn = index === 0 ? ",fade=t=in:st=0:d=0.24" : "";
    const videoFadeOut = index === files.length - 1 ? `,fade=t=out:st=${Math.max(0, FAL_CLIP_SECONDS - 0.36).toFixed(2)}:d=0.36` : "";
    const audioFadeIn = index === 0 ? ",afade=t=in:st=0:d=0.24" : "";
    const audioFadeOut = index === files.length - 1 ? `,afade=t=out:st=${Math.max(0, FAL_CLIP_SECONDS - 0.36).toFixed(2)}:d=0.36` : "";
    const videoLabel = `v${index}`;
    const audioLabel = `a${index}`;
    videoLabels.push(videoLabel);
    audioLabels.push(audioLabel);
    videoFilterParts.push(`[${index}:v]trim=start=0:duration=${FAL_CLIP_SECONDS},setpts=PTS-STARTPTS,fps=24,scale=1280:-2:flags=lanczos,setsar=1,format=yuv420p${videoFadeIn}${videoFadeOut}[${videoLabel}]`);
    audioFilterParts.push(`[${index}:a]atrim=start=0:duration=${FAL_CLIP_SECONDS},asetpts=PTS-STARTPTS,aresample=48000${audioFadeIn}${audioFadeOut}[${audioLabel}]`);
  }

  // Keep every source clip at its complete ten-second duration. Hard cuts preserve
  // the requested timing and avoid transitions that make the reel feel like a slideshow.
  const videoInputs = videoLabels.map(label => `[${label}]`).join("");
  const audioInputs = audioLabels.map(label => `[${label}]`).join("");
  const videoConcat = `${videoInputs}concat=n=${files.length}:v=1:a=0,format=yuv420p[edited]`;
  const audioConcat = `${audioInputs}concat=n=${files.length}:v=0:a=1,aresample=async=1:first_pts=0[audio]`;
  const filterGraph = [...videoFilterParts, ...audioFilterParts, videoConcat, audioConcat].join(";");
  const videoOnlyFilterGraph = [...videoFilterParts, videoConcat].join(";");
  const inputs = files.flatMap(filename => ["-i", filename]);
  const encodeArgs = [
    ...inputs,
    "-filter_complex", filterGraph,
    "-map", "[edited]",
    "-map", "[audio]",
    "-c:v", "libx264",
    "-c:a", "aac",
    "-b:a", "128k",
    "-shortest",
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
    // If a provider clip has no audio stream, preserve the full visual edit instead of failing the project.
    const videoOnlyArgs = [
      ...inputs,
      "-filter_complex", videoOnlyFilterGraph,
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
    try {
      await engine.exec(videoOnlyArgs);
    } catch {
      const fallbackArgs = videoOnlyArgs.slice();
      const codecIndex = fallbackArgs.indexOf("libx264");
      if (codecIndex >= 0) fallbackArgs[codecIndex] = "mpeg4";
      fallbackArgs.splice(fallbackArgs.indexOf("-crf"), 2, "-q:v", "6");
      await engine.exec(fallbackArgs);
    }
  }

  onProgress({ progress: 96, currentStep: "Polishing the final editorial cut for download…" });
  const output = await engine.readFile("final-reel.mp4");
  const bytes = typeof output === "string" ? new TextEncoder().encode(output) : output;
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: "video/mp4" });
}
