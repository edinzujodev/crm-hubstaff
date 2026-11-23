import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// Time-based one-time codes (RFC 6238) as used by Google Authenticator, Microsoft Authenticator, 1Password, etc.:
// HMAC-SHA1, 6 digits, a new code every 30 seconds.

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const PERIOD = 30;
const DIGITS = 6;
export const TOTP_ISSUER = "Client tracker";

function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("Bad base32 secret");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A new random secret (160 bits), base32 as the apps expect it. */
export function newTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function codeAt(secret: Buffer, step: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = createHmac("sha1", secret).update(counter).digest();
  const offset = h[h.length - 1]! & 15;
  const n = (h.readUInt32BE(offset) & 0x7fffffff) % 10 ** DIGITS;
  return String(n).padStart(DIGITS, "0");
}

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / PERIOD);

/**
 * Checks a code against the secret, allowing one step of clock drift either way. Returns the step it matched, or
 * null. A step at or before `lastStep` is refused, so the same code can't be used twice.
 */
export function verifyTotp(secret: string, code: string, lastStep: number | null, now = Date.now()): number | null {
  const typed = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(typed)) return null;
  const key = base32Decode(secret);
  const step = currentStep(now);
  for (const s of [step, step - 1, step + 1]) {
    if (lastStep !== null && s <= lastStep) continue;
    if (timingSafeEqual(Buffer.from(codeAt(key, s)), Buffer.from(typed))) return s;
  }
  return null;
}

/** The link the authenticator app reads from the QR code. */
export function totpUri(secret: string, account: string): string {
  const label = encodeURIComponent(`${TOTP_ISSUER}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(TOTP_ISSUER)}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD}`;
}

/** The secret in groups of four, easier to type by hand. */
export const groupSecret = (secret: string) => secret.match(/.{1,4}/g)?.join(" ") ?? secret;

/** For tests: the code an app would show right now. */
export const totpNow = (secret: string, now = Date.now()) => codeAt(base32Decode(secret), currentStep(now));
