import { isIP } from 'node:net';

export function normalizeGameBindIp(raw: string): string {
  return String(raw ?? '').trim();
}

export function resolveGameBindIp(raw: string): string {
  const ip = normalizeGameBindIp(raw);
  return ip || '0.0.0.0';
}

export function isValidGameBindIp(raw: string): boolean {
  const ip = normalizeGameBindIp(raw);
  if (!ip) return true;
  if (ip === '0.0.0.0' || ip === '::') return true;
  return isIP(ip) !== 0;
}

export function isValidGamePort(raw: string): boolean {
  const s = String(raw ?? '').trim();
  if (!s || !/^\d+$/.test(s)) return false;
  const n = parseInt(s, 10);
  return Number.isInteger(n) && n >= 1 && n <= 65535;
}
