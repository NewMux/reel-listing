import { COOKIE_NAME } from "@shared/const";

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function readSessionCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join("="));
  }
  return null;
}

function isSecure(request: Request) {
  return new URL(request.url).protocol === "https:";
}

export function sessionCookie(request: Request, token: string, maxAgeMs = SESSION_TTL_MS) {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.floor(maxAgeMs / 1000)}`,
    ...(isSecure(request) ? ["Secure"] : []),
  ].join("; ");
}

export function clearedSessionCookie(request: Request) {
  return sessionCookie(request, "", 0);
}
