import { existsSync, mkdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { panelTimestamp } from '../common/datetime.util';
import { writeJsonFile } from '../common/json-store';

export const BUILTIN_MOD_AUTHOR = 'Wube Software';

export interface InstanceServerData {
  stats: Record<string, unknown>;
  bans: { active_bans: unknown[] };
  mod_install_dates: Record<string, string>;
  mod_install_by: Record<string, string>;
  mod_prefs?: { remove_old_zips?: boolean };
  server_created_at?: string;
  factorio_updated_at?: string;
}

function emptyServerData(): InstanceServerData {
  return {
    stats: {},
    bans: { active_bans: [] },
    mod_install_dates: {},
    mod_install_by: {},
  };
}

export function loadServerData(serverPath: string): InstanceServerData {
  const p = join(serverPath, 'server_data.json');
  if (!existsSync(p)) return emptyServerData();
  try {
    const raw = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, unknown>;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw))
      return emptyServerData();
    const stats = raw.stats;
    const bans = raw.bans;
    const dates = raw.mod_install_dates;
    const by = raw.mod_install_by;
    const prefs = raw.mod_prefs;
    const createdAt = raw.server_created_at;
    const updatedAt = raw.factorio_updated_at;
    return {
      stats:
        stats && typeof stats === 'object' && !Array.isArray(stats)
          ? (stats as Record<string, unknown>)
          : {},
      bans: {
        active_bans:
          bans &&
          typeof bans === 'object' &&
          !Array.isArray(bans) &&
          Array.isArray((bans as { active_bans?: unknown }).active_bans)
            ? (bans as { active_bans: unknown[] }).active_bans || []
            : [],
      },
      mod_install_dates:
        dates && typeof dates === 'object' && !Array.isArray(dates)
          ? (dates as Record<string, string>)
          : {},
      mod_install_by:
        by && typeof by === 'object' && !Array.isArray(by)
          ? (by as Record<string, string>)
          : {},
      mod_prefs:
        prefs && typeof prefs === 'object' && !Array.isArray(prefs)
          ? {
              remove_old_zips: (prefs as { remove_old_zips?: boolean })
                .remove_old_zips,
            }
          : undefined,
      server_created_at:
        typeof createdAt === 'string' ? createdAt.trim() : undefined,
      factorio_updated_at:
        typeof updatedAt === 'string' ? updatedAt.trim() : undefined,
    };
  } catch {
    return emptyServerData();
  }
}

export function saveServerData(
  serverPath: string,
  data: InstanceServerData,
): void {
  const p = join(serverPath, 'server_data.json');
  mkdirSync(serverPath, { recursive: true });
  writeJsonFile(p, data);
}

export function trackModInstallMeta(
  serverPath: string,
  modNames: string[],
  actor = '',
  overwrite = false,
): void {
  const cleanNames = modNames
    .map((n) => String(n || '').trim())
    .filter(Boolean);
  if (!cleanNames.length) return;
  const cleanActor = String(actor || '').trim();
  try {
    const sd = loadServerData(serverPath);
    const today = new Date().toISOString().slice(0, 10);
    let dirty = false;
    for (const mn of cleanNames) {
      if (overwrite || !String(sd.mod_install_dates[mn] || '').trim()) {
        sd.mod_install_dates[mn] = today;
        dirty = true;
      }
      if (
        cleanActor &&
        (overwrite || !String(sd.mod_install_by[mn] || '').trim())
      ) {
        sd.mod_install_by[mn] = cleanActor;
        dirty = true;
      }
    }
    if (dirty) saveServerData(serverPath, sd);
  } catch {
    /* ignore persistence errors */
  }
}

export function ensureServerTimestamps(serverPath: string): void {
  const sd = loadServerData(serverPath);
  if (String(sd.server_created_at || '').trim()) return;
  sd.server_created_at = panelTimestamp();
  saveServerData(serverPath, sd);
}

export function markServerCreated(serverPath: string, at?: string): void {
  const sd = loadServerData(serverPath);
  if (String(sd.server_created_at || '').trim()) return;
  sd.server_created_at = String(at || '').trim() || panelTimestamp();
  saveServerData(serverPath, sd);
}

export function markFactorioUpdated(serverPath: string): void {
  const sd = loadServerData(serverPath);
  if (!String(sd.server_created_at || '').trim()) {
    sd.server_created_at = panelTimestamp();
  }
  sd.factorio_updated_at = panelTimestamp();
  saveServerData(serverPath, sd);
}

/** Install date for built-in DLC mods: last Factorio update, else server creation. */
export function resolveBuiltinModInstallDate(serverPath: string): string {
  ensureServerTimestamps(serverPath);
  const sd = loadServerData(serverPath);
  return String(sd.factorio_updated_at || sd.server_created_at || '').trim();
}
