import {
  hashPassword,
  verifyPassword,
  PBKDF2_ALGORITHM,
} from './password.util';

describe('password.util', () => {
  describe('hashPassword', () => {
    it('hashes a password and returns correct pbkdf2 format', async () => {
      const hash = await hashPassword('mySecretPassword123');
      const parts = hash.split('$');

      expect(parts).toHaveLength(3);
      expect(parts[0]).toBe(PBKDF2_ALGORITHM);
      // 16 bytes = 32 hex characters
      expect(parts[1]).toMatch(/^[0-9a-f]{32}$/);
      // 32 bytes = 64 hex characters
      expect(parts[2]).toMatch(/^[0-9a-f]{64}$/);
    });

    it('generates distinct salts on consecutive calls', async () => {
      const hash1 = await hashPassword('samePassword');
      const hash2 = await hashPassword('samePassword');

      expect(hash1).not.toBe(hash2);
      const salt1 = hash1.split('$')[1];
      const salt2 = hash2.split('$')[1];
      expect(salt1).not.toBe(salt2);
    });

    it('produces deterministic hash when using the same saltHex', async () => {
      const saltHex = '0123456789abcdef0123456789abcdef';
      const hash1 = await hashPassword('deterministicPass', saltHex);
      const hash2 = await hashPassword('deterministicPass', saltHex);

      expect(hash1).toBe(hash2);
    });

    it('throws an error if an invalid saltHex is provided', async () => {
      await expect(
        hashPassword('pass', 'invalid_hex_string_123'),
      ).rejects.toThrow('invalid_salt_hex');

      await expect(
        hashPassword('pass', '1234'), // too short
      ).rejects.toThrow('invalid_salt_hex');

      await expect(
        hashPassword('pass', '0123456789abcdef0123456789abcdef00'), // too long
      ).rejects.toThrow('invalid_salt_hex');
    });
  });

  describe('verifyPassword', () => {
    it('returns true when password matches hash', async () => {
      const password = 'CorrectHorseBatteryStaple!42';
      const hash = await hashPassword(password);

      const isValid = await verifyPassword(password, hash);
      expect(isValid).toBe(true);
    });

    it('returns false when password does not match', async () => {
      const hash = await hashPassword('realPassword');

      const isValid = await verifyPassword('wrongPassword', hash);
      expect(isValid).toBe(false);
    });

    it('fast-fails and returns false on malformed hash strings without throwing', async () => {
      expect(await verifyPassword('pass', '')).toBe(false);
      expect(await verifyPassword('pass', 'pbkdf2_sha256')).toBe(false);
      expect(await verifyPassword('pass', 'pbkdf2_sha256$')).toBe(false);
      expect(
        await verifyPassword(
          'pass',
          'invalidalgo$0123456789abcdef0123456789abcdef$1234',
        ),
      ).toBe(false);
      expect(await verifyPassword('pass', 'pbkdf2_sha256$shortSalt$hash')).toBe(
        false,
      );
      expect(
        await verifyPassword(
          'pass',
          'pbkdf2_sha256$0123456789abcdef0123456789abcdef$shortHash',
        ),
      ).toBe(false);
    });

    it('returns false for non-string arguments safely', async () => {
      expect(
        await verifyPassword(null as unknown as string, 'pbkdf2_sha256$abc'),
      ).toBe(false);
      expect(await verifyPassword('pass', undefined as unknown as string)).toBe(
        false,
      );
      expect(
        await verifyPassword({} as unknown as string, {} as unknown as string),
      ).toBe(false);
    });
  });
});
