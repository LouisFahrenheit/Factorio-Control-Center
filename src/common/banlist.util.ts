import { existsSync } from 'fs';
import { writeJsonFile } from './json-store';

export interface BanlistEntry {
  username: string;
  reason: string;
  address: string;
}

/** Factorio may store plain strings; panel uses objects — normalize and dedupe by username. */
export function normalizeBanlistEntries(raw: unknown): BanlistEntry[] {
  const out: BanlistEntry[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(raw)) return out;
  for (const item of raw) {
    let username = '';
    let reason = '';
    let address = '';
    if (typeof item === 'string') {
      username = item.trim();
    } else if (item && typeof item === 'object') {
      const o = item as Record<string, unknown>;
      username = String(o.username || o.player || '').trim();
      reason = String(o.reason || '').trim();
      address = String(o.address || o.ip || '').trim();
    }
    if (!username) continue;
    const key = username.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ username, reason, address });
  }
  return out;
}

/** Factorio expects server-banlist.json; create an empty list when missing. */
export function ensureBanlistFile(path: string): void {
  if (!existsSync(path)) writeJsonFile(path, []);
}
