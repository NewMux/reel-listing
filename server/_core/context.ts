import type { FetchCreateContextFnOptions } from "@trpc/server/adapters/fetch";
import type { User } from "../../drizzle/schema";
import { readSessionCookie, sessionCookie } from "../auth/cookies";
import { getSessionUser } from "../auth/service";

export type TrpcContext = {
  req: Request;
  resHeaders: Headers;
  user: User | null;
  /** The raw session cookie value, so sign-out can revoke exactly this session. */
  sessionToken: string | null;
  /**
   * True when the caller presented a session cookie but we could not check it (for example
   * the database errored). They may well be signed in, so sending them back to the login
   * page would only loop.
   */
  authUnavailable: boolean;
};

export async function createContext({ req, resHeaders }: Pick<FetchCreateContextFnOptions, "req" | "resHeaders">): Promise<TrpcContext> {
  const sessionToken = readSessionCookie(req);
  if (!sessionToken) return { req, resHeaders, user: null, sessionToken: null, authUnavailable: false };

  try {
    const session = await getSessionUser(sessionToken);
    if (session?.refreshed) resHeaders.append("Set-Cookie", sessionCookie(req, sessionToken));
    return { req, resHeaders, user: session?.user ?? null, sessionToken, authUnavailable: false };
  } catch (error) {
    console.error("[Auth] session lookup failed:", error);
    return { req, resHeaders, user: null, sessionToken, authUnavailable: true };
  }
}
