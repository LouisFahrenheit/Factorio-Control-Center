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
