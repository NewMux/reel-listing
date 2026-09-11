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
 *
 * Credit moves as a RESERVATION taken when a render is approved and a RELEASE returned if
 * the render never started. Both carry a referenceId that is unique across the ledger, which
 * is what makes a retried movement a no-op rather than a second charge.
 */

/**
 * Mirrors moveCredits: an idempotency check on referenceId, then
 * UPDATE billing_accounts SET creditBalance = creditBalance + amount
 * WHERE id = ? AND creditBalance >= -amount
 */
function makeAccount(initial: number) {
  let balance = initial;
  const ledger: { amount: number; balanceAfter: number; referenceId: string }[] = [];
  return {
    move(amount: number, referenceId = `ref-${ledger.length}`) {
      const seen = ledger.find(entry => entry.referenceId === referenceId);
      if (seen) return seen.balanceAfter;
      if (amount < 0 && balance < -amount) return null;
      balance += amount;
      ledger.push({ amount, balanceAfter: balance, referenceId });
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
    const results = Array.from({ length: 5 }, (_, i) => account.move(-10, `reservation:${i}`));
    expect(results.filter(result => result !== null)).toHaveLength(1);
    expect(account.balance).toBe(0);
  });

  it("charges per clip, so a one-photo reel costs a tenth of a ten-photo reel", () => {
    const account = makeAccount(11);
    expect(account.move(-10, "ten-photo-reel")).toBe(1);
    expect(account.move(-1, "one-photo-reel")).toBe(0);
    expect(account.move(-1, "one-more")).toBeNull();
  });

  it("releases exactly what was reserved when a render never starts", () => {
    const account = makeAccount(10);
    expect(account.move(-10, "reservation:project:1:abc")).toBe(0);
    expect(account.move(10, "release:project:1:abc")).toBe(10);
    expect(account.balance).toBe(10);
    expect(account.ledger.map(entry => entry.amount)).toEqual([-10, 10]);
  });

  it("treats a repeated referenceId as already applied instead of moving credit twice", () => {
    const account = makeAccount(10);
    expect(account.move(-10, "reservation:project:1:abc")).toBe(0);
    // A retried reservation must not charge again.
    expect(account.move(-10, "reservation:project:1:abc")).toBe(0);
    expect(account.balance).toBe(0);
    expect(account.ledger).toHaveLength(1);
  });

  it("does not return credit twice when a release is retried", () => {
    const account = makeAccount(10);
    account.move(-10, "reservation:project:1:abc");
    expect(account.move(10, "release:project:1:abc")).toBe(10);
    expect(account.move(10, "release:project:1:abc")).toBe(10);
    expect(account.balance).toBe(10);
  });

  it("charges a re-approved project again, because it is a second real render", () => {
    const account = makeAccount(20);
    // Approve, send back for changes, approve again: two attempts, two references.
    expect(account.move(-10, "reservation:project:1:first")).toBe(10);
    expect(account.move(-10, "reservation:project:1:second")).toBe(0);
    expect(account.balance).toBe(0);
  });

  it("records a balance on every ledger entry so the running total is auditable", () => {
    const account = makeAccount(0);
    account.move(20, "purchase:invoice-1");
    account.move(-10, "reservation:project:1:abc");
    expect(account.ledger).toEqual([
      { amount: 20, balanceAfter: 20, referenceId: "purchase:invoice-1" },
      { amount: -10, balanceAfter: 10, referenceId: "reservation:project:1:abc" },
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
