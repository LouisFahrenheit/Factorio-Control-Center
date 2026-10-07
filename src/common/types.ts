export type ApiResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string; [key: string]: unknown };

export interface InstanceItem {
  id: string;
  name: string;
  serverPath: string;
  ip: string;
  port: string;
  rconPort: number;
  rconPassword: string;
  autostartServer: boolean;
  autoEnterPanel: boolean;
  launchSave: string;
  maintenanceLock?: boolean;
  blockUpdates?: boolean;
  experimentalUpdates?: boolean;
  isPublic?: boolean;
  publicDescription?: string;
  publicConnectionAddress?: string;
  collectGameMetrics?: boolean;
  notifOverride?: string | null;
}

export interface InstancesState {
  version: number;
  items: InstanceItem[];
  selectedId: string;
}

import type { UserRole } from '../shared/fcc-roles';

export interface WebUserRecord {
  username: string;
  password_hash: string;
  role: UserRole;
  tabs: string[];
  instance_ids?: string[];
  enabled: boolean;
}

export interface SessionUser {
  username: string;
  role: UserRole;
  tabs: string[];
  instance_ids: string[];
  enabled: boolean;
  twoFactorEnabled?: boolean;
}

export interface PublicUserView {
  username: string;
  role: UserRole;
  tabs: string[];
  instance_ids: string[];
  enabled: boolean;
  twoFactorEnabled?: boolean;
}
