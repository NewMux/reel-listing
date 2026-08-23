// Storage helpers for the deployed reel-listing app.
// Prefer the built-in Forge storage when it is available; otherwise use the
// private Supabase Storage bucket configured for the Vercel deployment.

import { createClient } from "@supabase/supabase-js";
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
  const { error } = await getSupabaseStorageClient(accessToken).storage.from(SUPABASE_BUCKET).upload(key, body, {
    contentType,
    upsert: false,
  });
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
  const uploadResp = await fetch(target.uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": contentType },
    body: blob,
  });
  if (!uploadResp.ok) throw new Error(`Storage upload to S3 failed (${uploadResp.status})`);
  return { key: target.key, url: target.url };
}

export async function storageCreatePutTarget(relKey: string, accessToken?: string): Promise<{ key: string; url: string; uploadUrl: string }> {
  if (!hasForgeConfig()) {
    if (!accessToken) throw new Error("Storage config missing: authenticated Supabase Storage access is required.");
    const key = appendHashSuffix(normalizeKey(relKey));
    const { data, error } = await getSupabaseStorageClient(accessToken).storage.from(SUPABASE_BUCKET).createSignedUploadUrl(key);
    if (error || !data?.signedUrl) throw new Error(`Supabase Storage signing failed: ${error?.message || "empty signed URL"}`);
    return { key, url: `/manus-storage/${key}`, uploadUrl: data.signedUrl };
  }

  const forgeUrl = ENV.forgeApiUrl!.replace(/\/+$/, "");
  const key = appendHashSuffix(normalizeKey(relKey));
  const presignUrl = new URL("v1/storage/presign/put", `${forgeUrl}/`);
  presignUrl.searchParams.set("path", key);
  const presignResp = await fetch(presignUrl, { headers: { Authorization: `Bearer ${ENV.forgeApiKey}` } });
  if (!presignResp.ok) {
    const msg = await presignResp.text().catch(() => presignResp.statusText);
    throw new Error(`Storage presign failed (${presignResp.status}): ${msg}`);
  }
  const { url } = (await presignResp.json()) as { url: string };
  if (!url) throw new Error("Forge returned empty presign URL");
  return { key, url: `/manus-storage/${key}`, uploadUrl: url };
}

export async function storageGet(relKey: string): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  return { key, url: `/manus-storage/${key}` };
}

export async function storageGetSignedUrl(relKey: string, accessToken?: string): Promise<string> {
  const key = normalizeKey(relKey);
  if (!hasForgeConfig()) {
    const { data, error } = await getSupabaseStorageClient(accessToken).storage.from(SUPABASE_BUCKET).createSignedUrl(key, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) throw new Error(`Supabase Storage signing failed: ${error?.message || "empty signed URL"}`);
    return data.signedUrl;
  }

  const forgeUrl = new URL("v1/storage/presign/get", ENV.forgeApiUrl!.replace(/\/+$/, "") + "/");
  forgeUrl.searchParams.set("path", key);
  const resp = await fetch(forgeUrl, { headers: { Authorization: `Bearer ${ENV.forgeApiKey}` } });
  if (!resp.ok) {
    const msg = await resp.text().catch(() => resp.statusText);
    throw new Error(`Storage signed URL failed (${resp.status}): ${msg}`);
  }
  const { url } = (await resp.json()) as { url: string };
  if (!url) throw new Error("Empty signed URL from backend");
  return url;
}

export async function signStoredUrl(value: string | null | undefined, accessToken?: string | null): Promise<string | null> {
  if (!value) return null;
  if (!value.startsWith("/manus-storage/")) return value;
  const key = value.slice("/manus-storage/".length);
  return storageGetSignedUrl(key, accessToken ?? undefined);
}
