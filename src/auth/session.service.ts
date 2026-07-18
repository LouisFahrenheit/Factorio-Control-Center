import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { SessionUser } from '../common/types';
import { UsersService } from './users.service';

interface SessionRecord extends SessionUser {
  exp: number;
  selectedInstanceId?: string;
}

@Injectable()
export class SessionService {
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(private readonly users: UsersService) {}

  createToken(user: SessionUser): string {
    const token = randomBytes(36).toString('base64url');
    this.sessions.set(token, {
      ...user,
      exp: Date.now() / 1000 + 7 * 24 * 3600,
    });
    return token;
  }

  resolve(token: string): SessionUser | null {
    const s = this.sessions.get(token);
    if (!s) return null;
    if (s.exp < Date.now() / 1000) {
      this.sessions.delete(token);
      return null;
    }

    const record = this.users.findUser(s.username);
    if (!record || record.enabled === false) {
      this.sessions.delete(token);
      return null;
    }

    const role = this.users.normalizeRole(record.role);
    const tabs = this.users.cleanTabs(record.tabs, role);
    let instance_ids = Array.isArray(record.instance_ids)
      ? [...record.instance_ids]
      : [];
    if (role === 'administrator') instance_ids = ['*'];

    s.role = role;
    s.tabs = tabs;
    s.instance_ids = instance_ids;
    s.enabled = true;

    return {
      username: record.username,
      role,
      tabs,
      instance_ids,
      enabled: true,
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

  login(
    username: string,
    password: string,
    users: UsersService,
  ): SessionUser | null {
    const u = users.findUser(username);
    if (!u || !u.enabled) return null;
    const { verifyPassword } =
      require('./password.util') as typeof import('./password.util');
    if (!verifyPassword(password, u.password_hash)) return null;
    const role = users.normalizeRole(u.role);
    const tabs = users.cleanTabs(u.tabs, role);
    let instance_ids = Array.isArray(u.instance_ids) ? [...u.instance_ids] : [];
    if (role === 'administrator') instance_ids = ['*'];
    return {
      username: u.username,
      role,
      tabs,
      instance_ids,
      enabled: true,
    };
  }
}
