import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { getUserByOpenId, upsertUser } from "../db";
import { ENV } from "./env";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
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

async function authenticateSupabaseRequest(req: CreateExpressContextOptions["req"]): Promise<User | null> {
  const token = bearerToken(req);
  if (!token || !ENV.supabaseUrl || !ENV.supabaseAnonKey) return null;

  try {
    const response = await fetch(`${ENV.supabaseUrl.replace(/\/$/, "")}/auth/v1/user`, {
      headers: {
        apikey: ENV.supabaseAnonKey,
        authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) return null;

    const supabaseUser = await response.json() as SupabaseUser;
    if (!supabaseUser.id) return null;

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
    return (await getUserByOpenId(openId)) ?? null;
  } catch {
    return null;
  }
}

export async function createContext(
  opts: CreateExpressContextOptions,
): Promise<TrpcContext> {
  let user: User | null = await authenticateSupabaseRequest(opts.req);

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
  };
}
