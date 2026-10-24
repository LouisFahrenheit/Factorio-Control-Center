import { HttpException, ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthController } from './auth.controller';
import { SessionService } from './session.service';
import { UsersService } from './users.service';
import { InstancesService } from '../instances/instances.service';
import { WebPanelEventLogService } from '../logging/web-panel-event-log.service';
import { TwoFactorService } from './two-factor.service';
import { AuthRateLimiterService } from './auth-rate-limiter.service';
import { User } from './user.entity';
import type { SessionUser } from '../common/types';

jest.mock('./password.util', () => ({
  verifyPassword: jest.fn(),
  hashPassword: jest.fn(),
}));

import { verifyPassword } from './password.util';

describe('AuthController', () => {
  let controller: AuthController;
  let mockSessions: Partial<SessionService>;
  let mockUsers: Partial<UsersService>;
  let mockInstances: Partial<InstancesService>;
  let mockEventLog: Partial<WebPanelEventLogService>;
  let mockTwoFactor: Partial<TwoFactorService>;
  let mockRateLimiter: Partial<AuthRateLimiterService>;

  const createMockReq = (ip = '127.0.0.1'): Request =>
    ({
      ip,
      headers: {},
      socket: { remoteAddress: ip },
    }) as unknown as Request;

  const mockAdminSession: SessionUser = {
    username: 'admin',
    role: 'administrator',
    tabs: ['*'],
    instance_ids: ['*'],
    enabled: true,
  };

  const mockUserEntity: User = {
    id: 'user-uuid-1',
    username: 'alice',
    passwordHash: 'pbkdf2_sha256$mock$hash',
    role: 'administrator',
    enabled: true,
    tabs: ['overview'],
    instanceIds: ['inst-1'],
    twoFactorEnabled: false,
    twoFactorSecret: null,
    twoFactorRecoveryCodes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockSessions = {
      createSession: jest.fn().mockResolvedValue('test-session-token'),
      resolve: jest.fn().mockResolvedValue(mockAdminSession),
      logout: jest.fn(),
      revokeAllForUser: jest.fn(),
    };

    mockUsers = {
      hasAnyUser: jest.fn().mockResolvedValue(true),
      createInitialAdmin: jest.fn().mockResolvedValue(mockUserEntity),
      publicView: jest.fn().mockImplementation((u: User) => ({
        username: u.username,
        role: u.role,
        enabled: u.enabled,
        tabs: u.tabs,
        instance_ids: u.instanceIds,
        twoFactorEnabled: u.twoFactorEnabled,
      })),
      findUser: jest.fn().mockResolvedValue(mockUserEntity),
      listPublic: jest.fn().mockResolvedValue([
        {
          username: 'alice',
          role: 'administrator',
          enabled: true,
          tabs: ['overview'],
          instance_ids: ['inst-1'],
          twoFactorEnabled: false,
        },
      ]),
      createUser: jest.fn().mockResolvedValue({ ok: true }),
      updateUser: jest.fn().mockResolvedValue({ ok: true }),
      deleteUser: jest.fn().mockResolvedValue({ ok: true }),
    };

    mockInstances = {
      list: jest.fn().mockReturnValue({
        items: [{ id: 'inst-1', name: 'Server 1' }],
      }),
    };

    mockEventLog = {
      logAuth: jest.fn(),
    };

    mockTwoFactor = {
      createChallenge: jest.fn().mockReturnValue('mock-challenge-token'),
      verifyLogin: jest.fn().mockResolvedValue({
        ok: true,
        username: 'alice',
        isRecoveryCode: false,
      }),
      initiateSetup: jest.fn().mockResolvedValue({
        secret: 'MOCKSECRET',
        qrCodeDataUrl: 'data:image/png;base64,...',
      }),
      confirmSetup: jest
        .fn()
        .mockResolvedValue({ ok: true, recoveryCodes: ['code1', 'code2'] }),
      disable: jest.fn().mockResolvedValue({ ok: true }),
      resetForUser: jest.fn().mockResolvedValue({ ok: true }),
    };

    mockRateLimiter = {
      checkLoginAllowed: jest.fn().mockReturnValue({ allowed: true }),
      recordFailedAttempt: jest
        .fn()
        .mockReturnValue({ locked: false, attemptsRemaining: 4 }),
      recordSuccessfulLogin: jest.fn(),
      check2faAllowed: jest.fn().mockReturnValue({ allowed: true }),
      recordFailed2fa: jest.fn().mockReturnValue({ locked: false }),
      recordSuccessful2fa: jest.fn(),
    };

    (verifyPassword as jest.Mock).mockResolvedValue(true);

    controller = new AuthController(
      mockSessions as SessionService,
      mockUsers as UsersService,
      mockInstances as InstancesService,
      mockEventLog as WebPanelEventLogService,
      mockTwoFactor as TwoFactorService,
      mockRateLimiter as AuthRateLimiterService,
    );
  });

  describe('setupStatus', () => {
    it('should return needsSetup true when no users exist', async () => {
      (mockUsers.hasAnyUser as jest.Mock).mockResolvedValue(false);
      const res = await controller.setupStatus();
      expect(res).toEqual({ ok: true, needsSetup: true });
    });

    it('should return needsSetup false when users exist', async () => {
      (mockUsers.hasAnyUser as jest.Mock).mockResolvedValue(true);
      const res = await controller.setupStatus();
      expect(res).toEqual({ ok: true, needsSetup: false });
    });
  });

  describe('setupAdmin', () => {
    it('should reject short username', async () => {
      const res = await controller.setupAdmin(
        { username: 'a', password: 'password123' },
        '127.0.0.1',
      );
      expect(res).toEqual({ ok: false, error: 'username_too_short' });
    });

    it('should reject short password', async () => {
      const res = await controller.setupAdmin(
        { username: 'admin', password: '123' },
        '127.0.0.1',
      );
      expect(res).toEqual({ ok: false, error: 'invalid_password' });
    });

    it('should create initial admin and session on valid input', async () => {
      const res = await controller.setupAdmin(
        { username: 'superadmin', password: 'password123' },
        '127.0.0.1',
      );
      expect(res.ok).toBe(true);
      expect(res.token).toBe('test-session-token');
      expect(mockUsers.createInitialAdmin).toHaveBeenCalledWith(
        'superadmin',
        'password123',
      );
      expect(mockEventLog.logAuth).toHaveBeenCalledWith(
        'login',
        'alice',
        'administrator',
      );
    });

    it('should handle error when createInitialAdmin fails', async () => {
      (mockUsers.createInitialAdmin as jest.Mock).mockRejectedValue(
        new Error('admin_exists'),
      );
      const res = await controller.setupAdmin(
        { username: 'admin', password: 'password123' },
        '127.0.0.1',
      );
      expect(res).toEqual({ ok: false, error: 'admin_exists' });
    });
  });

  describe('login', () => {
    it('should block login if rate limiter check fails', async () => {
      (mockRateLimiter.checkLoginAllowed as jest.Mock).mockReturnValue({
        allowed: false,
        reason: 'ip_locked',
        retryAfterSec: 300,
        retryAfterMin: 5,
      });

      await expect(
        controller.login(
          { username: 'alice', password: 'password123' },
          '127.0.0.1',
          createMockReq(),
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should return invalid_credentials and record attempt if user not found', async () => {
      (mockUsers.findUser as jest.Mock).mockResolvedValue(undefined);

      const res = await controller.login(
        { username: 'bob', password: 'password123' },
        '127.0.0.1',
        createMockReq(),
      );

      expect(res).toEqual({ ok: false, error: 'invalid_credentials' });
      expect(mockRateLimiter.recordFailedAttempt).toHaveBeenCalledWith(
        '127.0.0.1',
        'bob',
      );
    });

    it('should throw 429 if failed attempt causes rate limiter to lock', async () => {
      (mockUsers.findUser as jest.Mock).mockResolvedValue(undefined);
      (mockRateLimiter.recordFailedAttempt as jest.Mock).mockReturnValue({
        locked: true,
        retryAfterSec: 300,
        retryAfterMin: 5,
      });

      await expect(
        controller.login(
          { username: 'bob', password: 'password123' },
          '127.0.0.1',
          createMockReq(),
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should return invalid_credentials if password does not match', async () => {
      (verifyPassword as jest.Mock).mockResolvedValue(false);

      const res = await controller.login(
        { username: 'alice', password: 'wrongpassword' },
        '127.0.0.1',
        createMockReq(),
      );

      expect(res).toEqual({
        ok: false,
        error: 'invalid_credentials',
        attemptsRemaining: 4,
      });
    });

    it('should require 2FA challenge if twoFactorEnabled is true', async () => {
      (mockUsers.findUser as jest.Mock).mockResolvedValue({
        ...mockUserEntity,
        twoFactorEnabled: true,
      });

      const res = await controller.login(
        { username: 'alice', password: 'password123' },
        '127.0.0.1',
        createMockReq(),
      );

      expect(res).toEqual({
        ok: true,
        requires2fa: true,
        challengeToken: 'mock-challenge-token',
      });
      expect(mockTwoFactor.createChallenge).toHaveBeenCalledWith('alice');
    });

    it('should succeed and return token when credentials are valid', async () => {
      const res = await controller.login(
        { username: 'alice', password: 'password123' },
        '127.0.0.1',
        createMockReq(),
      );

      expect(res.ok).toBe(true);
      expect(res.token).toBe('test-session-token');
      expect(mockRateLimiter.recordSuccessfulLogin).toHaveBeenCalledWith(
        '127.0.0.1',
        'alice',
      );
      expect(mockEventLog.logAuth).toHaveBeenCalledWith(
        'login',
        'alice',
        'administrator',
      );
    });
  });

  describe('verify2fa', () => {
    it('should block if rate limiter prevents 2FA verification', async () => {
      (mockRateLimiter.check2faAllowed as jest.Mock).mockReturnValue({
        allowed: false,
        reason: 'too_many_attempts',
        retryAfterSec: 60,
        retryAfterMin: 1,
      });

      await expect(
        controller.verify2fa(
          { challengeToken: 'token', code: '123456' },
          '127.0.0.1',
          createMockReq(),
        ),
      ).rejects.toThrow(HttpException);
    });

    it('should return error if 2FA code is invalid', async () => {
      (mockTwoFactor.verifyLogin as jest.Mock).mockResolvedValue({
        ok: false,
        error: 'invalid_code',
        username: 'alice',
      });

      const res = await controller.verify2fa(
        { challengeToken: 'token', code: '000000' },
        '127.0.0.1',
        createMockReq(),
      );

      expect(res).toEqual({ ok: false, error: 'invalid_code' });
      expect(mockRateLimiter.recordFailed2fa).toHaveBeenCalled();
    });

    it('should succeed and create session on valid 2FA code', async () => {
      const res = await controller.verify2fa(
        { challengeToken: 'token', code: '123456' },
        '127.0.0.1',
        createMockReq(),
      );

      expect(res.ok).toBe(true);
      expect(res.token).toBe('test-session-token');
      expect(mockRateLimiter.recordSuccessful2fa).toHaveBeenCalled();
      expect(mockEventLog.logAuth).toHaveBeenCalledWith(
        'login',
        'alice',
        'administrator',
      );
    });
  });

  describe('2FA Management (setup, enable, disable)', () => {
    it('should initiate 2FA setup for user', async () => {
      const res = await controller.setup2fa(mockAdminSession);
      expect(res.ok).toBe(true);
      if ('secret' in res) {
        expect(res.secret).toBe('MOCKSECRET');
      } else {
        throw new Error('Expected secret in setup2fa response');
      }
      expect(mockTwoFactor.initiateSetup).toHaveBeenCalledWith('admin');
    });

    it('should reject setup if 2FA is already enabled', async () => {
      (mockUsers.findUser as jest.Mock).mockResolvedValue({
        ...mockUserEntity,
        twoFactorEnabled: true,
      });

      const res = await controller.setup2fa(mockAdminSession);
      expect(res).toEqual({ ok: false, error: 'already_enabled' });
    });

    it('should confirm and enable 2FA', async () => {
      const res = await controller.enable2fa(mockAdminSession, {
        code: '123456',
      });
      expect(res).toEqual({ ok: true, recoveryCodes: ['code1', 'code2'] });
      expect(mockEventLog.logAuth).toHaveBeenCalledWith('2fa_enable', 'admin');
    });

    it('should disable 2FA', async () => {
      const res = await controller.disable2fa(mockAdminSession, {
        password: 'pass',
        code: '123456',
      });
      expect(res).toEqual({ ok: true });
      expect(mockEventLog.logAuth).toHaveBeenCalledWith('2fa_disable', 'admin');
    });
  });

  describe('logout and me', () => {
    it('should handle logout without authorization header', async () => {
      const res = await controller.logout(undefined);
      expect(res).toEqual({ ok: true });
      expect(mockSessions.logout).not.toHaveBeenCalled();
    });

    it('should resolve session, log event, and logout token', async () => {
      const res = await controller.logout('Bearer active-token');
      expect(res).toEqual({ ok: true });
      expect(mockSessions.logout).toHaveBeenCalledWith('active-token');
      expect(mockEventLog.logAuth).toHaveBeenCalledWith('logout', 'admin');
    });

    it('should return me payload with current user', () => {
      const res = controller.me(mockAdminSession);
      expect(res).toEqual({ ok: true, user: mockAdminSession });
    });
  });

  describe('user management (CRUD)', () => {
    it('should list all public users with tabs and instances', async () => {
      const res = await controller.listUsers();
      expect(res.ok).toBe(true);
      expect(res.users.length).toBe(1);
      expect(res.instances).toEqual([{ id: 'inst-1', name: 'Server 1' }]);
    });

    it('should create user', async () => {
      const res = await controller.createUser(mockAdminSession, {
        username: 'bob',
        password: 'password123',
        role: 'moderator',
        enabled: true,
        tabs: ['overview'],
        instance_ids: ['inst-1'],
      });
      expect(res).toEqual({ ok: true });
      expect(mockUsers.createUser).toHaveBeenCalled();
      expect(mockEventLog.logAuth).toHaveBeenCalledWith(
        'user_create',
        'admin',
        'bob',
      );
    });

    it('should throw ForbiddenException if createUser fails', async () => {
      (mockUsers.createUser as jest.Mock).mockResolvedValue({
        ok: false,
        error: 'user_exists',
      });

      await expect(
        controller.createUser(mockAdminSession, {
          username: 'bob',
          password: 'password123',
          role: 'moderator',
          enabled: true,
          tabs: ['overview'],
          instance_ids: ['inst-1'],
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update user and log detailed changes', async () => {
      const res = await controller.updateUser(
        mockAdminSession,
        'alice',
        { role: 'moderator', enabled: false },
        'Bearer token-123',
      );
      expect(res).toEqual({ ok: true });
      expect(mockUsers.updateUser).toHaveBeenCalledWith(
        'alice',
        { role: 'moderator', enabled: false },
        'admin',
        'token-123',
      );
      expect(mockEventLog.logAuth).toHaveBeenCalledWith(
        'user_update',
        'admin',
        expect.stringContaining('role=moderator'),
      );
    });

    it('should reset 2FA for a user and revoke sessions', async () => {
      const res = await controller.reset2fa(mockAdminSession, 'alice');
      expect(res).toEqual({ ok: true });
      expect(mockTwoFactor.resetForUser).toHaveBeenCalledWith('alice');
      expect(mockSessions.revokeAllForUser).toHaveBeenCalledWith('alice');
      expect(mockEventLog.logAuth).toHaveBeenCalledWith(
        'user_reset_2fa',
        'admin',
        'alice',
      );
    });

    it('should delete user', async () => {
      const res = await controller.deleteUser(mockAdminSession, 'bob');
      expect(res).toEqual({ ok: true });
      expect(mockUsers.deleteUser).toHaveBeenCalledWith('bob', 'admin');
      expect(mockEventLog.logAuth).toHaveBeenCalledWith(
        'user_delete',
        'admin',
        'bob',
      );
    });
  });
});
