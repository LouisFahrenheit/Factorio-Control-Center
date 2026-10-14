import { encryptString, decryptString } from './crypto.util';

describe('crypto.util', () => {
  const secret = 'my-super-secret-key-12345';
  const alternativeSecret = 'another-secret-key-67890';

  describe('encryptString', () => {
    it('returns empty string if plaintext is empty or falsy', () => {
      expect(encryptString('', secret)).toBe('');
    });

    it('returns formatted encrypted string with 4 colon-separated segments', () => {
      const encrypted = encryptString('hello world', secret);
      expect(encrypted.startsWith('enc:')).toBe(true);

      const parts = encrypted.split(':');
      expect(parts.length).toBe(4);
      expect(parts[0]).toBe('enc');
      // IV is 12 bytes = 24 hex characters
      expect(parts[1]).toMatch(/^[0-9a-f]{24}$/);
      // Auth tag is 16 bytes = 32 hex characters
      expect(parts[2]).toMatch(/^[0-9a-f]{32}$/);
      // Ciphertext hex
      expect(parts[3]).toMatch(/^[0-9a-f]+$/);
    });

    it('generates a unique IV for each encryption call with the same input', () => {
      const enc1 = encryptString('same text', secret);
      const enc2 = encryptString('same text', secret);
      expect(enc1).not.toBe(enc2);
    });
  });

  describe('decryptString', () => {
    it('successfully decrypts an encrypted string (roundtrip)', () => {
      const original = 'factorio-super-secret-token-987';
      const encrypted = encryptString(original, secret);
      const decrypted = decryptString(encrypted, secret);
      expect(decrypted).toBe(original);
    });

    it('handles unicode, cyrillic, emojis and special symbols', () => {
      const original =
        'Факторио Сервер 🚀 Привет! 12345 !@#$%^&*()_+~`|}{[]:;?><,./-=';
      const encrypted = encryptString(original, secret);
      expect(decryptString(encrypted, secret)).toBe(original);
    });

    it('handles long strings', () => {
      const original = 'A'.repeat(5000) + '🔥' + 'B'.repeat(5000);
      const encrypted = encryptString(original, secret);
      expect(decryptString(encrypted, secret)).toBe(original);
    });

    it('returns unencrypted string as-is when missing "enc:" prefix (backward compatibility)', () => {
      expect(decryptString('plain-text-token', secret)).toBe(
        'plain-text-token',
      );
      expect(decryptString('some_other_value', secret)).toBe(
        'some_other_value',
      );
    });

    it('returns empty string for empty input', () => {
      expect(decryptString('', secret)).toBe('');
    });

    it('returns empty string when decrypting with incorrect secret', () => {
      const encrypted = encryptString('secret data', secret);
      expect(decryptString(encrypted, alternativeSecret)).toBe('');
    });

    it('returns empty string if ciphertext is corrupted or tampered with', () => {
      const encrypted = encryptString('secret data', secret);
      const parts = encrypted.split(':');
      // Tamper ciphertext
      parts[3] =
        parts[3].slice(0, -2) + (parts[3].slice(-2) === 'aa' ? 'bb' : 'aa');
      expect(decryptString(parts.join(':'), secret)).toBe('');
    });

    it('returns empty string if authTag is corrupted', () => {
      const encrypted = encryptString('secret data', secret);
      const parts = encrypted.split(':');
      // Tamper auth tag
      parts[2] = '00'.repeat(16);
      expect(decryptString(parts.join(':'), secret)).toBe('');
    });

    it('returns empty string if formatted with wrong number of colon-separated parts', () => {
      expect(decryptString('enc:invalid', secret)).toBe('');
      expect(decryptString('enc:part1:part2', secret)).toBe('');
      expect(decryptString('enc:part1:part2:part3:part4', secret)).toBe('');
    });

    it('returns empty string if hex decoding fails or is malformed', () => {
      expect(decryptString('enc:not-hex:not-hex:not-hex', secret)).toBe('');
    });
  });
});
