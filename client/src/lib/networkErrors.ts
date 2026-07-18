import { localizeApiError } from './apiErrorUtils';
import { notifyErr } from './notify';

const FETCH_NOTIFY_COOLDOWN_MS = 15_000;
let lastFetchNotifyAt = 0;

export function isNetworkFetchError(err: unknown): boolean {
  const raw = err instanceof Error ? err.message : String(err);
  const k = String(raw || '').trim();
  return (
    k === 'web_error_failed_fetch' ||
    /^failed to fetch$/i.test(k) ||
    /networkerror|load failed|network request failed/i.test(k)
  );
}

function networkErrorMessageKey(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const k = String(raw || '').trim();
  if (k === 'web_error_failed_fetch' || /^failed to fetch$/i.test(k)) return 'web_error_failed_fetch';
  if (/load failed/i.test(k)) return 'web_error_load_failed';
  if (/networkerror|network request failed/i.test(k)) return 'web_error_network';
  return 'web_error_failed_fetch';
}

export function localizeNetworkFetchError(
  t: (key: string) => string,
  err?: unknown,
): string {
  const key = networkErrorMessageKey(err);
  const loc = t(key);
  if (loc !== key) return loc;
  const fallback = t('web_error_failed_fetch');
  return fallback !== 'web_error_failed_fetch' ? fallback : key;
}

/** Localize API error keys/messages for toasts and inline hints. */
export function resolveApiErrorMessage(err: unknown, t: (key: string) => string): string {
  if (isNetworkFetchError(err)) return localizeNetworkFetchError(t, err);
  const raw = err instanceof Error ? err.message : String(err);
  const key = String(raw || '').trim();
  if (!key) return '';
  return localizeApiError(key, t);
}

export function notifyApiError(
  title: string,
  err: unknown,
  t: (key: string) => string,
  opts?: { cooldownMs?: number },
): void {
  if (notifyNetworkFetchError(title, err, t, opts)) return;
  const msg = resolveApiErrorMessage(err, t);
  if (msg) notifyErr(title, msg);
}

/** Show a debounced toast for connectivity failures; returns true if handled. */
export function notifyNetworkFetchError(
  title: string,
  err: unknown,
  t: (key: string) => string,
  opts?: { cooldownMs?: number },
): boolean {
  if (!isNetworkFetchError(err)) return false;
  const now = Date.now();
  const cooldown = opts?.cooldownMs ?? FETCH_NOTIFY_COOLDOWN_MS;
  if (now - lastFetchNotifyAt < cooldown) return true;
  lastFetchNotifyAt = now;
  notifyErr(title, localizeNetworkFetchError(t, err));
  return true;
}

/** Inline UI should not show raw fetch errors — use toast instead. */
export function inlineApiErrorMessage(
  err: unknown,
  t: (key: string) => string,
  notifyTitle: string,
): string {
  if (isNetworkFetchError(err)) {
    notifyNetworkFetchError(notifyTitle, err, t);
    return '';
  }
  return err instanceof Error ? err.message : String(err);
}
