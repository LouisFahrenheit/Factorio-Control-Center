import { Injectable } from '@nestjs/common';
import {
  ALL_TABS,
  ENGINEER_TABS,
  MODERATOR_TABS,
} from '../constants/fcc.constants';
import { readJsonFile, writeJsonFile } from '../common/json-store';
import { PathsService } from '../config/paths.service';
import { PublicUserView, WebUserRecord } from '../common/types';
import { hashPassword, verifyPassword } from './password.util';

interface UsersFile {
  version: number;
  users: WebUserRecord[];
}

function isEnabledAdmin(u: WebUserRecord): boolean {
  return u.role === 'administrator' && u.enabled !== false;
}

@Injectable()
export class UsersService {
  private defaultsInstalled = false;

  constructor(private readonly paths: PathsService) {}

  load(): UsersFile {
    const fallback: UsersFile = {
      version: 1,
      users: [
        {
          username: 'admin',
          password_hash: hashPassword('admin'),
          role: 'administrator',
          tabs: [...ALL_TABS],
          instance_ids: ['*'],
          enabled: true,
        },
      ],
    };
    if (!require('fs').existsSync(this.paths.usersPath)) {
      writeJsonFile(this.paths.usersPath, fallback);
      this.defaultsInstalled = true;
      return fallback;
    }
    const data = readJsonFile<UsersFile>(this.paths.usersPath, fallback);
    if (!Array.isArray(data.users) || data.users.length === 0) {
      writeJsonFile(this.paths.usersPath, fallback);
      this.defaultsInstalled = true;
      return fallback;
    }
    return data;
  }

  save(data: UsersFile): void {
    writeJsonFile(this.paths.usersPath, data);
  }

  findUser(username: string): WebUserRecord | undefined {
    const needle = username.trim().toLowerCase();
    return this.load().users.find(
      (u) => u.username.trim().toLowerCase() === needle,
    );
  }

  defaultAdminPasswordActive(): boolean {
    const u = this.findUser('admin');
    if (!u?.enabled) return false;
    return verifyPassword('admin', u.password_hash);
  }

  normalizeRole(role: string): WebUserRecord['role'] {
    if (role === 'administrator') return 'administrator';
    if (role === 'server_engineer') return 'server_engineer';
    return 'moderator';
  }

  cleanTabs(raw: unknown, role: WebUserRecord['role']): string[] {
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

  defaultTabsForRole(role: WebUserRecord['role']): string[] {
    if (role === 'administrator') return [...ALL_TABS];
    if (role === 'server_engineer') return [...ENGINEER_TABS];
    return [...MODERATOR_TABS];
  }

  private actorIsEnabledAdmin(actorUsername: string): boolean {
    const actor = this.findUser(actorUsername);
    return !!actor && isEnabledAdmin(actor);
  }

  private wouldRemoveLastEnabledAdmin(
    users: WebUserRecord[],
    target: WebUserRecord,
    nextRole: WebUserRecord['role'],
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

  private hasEnabledAdministrator(users: WebUserRecord[]): boolean {
    return users.some(isEnabledAdmin);
  }

  publicView(u: WebUserRecord): PublicUserView {
    const role = this.normalizeRole(u.role);
    const tabs = this.cleanTabs(u.tabs, role);
    let inst = Array.isArray(u.instance_ids) ? [...u.instance_ids] : [];
    inst = inst.map((x) => String(x).trim()).filter(Boolean);
    if (role === 'administrator' && !inst.includes('*')) inst.unshift('*');
    return {
      username: u.username,
      role,
      tabs,
      instance_ids: inst,
      enabled: u.enabled !== false,
    };
  }

  listPublic(): PublicUserView[] {
    return this.load().users.map((u) => this.publicView(u));
  }

  createUser(
    body: {
      username: string;
      password: string;
      role?: string;
      tabs?: string[];
      instance_ids?: string[];
      enabled?: boolean;
    },
    actorUsername: string,
  ): { ok: boolean; error?: string } {
    if (!this.actorIsEnabledAdmin(actorUsername))
      return { ok: false, error: 'admin_required' };
    const data = this.load();
    const username = String(body.username || '').trim();
    if (!username) return { ok: false, error: 'invalid_username' };
    if (
      data.users.some(
        (u) => u.username.toLowerCase() === username.toLowerCase(),
      )
    )
      return { ok: false, error: 'user_exists' };
    const role = this.normalizeRole(body.role || 'moderator');
    if (role === 'administrator' && !this.actorIsEnabledAdmin(actorUsername))
      return { ok: false, error: 'admin_required' };
    data.users.push({
      username,
      password_hash: hashPassword(body.password || ''),
      role,
      tabs: this.cleanTabs(body.tabs ?? this.defaultTabsForRole(role), role),
      instance_ids: body.instance_ids,
      enabled: body.enabled !== false,
    });
    this.save(data);
    return { ok: true };
  }

  updateUser(
    username: string,
    body: Partial<{
      password: string;
      role: string;
      tabs: string[];
      instance_ids: string[];
      enabled: boolean;
    }>,
    actorUsername: string,
  ): { ok: boolean; error?: string } {
    if (!this.actorIsEnabledAdmin(actorUsername))
      return { ok: false, error: 'admin_required' };

    const data = this.load();
    const u = data.users.find(
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
      !this.actorIsEnabledAdmin(actorUsername)
    ) {
      return { ok: false, error: 'admin_required' };
    }

    if (this.wouldRemoveLastEnabledAdmin(data.users, u, nextRole, nextEnabled))
      return { ok: false, error: 'last_admin' };

    if (body.password) u.password_hash = hashPassword(body.password);
    if (body.role) u.role = nextRole;
    if (body.tabs) u.tabs = this.cleanTabs(body.tabs, u.role);
    if (body.instance_ids) u.instance_ids = body.instance_ids;
    if (body.enabled !== undefined) u.enabled = body.enabled;

    if (!this.hasEnabledAdministrator(data.users))
      return { ok: false, error: 'last_admin' };

    this.save(data);
    return { ok: true };
  }

  deleteUser(
    username: string,
    actorUsername: string,
  ): { ok: boolean; error?: string } {
    if (!this.actorIsEnabledAdmin(actorUsername))
      return { ok: false, error: 'admin_required' };

    const data = this.load();
    const target = data.users.find(
      (u) => u.username.toLowerCase() === username.toLowerCase(),
    );
    if (!target) return { ok: false, error: 'not_found' };
    if (isEnabledAdmin(target) && data.users.filter(isEnabledAdmin).length <= 1)
      return { ok: false, error: 'last_admin' };

    data.users = data.users.filter(
      (u) => u.username.toLowerCase() !== username.toLowerCase(),
    );
    if (!this.hasEnabledAdministrator(data.users))
      return { ok: false, error: 'last_admin' };
    this.save(data);
    return { ok: true };
  }
}
