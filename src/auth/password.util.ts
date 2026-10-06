import { pbkdf2, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const pbkdf2Async = promisify(pbkdf2);

export async function hashPassword(
  password: string,
  saltHex?: string,
): Promise<string> {
  const salt = saltHex ? Buffer.from(saltHex, 'hex') : randomBytes(16);
  const key = await pbkdf2Async(
    password || '',
    salt,
    120_000,
    32,
    'sha256',
  );
  return `pbkdf2_sha256$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  try {
    const [algo, saltHex] = String(encoded || '').split('$');
    if (algo !== 'pbkdf2_sha256') return false;
    const check = await hashPassword(password, saltHex);
    const a = Buffer.from(check);
    const b = Buffer.from(encoded);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
