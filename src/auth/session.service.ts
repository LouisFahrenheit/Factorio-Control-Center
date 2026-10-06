import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { SessionUser } from '../common/types';
import { UsersService } from './users.service';

interface SessionRecord extends SessionUser {
  exp: number;
  selectedInstanceId?: string;
}

@Injectable()
export class SessionService implements OnModuleInit, OnModuleDestroy {
  private readonly sessions = new Map<string, SessionRecord>();
  private cleanupTimer?: NodeJS.Timeout;

  constructor(private readonly users: UsersService) {}

  onModuleInit() {
    const HOUR_MS = 60 * 60 * 1000;
    this.cleanupTimer = setInterval(() => this.purgeExpired(), HOUR_MS);
  }

  onModuleDestroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
  }

  private purgeExpired(): void {
    const now = Date.now() / 1000;
    for (const [token, s] of this.sessions) {
      if (s.exp < now) this.sessions.delete(token);
    }
  }

  createToken(user: SessionUser): string {
    const token = randomBytes(36).toString('base64url');
    this.sessions.set(token, {
      ...user,
      exp: Date.now() / 1000 + 7 * 24 * 3600,
    });
    return token;
  }

  async createSession(username: string, ip?: string): Promise<string> {
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
    return this.createToken(user);
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
