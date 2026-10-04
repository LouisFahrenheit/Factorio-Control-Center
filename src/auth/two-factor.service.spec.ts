import { TwoFactorService } from './two-factor.service';
import { UsersService } from './users.service';
import * as OTPAuth from 'otpauth';

describe('TwoFactorService', () => {
  let service: TwoFactorService;
  let mockUsersService: Partial<UsersService>;
  let mockUser: any;

  beforeEach(() => {
    mockUser = {
      username: 'admin',
      role: 'administrator',
      enabled: true,
      twoFactorEnabled: false,
      twoFactorSecret: null,
      twoFactorRecoveryCodes: null,
      passwordHash: 'dummy',
    };

    mockUsersService = {
      findUser: jest.fn().mockImplementation(async (username: string) => {
        if (username.toLowerCase() === 'admin') return mockUser;
        return undefined;
      }),
      setTwoFactor: jest
        .fn()
        .mockImplementation(async (username, enabled, secret, codes) => {
          if (username.toLowerCase() === 'admin') {
            mockUser.twoFactorEnabled = enabled;
            mockUser.twoFactorSecret = secret;
            mockUser.twoFactorRecoveryCodes = codes;
            return true;
          }
          return false;
        }),
      removeRecoveryCode: jest
        .fn()
        .mockImplementation(async (username, hashed) => {
          if (
            username.toLowerCase() === 'admin' &&
            mockUser.twoFactorRecoveryCodes
          ) {
            mockUser.twoFactorRecoveryCodes =
              mockUser.twoFactorRecoveryCodes.filter(
                (c: string) => c !== hashed,
              );
            return true;
          }
          return false;
        }),
    };

    service = new TwoFactorService(mockUsersService as UsersService);
  });

  describe('setup & confirm', () => {
    it('should initiate setup and return secret and qrDataUrl', async () => {
      const res = await service.initiateSetup('admin');
      expect(res.secret).toBeDefined();
      expect(res.qrDataUrl).toMatch(/^data:image\/png;base64,/);
      expect(res.uri).toContain('Factorio%20Control%20Center');
    });

    it('should fail confirmSetup with invalid code', async () => {
      await service.initiateSetup('admin');
      const res = await service.confirmSetup('admin', '000000');
      expect(res.ok).toBe(false);
      expect(res.error).toBe('invalid_code');
    });

    it('should successfully confirm setup with valid code and return recovery codes', async () => {
      const setup = await service.initiateSetup('admin');
      const totp = new OTPAuth.TOTP({
        issuer: 'Factorio Control Center',
        label: 'admin',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(setup.secret),
      });
      const validCode = totp.generate();

      const res = await service.confirmSetup('admin', validCode);
      expect(res.ok).toBe(true);
      expect(res.recoveryCodes).toHaveLength(8);
      expect(mockUsersService.setTwoFactor).toHaveBeenCalledWith(
        'admin',
        true,
        setup.secret,
        expect.any(Array),
      );
    });
  });

  describe('login challenge and verify', () => {
    it('should create challenge and verify TOTP code', async () => {
      const secret = new OTPAuth.Secret({ size: 20 }).base32;
      mockUser.twoFactorEnabled = true;
      mockUser.twoFactorSecret = secret;

      const challengeToken = service.createChallenge('admin');
      expect(challengeToken).toBeDefined();

      const totp = new OTPAuth.TOTP({
        issuer: 'Factorio Control Center',
        label: 'admin',
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      });
      const code = totp.generate();

      const verifyRes = await service.verifyLogin(challengeToken, code);
      expect(verifyRes.ok).toBe(true);
      expect(verifyRes.username).toBe('admin');
      expect(verifyRes.isRecoveryCode).toBe(false);
    });

    it('should verify backup recovery code and consume it', async () => {
      const rawRecoveryCode = 'a1b2-c3d4';
      const hashed = service.hashRecoveryCode(rawRecoveryCode);
      const secret = new OTPAuth.Secret({ size: 20 }).base32;

      mockUser.twoFactorEnabled = true;
      mockUser.twoFactorSecret = secret;
      mockUser.twoFactorRecoveryCodes = [hashed];

      const challengeToken = service.createChallenge('admin');

      const verifyRes = await service.verifyLogin(challengeToken, 'A1B2-C3D4');
      expect(verifyRes.ok).toBe(true);
      expect(verifyRes.isRecoveryCode).toBe(true);
      expect(mockUsersService.removeRecoveryCode).toHaveBeenCalledWith(
        'admin',
        hashed,
      );
    });
  });
});
