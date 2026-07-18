import { networkInterfaces } from 'os';

function listNonLoopbackIPv4(): string[] {
  const out: string[] = [];
  try {
    const nets = networkInterfaces();
    for (const entries of Object.values(nets)) {
      if (!entries) continue;
      for (const ent of entries) {
        const family = String(ent.family);
        if (family !== 'IPv4' && family !== '4') continue;
        if (ent.internal) continue;
        const addr = String(ent.address || '').trim();
        if (addr) out.push(addr);
      }
    }
  } catch {
    /* ignore */
  }
  return [...new Set(out)];
}

/** RFC1918 and link-local (169.254.x.x). */
export function isPrivateIPv4(addr: string): boolean {
  const parts = addr.split('.').map((p) => Number(p));
  if (
    parts.length !== 4 ||
    parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)
  ) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

/** Private IPv4 addresses on this machine (RFC1918, link-local). */
export function listLanIPv4(): string[] {
  return listNonLoopbackIPv4().filter(isPrivateIPv4);
}

/** Public (non-private) IPv4 addresses on this machine — e.g. VPS external IP. */
export function listPublicIPv4(): string[] {
  return listNonLoopbackIPv4().filter((addr) => !isPrivateIPv4(addr));
}
