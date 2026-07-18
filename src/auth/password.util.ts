import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'crypto';

export function hashPassword(password: string, saltHex?: string): string {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : randomBytes(16);
  const key = pbkdf2Sync(password || '', salt, 120_000, 32, 'sha256');
  return `pbkdf2_sha256$${salt.toString('hex')}$${key.toString('hex')}`;
}

export function verifyPassword(password: string, encoded: string): boolean {
  try {
    const [algo, saltHex, digestHex] = String(encoded || '').split('$');
    if (algo !== 'pbkdf2_sha256') return false;
    const check = hashPassword(password, saltHex);
    const a = Buffer.from(check);
    const b = Buffer.from(encoded);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
