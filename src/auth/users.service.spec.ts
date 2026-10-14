import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { SessionService } from './session.service';
import { User } from './user.entity';
import {
  ALL_TABS,
  ENGINEER_TABS,
  MODERATOR_TABS,
} from '../constants/fcc.constants';

describe('UsersService', () => {
  let service: UsersService;
  let mockUserRepo: Partial<Record<keyof Repository<User>, jest.Mock>>;
  let mockSessionService: Partial<Record<keyof SessionService, jest.Mock>>;

  const createFakeUser = (overrides: Partial<User> = {}): User => ({
    id: 'user-uuid-1',
    username: 'admin',
    passwordHash: 'hash123',
    role: 'administrator',
    tabs: [...ALL_TABS],
    instanceIds: ['*'],
    enabled: true,
    twoFactorEnabled: false,
    twoFactorSecret: null,
    twoFactorRecoveryCodes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    mockUserRepo = {
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(
        (data: Partial<User>) =>
          ({
            id: 'uuid-' + Math.random().toString(36).slice(2),
            ...data,
          }) as User,
      ),
      save: jest.fn().mockImplementation((user: User) => Promise.resolve(user)),
      remove: jest
        .fn()
        .mockImplementation((user: User) => Promise.resolve(user)),
    };

    mockSessionService = {
      revokeAllForUser: jest.fn(),
      updateSessionPasswordHash: jest.fn(),
    };

    service = new UsersService(
      mockUserRepo as unknown as Repository<User>,
      mockSessionService as unknown as SessionService,
    );
  });

  describe('role and tab normalization', () => {
    it('normalizes roles correctly', () => {
      expect(service.normalizeRole('administrator')).toBe('administrator');
      expect(service.normalizeRole('server_engineer')).toBe('server_engineer');
      expect(service.normalizeRole('other_unknown')).toBe('moderator');
    });

    it('returns all tabs for administrator', () => {
      expect(service.cleanTabs(['instances'], 'administrator')).toEqual([
        ...ALL_TABS,
      ]);
    });

    it('filters and deduplicates valid tabs for non-admin roles', () => {
      const input = ['control', 'control', 'invalid_tab', 'mods'];
      expect(service.cleanTabs(input, 'server_engineer')).toEqual([
        'control',
        'mods',
      ]);
    });

    it('returns default tabs for each role', () => {
      expect(service.defaultTabsForRole('administrator')).toEqual([
        ...ALL_TABS,
      ]);
      expect(service.defaultTabsForRole('server_engineer')).toEqual([
        ...ENGINEER_TABS,
      ]);
      expect(service.defaultTabsForRole('moderator')).toEqual([
        ...MODERATOR_TABS,
      ]);
    });
  });

  describe('publicView', () => {
    it('formats a public view of a user without sensitive fields', () => {
      const user = createFakeUser({
        passwordHash: 'secret-hash',
        twoFactorSecret: 'secret-2fa',
      });
      const view = service.publicView(user);

      expect(view.username).toBe('admin');
      expect(view.role).toBe('administrator');
      expect(view.enabled).toBe(true);
      expect(view.instance_ids).toContain('*');
      expect(view.twoFactorEnabled).toBe(false);
      expect(
        (view as unknown as Record<string, unknown>).passwordHash,
      ).toBeUndefined();
      expect(
        (view as unknown as Record<string, unknown>).twoFactorSecret,
      ).toBeUndefined();
    });
  });

  describe('createUser', () => {
    it('rejects if actor is not an enabled administrator', async () => {
      const mod = createFakeUser({
        id: 'mod-1',
        username: 'mod',
        role: 'moderator',
        enabled: true,
      });
      mockUserRepo.find?.mockResolvedValue([mod]);

      const res = await service.createUser(
        { username: 'newuser', password: 'password123' },
        'mod',
      );
      expect(res.ok).toBe(false);
      expect(res.error).toBe('admin_required');
    });

    it('creates a user when called by an admin', async () => {
      const admin = createFakeUser({ id: 'admin-1', username: 'admin' });
      mockUserRepo.find?.mockResolvedValue([admin]);

      const res = await service.createUser(
        {
          username: 'engineer1',
          password: 'securepassword123',
          role: 'server_engineer',
        },
        'admin',
      );

      expect(res.ok).toBe(true);
      expect(mockUserRepo.save).toHaveBeenCalled();
    });

    it('rejects duplicate username or short password', async () => {
      const admin = createFakeUser({ id: 'admin-1', username: 'admin' });
      mockUserRepo.find?.mockResolvedValue([admin]);

      const resDup = await service.createUser(
        { username: 'admin', password: 'securepassword123' },
        'admin',
      );
      expect(resDup.ok).toBe(false);
      expect(resDup.error).toBe('user_exists');

      const resShort = await service.createUser(
        { username: 'user2', password: '123' },
        'admin',
      );
      expect(resShort.ok).toBe(false);
      expect(resShort.error).toBe('invalid_password');
    });
  });

  describe('last admin protection in updateUser and deleteUser', () => {
    it('prevents demoting or disabling the only administrator', async () => {
      const admin = createFakeUser({ id: 'admin-1', username: 'admin' });
      mockUserRepo.find?.mockResolvedValue([admin]);

      const demoteRes = await service.updateUser(
        'admin',
        { role: 'moderator' },
        'admin',
      );
      expect(demoteRes.ok).toBe(false);
      expect(demoteRes.error).toBe('last_admin');

      const disableRes = await service.updateUser(
        'admin',
        { enabled: false },
        'admin',
      );
      expect(disableRes.ok).toBe(false);
      expect(disableRes.error).toBe('last_admin');
    });

    it('prevents deleting the only administrator', async () => {
      const admin = createFakeUser({ id: 'admin-1', username: 'admin' });
      mockUserRepo.find?.mockResolvedValue([admin]);

      const delRes = await service.deleteUser('admin', 'admin');
      expect(delRes.ok).toBe(false);
      expect(delRes.error).toBe('last_admin');
    });

    it('allows deleting an admin if another enabled admin exists', async () => {
      const admin1 = createFakeUser({ id: 'admin-1', username: 'admin1' });
      const admin2 = createFakeUser({ id: 'admin-2', username: 'admin2' });
      mockUserRepo.find?.mockResolvedValue([admin1, admin2]);

      const delRes = await service.deleteUser('admin2', 'admin1');
      expect(delRes.ok).toBe(true);
      expect(mockUserRepo.remove).toHaveBeenCalledWith(admin2);
      expect(mockSessionService.revokeAllForUser).toHaveBeenCalledWith(
        'admin2',
      );
    });
  });

  describe('twoFactor management', () => {
    it('enables and disables 2FA, revoking sessions on disable', async () => {
      const admin = createFakeUser({ id: 'admin-1', username: 'admin' });
      mockUserRepo.find?.mockResolvedValue([admin]);

      await service.setTwoFactor('admin', true, 'secret123', ['code1']);
      expect(admin.twoFactorEnabled).toBe(true);
      expect(admin.twoFactorSecret).toBe('secret123');

      await service.setTwoFactor('admin', false);
      expect(admin.twoFactorEnabled).toBe(false);
      expect(mockSessionService.revokeAllForUser).toHaveBeenCalledWith('admin');
    });

    it('removes recovery code when used', async () => {
      const admin = createFakeUser({
        id: 'admin-1',
        username: 'admin',
        twoFactorRecoveryCodes: ['code1', 'code2'],
      });
      mockUserRepo.find?.mockResolvedValue([admin]);

      const removed = await service.removeRecoveryCode('admin', 'code1');
      expect(removed).toBe(true);
      expect(admin.twoFactorRecoveryCodes).toEqual(['code2']);
    });
  });
});
