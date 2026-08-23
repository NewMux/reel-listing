export type CinematicRenderProgress = {
  completedClips: number;
  totalClips: number;
  clipIndex: number;
  phase: "clips" | "assembly";
  overallProgress: number;
  currentStep: string;
};

export type CinematicRenderResult = {
  blob: Blob;
  mimeType: string;
  extension: "mp4" | "webm";
};

const WIDTH = 720;
const HEIGHT = 1280;
const FPS = 30;
const CLIP_SECONDS = 10;

function getSupportedMimeType() {
  const candidates = [
    "video/mp4;codecs=h264",
    "video/mp4",
    "video/webm;codecs=vp9",
    "video/webm;codecs=vp8",
    "video/webm",
  ];
  return candidates.find(type => MediaRecorder.isTypeSupported(type)) || "";
}

function waitForFrame() {
  return new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function easeInOut(value: number) {
  return value < 0.5 ? 2 * value * value : 1 - Math.pow(-2 * value + 2, 2) / 2;
}

function loadImage(url: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("One of the property photos could not be loaded for rendering."));
    image.src = url;
  });
}

function drawCinematicFrame(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  progress: number,
  clipIndex: number,
) {
  const eased = easeInOut(progress);
  const coverScale = Math.max(WIDTH / image.naturalWidth, HEIGHT / image.naturalHeight);
  const zoom = 1.04 + eased * 0.08;
  const drawWidth = image.naturalWidth * coverScale * zoom;
  const drawHeight = image.naturalHeight * coverScale * zoom;
  const drift = (clipIndex % 2 === 0 ? 1 : -1) * (eased - 0.5) * WIDTH * 0.08;
  const x = (WIDTH - drawWidth) / 2 + drift;
  const y = (HEIGHT - drawHeight) / 2 + (0.5 - eased) * HEIGHT * 0.035;

  context.fillStyle = "#10231c";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.drawImage(image, x, y, drawWidth, drawHeight);

  const topGradient = context.createLinearGradient(0, 0, 0, HEIGHT * 0.35);
  topGradient.addColorStop(0, "rgba(8, 24, 17, .46)");
  topGradient.addColorStop(1, "rgba(8, 24, 17, 0)");
  context.fillStyle = topGradient;
  context.fillRect(0, 0, WIDTH, HEIGHT * 0.35);

  const bottomGradient = context.createLinearGradient(0, HEIGHT * 0.55, 0, HEIGHT);
  bottomGradient.addColorStop(0, "rgba(8, 24, 17, 0)");
  bottomGradient.addColorStop(1, "rgba(8, 24, 17, .64)");
  context.fillStyle = bottomGradient;
  context.fillRect(0, HEIGHT * 0.55, WIDTH, HEIGHT * 0.45);

  context.fillStyle = "rgba(245, 243, 233, .86)";
  context.font = "600 16px Arial, sans-serif";
  context.letterSpacing = "3px";
  context.fillText("REEL-LISTING.COM", 42, HEIGHT - 68);
  context.letterSpacing = "0px";
}

async function animateClip(
  context: CanvasRenderingContext2D,
  image: HTMLImageElement,
  clipIndex: number,
  totalClips: number,
  onProgress: (progress: CinematicRenderProgress) => void,
) {
  const startedAt = performance.now();
  const duration = CLIP_SECONDS * 1_000;
  let lastReported = -1;

  while (true) {
    const elapsed = performance.now() - startedAt;
    const progress = clamp(elapsed / duration, 0, 1);
    drawCinematicFrame(context, image, progress, clipIndex);
    const overallProgress = Math.round(((clipIndex + progress) / totalClips) * 92);
    const rounded = Math.floor(overallProgress / 2) * 2;
    if (rounded !== lastReported) {
      lastReported = rounded;
      onProgress({
        completedClips: clipIndex,
        totalClips,
        clipIndex,
        phase: "clips",
        overallProgress: rounded,
        currentStep: `Rendering cinematic clip ${clipIndex + 1} of ${totalClips}…`,
      });
    }
    if (progress >= 1) break;
    await waitForFrame();
  }
}

export async function renderCinematicReel(
  imageUrls: string[],
  onProgress: (progress: CinematicRenderProgress) => void,
): Promise<CinematicRenderResult> {
  if (imageUrls.length === 0) throw new Error("Add at least one property photo before rendering.");
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) {
    throw new Error("This browser cannot render the cinematic reel. Please use the latest Chrome, Edge, or Safari.");
  }

  const mimeType = getSupportedMimeType();
  if (!mimeType) throw new Error("This browser does not support video export. Please use the latest Chrome, Edge, or Safari.");

  const images: HTMLImageElement[] = [];
  for (let index = 0; index < imageUrls.length; index += 1) {
    onProgress({
      completedClips: index,
      totalClips: imageUrls.length,
      clipIndex: index,
      phase: "clips",
      overallProgress: Math.round((index / imageUrls.length) * 4),
      currentStep: `Loading property photo ${index + 1} of ${imageUrls.length}…`,
    });
    images.push(await loadImage(imageUrls[index]));
  }

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("The cinematic renderer could not create a drawing surface.");

  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
  const chunks: BlobPart[] = [];
  const completed = new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener("dataavailable", event => {
      if (event.data.size > 0) chunks.push(event.data);
    });
    recorder.addEventListener("error", () => reject(new Error("The cinematic reel could not be recorded.")));
    recorder.addEventListener("stop", () => resolve(new Blob(chunks, { type: mimeType.split(";")[0] })));
  });

  recorder.start(250);
  for (let index = 0; index < images.length; index += 1) {
    await animateClip(context, images[index], index, images.length, onProgress);
  }

  onProgress({
    completedClips: imageUrls.length,
    totalClips: imageUrls.length,
    clipIndex: imageUrls.length - 1,
    phase: "assembly",
    overallProgress: 96,
    currentStep: "Stitching the clips into your final reel…",
  });
  await waitForFrame();
  recorder.stop();
  const blob = await completed;
  stream.getTracks().forEach(track => track.stop());

  const normalizedMimeType = mimeType.split(";")[0];
  return {
    blob,
    mimeType: normalizedMimeType,
    extension: normalizedMimeType === "video/mp4" ? "mp4" : "webm",
  };
}
