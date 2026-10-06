import { pbkdf2, randomBytes, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const pbkdf2Async = promisify(pbkdf2);

export const PBKDF2_ALGORITHM = 'pbkdf2_sha256';
export const PBKDF2_ITERATIONS = 120_000;
export const PBKDF2_KEYLEN = 32;
export const PBKDF2_DIGEST = 'sha256';
export const SALT_BYTE_LENGTH = 16;
export const MIN_PASSWORD_LENGTH = 8;
const HEX_32_REGEX = /^[0-9a-fA-F]{32}$/;
const HEX_64_REGEX = /^[0-9a-fA-F]{64}$/;

export async function hashPassword(
  password: string,
  saltHex?: string,
): Promise<string> {
  const pwd = typeof password === 'string' ? password : String(password || '');
  let salt: Buffer;

  if (saltHex !== undefined) {
    if (typeof saltHex !== 'string' || !HEX_32_REGEX.test(saltHex)) {
      throw new Error('invalid_salt_hex');
    }
    salt = Buffer.from(saltHex, 'hex');
  } else {
    salt = randomBytes(SALT_BYTE_LENGTH);
  }

  const key = await pbkdf2Async(
    pwd,
    salt,
    PBKDF2_ITERATIONS,
    PBKDF2_KEYLEN,
    PBKDF2_DIGEST,
  );
  return `${PBKDF2_ALGORITHM}$${salt.toString('hex')}$${key.toString('hex')}`;
}

export async function verifyPassword(
  password: string,
  encoded: string,
): Promise<boolean> {
  try {
    if (typeof password !== 'string' || typeof encoded !== 'string') {
      return false;
    }

    const parts = encoded.split('$');
    if (parts.length !== 3) {
      return false;
    }

    const [algo, saltHex, hashHex] = parts;
    if (algo !== PBKDF2_ALGORITHM) {
      return false;
    }
    if (!HEX_32_REGEX.test(saltHex) || !HEX_64_REGEX.test(hashHex)) {
      return false;
    }

    const check = await hashPassword(password, saltHex);
    const a = Buffer.from(check, 'utf8');
    const b = Buffer.from(encoded, 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
