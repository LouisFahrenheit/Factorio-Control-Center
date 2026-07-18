import type { ServerListModBadgeId } from '@fcc/shared/server-list-mod-badges';

export interface InstanceItem {
  id: string;
  name?: string;
  status?: string;
  port?: string | number;
  rconPort?: string | number;
  gameVersion?: string;
  hasSpaceAge?: boolean;
  modBadges?: ServerListModBadgeId[];
  modsCount?: number;
  onlineCount?: number;
  uptimeSeconds?: number;
  visibilityLan?: boolean;
  visibilityPublic?: boolean;
  requireUserVerification?: boolean;
  autostartServer?: boolean;
  blockUpdates?: boolean;
  experimentalUpdates?: boolean;
  maintenanceLock?: boolean;
  maintenanceManualPending?: boolean;
  modJobRunning?: boolean;
  autoEnterPanel?: boolean;
  launchSave?: string;
  serverPath?: string;
  ip?: string;
  rconPassword?: string;
}

export interface InstancesListResponse {
  ok?: boolean;
  items?: InstanceItem[];
  selectedId?: string;
  error?: string;
}

export interface AuthUser {
  username?: string;
  role?: string;
  tabs?: string[];
  instance_ids?: string[];
}
