import {
  Injectable,
  OnModuleInit,
  Logger,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ALL_TABS,
  ENGINEER_TABS,
  MODERATOR_TABS,
} from '../constants/fcc.constants';
import { PublicUserView, WebUserRecord } from '../common/types';
import { hashPassword, verifyPassword } from './password.util';
import { User, UserRole } from './user.entity';

function isEnabledAdmin(u: User): boolean {
  return u.role === 'administrator' && u.enabled;
}

@Injectable()
export class UsersService implements OnModuleInit {
  private readonly log = new Logger(UsersService.name);
  private isLoaded = false;
  private cache: User[] = [];

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
  ) {}

  async onModuleInit() {
    await this.load();
  }

  async load(): Promise<User[]> {
    const users = await this.userRepo.find();
    if (users.length === 0) {
      const envPass = (
        process.env.FCC_ADMIN_PASSWORD ||
        process.env.FCC_ADMIN_PASS ||
        ''
      ).trim();
      const envUser = (process.env.FCC_ADMIN_USER || 'admin').trim();
      if (envPass) {
        const admin = this.userRepo.create({
          username: envUser,
          passwordHash: hashPassword(envPass),
          role: 'administrator',
          tabs: [...ALL_TABS],
          instanceIds: ['*'],
          enabled: true,
        });
        await this.userRepo.save(admin);
        this.log.log(
          `No users found. Created initial administrator '${envUser}' from environment variables.`,
        );
        this.isLoaded = true;
        this.cache = [admin];
        return this.cache;
      }
      this.log.log(
        `No users found in database. Initial administrator setup wizard is awaiting first run.`,
      );
      this.isLoaded = true;
      this.cache = [];
      return this.cache;
    }
    this.log.debug(`Loaded ${users.length} users from database.`);
    this.isLoaded = true;
    this.cache = users;
    return this.cache;
  }

  async hasAnyUser(): Promise<boolean> {
    if (!this.isLoaded) await this.load();
    return this.cache.length > 0;
  }

  async createInitialAdmin(username: string, password: string): Promise<User> {
    if (!this.isLoaded) await this.load();
    const count = await this.userRepo.count();
    if (count > 0 || this.cache.length > 0) {
      throw new ForbiddenException('setup_already_completed');
    }
    const cleanUser = (username || '').trim();
    if (!cleanUser || cleanUser.length < 2) {
      throw new BadRequestException('username_too_short');
    }
    if (!password || password.length < 4) {
      throw new BadRequestException('password_too_short');
    }
    const admin = this.userRepo.create({
      username: cleanUser,
      passwordHash: hashPassword(password),
      role: 'administrator',
      tabs: [...ALL_TABS],
      instanceIds: ['*'],
      enabled: true,
    });
    await this.userRepo.save(admin);
    this.cache = [admin];
    this.isLoaded = true;
    this.log.log(`Initial administrator '${cleanUser}' created via setup wizard.`);
    return admin;
  }

  async findUser(username: string): Promise<User | undefined> {
    const needle = username.trim().toLowerCase();
    if (!this.isLoaded) await this.load();
    return this.cache.find((u) => u.username.trim().toLowerCase() === needle);
  }

  normalizeRole(role: string): UserRole {
    if (role === 'administrator') return 'administrator';
    if (role === 'server_engineer') return 'server_engineer';
    return 'moderator';
  }

  cleanTabs(raw: unknown, role: UserRole): string[] {
    if (role === 'administrator') return [...ALL_TABS];
    const tabs = Array.isArray(raw) ? raw : [];
    const out: string[] = [];
    for (const t of tabs) {
      const key = String(t || '').trim();
      if (
        ALL_TABS.includes(key as (typeof ALL_TABS)[number]) &&
        !out.includes(key)
      )
        out.push(key);
    }
    return out;
  }

  defaultTabsForRole(role: UserRole): string[] {
    if (role === 'administrator') return [...ALL_TABS];
    if (role === 'server_engineer') return [...ENGINEER_TABS];
    return [...MODERATOR_TABS];
  }

  private async actorIsEnabledAdmin(actorUsername: string): Promise<boolean> {
    const actor = await this.findUser(actorUsername);
    return !!actor && isEnabledAdmin(actor);
  }

  private wouldRemoveLastEnabledAdmin(
    users: User[],
    target: User,
    nextRole: UserRole,
    nextEnabled: boolean,
  ): boolean {
    const wasEnabledAdmin = isEnabledAdmin(target);
    const willBeEnabledAdmin = nextRole === 'administrator' && nextEnabled;
    if (!wasEnabledAdmin || willBeEnabledAdmin) return false;
    const others = users.filter(
      (u) =>
        u.username.toLowerCase() !== target.username.toLowerCase() &&
        isEnabledAdmin(u),
    );
    return others.length === 0;
  }

  private hasEnabledAdministrator(users: User[]): boolean {
    return users.some(isEnabledAdmin);
  }

  publicView(u: User): PublicUserView {
    const role = this.normalizeRole(u.role);
    const tabs = this.cleanTabs(u.tabs, role);
    let inst = Array.isArray(u.instanceIds) ? [...u.instanceIds] : [];
    inst = inst.map((x) => String(x).trim()).filter(Boolean);
    if (role === 'administrator' && !inst.includes('*')) inst.unshift('*');
    return {
      username: u.username,
      role,
      tabs,
      instance_ids: inst,
      enabled: u.enabled !== false,
      twoFactorEnabled: !!u.twoFactorEnabled,
    };
  }

  async setTwoFactor(
    username: string,
    enabled: boolean,
    secret: string | null = null,
    recoveryCodes: string[] | null = null,
  ): Promise<boolean> {
    const user = await this.findUser(username);
    if (!user) return false;
    user.twoFactorEnabled = enabled;
    user.twoFactorSecret = secret;
    user.twoFactorRecoveryCodes = recoveryCodes;
    await this.userRepo.save(user);
    return true;
  }

  async removeRecoveryCode(
    username: string,
    hashedCode: string,
  ): Promise<boolean> {
    const user = await this.findUser(username);
    if (!user || !user.twoFactorRecoveryCodes) return false;
    user.twoFactorRecoveryCodes = user.twoFactorRecoveryCodes.filter(
      (c) => c !== hashedCode,
    );
    await this.userRepo.save(user);
    return true;
  }

  async listPublic(): Promise<PublicUserView[]> {
    const users = await this.load();
    return users.map((u) => this.publicView(u));
  }

  async createUser(
    body: {
      username: string;
      password?: string;
      role?: string;
      tabs?: string[];
      instance_ids?: string[];
      enabled?: boolean;
    },
    actorUsername: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!(await this.actorIsEnabledAdmin(actorUsername)))
      return { ok: false, error: 'admin_required' };
    const users = await this.load();
    const username = String(body.username || '').trim();
    if (!username) return { ok: false, error: 'invalid_username' };
    if (users.some((u) => u.username.toLowerCase() === username.toLowerCase()))
      return { ok: false, error: 'user_exists' };
    const role = this.normalizeRole(body.role || 'moderator');
    if (
      role === 'administrator' &&
      !(await this.actorIsEnabledAdmin(actorUsername))
    )
      return { ok: false, error: 'admin_required' };

    const newUser = this.userRepo.create({
      username,
      passwordHash: hashPassword(body.password || ''),
      role,
      tabs: this.cleanTabs(body.tabs ?? this.defaultTabsForRole(role), role),
      instanceIds: body.instance_ids,
      enabled: body.enabled !== false,
    });

    await this.userRepo.save(newUser);
    return { ok: true };
  }

  async updateUser(
    username: string,
    body: Partial<{
      password: string;
      role: string;
      tabs: string[];
      instance_ids: string[];
      enabled: boolean;
    }>,
    actorUsername: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!(await this.actorIsEnabledAdmin(actorUsername)))
      return { ok: false, error: 'admin_required' };

    const users = await this.load();
    const u = users.find(
      (x) => x.username.toLowerCase() === username.toLowerCase(),
    );
    if (!u) return { ok: false, error: 'not_found' };

    const nextRole =
      body.role !== undefined
        ? this.normalizeRole(body.role)
        : this.normalizeRole(u.role);
    const nextEnabled =
      body.enabled !== undefined ? body.enabled : u.enabled !== false;

    if (
      body.role !== undefined &&
      nextRole === 'administrator' &&
      !(await this.actorIsEnabledAdmin(actorUsername))
    ) {
      return { ok: false, error: 'admin_required' };
    }

    if (this.wouldRemoveLastEnabledAdmin(users, u, nextRole, nextEnabled))
      return { ok: false, error: 'last_admin' };

    if (body.password) u.passwordHash = hashPassword(body.password);
    if (body.role) u.role = nextRole;
    if (body.tabs) u.tabs = this.cleanTabs(body.tabs, u.role);
    if (body.instance_ids) u.instanceIds = body.instance_ids;
    if (body.enabled !== undefined) u.enabled = body.enabled;

    // Check again before save
    const tempUsers = users.map((x) => (x.id === u.id ? u : x));
    if (!this.hasEnabledAdministrator(tempUsers))
      return { ok: false, error: 'last_admin' };

    await this.userRepo.save(u);
    return { ok: true };
  }

  async deleteUser(
    username: string,
    actorUsername: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (!(await this.actorIsEnabledAdmin(actorUsername)))
      return { ok: false, error: 'admin_required' };

    const users = await this.load();
    const target = users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase(),
    );
    if (!target) return { ok: false, error: 'not_found' };
    if (isEnabledAdmin(target) && users.filter(isEnabledAdmin).length <= 1)
      return { ok: false, error: 'last_admin' };

    const tempUsers = users.filter(
      (u) => u.username.toLowerCase() !== username.toLowerCase(),
    );
    if (!this.hasEnabledAdministrator(tempUsers))
      return { ok: false, error: 'last_admin' };

    await this.userRepo.remove(target);
    return { ok: true };
  }
}
