import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId, upsertUser } from "../db";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  supabaseAccessToken: string | null;
  /**
   * True when Supabase verified the caller but we could not load their account
   * row (for example the database rejected the connection). The caller is
   * signed in, so sending them back to the login page would only loop.
   */
  authUnavailable: boolean;
};

type SupabaseUser = {
  id: string;
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
};

function bearerToken(req: CreateExpressContextOptions["req"]) {
  const authorization = req.get("authorization");
  return authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
}

type SupabaseAuthResult = { user: User | null; accessToken: string | null; unavailable: boolean };

const UNAUTHENTICATED: SupabaseAuthResult = { user: null, accessToken: null, unavailable: false };

async function authenticateSupabaseRequest(req: CreateExpressContextOptions["req"]): Promise<SupabaseAuthResult> {
  const token = bearerToken(req);
  if (!token || !ENV.supabaseUrl || !ENV.supabaseAnonKey) return UNAUTHENTICATED;

  let supabaseUser: SupabaseUser;
  try {
    const response = await fetch(`${ENV.supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
      headers: {
        apikey: ENV.supabaseAnonKey,
        authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) return UNAUTHENTICATED;

    supabaseUser = await response.json() as SupabaseUser;
    if (!supabaseUser.id) return UNAUTHENTICATED;
  } catch (error) {
    console.error("[Auth] Supabase token verification failed:", error);
    return { ...UNAUTHENTICATED, unavailable: true };
  }

  // The token is valid past this point, so a failure here is ours, not the
  // caller's: report it as unavailable rather than unauthenticated.
  try {
    const metadata = supabaseUser.user_metadata ?? {};
    const metadataName = metadata.full_name ?? metadata.name;
    const name = typeof metadataName === "string" && metadataName.trim() ? metadataName.trim() : null;
    const openId = `supabase:${supabaseUser.id}`;
    await upsertUser({
      openId,
      name,
      email: supabaseUser.email ?? null,
      loginMethod: "supabase",
    });
    return { user: (await getUserByOpenId(openId)) ?? null, accessToken: token, unavailable: false };
  } catch (error) {
    console.error("[Auth] Supabase user sync failed:", error);
    return { user: null, accessToken: token, unavailable: true };
  }
}

export async function createContext(
  opts: CreateExpressContextOptions,
): Promise<TrpcContext> {
  const supabaseAuth = await authenticateSupabaseRequest(opts.req);
  let user: User | null = supabaseAuth.user;
  const supabaseAccessToken = supabaseAuth.accessToken;

  if (!user && ENV.oAuthServerUrl) {
    try {
      user = await sdk.authenticateRequest(opts.req);
    } catch {
      // Authentication is optional for public procedures.
      user = null;
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    supabaseAccessToken,
    authUnavailable: !user && supabaseAuth.unavailable,
  };
}
