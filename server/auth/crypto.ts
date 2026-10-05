// WebCrypto helpers for auth: PBKDF2 password hashing and random/opaque tokens.

// Workers cap PBKDF2 at 100,000 iterations.
export const PBKDF2_ITERATIONS = 100_000;
const HASH_BITS = 256;

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach(byte => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const binary = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

/** A URL-safe random token with `bytes` bytes of entropy. */
export function randomToken(bytes = 32) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** SHA-256 of a token, used as its database id so the stored value can't be replayed. */
export async function hashToken(token: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return toBase64Url(new Uint8Array(digest));
}

async function derive(password: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, HASH_BITS);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, PBKDF2_ITERATIONS);
  return { passwordHash: toBase64Url(hash), salt: toBase64Url(salt), iterations: PBKDF2_ITERATIONS };
}

export async function verifyPassword(password: string, stored: { passwordHash: string; salt: string; iterations: number }) {
  const expected = fromBase64Url(stored.passwordHash);
  const actual = await derive(password, fromBase64Url(stored.salt), stored.iterations);
  if (actual.length !== expected.length) return false;
  // Constant-time comparison.
  let diff = 0;
  for (let i = 0; i < actual.length; i += 1) diff |= actual[i] ^ expected[i];
  return diff === 0;
}
