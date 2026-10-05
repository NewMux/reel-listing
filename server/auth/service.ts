import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { authCredentials, authTokens, sessions, users, type User } from "../../drizzle/schema";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import { SESSION_TTL_MS } from "./cookies";
import { hashPassword, hashToken, randomToken, verifyPassword } from "./crypto";
import { sendPasswordResetEmail, sendVerificationEmail } from "./email";

const VERIFY_EMAIL_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_PASSWORD_TTL_MS = 60 * 60 * 1000;

export class AuthError extends Error {
  constructor(
    public code: "INVALID_CREDENTIALS" | "EMAIL_NOT_VERIFIED" | "INVALID_TOKEN",
    message: string,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

// ---- Sessions ----

export async function createSession(userId: number) {
  const token = randomToken();
  await getDb().insert(sessions).values({ id: await hashToken(token), userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) });
  await getDb().update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, userId));
  return token;
}

/**
 * Resolves a session cookie to its user. Sessions slide: once less than half the TTL
 * remains, the expiry is pushed out again and `refreshed` tells the caller to re-set the cookie.
 */
export async function getSessionUser(token: string): Promise<{ user: User; refreshed: boolean } | null> {
  const id = await hashToken(token);
  const db = getDb();
  const rows = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const now = Date.now();
  if (row.expiresAt.getTime() <= now) {
    await db.delete(sessions).where(eq(sessions.id, id));
    return null;
  }
  const refreshed = row.expiresAt.getTime() - now < SESSION_TTL_MS / 2;
  if (refreshed) await db.update(sessions).set({ expiresAt: new Date(now + SESSION_TTL_MS) }).where(eq(sessions.id, id));
  return { user: row.user, refreshed };
}

export async function deleteSession(token: string) {
  await getDb().delete(sessions).where(eq(sessions.id, await hashToken(token)));
}

// ---- One-time email tokens ----

async function issueToken(userId: number, purpose: "verify_email" | "reset_password", ttlMs: number) {
  const token = randomToken();
  const db = getDb();
  // Only the newest link of each kind stays valid, and expired ones are swept as we go.
  await db.delete(authTokens).where(and(eq(authTokens.userId, userId), eq(authTokens.purpose, purpose)));
  await db.delete(authTokens).where(lt(authTokens.expiresAt, new Date()));
  await db.insert(authTokens).values({ id: await hashToken(token), userId, purpose, expiresAt: new Date(Date.now() + ttlMs) });
  return token;
}

/** Atomically marks a token used and returns its user id, or throws if it is unknown, used, or expired. */
async function consumeToken(token: string, purpose: "verify_email" | "reset_password") {
  const now = new Date();
  const result = await getDb()
    .update(authTokens)
    .set({ usedAt: now })
    .where(and(eq(authTokens.id, await hashToken(token)), eq(authTokens.purpose, purpose), isNull(authTokens.usedAt), gt(authTokens.expiresAt, now)))
    .returning({ userId: authTokens.userId });
  const userId = result[0]?.userId;
  if (!userId) throw new AuthError("INVALID_TOKEN", "This link is invalid or has expired. Please request a new one.");
  return userId;
}

// ---- Flows ----

async function findUserByEmail(email: string) {
  const rows = await getDb().select().from(users).where(eq(users.email, normalizeEmail(email))).limit(1);
  return rows[0];
}

/**
 * Creates an unverified account and emails a confirmation link. Deliberately returns the
 * same result whether or not the email is already registered, so sign-up can't be used to
 * discover which addresses have accounts.
 */
export async function signUp(input: { email: string; password: string; name?: string | null }) {
  const email = normalizeEmail(input.email);
  const existing = await findUserByEmail(email);
  if (existing) {
    if (!existing.emailVerifiedAt) await sendVerificationEmail(email, await issueToken(existing.id, "verify_email", VERIFY_EMAIL_TTL_MS));
    return;
  }

  const db = getDb();
  const credentials = await hashPassword(input.password);
  const inserted = await db
    .insert(users)
    .values({ email, name: input.name?.trim() || null, role: ENV.ownerEmail && email === ENV.ownerEmail ? "admin" : "user" })
    .onConflictDoNothing({ target: users.email })
    .returning({ id: users.id });
  const userId = inserted[0]?.id;
  // Lost a race with a concurrent sign-up for the same address: treat it as already registered.
  if (!userId) return;
  await db.insert(authCredentials).values({ userId, ...credentials });
  await sendVerificationEmail(email, await issueToken(userId, "verify_email", VERIFY_EMAIL_TTL_MS));
}

// Verified against when the email is unknown, so a miss costs the same time as a wrong password.
let dummyCredentials: ReturnType<typeof hashPassword> | null = null;

export async function signIn(input: { email: string; password: string }) {
  const rows = await getDb()
    .select({ user: users, credentials: authCredentials })
    .from(users)
    .innerJoin(authCredentials, eq(authCredentials.userId, users.id))
    .where(eq(users.email, normalizeEmail(input.email)))
    .limit(1);
  const row = rows[0];
  dummyCredentials ??= hashPassword(randomToken());
  const valid = await verifyPassword(input.password, row?.credentials ?? (await dummyCredentials));
  if (!row || !valid) throw new AuthError("INVALID_CREDENTIALS", "Incorrect email or password.");
  if (!row.user.emailVerifiedAt) {
    await sendVerificationEmail(row.user.email, await issueToken(row.user.id, "verify_email", VERIFY_EMAIL_TTL_MS));
    throw new AuthError("EMAIL_NOT_VERIFIED", "Please confirm your email first. We just sent you a new link.");
  }
  return { user: row.user, token: await createSession(row.user.id) };
}

export async function resendVerification(email: string) {
  const user = await findUserByEmail(email);
  if (user && !user.emailVerifiedAt) await sendVerificationEmail(user.email, await issueToken(user.id, "verify_email", VERIFY_EMAIL_TTL_MS));
}

/** Confirms the email and signs the user in. */
export async function verifyEmail(token: string) {
  const userId = await consumeToken(token, "verify_email");
  await getDb().update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)));
  return { token: await createSession(userId) };
}

/** Always succeeds from the caller's point of view, whether or not the email has an account. */
export async function requestPasswordReset(email: string) {
  const user = await findUserByEmail(email);
  if (user) await sendPasswordResetEmail(user.email, await issueToken(user.id, "reset_password", RESET_PASSWORD_TTL_MS));
}

/**
 * Sets a new password from a reset link, signs out every other session, and signs this
 * browser in. Following the emailed link also proves the address, so it counts as verification.
 */
export async function resetPassword(token: string, password: string) {
  const userId = await consumeToken(token, "reset_password");
  const db = getDb();
  const credentials = await hashPassword(password);
  await db
    .insert(authCredentials)
    .values({ userId, ...credentials })
    .onConflictDoUpdate({ target: authCredentials.userId, set: { ...credentials, updatedAt: new Date() } });
  await db.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(and(eq(users.id, userId), isNull(users.emailVerifiedAt)));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  return { token: await createSession(userId) };
}
