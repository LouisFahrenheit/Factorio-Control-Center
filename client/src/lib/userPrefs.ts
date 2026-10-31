const TOAST_SEC_MIN = 1;
const TOAST_SEC_MAX = 20;
const TOAST_STORAGE_KEY = 'fcc_user_toast_duration_sec';
const SERVER_LIST_MOD_BADGES_KEY = 'fcc_user_show_server_list_mod_badges';
const SERVER_LIST_SA_BADGE_KEY = 'fcc_user_show_server_list_sa_badge';
const SERVER_LIST_VIEW_MODE_KEY = 'fcc_user_server_list_view_mode';

export type ServerListViewMode = 'list' | 'cards';

export const USER_PREFS_CHANGED_EVENT = 'fcc-user-prefs-changed';

function dispatchUserPrefsChanged(): void {
  window.dispatchEvent(new CustomEvent(USER_PREFS_CHANGED_EVENT));
}

let defaultToastSec = 5;

function clampToastSec(value: unknown, fallback: number): number {
  const n = parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(TOAST_SEC_MIN, Math.min(TOAST_SEC_MAX, n));
}

export function setDefaultToastDurationSec(sec: number): void {
  defaultToastSec = clampToastSec(sec, 5);
}

export function getToastDurationSec(): number {
  try {
    const raw = localStorage.getItem(TOAST_STORAGE_KEY);
    if (raw != null && raw !== '') return clampToastSec(raw, defaultToastSec);
  } catch {
    /* ignore */
  }
  return defaultToastSec;
}

export function getToastAutoCloseMs(): number {
  return getToastDurationSec() * 1000;
}

export function setUserToastDurationSec(raw: string): void {
  try {
    localStorage.setItem(
      TOAST_STORAGE_KEY,
      String(clampToastSec(raw, defaultToastSec)),
    );
  } catch {
    /* ignore */
  }
}

export function readUserToastDurationSec(): string {
  try {
    const raw = localStorage.getItem(TOAST_STORAGE_KEY);
    if (raw != null && raw !== '')
      return String(clampToastSec(raw, defaultToastSec));
  } catch {
    /* ignore */
  }
  return String(defaultToastSec);
}

export function readUserShowServerListModBadges(): boolean {
  try {
    return localStorage.getItem(SERVER_LIST_MOD_BADGES_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setUserShowServerListModBadges(show: boolean): void {
  try {
    localStorage.setItem(SERVER_LIST_MOD_BADGES_KEY, show ? '1' : '0');
    dispatchUserPrefsChanged();
  } catch {
    /* ignore */
  }
}

export function readUserShowServerListSpaceAgeBadge(): boolean {
  try {
    return localStorage.getItem(SERVER_LIST_SA_BADGE_KEY) !== '0';
  } catch {
    return true;
  }
}

export function setUserShowServerListSpaceAgeBadge(show: boolean): void {
  try {
    localStorage.setItem(SERVER_LIST_SA_BADGE_KEY, show ? '1' : '0');
    dispatchUserPrefsChanged();
  } catch {
    /* ignore */
  }
}

export function readUserServerListViewMode(): ServerListViewMode {
  try {
    if (typeof localStorage === 'undefined') return 'list';
    const raw = localStorage.getItem(SERVER_LIST_VIEW_MODE_KEY);
    if (raw === 'cards' || raw === 'list') return raw;
  } catch {
    /* ignore */
  }
  return 'list';
}

export function setUserServerListViewMode(mode: ServerListViewMode): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(SERVER_LIST_VIEW_MODE_KEY, mode);
    dispatchUserPrefsChanged();
  } catch {
    /* ignore */
  }
}

const USERS_VIEW_MODE_KEY = 'fcc_user_access_view_mode';
export type UserAccessViewMode = 'cards' | 'table';

export function readUserAccessViewMode(): UserAccessViewMode {
  try {
    if (typeof localStorage === 'undefined') return 'cards';
    const raw = localStorage.getItem(USERS_VIEW_MODE_KEY);
    if (raw === 'cards' || raw === 'table') return raw;
  } catch {
    /* ignore */
  }
  return 'cards';
}

export function setUserAccessViewMode(mode: UserAccessViewMode): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(USERS_VIEW_MODE_KEY, mode);
    dispatchUserPrefsChanged();
  } catch {
    /* ignore */
  }
}

const MAINTENANCE_VIEW_MODE_KEY = 'fcc_user_maintenance_view_mode';
export type MaintenanceViewMode = 'cards' | 'table';

export function readUserMaintenanceViewMode(): MaintenanceViewMode {
  try {
    if (typeof localStorage === 'undefined') return 'cards';
    const raw = localStorage.getItem(MAINTENANCE_VIEW_MODE_KEY);
    if (raw === 'cards' || raw === 'table') return raw;
  } catch {
    /* ignore */
  }
  return 'cards';
}

export function setUserMaintenanceViewMode(mode: MaintenanceViewMode): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(MAINTENANCE_VIEW_MODE_KEY, mode);
    dispatchUserPrefsChanged();
  } catch {
    /* ignore */
  }
}
