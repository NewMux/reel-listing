import { describe, expect, it } from "vitest";

/**
 * These exercise the invariants the credit system has to hold under concurrency, against an
 * in-memory stand-in for the two database operations that enforce them. The real
 * implementations (server/db.ts) get their atomicity from the same shape: one conditional
 * UPDATE whose WHERE clause carries the precondition, so a losing racer matches no rows.
 *
 * What matters is that the guard lives in the WHERE clause rather than in a read-then-write
 * in application code, which is what would let two callers both observe enough credit and
 * both spend it.
 */

/** Mirrors moveCredits: UPDATE users SET credits = credits + delta WHERE id = ? AND credits >= -delta */
function makeAccount(initial: number) {
  let balance = initial;
  const ledger: { delta: number; balanceAfter: number }[] = [];
  return {
    move(delta: number) {
      if (delta < 0 && balance < -delta) return null;
      balance += delta;
      ledger.push({ delta, balanceAfter: balance });
      return balance;
    },
    get balance() {
      return balance;
    },
    get ledger() {
      return ledger;
    },
  };
}

/** Mirrors claimRenderLock: UPDATE ... SET lockedAt = now() WHERE lockedAt IS NULL OR lockedAt < stale */
function makeRenderLock(ttlMs: number) {
  let lockedAt: number | null = null;
  return {
    claim(now: number) {
      if (lockedAt !== null && now - lockedAt < ttlMs) return false;
      lockedAt = now;
      return true;
    },
    release() {
      lockedAt = null;
    },
  };
}

describe("clip credits", () => {
  it("never lets a balance go negative, however many spends race", () => {
    const account = makeAccount(10);
    const results = Array.from({ length: 5 }, () => account.move(-10));
    expect(results.filter(result => result !== null)).toHaveLength(1);
    expect(account.balance).toBe(0);
  });

  it("charges per clip, so a one-photo reel costs a tenth of a ten-photo reel", () => {
    const account = makeAccount(11);
    expect(account.move(-10)).toBe(1);
    expect(account.move(-1)).toBe(0);
    expect(account.move(-1)).toBeNull();
  });

  it("refunds exactly what was spent when a render never starts", () => {
    const account = makeAccount(10);
    expect(account.move(-10)).toBe(0);
    expect(account.move(10)).toBe(10);
    expect(account.balance).toBe(10);
    expect(account.ledger.map(entry => entry.delta)).toEqual([-10, 10]);
  });

  it("records a balance on every ledger entry so the running total is auditable", () => {
    const account = makeAccount(0);
    account.move(20);
    account.move(-10);
    expect(account.ledger).toEqual([
      { delta: 20, balanceAfter: 20 },
      { delta: -10, balanceAfter: 10 },
    ]);
  });
});

describe("render lock", () => {
  it("admits exactly one of several concurrent callers", () => {
    const lock = makeRenderLock(60_000);
    const claims = Array.from({ length: 4 }, () => lock.claim(1_000));
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("lets a later caller take over a lock whose holder died mid-flight", () => {
    const lock = makeRenderLock(60_000);
    expect(lock.claim(0)).toBe(true);
    expect(lock.claim(30_000)).toBe(false);
    expect(lock.claim(90_000)).toBe(true);
  });

  it("frees the lock immediately on release, so a retry is not made to wait out the TTL", () => {
    const lock = makeRenderLock(60_000);
    expect(lock.claim(0)).toBe(true);
    lock.release();
    expect(lock.claim(1)).toBe(true);
  });
});
