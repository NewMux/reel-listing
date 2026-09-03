// Storage helpers for the deployed reel-listing app.
// Prefer the built-in Forge storage when it is available; otherwise use the
// private Supabase Storage bucket configured for the Vercel deployment.

import { createClient } from "@supabase/supabase-js";
import { withRetry } from "@shared/retry";
import { ENV } from "./_core/env";

const SUPABASE_BUCKET = "reel-listing-media";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

type StorageData = Buffer | Uint8Array | string;

function hasForgeConfig() {
  return Boolean(ENV.forgeApiUrl && ENV.forgeApiKey);
}

function getSupabaseStorageClient(accessToken?: string) {
  if (!ENV.supabaseUrl || !ENV.supabaseAnonKey || !accessToken) {
    throw new Error("Storage config missing: set Supabase Storage access for the authenticated request.");
  }

  return createClient(ENV.supabaseUrl, ENV.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

function normalizeKey(relKey: string): string {
  return relKey.replace(/^\/+/, "");
}

function appendHashSuffix(relKey: string): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  if (lastDot === -1) return `${relKey}_${hash}`;
  return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
}

async function supabaseStoragePut(relKey: string, data: StorageData, contentType: string, accessToken: string) {
  const key = appendHashSuffix(normalizeKey(relKey));
  const body = typeof data === "string" ? data : new Uint8Array(data);
  const { error } = await withRetry(
    () => getSupabaseStorageClient(accessToken).storage.from(SUPABASE_BUCKET).upload(key, body, { contentType, upsert: false }),
    { label: "Supabase Storage upload" },
  );
  if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);
  return { key, url: `/manus-storage/${key}` };
}

export async function storagePut(
  relKey: string,
  data: StorageData,
  contentType = "application/octet-stream",
  accessToken?: string,
): Promise<{ key: string; url: string }> {
  if (!hasForgeConfig()) {
    if (!accessToken) throw new Error("Storage config missing: authenticated Supabase Storage access is required.");
    return supabaseStoragePut(relKey, data, contentType, accessToken);
  }

  const target = await storageCreatePutTarget(relKey, accessToken);
  const blob = typeof data === "string" ? new Blob([data], { type: contentType }) : new Blob([data as any]);
  await withRetry(async () => {
    const response = await fetch(target.uploadUrl, { method: "PUT", headers: { "Content-Type": contentType }, body: blob });
    if (!response.ok) throw new Error(`Storage upload to S3 failed (${response.status})`);
    return response;
  }, { label: "Forge storage upload" });
  return { key: target.key, url: target.url };
}

export async function storageCreatePutTarget(relKey: string, accessToken?: string): Promise<{ key: string; url: string; uploadUrl: string }> {
  if (!hasForgeConfig()) {
    if (!accessToken) throw new Error("Storage config missing: authenticated Supabase Storage access is required.");
    const key = appendHashSuffix(normalizeKey(relKey));
    const { data, error } = await withRetry(
      () => getSupabaseStorageClient(accessToken).storage.from(SUPABASE_BUCKET).createSignedUploadUrl(key),
      { label: "Supabase Storage upload signing" },
    );
    if (error || !data?.signedUrl) throw new Error(`Supabase Storage signing failed: ${error?.message || "empty signed URL"}`);
    return { key, url: `/manus-storage/${key}`, uploadUrl: data.signedUrl };
  }

  const forgeUrl = ENV.forgeApiUrl!.replace(/\/+$/, "");
  const key = appendHashSuffix(normalizeKey(relKey));
  const presignUrl = new URL("v1/storage/presign/put", `${forgeUrl}/`);
  presignUrl.searchParams.set("path", key);
  const { url } = await withRetry(async () => {
    const response = await fetch(presignUrl, { headers: { Authorization: `Bearer ${ENV.forgeApiKey}` } });
    if (!response.ok) {
      const msg = await response.text().catch(() => response.statusText);
      throw new Error(`Storage presign failed (${response.status}): ${msg}`);
    }
    return (await response.json()) as { url: string };
  }, { label: "Forge storage presign" });
  if (!url) throw new Error("Forge returned empty presign URL");
  return { key, url: `/manus-storage/${key}`, uploadUrl: url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

// This is called concurrently, per photo, on every render-status poll, inside a 10s
// Vercel function budget shared with the fal.ai calls that follow it -- keep the
// retry budget tight (short timeout, few retries) rather than reusing generous defaults.
const SIGN_RETRY_OPTIONS = { retries: 1, baseDelayMs: 250, maxDelayMs: 1_000, timeoutMs: 3_000 } as const;

export async function storageGetSignedUrl(relKey: string, accessToken?: string): Promise<string> {
  const key = normalizeKey(relKey);
  if (!hasForgeConfig()) {
    const { data, error } = await withRetry(
      () => getSupabaseStorageClient(accessToken).storage.from(SUPABASE_BUCKET).createSignedUrl(key, SIGNED_URL_TTL_SECONDS),
      { ...SIGN_RETRY_OPTIONS, label: "Supabase Storage signing" },
    );
    if (error || !data?.signedUrl) throw new Error(`Supabase Storage signing failed: ${error?.message || "empty signed URL"}`);
    return data.signedUrl;
  }

  const forgeUrl = new URL("v1/storage/presign/get", ENV.forgeApiUrl!.replace(/\/+$/, "") + "/");
  forgeUrl.searchParams.set("path", key);
  const { url } = await withRetry(async () => {
    const response = await fetch(forgeUrl, { headers: { Authorization: `Bearer ${ENV.forgeApiKey}` } });
    if (!response.ok) {
      const msg = await response.text().catch(() => response.statusText);
      throw new Error(`Storage signed URL failed (${response.status}): ${msg}`);
    }
    return (await response.json()) as { url: string };
  }, { ...SIGN_RETRY_OPTIONS, label: "Forge storage signed URL" });
  if (!url) throw new Error("Empty signed URL from backend");
  return url;
}

export async function signStoredUrl(value: string | null | undefined, accessToken?: string | null): Promise<string | null> {
  if (!value) return null;
  if (!value.startsWith("/manus-storage/")) return value;
  const key = value.slice("/manus-storage/".length);
  return storageGetSignedUrl(key, accessToken ?? undefined);
}
