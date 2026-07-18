import type { InstanceItem } from '../types/instance';
import { localizeApiError } from './apiErrorUtils';

export function formatUptime(sec: number | null | undefined, placeholder: string): string {
  if (sec == null || sec < 0) return placeholder;
  const total = Math.max(0, Math.floor(sec));
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const hms =
    String(h).padStart(2, '0') +
    ':' +
    String(m).padStart(2, '0') +
    ':' +
    String(s).padStart(2, '0');
  return d + 'd ' + hms;
}

export function formatInstanceGameVersion(
  version: string | undefined,
  placeholder: string,
): string {
  return String(version || '').trim() || placeholder;
}

export function localizeInstanceError(
  err: string,
  t: (key: string, ...args: (string | number)[]) => string,
  args: (string | number)[] = [],
): string {
  return localizeApiError(err, t, args);
}

export function findInstanceByServerPath(
  rows: InstanceItem[],
  serverPath: string,
  hostOs: string,
  excludeId?: string,
): InstanceItem | undefined {
  const key = normalizeServerPathKey(serverPath, hostOs);
  if (!key) return undefined;
  const skipId = String(excludeId || '').trim();
  return rows.find((it) => {
    if (skipId && it.id === skipId) return false;
    return normalizeServerPathKey(String(it.serverPath || ''), hostOs) === key;
  });
}

function normalizeServerPathKey(path: string, hostOs: string): string {
  const raw = String(path || '').trim();
  if (!raw) return '';
  let norm = raw.replace(/\\/g, '/');
  if (norm.length > 1) norm = norm.replace(/\/+$/, '');
  if (hostOs === 'windows') {
    if (/^[a-zA-Z]:/.test(norm)) norm = norm[0].toLowerCase() + norm.slice(1);
    return norm.toLowerCase();
  }
  return norm;
}

export function runningInstanceBlocked(
  item: InstanceItem,
  getStatus: (item: InstanceItem) => string,
): boolean {
  const statusRaw = getStatus(item);
  return statusRaw === 'running' || statusRaw === 'starting' || statusRaw === 'stopping';
}

export function instanceMaintenanceManualMode(
  item: InstanceItem,
  getStatus: (item: InstanceItem) => string,
): boolean {
  const statusRaw = getStatus(item);
  return statusRaw === 'maintenance_manual' || !!(item.maintenanceManualPending && !item.maintenanceLock);
}

export function hasRunningStatusForPortConflict(status: string): boolean {
  return status === 'running' || status === 'starting' || status === 'stopping';
}

export function isGamePortBusyByAnotherInstance(
  rows: InstanceItem[],
  targetInstanceId: string,
  targetPort: string | number | undefined,
  getStatus: (item: InstanceItem) => string,
): boolean {
  const wantPort = String(targetPort || '').trim();
  const iid = String(targetInstanceId || '').trim();
  if (!wantPort) return false;
  return rows.some((it) => {
    const otherId = String(it.id || '').trim();
    if (!otherId || otherId === iid) return false;
    if (String(it.port || '').trim() !== wantPort) return false;
    return hasRunningStatusForPortConflict(getStatus(it));
  });
}

export function syncInstancesDashboard(rows: InstanceItem[]) {
  let onlineTotal = 0;
  let runningCount = 0;
  let stoppedCount = 0;
  rows.forEach((it) => {
    const n = parseInt(String(it.onlineCount ?? ''), 10);
    if (Number.isFinite(n) && n > 0) onlineTotal += n;
    const status = String(it.status || '');
    if (status === 'running') runningCount += 1;
    if (status === 'ready') stoppedCount += 1;
  });
  return { total: rows.length, running: runningCount, stopped: stoppedCount, online: onlineTotal };
}
