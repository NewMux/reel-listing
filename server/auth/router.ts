import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { AUTH_UNAVAILABLE_ERR_MSG } from "@shared/const";
import { ENV } from "../_core/env";
import type { TrpcContext } from "../_core/context";
import { publicProcedure, router } from "../_core/trpc";
import { checkRateLimit } from "../rateLimit";
import { clearedSessionCookie, sessionCookie } from "./cookies";
import * as auth from "./service";

const email = z.string().trim().email().max(320);
const password = z.string().min(8, "Use at least 8 characters.").max(256);
const token = z.string().min(16).max(200);

export function clientIp(req: Request) {
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

async function limit(ctx: TrpcContext, action: string) {
  const { allowed } = await checkRateLimit(ENV.authRateLimiter, `${action}:${clientIp(ctx.req)}`);
  if (!allowed) throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many attempts. Please wait a minute and try again." });
}

function startSession(ctx: TrpcContext, sessionToken: string) {
  ctx.resHeaders.append("Set-Cookie", sessionCookie(ctx.req, sessionToken));
}

async function run<T>(label: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    if (error instanceof auth.AuthError) {
      const code = error.code === "EMAIL_NOT_VERIFIED" ? "FORBIDDEN" : error.code === "INVALID_TOKEN" ? "BAD_REQUEST" : "UNAUTHORIZED";
      throw new TRPCError({ code, message: error.message, cause: error });
    }
    console.error(`[Auth] ${label} failed:`, error);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Something went wrong. Please try again." });
  }
}

export const authRouter = router({
  me: publicProcedure.query(({ ctx }) => {
    // A session cookie we could not check. Reporting "signed out" here would send the
    // client back to the login page in a loop.
    if (ctx.authUnavailable) {
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: AUTH_UNAVAILABLE_ERR_MSG });
    }
    return ctx.user;
  }),
  signUp: publicProcedure
    .input(z.object({ email, password, name: z.string().trim().max(160).optional() }))
    .mutation(async ({ ctx, input }) => {
      await limit(ctx, "signUp");
      await run("signUp", () => auth.signUp(input));
      return { success: true } as const;
    }),
  signIn: publicProcedure.input(z.object({ email, password: z.string().min(1).max(256) })).mutation(async ({ ctx, input }) => {
    await limit(ctx, "signIn");
    const { user, token: sessionToken } = await run("signIn", () => auth.signIn(input));
    startSession(ctx, sessionToken);
    return user;
  }),
  resendVerification: publicProcedure.input(z.object({ email })).mutation(async ({ ctx, input }) => {
    await limit(ctx, "resendVerification");
    await run("resendVerification", () => auth.resendVerification(input.email));
    return { success: true } as const;
  }),
  verifyEmail: publicProcedure.input(z.object({ token })).mutation(async ({ ctx, input }) => {
    const { token: sessionToken } = await run("verifyEmail", () => auth.verifyEmail(input.token));
    startSession(ctx, sessionToken);
    return { success: true } as const;
  }),
  requestPasswordReset: publicProcedure.input(z.object({ email })).mutation(async ({ ctx, input }) => {
    await limit(ctx, "requestPasswordReset");
    await run("requestPasswordReset", () => auth.requestPasswordReset(input.email));
    return { success: true } as const;
  }),
  resetPassword: publicProcedure.input(z.object({ token, password })).mutation(async ({ ctx, input }) => {
    const { token: sessionToken } = await run("resetPassword", () => auth.resetPassword(input.token, input.password));
    startSession(ctx, sessionToken);
    return { success: true } as const;
  }),
  logout: publicProcedure.mutation(async ({ ctx }) => {
    if (ctx.sessionToken) await auth.deleteSession(ctx.sessionToken).catch(error => console.error("[Auth] logout failed:", error));
    ctx.resHeaders.append("Set-Cookie", clearedSessionCookie(ctx.req));
    return { success: true } as const;
  }),
});
