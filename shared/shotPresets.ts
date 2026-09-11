/**
 * The camera and room vocabulary offered to customers.
 *
 * These are estate agents, not cinematographers. Asking them to write a camera move in prose
 * was both intimidating and unsafe: the render prompt forbids crane, drone, orbit and tilt
 * moves because the video model handles them badly, but a free-text box happily accepted
 * "drone shot flying through the window" and fed it straight into the prompt, contradicting
 * those rules and spending a credit on an unusable clip.
 *
 * So the customer picks from named options in their own words, and each one maps to a
 * directive already proven against the model. Virtual staging has always worked this way
 * (see STAGING_STYLES); camera movement now matches it.
 */

/** Plain-language camera choices. `directive` is the text that reaches the render prompt. */
export const CAMERA_PRESETS = [
  {
    id: "push-in",
    directive: "a forward gimbal push toward the strongest depth line",
  },
  {
    id: "pull-back",
    directive: "a slow backward gimbal pull at constant height that reveals more context while preserving the exact composition",
  },
  {
    id: "glide-across",
    directive: "a smooth lateral gimbal track that creates clear foreground-to-background parallax",
  },
  {
    id: "curve-around",
    directive: "a gentle gimbal arc around the dominant architectural feature while keeping verticals straight",
  },
  {
    id: "toward-the-light",
    directive: "a subtle forward-and-lateral gimbal drift toward the brightest visible opening",
  },
  {
    id: "over-the-detail",
    directive: "a short eye-level dolly move toward the nearest visible material plane",
  },
] as const;

export type CameraPresetId = (typeof CAMERA_PRESETS)[number]["id"];
export const cameraPresetIds = CAMERA_PRESETS.map(preset => preset.id) as [CameraPresetId, ...CameraPresetId[]];

export function getCameraPreset(id: string) {
  return CAMERA_PRESETS.find(preset => preset.id === id);
}

/** Which preset, if any, a stored camera-move string came from. Drives the selected chip. */
export function matchCameraPreset(cameraMove: string | null | undefined): CameraPresetId | null {
  if (!cameraMove) return null;
  return CAMERA_PRESETS.find(preset => preset.directive === cameraMove)?.id ?? null;
}

/**
 * Room types the vision model classifies into. The customer can correct it, which is the one
 * thing they know instantly and the model sometimes gets wrong -- and it improves the prompt
 * more than any camera wording does.
 */
export const ROOM_TYPES = ["outdoor-view", "living-room", "kitchen-dining", "bedroom", "bathroom", "detail"] as const;
export type RoomType = (typeof ROOM_TYPES)[number];
/** "unknown" is the model's own low-confidence value and the customer's "let it decide". */
export const ROOM_TYPE_CHOICES = ["unknown", ...ROOM_TYPES] as const;
export type RoomTypeChoice = (typeof ROOM_TYPE_CHOICES)[number];

/**
 * Movements the render prompt explicitly rules out, because the video model renders them as
 * warping, wall clipping, or drifting geometry. Checked against any free-text camera move
 * before it can reach a paid render.
 */
const UNSUPPORTED_MOVES = [
  "crane", "jib", "drone", "aerial", "birds eye", "bird's eye", "overhead", "top down", "top-down",
  "orbit", "spin", "rotate", "360", "fly", "flying", "float", "floating", "hover",
  "tilt", "pan up", "pan down", "look up", "look down", "whip", "snap zoom", "zoom",
  "handheld", "shake", "shaky", "time lapse", "timelapse", "through the wall", "through the window",
] as const;

/**
 * Returns the unsupported term found in a free-text camera move, or null when it is usable.
 * Matched on word boundaries so "panorama" is not mistaken for "pan up".
 */
export function findUnsupportedMove(cameraMove: string): string | null {
  const haystack = ` ${cameraMove.toLowerCase().replace(/[^a-z0-9'\s]/g, " ").replace(/\s+/g, " ")} `;
  return UNSUPPORTED_MOVES.find(term => haystack.includes(` ${term} `)) ?? null;
}
