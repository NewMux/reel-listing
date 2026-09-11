import type { CameraPresetId } from "@shared/shotPresets";

/**
 * A small, looping schematic of what a camera move does, drawn over the customer's own photo.
 *
 * Deliberately not a render preview -- nothing here has been through the video model, and it
 * would be dishonest to imply otherwise. It exists because "a gentle gimbal arc around the
 * dominant architectural feature" means nothing to an estate agent, while two seconds of
 * their own kitchen drifting does.
 *
 * The motion is pure CSS on an <img>, so it costs nothing and needs no assets.
 */
const MOTION: Record<CameraPresetId, string> = {
  "push-in": "rl-push-in",
  "pull-back": "rl-pull-back",
  "glide-across": "rl-glide-across",
  "curve-around": "rl-curve-around",
  "toward-the-light": "rl-toward-light",
  "over-the-detail": "rl-over-detail",
};

export function ShotMovePreview({ src, preset, alt }: { src: string; preset: CameraPresetId; alt: string }) {
  return (
    <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg bg-[#E8E2DE]">
      {/* The wrapper clips; the image is oversized so a pan or a pull-back never reveals an edge. */}
      <img
        key={preset}
        src={src}
        alt={alt}
        className={`absolute left-1/2 top-1/2 h-[150%] w-[150%] -translate-x-1/2 -translate-y-1/2 object-cover ${MOTION[preset]}`}
      />
    </div>
  );
}
