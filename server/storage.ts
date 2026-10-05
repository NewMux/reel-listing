// Media storage on Cloudflare R2.
//
// Stored URLs are opaque `/manus-storage/<key>` markers (kept from the original storage
// layer so existing URL checks stay valid); they are turned into short-lived signed URLs
// whenever a project is presented. Browsers upload straight to R2 with a presigned PUT
// (final reels can exceed the Worker request-body limit), and fal.ai fetches source photos
// through presigned GETs. Both use R2's S3 API, so they need an R2 API token.
//
// Without that token (local `pnpm dev`), the Worker itself serves and accepts media at
// /api/media/<key>, authorised by an HMAC signature, backed by the local R2 binding.

import { AwsClient } from "aws4fetch";
import { ENV } from "./_core/env";

export const STORED_URL_PREFIX = "/manus-storage/";
export const MEDIA_ROUTE_PREFIX = "/api/media/";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type StorageData = ArrayBuffer | Uint8Array | string;

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

function encodeKey(key: string) {
  return key.split("/").map(encodeURIComponent).join("/");
}

function hasR2ApiCredentials() {
  const { accountId, accessKeyId, secretAccessKey, bucket } = ENV.r2;
  return Boolean(accountId && accessKeyId && secretAccessKey && bucket);
}

let awsClient: AwsClient | null = null;
function getAwsClient() {
  if (!awsClient) {
    const { accessKeyId, secretAccessKey } = ENV.r2;
    awsClient = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  }
  return awsClient;
}

async function presignR2(method: "GET" | "PUT", key: string): Promise<string> {
  const { accountId, bucket } = ENV.r2;
  const url = new URL(`https://${accountId}.r2.cloudflarestorage.com/${bucket}/${encodeKey(key)}`);
  url.searchParams.set("X-Amz-Expires", String(SIGNED_URL_TTL_SECONDS));
  const signed = await getAwsClient().sign(new Request(url, { method }), { aws: { signQuery: true } });
  return signed.url;
}

// ---- Local fallback: Worker-served media URLs signed with a per-isolate HMAC key. ----

let localSigningKey: Promise<CryptoKey> | null = null;
function getLocalSigningKey() {
  localSigningKey ??= crypto.subtle.generateKey({ name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]) as Promise<CryptoKey>;
  return localSigningKey;
}

function toHex(buffer: ArrayBuffer) {
  return Array.from(new Uint8Array(buffer), byte => byte.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string) {
  if (!/^[0-9a-f]*$/.test(hex) || hex.length % 2) return new Uint8Array();
  return new Uint8Array(hex.match(/../g)?.map(byte => parseInt(byte, 16)) ?? []);
}

async function signLocal(method: "GET" | "PUT", key: string): Promise<string> {
  const expires = Math.floor(Date.now() / 1000) + SIGNED_URL_TTL_SECONDS;
  const signature = await crypto.subtle.sign("HMAC", await getLocalSigningKey(), new TextEncoder().encode(`${method}\n${key}\n${expires}`));
  return `${ENV.publicUrl}${MEDIA_ROUTE_PREFIX}${encodeKey(key)}?expires=${expires}&signature=${toHex(signature)}`;
}

export async function verifyLocalMediaSignature(method: string, key: string, expires: string | null, signature: string | null) {
  if (hasR2ApiCredentials() || (method !== "GET" && method !== "PUT" && method !== "HEAD")) return false;
  const expiresAt = Number(expires);
  if (!signature || !Number.isFinite(expiresAt) || expiresAt < Date.now() / 1000) return false;
  const signedMethod = method === "HEAD" ? "GET" : method;
  return crypto.subtle.verify("HMAC", await getLocalSigningKey(), fromHex(signature), new TextEncoder().encode(`${signedMethod}\n${key}\n${expiresAt}`));
}

let warnedLocalFallback = false;
function presign(method: "GET" | "PUT", key: string) {
  if (hasR2ApiCredentials()) return presignR2(method, key);
  if (!warnedLocalFallback) {
    warnedLocalFallback = true;
    // Fine for local dev; in production these URLs only verify in the isolate that signed them.
    console.warn("[Storage] R2 API credentials are not set; serving media through the Worker. Set R2_* secrets in production.");
  }
  return signLocal(method, key);
}

// ---- Public API ----

export async function storagePut(
  relKey: string,
  data: StorageData,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  await ENV.media.put(key, data, { httpMetadata: { contentType } });
  return { key, url: `${STORED_URL_PREFIX}${key}` };
}

export async function storageCreatePutTarget(relKey: string): Promise<{ key: string; url: string; uploadUrl: string }> {
  const key = appendHashSuffix(normalizeKey(relKey));
  return { key, url: `${STORED_URL_PREFIX}${key}`, uploadUrl: await presign("PUT", key) };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  return presign("GET", normalizeKey(relKey));
}

export async function signStoredUrl(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  if (!value.startsWith(STORED_URL_PREFIX)) return value;
  return storageGetSignedUrl(value.slice(STORED_URL_PREFIX.length));
}
