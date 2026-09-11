import crypto from "node:crypto";

/**
 * Paddle webhook signature verification.
 *
 * Kept apart from the request handling so it can be tested directly. This is the only thing
 * standing between a forged HTTP request and free credit: unlike the fal.ai webhook, which
 * can treat its body as an untrusted hint because it re-queries fal.ai with our own
 * credentials afterwards, a Paddle webhook is the sole evidence the app ever receives that
 * money changed hands. There is nothing to cross-check it against.
 *
 * Paddle sends `Paddle-Signature: ts=<unix seconds>;h1=<hex>`, where the signature is
 * HMAC-SHA256 over `<ts>:<raw body>` keyed with the endpoint secret.
 * https://developer.paddle.com/webhooks/about/signature-verification/
 */

export type SignatureFailure =
  | "missing-secret"
  | "missing-header"
  | "malformed-header"
  | "stale-timestamp"
  | "bad-signature";

export type SignatureResult = { ok: true } | { ok: false; reason: SignatureFailure };

/**
 * How far out of date a signed timestamp may be. Paddle's own guidance is a tolerance of
 * seconds; five minutes is generous enough to survive clock drift and a slow cold start
 * while still making a captured request useless before long.
 */
export const SIGNATURE_TOLERANCE_SECONDS = 5 * 60;

function parseHeader(header: string) {
  const parts = new Map<string, string>();
  for (const segment of header.split(";")) {
    const index = segment.indexOf("=");
    if (index === -1) continue;
    parts.set(segment.slice(0, index).trim(), segment.slice(index + 1).trim());
  }
  const ts = parts.get("ts");
  const h1 = parts.get("h1");
  if (!ts || !h1 || !/^\d+$/.test(ts) || !/^[a-f0-9]{64}$/i.test(h1)) return null;
  return { ts, h1 };
}

/**
 * `rawBody` must be the exact bytes Paddle sent. A parsed-and-re-serialised body produces a
 * different hash even when it is semantically identical, which is the usual reason a correct
 * implementation still rejects every request.
 */
export function verifyPaddleSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  secret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): SignatureResult {
  // Fail closed. An unset secret must never degrade into accepting everything.
  if (!secret) return { ok: false, reason: "missing-secret" };
  if (!signatureHeader) return { ok: false, reason: "missing-header" };

  const parsed = parseHeader(signatureHeader);
  if (!parsed) return { ok: false, reason: "malformed-header" };

  // Checked before the HMAC so a replayed-but-validly-signed request is rejected too.
  if (Math.abs(nowSeconds - Number(parsed.ts)) > SIGNATURE_TOLERANCE_SECONDS) {
    return { ok: false, reason: "stale-timestamp" };
  }

  const body = typeof rawBody === "string" ? Buffer.from(rawBody, "utf8") : rawBody;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(Buffer.concat([Buffer.from(`${parsed.ts}:`, "utf8"), body]))
    .digest();
  const received = Buffer.from(parsed.h1, "hex");

  // timingSafeEqual throws on a length mismatch, and a plain === would leak how much of the
  // hash was correct through response timing. Both lengths are fixed here, but the guard
  // keeps that true if the header regex ever loosens.
  if (received.length !== expected.length) return { ok: false, reason: "bad-signature" };
  if (!crypto.timingSafeEqual(received, expected)) return { ok: false, reason: "bad-signature" };
  return { ok: true };
}

/** Builds a valid header for a body and secret. Test helper, and useful for local replay. */
export function signPaddlePayload(rawBody: string, secret: string, ts: number) {
  const h1 = crypto.createHmac("sha256", secret).update(`${ts}:${rawBody}`).digest("hex");
  return `ts=${ts};h1=${h1}`;
}
