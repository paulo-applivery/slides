/**
 * AES-GCM at-rest encryption for sensitive integration credentials
 * (Stripe restricted keys, HubSpot OAuth tokens, etc.).
 *
 * Uses Web Crypto (available in both Node ≥ 20 and the Cloudflare Workers
 * runtime) so the same code path runs locally and on the edge.
 *
 * Key sourcing: `INTEGRATIONS_KMS_KEY` env var — a base64-encoded 32-byte
 * random value. Generate with `openssl rand -base64 32`. Rotating keys is
 * out of scope for v1 (the integrations row would need a `key_version`
 * column and a re-encrypt job).
 */

const ALGO = "AES-GCM";
const IV_LEN = 12; // GCM standard
const KEY_LEN_BYTES = 32;

function base64Decode(s: string): Uint8Array {
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(s, "base64"));
  }
  // Edge fallback
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function base64Encode(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") {
    return Buffer.from(bytes).toString("base64");
  }
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

async function getKey(): Promise<CryptoKey> {
  const raw = process.env.INTEGRATIONS_KMS_KEY;
  if (!raw) {
    throw new Error(
      "INTEGRATIONS_KMS_KEY is unset. Generate with `openssl rand -base64 32`.",
    );
  }
  const bytes = base64Decode(raw);
  if (bytes.length !== KEY_LEN_BYTES) {
    throw new Error(
      `INTEGRATIONS_KMS_KEY must decode to ${KEY_LEN_BYTES} bytes; got ${bytes.length}.`,
    );
  }
  return crypto.subtle.importKey(
    "raw",
    bytes as BufferSource,
    ALGO,
    false,
    ["encrypt", "decrypt"],
  );
}

/** Returns a self-contained ciphertext: `<iv(12 bytes)><ciphertext>` base64. */
export async function encryptSecret(plaintext: string): Promise<string> {
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN));
  const data = new TextEncoder().encode(plaintext);
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: ALGO, iv }, key, data),
  );
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return base64Encode(out);
}

/** Inverse of `encryptSecret`. Throws on tampering (GCM auth tag fails). */
export async function decryptSecret(blob: string): Promise<string> {
  const key = await getKey();
  const bytes = base64Decode(blob);
  if (bytes.length <= IV_LEN) throw new Error("Ciphertext too short.");
  const iv = bytes.slice(0, IV_LEN);
  const ct = bytes.slice(IV_LEN);
  const pt = new Uint8Array(
    await crypto.subtle.decrypt({ name: ALGO, iv }, key, ct),
  );
  return new TextDecoder().decode(pt);
}

/**
 * Show only the last 4 characters of a secret for UI confirmation
 * ("•••• abcd"). Never reveals the full value.
 */
export function maskTail(secret: string, visible = 4): string {
  if (secret.length <= visible) return "•".repeat(secret.length);
  return "•••• " + secret.slice(-visible);
}
