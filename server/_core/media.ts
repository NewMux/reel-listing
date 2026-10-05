import { ENV } from "./env";
import { MEDIA_ROUTE_PREFIX, verifyLocalMediaSignature } from "../storage";

// Serves and accepts media through the Worker when no R2 API token is configured (local
// development). In production, browsers and fal.ai talk to R2 directly via presigned URLs
// and every request here is rejected by the signature check.
export async function handleMediaRequest(request: Request) {
  const url = new URL(request.url);
  const key = decodeURIComponent(url.pathname.slice(MEDIA_ROUTE_PREFIX.length));
  const allowed = key && await verifyLocalMediaSignature(request.method, key, url.searchParams.get("expires"), url.searchParams.get("signature"));
  if (!allowed) return new Response("Forbidden", { status: 403 });

  if (request.method === "PUT") {
    await ENV.media.put(key, request.body, { httpMetadata: { contentType: request.headers.get("content-type") ?? "application/octet-stream" } });
    return new Response(null, { status: 200 });
  }

  const object = await ENV.media.get(key, { range: request.headers, onlyIf: request.headers });
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("etag", object.httpEtag);
  headers.set("accept-ranges", "bytes");
  headers.set("cache-control", "private, max-age=3600");
  if (!("body" in object)) return new Response(null, { status: 304, headers });
  const range = object.range as { offset?: number; length?: number } | undefined;
  if (range && request.headers.has("range")) {
    const offset = range.offset ?? 0;
    const length = range.length ?? object.size - offset;
    headers.set("content-range", `bytes ${offset}-${offset + length - 1}/${object.size}`);
    headers.set("content-length", String(length));
    return new Response(request.method === "HEAD" ? null : object.body, { status: 206, headers });
  }
  headers.set("content-length", String(object.size));
  return new Response(request.method === "HEAD" ? null : object.body, { headers });
}
