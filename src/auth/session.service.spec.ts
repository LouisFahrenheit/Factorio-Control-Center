import { SessionService } from './session.service';
import { UsersService } from './users.service';
import { SessionUser } from '../common/types';
import type { User, UserRole } from './user.entity';

describe('SessionService', () => {
  let sessionService: SessionService;
  let mockUsersService: Partial<UsersService>;
  let mockUserRecord: User;

  beforeEach(() => {
    mockUserRecord = {
      id: 'uuid-1',
      username: 'testadmin',
      role: 'administrator',
      tabs: ['control', 'servers'],
      instanceIds: ['*'],
      enabled: true,
      twoFactorEnabled: false,
      passwordHash: 'pbkdf2_sha256$oldSalt$oldHash',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as User;

    mockUsersService = {
      findUser: jest.fn().mockImplementation((uname: string) => {
        if (uname.toLowerCase() === mockUserRecord.username.toLowerCase()) {
          return Promise.resolve(mockUserRecord);
        }
        return Promise.resolve(undefined);
      }),
      normalizeRole: jest.fn().mockImplementation((r: UserRole) => r),
      cleanTabs: jest.fn().mockImplementation((t: string[]) => t || []),
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

    it('synchronizes updated roles and tabs dynamically upon resolve', async () => {
      const token = await sessionService.createSession('testadmin');
      const initialUser = await sessionService.resolve(token);
      expect(initialUser?.role).toBe('administrator');
      expect(initialUser?.tabs).toEqual(['control', 'servers']);

      // Update role and tabs in mock database
      mockUserRecord.role = 'server_engineer';
      mockUserRecord.tabs = ['control', 'servers', 'saves'];
      mockUsersService.cleanTabs = jest
        .fn()
        .mockReturnValue(['control', 'servers', 'saves']);

      const updatedUser = await sessionService.resolve(token);
      expect(updatedUser?.role).toBe('server_engineer');
      expect(updatedUser?.tabs).toEqual(['control', 'servers', 'saves']);
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
      await sessionService.createSession('testadmin');

      // Create another session directly with createToken
      const otherUser: SessionUser = {
        username: 'otheruser',
        role: 'moderator',
        tabs: ['players'],
        instance_ids: [],
        enabled: true,
      };
      sessionService.createToken(otherUser);

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
      const internalService = sessionService as unknown as {
        sessions: Map<string, { exp: number }>;
      };
      const record = internalService.sessions.get(token);
      if (record) record.exp = Date.now() / 1000 - 100;

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
