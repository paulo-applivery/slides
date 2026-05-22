/**
 * Server-side helpers for the TV pairing flow.
 *
 * Lives outside the `/api/tv/*` route handlers so the same primitives can be
 * reused by future Server Actions (Phase 4 slice 4 — "rotate session").
 */
import QRCode from "qrcode";

const PAIR_TOKEN_LEN = 24;
const SESSION_TOKEN_LEN = 32;
const PAIR_TTL_MS = 5 * 60_000;
const SESSION_TTL_MS = 30 * 24 * 60 * 60_000;
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // crockford-ish, no I/L/O/0/1

function randomToken(len: number): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export function newPairingToken() {
  return randomToken(PAIR_TOKEN_LEN);
}

export function newSessionToken() {
  return randomToken(SESSION_TOKEN_LEN);
}

/** Six-digit zero-padded PIN — friendlier than full token for manual entry. */
export function newPin(): string {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const n =
    ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0;
  return String(n % 1_000_000).padStart(6, "0");
}

export function pairingExpiresAt(): Date {
  return new Date(Date.now() + PAIR_TTL_MS);
}

export function sessionExpiresAt(): Date {
  return new Date(Date.now() + SESSION_TTL_MS);
}

/** Returns the URL we encode into the QR — that mobile lands on after scanning. */
export function pairingUrl(origin: string, token: string): string {
  const u = new URL(origin);
  u.pathname = "/pair";
  u.searchParams.set("token", token);
  return u.toString();
}

/** PNG data URL — what the TV's <img> tag renders. */
export async function qrDataUrl(value: string): Promise<string> {
  return QRCode.toDataURL(value, {
    margin: 1,
    width: 360,
    color: { dark: "#050B1F", light: "#FFFFFF" },
    errorCorrectionLevel: "M",
  });
}
