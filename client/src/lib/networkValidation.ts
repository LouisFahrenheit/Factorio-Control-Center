export type GameBindIpError = 'invalid_ip' | null;
export type GamePortError = 'invalid_port' | null;

export function normalizeGameBindIp(raw: string): string {
  return String(raw ?? '').trim();
}

/** Value persisted when the field is empty. */
export function resolveGameBindIp(raw: string): string {
  const ip = normalizeGameBindIp(raw);
  return ip || '0.0.0.0';
}

export function validateGameBindIp(raw: string): GameBindIpError {
  const ip = normalizeGameBindIp(raw);
  if (!ip) return null;
  if (ip === '0.0.0.0' || ip === '::') return null;
  if (isValidIPv4(ip)) return null;
  if (isValidIPv6(ip)) return null;
  return 'invalid_ip';
}

export function validateGamePort(raw: string): GamePortError {
  const s = String(raw ?? '').trim();
  if (!s) return 'invalid_port';
  if (!/^\d+$/.test(s)) return 'invalid_port';
  const n = parseInt(s, 10);
  if (!Number.isInteger(n) || n < 1 || n > 65535) return 'invalid_port';
  return null;
}

export function isNetworkConfigValid(ip: string, port: string): boolean {
  return validateGameBindIp(ip) === null && validateGamePort(port) === null;
}

function isValidIPv4(ip: string): boolean {
  const parts = ip.split('.');
  if (parts.length !== 4) return false;
  return parts.every((oct) => {
    if (!/^\d{1,3}$/.test(oct)) return false;
    const n = Number(oct);
    return n >= 0 && n <= 255;
  });
}

function isValidIPv6(ip: string): boolean {
  if (!ip.includes(':')) return false;
  try {
    const url = new URL(`http://[${ip}]/`);
    return url.hostname === ip || url.hostname.includes(':');
  } catch {
    return false;
  }
}
