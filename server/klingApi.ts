// Direct client for Kling's own API (https://kling.ai/document-api), used for clip generation
// instead of going through fal.ai. Request/response shapes follow the "new design standard"
// image-to-video reference: API-key bearer auth, POST /image-to-video/<model>, GET /tasks.
import { ENV } from "./_core/env";

/** Stored request ids carry this prefix so a render knows which provider to poll. */
export const KLING_PREFIX = "kling:";

// Service codes from Kling's error table that mean "try again shortly", not "this will never work":
// 1302 rate limit, 1303 account concurrency limit reached.
const TRANSIENT_CODES = new Set([1302, 1303]);
// Our own Kling account is out of balance / misconfigured -- the customer must never see that wording.
const ACCOUNT_CODES = new Set([1000, 1001, 1002, 1003, 1004, 1100, 1101, 1102, 1103, 1304]);

export class KlingError extends Error {
  constructor(message: string, public readonly status: number, public readonly code: number | null) {
    super(message);
  }
  /** Worth retrying later without telling the customer anything went wrong. */
  get transient() {
    return this.status >= 500 || (this.code !== null && TRANSIENT_CODES.has(this.code));
  }
  /** What the customer is told when this error fails their clip. */
  get customerMessage() {
    if (this.code === 1300 || this.code === 1301) return "This photo or prompt was blocked by the video model's content policy. Change it and try again.";
    if (this.code !== null && ACCOUNT_CODES.has(this.code)) return "Rendering is temporarily unavailable. Please try again shortly.";
    return this.message || "The video model rejected this clip.";
  }
}

export function isKlingConfigured() {
  return Boolean(ENV.klingApiKey);
}

async function klingFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!ENV.klingApiKey) throw new Error("Kling is not configured yet. Add KLING_API_KEY to the server environment before rendering.");
  const response = await fetch(`${ENV.klingApiBase.replace(/\/+$/, "")}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${ENV.klingApiKey}`, "Content-Type": "application/json", ...init?.headers },
    signal: AbortSignal.timeout(8_000),
  });
  const body = await response.json().catch(() => null) as { code?: number; message?: string; data?: T } | null;
  if (!response.ok || !body || body.code !== 0 || body.data === undefined) {
    const error = new KlingError(body?.message || `Kling request failed (${response.status}).`, response.status, typeof body?.code === "number" ? body.code : null);
    if (error.code !== null && ACCOUNT_CODES.has(error.code)) console.error(`[Kling] ACCOUNT PROBLEM (code ${error.code}): ${error.message} -- renders are failing until this is fixed.`);
    throw error;
  }
  return body.data;
}

/** Submits one image-to-video clip and returns Kling's task id. */
export async function submitKlingClip(input: { imageUrl: string; prompt: string; durationSeconds: number; callbackUrl?: string }): Promise<string> {
  const data = await klingFetch<{ id?: string }>(`/image-to-video/${ENV.klingModel}`, {
    method: "POST",
    body: JSON.stringify({
      contents: [
        { type: "prompt", text: input.prompt },
        { type: "first_frame", url: input.imageUrl },
      ],
      settings: {
        resolution: ENV.klingResolution,
        duration: input.durationSeconds,
        audio: "off",
        // One photo is one continuous shot; multi_shot defaults to true and would let the model cut.
        multi_shot: false,
      },
      options: {
        ...(input.callbackUrl ? { callback_url: input.callbackUrl } : {}),
        watermark_info: { enabled: false },
      },
    }),
  });
  if (!data.id) throw new KlingError("Kling accepted the clip but returned no task id.", 502, null);
  return data.id;
}

export type KlingTask = { state: "pending" | "done" | "failed"; url: string | null; message: string | null };

type RawTask = { id?: string; status?: string; message?: string; outputs?: { type?: string; url?: string }[] };

export function normalizeKlingTask(task: RawTask): KlingTask {
  if (task.status === "succeeded") {
    const url = task.outputs?.find(output => output.type === "video" && typeof output.url === "string")?.url ?? null;
    return url ? { state: "done", url, message: null } : { state: "failed", url: null, message: "No video was returned." };
  }
  if (task.status === "failed") return { state: "failed", url: null, message: task.message || null };
  return { state: "pending", url: null, message: null };
}

/** Looks up many tasks in one request. Tasks Kling doesn't return are simply absent from the map. */
export async function getKlingTasks(taskIds: string[]): Promise<Map<string, KlingTask>> {
  const result = new Map<string, KlingTask>();
  if (!taskIds.length) return result;
  const data = await klingFetch<RawTask[]>(`/tasks?task_ids=${taskIds.map(encodeURIComponent).join(",")}`);
  for (const task of Array.isArray(data) ? data : []) {
    if (task.id) result.set(String(task.id), normalizeKlingTask(task));
  }
  return result;
}
