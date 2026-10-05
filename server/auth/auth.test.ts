import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { COOKIE_NAME } from "../../shared/const";
import { createContext } from "../_core/context";
import { appRouter } from "../routers";
import { hashPassword, hashToken, verifyPassword } from "./crypto";
import * as service from "./service";

// Capture outgoing auth emails from the EMAIL binding and pull the one-time token out of the link.
const sentEmails: { kind: "verify" | "reset"; to: string; token: string }[] = [];
vi.spyOn(env.EMAIL, "send").mockImplementation((async (message: { to: string; text: string }) => {
  const link = message.text.match(/\/(verify-email|reset-password)\?token=([^\s]+)/);
  if (link) sentEmails.push({ kind: link[1] === "verify-email" ? "verify" : "reset", to: message.to, token: decodeURIComponent(link[2]) });
  return { messageId: "test" };
}) as never);

function lastEmail(kind: "verify" | "reset") {
  const email = [...sentEmails].reverse().find(entry => entry.kind === kind);
  if (!email) throw new Error(`no ${kind} email sent`);
  return email;
}

async function caller(cookie?: string) {
  const req = new Request("https://reel-listing.test/api/trpc", { headers: cookie ? { cookie } : {} });
  const resHeaders = new Headers();
  const ctx = await createContext({ req, resHeaders });
  return { trpc: appRouter.createCaller(ctx), resHeaders };
}

function sessionFrom(resHeaders: Headers) {
  const header = resHeaders.get("set-cookie") ?? "";
  const match = header.match(new RegExp(`${COOKIE_NAME}=([^;]*)`));
  return match ? `${COOKIE_NAME}=${match[1]}` : null;
}

async function verifiedUser(email = "agent@example.com", password = "correct horse battery") {
  await service.signUp({ email, password });
  await service.verifyEmail(lastEmail("verify").token);
  return { email, password };
}

beforeEach(async () => {
  sentEmails.length = 0;
  await env.DB.exec("DELETE FROM sessions; DELETE FROM auth_tokens; DELETE FROM auth_credentials; DELETE FROM users;");
});

describe("password hashing", () => {
  it("verifies the right password and rejects a wrong one", async () => {
    const stored = await hashPassword("s3cret-pass");
    expect(await verifyPassword("s3cret-pass", stored)).toBe(true);
    expect(await verifyPassword("s3cret-pasS", stored)).toBe(false);
  });

  it("salts every hash", async () => {
    const [a, b] = await Promise.all([hashPassword("same"), hashPassword("same")]);
    expect(a.passwordHash).not.toBe(b.passwordHash);
  });
});

describe("sign up and email verification", () => {
  it("refuses to sign in until the email is confirmed, then signs in", async () => {
    const { trpc } = await caller();
    await trpc.auth.signUp({ email: "New@Example.com ", password: "long enough pw" });
    expect(lastEmail("verify").to).toBe("new@example.com");

    await expect(trpc.auth.signIn({ email: "new@example.com", password: "long enough pw" })).rejects.toMatchObject({ code: "FORBIDDEN" });

    const verify = await caller();
    await verify.trpc.auth.verifyEmail({ token: lastEmail("verify").token });
    const cookie = sessionFrom(verify.resHeaders);
    expect(cookie).toBeTruthy();
    const me = await (await caller(cookie!)).trpc.auth.me();
    expect(me?.email).toBe("new@example.com");
    expect(me?.emailVerifiedAt).toBeInstanceOf(Date);
  });

  it("does not reveal whether an email is already registered", async () => {
    await verifiedUser("taken@example.com");
    const { trpc } = await caller();
    await expect(trpc.auth.signUp({ email: "taken@example.com", password: "another password" })).resolves.toEqual({ success: true });
    // The existing password still works; the second sign-up changed nothing.
    await expect(service.signIn({ email: "taken@example.com", password: "correct horse battery" })).resolves.toBeTruthy();
  });

  it("makes the configured owner email an admin", async () => {
    const { trpc } = await caller();
    await trpc.auth.signUp({ email: "owner@reel-listing.test", password: "long enough pw" });
    const { token } = await service.verifyEmail(lastEmail("verify").token);
    const me = await (await caller(`${COOKIE_NAME}=${token}`)).trpc.auth.me();
    expect(me?.role).toBe("admin");
  });

  it("verification links are single-use", async () => {
    await service.signUp({ email: "once@example.com", password: "long enough pw" });
    const { token } = lastEmail("verify");
    await service.verifyEmail(token);
    await expect(service.verifyEmail(token)).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });
});

