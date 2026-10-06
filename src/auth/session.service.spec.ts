import { SessionService } from './session.service';
import { UsersService } from './users.service';
import { SessionUser } from '../common/types';

describe('SessionService', () => {
  let sessionService: SessionService;
  let mockUsersService: Partial<UsersService>;
  let mockUserRecord: any;

  beforeEach(() => {
    mockUserRecord = {
      username: 'testadmin',
      role: 'administrator',
      tabs: ['control', 'servers'],
      instanceIds: ['*'],
      enabled: true,
      twoFactorEnabled: false,
      passwordHash: 'pbkdf2_sha256$oldSalt$oldHash',
    };

    mockUsersService = {
      findUser: jest.fn().mockImplementation(async (uname: string) => {
        if (uname.toLowerCase() === mockUserRecord.username.toLowerCase()) {
          return mockUserRecord;
        }
        return undefined;
      }),
      normalizeRole: jest.fn().mockImplementation((r) => r),
      cleanTabs: jest.fn().mockImplementation((t) => t || []),
    };

    sessionService = new SessionService(mockUsersService as UsersService);
  });

  afterEach(() => {
    sessionService.onModuleDestroy();
  });

  describe('createSession & resolve', () => {
    it('creates and resolves an active session', async () => {
      const token = await sessionService.createSession('testadmin');
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const user = await sessionService.resolve(token);
      expect(user).toBeDefined();
      expect(user?.username).toBe('testadmin');
      expect(user?.role).toBe('administrator');
    });

    it('returns null for unknown token', async () => {
      const user = await sessionService.resolve('non_existent_token');
      expect(user).toBeNull();
    });

    it('returns null and removes token if user is disabled in database', async () => {
      const token = await sessionService.createSession('testadmin');

      // Disable user in database
      mockUserRecord.enabled = false;

      const user = await sessionService.resolve(token);
      expect(user).toBeNull();

      // Session should now be removed from memory
      expect(sessionService.getActiveSessionsCount('testadmin')).toBe(0);
    });

    it('invalidates session if passwordHash in database changed', async () => {
      const token = await sessionService.createSession('testadmin');

      // Password changed in database
      mockUserRecord.passwordHash = 'pbkdf2_sha256$newSalt$newHash';

      const user = await sessionService.resolve(token);
      expect(user).toBeNull();
      expect(sessionService.getActiveSessionsCount('testadmin')).toBe(0);
    });
  });

  describe('revokeAllForUser', () => {
    it('revokes all sessions for a specific user', async () => {
      const token1 = await sessionService.createSession('testadmin');
      const token2 = await sessionService.createSession('testadmin');

      expect(sessionService.getActiveSessionsCount('testadmin')).toBe(2);

      const revokedCount = sessionService.revokeAllForUser('testadmin');
      expect(revokedCount).toBe(2);
      expect(sessionService.getActiveSessionsCount('testadmin')).toBe(0);

      expect(await sessionService.resolve(token1)).toBeNull();
      expect(await sessionService.resolve(token2)).toBeNull();
    });

    it('preserves other users sessions when revoking', async () => {
      const tokenAdmin = await sessionService.createSession('testadmin');

      // Create another session directly with createToken
      const otherUser: SessionUser = {
        username: 'otheruser',
        role: 'moderator',
        tabs: ['players'],
        instance_ids: [],
        enabled: true,
      };
      const tokenOther = sessionService.createToken(otherUser);

      sessionService.revokeAllForUser('testadmin');

      expect(sessionService.getActiveSessionsCount('testadmin')).toBe(0);
      expect(sessionService.getActiveSessionsCount('otheruser')).toBe(1);
    });

    it('allows keeping a specific session token active via exceptToken', async () => {
      const token1 = await sessionService.createSession('testadmin');
      const token2 = await sessionService.createSession('testadmin');
      const token3 = await sessionService.createSession('testadmin');

      // Keep token2 active, revoke 1 and 3
      const revoked = sessionService.revokeAllForUser('testadmin', token2);
      expect(revoked).toBe(2);
      expect(sessionService.getActiveSessionsCount('testadmin')).toBe(1);

      expect(await sessionService.resolve(token1)).toBeNull();
      expect(await sessionService.resolve(token2)).not.toBeNull();
      expect(await sessionService.resolve(token3)).toBeNull();
    });
  });

  describe('updateSessionPasswordHash', () => {
    it('updates stored hash for active token when user changes own password', async () => {
      const token = await sessionService.createSession('testadmin');

      const newHash = 'pbkdf2_sha256$newSalt$newHash';
      mockUserRecord.passwordHash = newHash;

      // Update session record so it matches new database hash
      sessionService.updateSessionPasswordHash(token, newHash);

      const user = await sessionService.resolve(token);
      expect(user).not.toBeNull();
      expect(user?.username).toBe('testadmin');
    });
  });

  describe('purgeExpired & logout', () => {
    it('removes session on explicit logout', async () => {
      const token = await sessionService.createSession('testadmin');
      sessionService.logout(token);
      expect(await sessionService.resolve(token)).toBeNull();
    });

    it('purges expired sessions', () => {
      const expiredUser: SessionUser = {
        username: 'testadmin',
        role: 'administrator',
        tabs: [],
        instance_ids: [],
        enabled: true,
      };
      const token = sessionService.createToken(expiredUser);

      // Mutate exp to past
      (sessionService as any).sessions.get(token).exp = Date.now() / 1000 - 100;

      sessionService.purgeExpired();
      expect(sessionService.getActiveSessionsCount()).toBe(0);
    });
  });

  describe('instance selection', () => {
    it('gets and sets selected instance ID', async () => {
      const token = await sessionService.createSession('testadmin');
      expect(sessionService.getSelectedInstanceId(token)).toBe('');

      sessionService.setSelectedInstanceId(token, 'instance-42');
      expect(sessionService.getSelectedInstanceId(token)).toBe('instance-42');
    });
  });
});
