import type { Express } from "express";
import { getVideoProjectByRequestId } from "../db";
import { refreshFalRender } from "../falPipeline";

// Lets a render keep advancing even if the customer closes the tab mid-generation: fal.ai
// calls this the instant a submitted job finishes, instead of only ever finding out on the
// next 3s client poll. Deliberately does NOT verify the request's authenticity (fal.ai signs
// webhooks with an ED25519 key we can't currently verify against a confirmed primary-source
// spec) -- instead it treats the payload purely as a "go re-check this request_id" hint and
// never trusts anything else in the body. The actual state change always comes from
// refreshFalRender independently re-querying fal.ai with our own credentials, and the lookup
// only matches a request_id already recorded on one of our own in-progress projects, so the
// worst a forged call can do is trigger an early, harmless re-poll of a render whose fal.ai
// request_id an attacker would first have to already know. Client polling remains the primary,
// fully-trusted path regardless -- this is a latency/resilience optimization on top of it, not
// a new source of truth.
export function registerFalWebhook(app: Express) {
  app.post("/api/webhooks/fal", async (req, res) => {
    const requestId = typeof req.body?.request_id === "string" ? req.body.request_id : null;
    if (!requestId) {
      res.status(200).send("ignored");
      return;
    }

    try {
      const project = await getVideoProjectByRequestId(requestId);
      if (project) await refreshFalRender(project.userId, project);
    } catch (error) {
      console.warn("[FalWebhook] refresh failed for request", requestId, error);
    }

    // Always 200: fal.ai retries webhook delivery on non-2xx, and this is a best-effort nudge,
    // never the only path to progress -- no reason to make it retry on our transient errors.
    res.status(200).send("ok");
  });
}

// Kling's callback for clips rendered on its own API. Same contract as the fal.ai webhook above:
// the body is only a hint naming a task id; the real state always comes from re-querying Kling
// with our own key inside refreshFalRender.
export function registerKlingWebhook(app: Express) {
  app.post("/api/webhooks/kling", async (req, res) => {
    const taskId = typeof req.body?.id === "string" || typeof req.body?.id === "number" ? String(req.body.id) : null;
    const status = typeof req.body?.status === "string" ? req.body.status : null;
    // Kling calls back on every status change; only a finished task can move a render forward.
    if (taskId && (status === "succeeded" || status === "failed")) {
      try {
        const project = await getVideoProjectByRequestId(`kling:${taskId}`);
        if (project) await refreshFalRender(project.userId, project);
      } catch (error) {
        console.warn("[KlingWebhook] refresh failed for task", taskId, error);
      }
    }
    res.status(200).send("ok");
  });
}
