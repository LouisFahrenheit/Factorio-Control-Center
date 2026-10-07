import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { SessionUser } from '../common/types';
import { UsersService } from './users.service';

interface SessionRecord extends SessionUser {
  exp: number;
  selectedInstanceId?: string;
  passwordHash?: string;
}

@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private readonly sessions = new Map<string, SessionRecord>();
  private cleanupTimer?: NodeJS.Timeout;

  constructor(
    @Inject(forwardRef(() => UsersService))
    private readonly users: UsersService,
  ) {}

  onModuleInit() {
    const HOUR_MS = 60 * 60 * 1000;
    this.cleanupTimer = setInterval(() => this.purgeExpired(), HOUR_MS);
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  purgeExpired(): void {
    const now = Date.now() / 1000;
    for (const [token, s] of this.sessions) {
      if (s.exp < now) this.sessions.delete(token);
    }
  }

  createToken(user: SessionUser, passwordHash?: string): string {
    const token = randomBytes(36).toString('base64url');
    this.sessions.set(token, {
      ...user,
      exp: Date.now() / 1000 + 7 * 24 * 3600,
      passwordHash,
    });
    return token;
  }

  async createSession(username: string, _ip?: string): Promise<string> {
    const record = await this.users.findUser(username);
    if (!record || !record.enabled) throw new Error('invalid_credentials');
    const role = this.users.normalizeRole(record.role);
    const tabs = this.users.cleanTabs(record.tabs, role);
    let instance_ids = Array.isArray(record.instanceIds)
      ? [...record.instanceIds]
      : [];
    if (role === 'administrator') instance_ids = ['*'];

    const user: SessionUser = {
      username: record.username,
      role,
      tabs,
      instance_ids,
      enabled: true,
      twoFactorEnabled: !!record.twoFactorEnabled,
    };
    return this.createToken(user, record.passwordHash);
  }

  async resolve(token: string): Promise<SessionUser | null> {
    const s = this.sessions.get(token);
    if (!s) return null;
    if (s.exp < Date.now() / 1000) {
      this.sessions.delete(token);
      return null;
    }

    const record = await this.users.findUser(s.username);
    if (!record || record.enabled === false) {
      this.sessions.delete(token);
      return null;
    }

    // Invalidate session if user's password was changed
    if (
      s.passwordHash &&
      record.passwordHash &&
      s.passwordHash !== record.passwordHash
    ) {
      this.sessions.delete(token);
      return null;
    }

    const role = this.users.normalizeRole(record.role);
    const tabs = this.users.cleanTabs(record.tabs, role);
    let instance_ids = Array.isArray(record.instanceIds)
      ? [...record.instanceIds]
      : [];
    if (role === 'administrator') instance_ids = ['*'];

    s.role = role;
    s.tabs = tabs;
    s.instance_ids = instance_ids;
    s.enabled = true;
    s.twoFactorEnabled = !!record.twoFactorEnabled;

    return {
      username: record.username,
      role,
      tabs,
      instance_ids,
      enabled: true,
      twoFactorEnabled: !!record.twoFactorEnabled,
    };
  }

  logout(token: string): void {
    this.sessions.delete(token);
  }

  /**
   * Revoke all active sessions for a user (e.g. on password change, deletion, disable).
   * Optionally keeps a specific session active (e.g. current actor changing their own password).
   */
  revokeAllForUser(username: string, exceptToken?: string): number {
    const needle = (username || '').trim().toLowerCase();
    if (!needle) return 0;
    let count = 0;
    for (const [token, s] of this.sessions) {
      if (s.username.trim().toLowerCase() === needle) {
        if (exceptToken && token === exceptToken) continue;
        this.sessions.delete(token);
        count++;
      }
    }
    return count;
  }

  /**
   * Update the stored passwordHash for a specific session token
   * so it doesn't get invalidated when the user changes their own password.
   */
  updateSessionPasswordHash(token: string, newPasswordHash: string): boolean {
    const s = this.sessions.get(token);
    if (!s) return false;
    s.passwordHash = newPasswordHash;
    return true;
  }

  getActiveSessionsCount(username?: string): number {
    if (!username) return this.sessions.size;
    const needle = username.trim().toLowerCase();
    let count = 0;
    for (const s of this.sessions.values()) {
      if (s.username.trim().toLowerCase() === needle) count++;
    }
    return count;
  }

  getSelectedInstanceId(token: string): string {
    const s = this.sessions.get(token);
    if (!s || s.exp < Date.now() / 1000) return '';
    return String(s.selectedInstanceId || '').trim();
  }

  setSelectedInstanceId(token: string, instanceId: string): boolean {
    const s = this.sessions.get(token);
    if (!s || s.exp < Date.now() / 1000) return false;
    s.selectedInstanceId = String(instanceId || '').trim();
    return true;
  }
}
