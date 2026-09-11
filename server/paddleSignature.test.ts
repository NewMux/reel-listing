import { describe, expect, it } from "vitest";
import { SIGNATURE_TOLERANCE_SECONDS, signPaddlePayload, verifyPaddleSignature } from "./paddleSignature";

const SECRET = "pdl_ntfset_01test_secret_value";
const BODY = JSON.stringify({ event_type: "transaction.completed", data: { id: "txn_01abc" } });
const NOW = 1_800_000_000;

describe("paddle signature verification", () => {
  it("accepts a payload signed with the endpoint secret", () => {
    const header = signPaddlePayload(BODY, SECRET, NOW);
    expect(verifyPaddleSignature(BODY, header, SECRET, NOW)).toEqual({ ok: true });
  });

  it("rejects a body altered by a single character", () => {
    const header = signPaddlePayload(BODY, SECRET, NOW);
    const tampered = BODY.replace("txn_01abc", "txn_01abd");
    expect(verifyPaddleSignature(tampered, header, SECRET, NOW)).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a signature made with a different secret", () => {
    const header = signPaddlePayload(BODY, "someone-elses-secret", NOW);
    expect(verifyPaddleSignature(BODY, header, SECRET, NOW)).toEqual({ ok: false, reason: "bad-signature" });
  });

  it("rejects a correctly signed payload that is too old to be live", () => {
    const header = signPaddlePayload(BODY, SECRET, NOW);
    const later = NOW + SIGNATURE_TOLERANCE_SECONDS + 1;
    expect(verifyPaddleSignature(BODY, header, SECRET, later)).toEqual({ ok: false, reason: "stale-timestamp" });
  });

  it("accepts clock drift inside the tolerance, in both directions", () => {
    const header = signPaddlePayload(BODY, SECRET, NOW);
    expect(verifyPaddleSignature(BODY, header, SECRET, NOW + SIGNATURE_TOLERANCE_SECONDS).ok).toBe(true);
    expect(verifyPaddleSignature(BODY, header, SECRET, NOW - SIGNATURE_TOLERANCE_SECONDS).ok).toBe(true);
  });

  it("fails closed when no secret is configured", () => {
    const header = signPaddlePayload(BODY, SECRET, NOW);
    expect(verifyPaddleSignature(BODY, header, "", NOW)).toEqual({ ok: false, reason: "missing-secret" });
  });

  it("rejects a missing or unusable header", () => {
    expect(verifyPaddleSignature(BODY, undefined, SECRET, NOW)).toEqual({ ok: false, reason: "missing-header" });
    for (const header of ["", "garbage", "ts=;h1=", "h1=abc", `ts=${NOW}`, `ts=${NOW};h1=nothex`]) {
      const result = verifyPaddleSignature(BODY, header, SECRET, NOW);
      expect(result.ok, header).toBe(false);
    }
  });

  it("verifies raw bytes, so a re-serialised body no longer matches", () => {
    const header = signPaddlePayload(BODY, SECRET, NOW);
    // What express.json() would hand back: same meaning, different bytes.
    const reserialised = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(verifyPaddleSignature(reserialised, header, SECRET, NOW).ok).toBe(false);
    // And the original bytes still pass, as a Buffer too.
    expect(verifyPaddleSignature(Buffer.from(BODY, "utf8"), header, SECRET, NOW).ok).toBe(true);
  });
});
