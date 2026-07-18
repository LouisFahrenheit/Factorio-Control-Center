const TOAST_SEC_MIN = 1;
const TOAST_SEC_MAX = 20;
const TOAST_STORAGE_KEY = 'fcc_user_toast_duration_sec';
const SERVER_LIST_MOD_BADGES_KEY = 'fcc_user_show_server_list_mod_badges';

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
    localStorage.setItem(TOAST_STORAGE_KEY, String(clampToastSec(raw, defaultToastSec)));
  } catch {
    /* ignore */
  }
}

export function readUserToastDurationSec(): string {
  try {
    const raw = localStorage.getItem(TOAST_STORAGE_KEY);
    if (raw != null && raw !== '') return String(clampToastSec(raw, defaultToastSec));
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
