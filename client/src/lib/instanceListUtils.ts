import type { InstanceItem } from '../types/instance';

export type InstanceSortColumn =
  | 'name'
  | 'port'
  | 'rconPort'
  | 'version'
  | 'save'
  | 'mods'
  | 'online'
  | 'uptime'
  | 'status';

const STATUS_SORT_ORDER: Record<string, number> = {
  running: 0,
  starting: 1,
  stopping: 2,
  maintenance: 3,
  maintenance_manual: 4,
  ready: 5,
  missing: 6,
  error: 7,
};

export function instanceSortDefaultAsc(col: InstanceSortColumn): boolean {
  if (col === 'online' || col === 'uptime' || col === 'mods') return false;
  return true;
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true });
}

function compareNumber(a: number, b: number): number {
  return a - b;
}

function statusSortKey(status: string): number {
  return STATUS_SORT_ORDER[status] ?? 99;
}

export function filterInstanceRows(
  rows: InstanceItem[],
  query: string,
  getEffectiveStatus: (item: InstanceItem) => string,
  t: (key: string) => string,
  statusFilter = 'all',
): InstanceItem[] {
  const q = String(query || '').trim().toLowerCase();
  const filter = String(statusFilter || 'all').trim().toLowerCase();

  return rows.filter((it) => {
    const rawStatus = String(getEffectiveStatus(it) || 'ready').toLowerCase();

    if (filter !== 'all') {
      if (filter === 'ready') {
        if (rawStatus !== 'ready' && rawStatus !== 'stopped') return false;
      } else if (filter === 'maintenance') {
        if (rawStatus !== 'maintenance' && rawStatus !== 'maintenance_manual') {
          return false;
        }
      } else if (rawStatus !== filter) {
        return false;
      }
    }

    if (!q) return true;

    const statusText = t('instances_status_' + rawStatus).toLowerCase();
    const haystack = [
      it.name,
      it.port,
      it.rconPort,
      it.gameVersion,
      it.activeSave,
      it.launchSave,
      it.serverPath,
      it.ip,
      rawStatus,
      statusText,
    ]
      .map((x) => String(x || '').toLowerCase())
      .join('\0');
    return haystack.includes(q);
  });
}

export function sortInstanceRows(
  rows: InstanceItem[],
  col: InstanceSortColumn,
  asc: boolean,
  getEffectiveStatus: (item: InstanceItem) => string,
): InstanceItem[] {
  const dir = asc ? 1 : -1;
  const sorted = [...rows];
  sorted.sort((a, b) => {
    let cmp = 0;
    switch (col) {
      case 'name':
        cmp = compareText(String(a.name || ''), String(b.name || ''));
        break;
      case 'port':
        cmp = compareNumber(Number(a.port) || 0, Number(b.port) || 0);
        break;
      case 'rconPort':
        cmp = compareNumber(Number(a.rconPort) || 0, Number(b.rconPort) || 0);
        break;
      case 'version':
        cmp = compareText(String(a.gameVersion || ''), String(b.gameVersion || ''));
        break;
      case 'save': {
        const as = String(a.activeSave || a.launchSave || '');
        const bs = String(b.activeSave || b.launchSave || '');
        cmp = compareText(as, bs);
        break;
      }
      case 'mods':
        cmp = compareNumber(Number(a.modsCount) || 0, Number(b.modsCount) || 0);
        break;
      case 'online':
        cmp = compareNumber(Number(a.onlineCount) || 0, Number(b.onlineCount) || 0);
        break;
      case 'uptime': {
        const au = typeof a.uptimeSeconds === 'number' ? a.uptimeSeconds : -1;
        const bu = typeof b.uptimeSeconds === 'number' ? b.uptimeSeconds : -1;
        cmp = compareNumber(au, bu);
        break;
      }
      case 'status':
        cmp = compareNumber(
          statusSortKey(String(getEffectiveStatus(a) || 'ready')),
          statusSortKey(String(getEffectiveStatus(b) || 'ready')),
        );
        break;
      default:
        cmp = 0;
    }
    if (cmp === 0) cmp = compareText(String(a.name || ''), String(b.name || ''));
    return cmp * dir;
  });
  return sorted;
}
