/** Trim env/config paths; strip trailing slashes (avoids cmd `set VAR=path\ ` escaping). */
export function trimPath(
  value: string | undefined | null,
  fallback = '',
): string {
  let p = String(value ?? '').trim();
  if (!p) return fallback;
  p = p.replace(/[/\\]+$/, '');
  return p || fallback;
}

export function trimHost(
  value: string | undefined | null,
  fallback = '127.0.0.1',
): string {
  const h = String(value ?? '').trim();
  if (!h) return fallback;
  return h;
}

export function trimPort(
  value: string | number | undefined | null,
  fallback = 8080,
): number {
  const n = parseInt(String(value ?? '').trim(), 10);
  return Number.isFinite(n) && n > 0 && n <= 65535 ? n : fallback;
}

/** Safely convert unknown/nullable value to string, avoiding [object Object]. */
export function safeStr(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'string') return value || fallback;
  if (
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  ) {
    return String(value);
  }
  if (value instanceof Error) {
    return value.message || fallback;
  }
  return fallback;
}

/** Safely convert unknown/nullable value to trimmed string. */
export function safeTrim(value: unknown, fallback = ''): string {
  return safeStr(value, fallback).trim();
}
