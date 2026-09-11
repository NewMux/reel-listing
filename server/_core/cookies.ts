import type { CookieOptions, Request } from "express";

function isSecureRequest(req: Request) {
  if (req.protocol === "https") return true;

  const forwardedProto = req.headers["x-forwarded-proto"];
  if (!forwardedProto) return false;

  const protoList = Array.isArray(forwardedProto)
    ? forwardedProto
    : forwardedProto.split(",");

  return protoList.some(proto => proto.trim().toLowerCase() === "https");
}

export function getSessionCookieOptions(
  req: Request
): Pick<CookieOptions, "domain" | "httpOnly" | "path" | "sameSite" | "secure"> {
  return {
    httpOnly: true,
    path: "/",
    // "lax" not "none": the tRPC client sends `credentials: "include"` on every call, so a
    // cross-site cookie would let any page a signed-in user visits drive authenticated
    // mutations against this API. "lax" still survives the top-level redirect back from the
    // OAuth provider, which is the only cross-site navigation this session cookie has to
    // live through.
    sameSite: "lax",
    secure: isSecureRequest(req),
  };
}