describe("sign in and sessions", () => {
  it("rejects a wrong password with a generic error", async () => {
    await verifiedUser();
    const { trpc } = await caller();
    await expect(trpc.auth.signIn({ email: "agent@example.com", password: "wrong" })).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Incorrect email or password." });
    await expect(trpc.auth.signIn({ email: "nobody@example.com", password: "wrong" })).rejects.toMatchObject({ code: "UNAUTHORIZED", message: "Incorrect email or password." });
  });

  it("sets an HttpOnly session cookie that authenticates later requests, and logout revokes it", async () => {
    const { email, password } = await verifiedUser();
    const signIn = await caller();
    await signIn.trpc.auth.signIn({ email, password });
    const header = signIn.resHeaders.get("set-cookie")!;
    expect(header).toContain("HttpOnly");
    expect(header).toContain("SameSite=Lax");
    expect(header).toContain("Secure");
    const cookie = sessionFrom(signIn.resHeaders)!;

    expect((await (await caller(cookie)).trpc.auth.me())?.email).toBe(email);

    const logout = await caller(cookie);
    await logout.trpc.auth.logout();
    expect(logout.resHeaders.get("set-cookie")).toContain("Max-Age=0");
    expect(await (await caller(cookie)).trpc.auth.me()).toBeNull();
  });

  it("drops expired sessions", async () => {
    const { email, password } = await verifiedUser();
    const { token } = await service.signIn({ email, password });
    await env.DB.prepare("UPDATE sessions SET expiresAt = ?").bind(Date.now() - 1000).run();
    expect(await service.getSessionUser(token)).toBeNull();
    const row = await env.DB.prepare("SELECT id FROM sessions WHERE id = ?").bind(await hashToken(token)).first();
    expect(row).toBeNull();
  });

  it("slides a session's expiry once it is past half its lifetime", async () => {
    const { email, password } = await verifiedUser();
    const { token } = await service.signIn({ email, password });
    await env.DB.prepare("UPDATE sessions SET expiresAt = ?").bind(Date.now() + 60_000).run();
    const signedIn = await caller(`${COOKIE_NAME}=${token}`);
    expect(signedIn.resHeaders.get("set-cookie")).toContain(`${COOKIE_NAME}=`);
  });

  it("protected procedures reject anonymous callers", async () => {
    const { trpc } = await caller();
    await expect(trpc.projects.list()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("password reset", () => {
  it("resets the password, signs out other sessions, and signs this browser in", async () => {
    const { email, password } = await verifiedUser();
    const { token: oldSession } = await service.signIn({ email, password });

    const request = await caller();
    await request.trpc.auth.requestPasswordReset({ email });
    const reset = await caller();
    await reset.trpc.auth.resetPassword({ token: lastEmail("reset").token, password: "brand new password" });

    expect(sessionFrom(reset.resHeaders)).toBeTruthy();
    expect(await service.getSessionUser(oldSession)).toBeNull();
    await expect(service.signIn({ email, password })).rejects.toMatchObject({ code: "INVALID_CREDENTIALS" });
    await expect(service.signIn({ email, password: "brand new password" })).resolves.toBeTruthy();
    await expect(service.resetPassword(lastEmail("reset").token, "yet another one")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });

  it("succeeds silently for unknown emails", async () => {
    const { trpc } = await caller();
    await expect(trpc.auth.requestPasswordReset({ email: "ghost@example.com" })).resolves.toEqual({ success: true });
    expect(sentEmails).toHaveLength(0);
  });

  it("rejects expired reset links", async () => {
    const { email } = await verifiedUser();
    await service.requestPasswordReset(email);
    await env.DB.prepare("UPDATE auth_tokens SET expiresAt = ?").bind(Date.now() - 1000).run();
    await expect(service.resetPassword(lastEmail("reset").token, "brand new password")).rejects.toMatchObject({ code: "INVALID_TOKEN" });
  });
});
