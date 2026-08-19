import { randomBytes } from 'node:crypto';

/** Uppercase letters and digits without look alike characters. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function generateReferralCode(length = 8): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('');
}

export function normalizeReferralCode(code: string): string {
  return code.trim().toUpperCase();
}
