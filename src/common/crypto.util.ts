import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  scryptSync,
} from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // GCM recommended
const AUTH_TAG_LENGTH = 16;
const SCRYPT_SALT = 'factorio-control-center-salt';

/**
 * Derives a consistent 32-byte key from any secret string using scrypt.
 */
function deriveKey(secret: string): Buffer {
  return scryptSync(secret || 'default_secret', SCRYPT_SALT, 32);
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * @param plaintext The text to encrypt
 * @param secret The APP_SECRET used for encryption
 * @returns A string in the format "enc:iv(hex):authTag(hex):ciphertext(hex)"
 */
export function encryptString(plaintext: string, secret: string): string {
  if (!plaintext) return '';
  const key = deriveKey(secret);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `enc:${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a previously encrypted string.
 * @param encryptedText The encrypted string in the "enc:iv:authTag:ciphertext" format
 * @param secret The APP_SECRET used for decryption
 * @returns The decrypted plaintext, or an empty string if decryption fails or format is invalid.
 */
export function decryptString(encryptedText: string, secret: string): string {
  if (!encryptedText || !encryptedText.startsWith('enc:')) {
    return encryptedText; // Not encrypted, return as is (for backwards compatibility/safety)
  }

  try {
    const parts = encryptedText.split(':');
    if (parts.length !== 4) return '';

    const [, ivHex, authTagHex, ciphertextHex] = parts;
    const key = deriveKey(secret);
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    // Return empty string on decryption failure to avoid crashing the application
    return '';
  }
}
