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
}

export interface InstancesState {
  version: number;
  items: InstanceItem[];
  selectedId: string;
}

export interface WebUserRecord {
  username: string;
  password_hash: string;
  role: 'administrator' | 'server_engineer' | 'moderator';
  tabs: string[];
  instance_ids?: string[];
  enabled: boolean;
}

export interface SessionUser {
  username: string;
  role: 'administrator' | 'server_engineer' | 'moderator';
  tabs: string[];
  instance_ids: string[];
  enabled: boolean;
}

export interface PublicUserView {
  username: string;
  role: string;
  tabs: string[];
  instance_ids: string[];
  enabled: boolean;
}
