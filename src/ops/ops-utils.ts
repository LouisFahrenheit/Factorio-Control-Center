import AdmZip from 'adm-zip';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs';
import { randomBytes } from 'crypto';
import { basename, dirname, extname, join, normalize, resolve } from 'path';
import { InstanceItem } from '../common/types';
import { readJsonFile, writeJsonFile } from '../common/json-store';
import { InstancesService } from '../instances/instances.service';
import { PathManager } from './path-manager';

export type OpResult = Record<string, unknown>;

export interface SelectedInstance {
  item: InstanceItem;
  pm: PathManager;
}

export function selectedInstance(
  instances: InstancesService,
): SelectedInstance | OpResult {
  const item = instances.getSelected();
  if (!item) return { ok: false, error: 'instance_not_found' };
  return { item, pm: new PathManager(item.serverPath) };
}

export function isErrorResult(v: SelectedInstance | OpResult): v is OpResult {
  return !('item' in v);
}

/** Multer/busboy read multipart filenames as latin1; UTF-8 Cyrillic arrives as mojibake (e.g. Ð±ÐµÐ·). */
export function decodeUploadFilename(raw: string): string {
  const name = String(raw || '').trim();
  if (!name) return name;
  if (!/[ÃÐÑ]/.test(name)) return name;
  const decoded = Buffer.from(name, 'latin1').toString('utf8');
  if (decoded === name || decoded.includes('\uFFFD')) return name;
  return decoded;
}

/** User-facing save .zip name (Unicode OK; no path separators or reserved chars). */
export function normalizeSaveZipName(raw: string): string | null {
  let n = decodeUploadFilename(String(raw || '').trim());
  if (!n) return null;
  n = basename(n).replace(/\.zip$/i, '');
  if (!n || /^\.+$/.test(n)) return null;
  if (/[<>:"/\\|?*\x00-\x1f]/.test(n)) return null;
  return `${n}.zip`;
}

/** On Windows, factorio --create needs an ASCII path without spaces; rename after success. */
export function factorioCreateStagingZipName(finalZipName: string): string {
  if (process.platform !== 'win32') return finalZipName;
  if (/\s/.test(finalZipName) || /[^\x20-\x7E]/.test(finalZipName)) {
    return `__fcc_create_${randomBytes(8).toString('hex')}.zip`;
  }
  return finalZipName;
}

export function safeZipName(name: string): string | null {
  return normalizeSaveZipName(name);
}

export function safeName(name: string, fallback = ''): string {
  return String(name || fallback)
    .trim()
    .replace(/[<>:"/\\|?*\x00-\x1f]+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120);
}

export function safeJoin(base: string, name: string): string | null {
  const b = normalize(resolve(base));
  const p = normalize(resolve(join(b, name)));
  if (p !== b && !p.startsWith(b + require('path').sep)) return null;
  return p;
}

export type EnsureServerSettingsOptions = {
  defaultPublicOff?: boolean;
  applyGlobalCredentials?: boolean;
  globalUsername?: string;
  globalToken?: string;
};

export function ensureServerSettingsOptionsFromWebPanel(wp: {
  server_settings_default_public_off: boolean;
  server_settings_apply_global_credentials: boolean;
  global_username: string;
  global_token: string;
}): EnsureServerSettingsOptions {
  return {
    defaultPublicOff: wp.server_settings_default_public_off,
    applyGlobalCredentials: wp.server_settings_apply_global_credentials,
    globalUsername: wp.global_username,
    globalToken: wp.global_token,
  };
}

function applyServerSettingsCreateDefaults(
  settingsPath: string,
  opts?: EnsureServerSettingsOptions,
): void {
  if (!opts) return;
  const defaultPublicOff = opts.defaultPublicOff !== false;
  const applyCreds = opts.applyGlobalCredentials !== false;
  if (!defaultPublicOff && !applyCreds) return;
  try {
    const data = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<
      string,
      unknown
    >;
    if (defaultPublicOff) {
      const vis =
        data.visibility &&
        typeof data.visibility === 'object' &&
        !Array.isArray(data.visibility)
          ? { ...(data.visibility as Record<string, unknown>) }
          : {};
      vis.public = false;
      data.visibility = vis;
    }
    if (applyCreds) {
      const user = String(opts.globalUsername || '').trim();
      const token = String(opts.globalToken || '').trim();
      if (user && token) {
        data.username = user;
        data.token = token;
        data.password = '';
      }
    }
    writeFileSync(settingsPath, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  } catch {
    /* keep copied file as-is */
  }
}

/** Create server-settings.json from Factorio example when missing (or when recreate is true). */
export function ensureServerSettingsFile(
  serverPath: string,
  opts?: EnsureServerSettingsOptions,
  recreate = false,
): {
  ok: boolean;
  created: boolean;
  path: string;
} {
  const settingsPath = join(serverPath, 'server-settings.json');
  if (existsSync(settingsPath) && !recreate) {
    return { ok: true, created: false, path: settingsPath };
  }
  const candidates = [
    join(serverPath, 'data', 'server-settings.example.json'),
    join(serverPath, 'server-settings.example.json'),
  ];
  const src = candidates.find((p) => existsSync(p));
  if (!src) return { ok: false, created: false, path: settingsPath };
  try {
    mkdirSync(serverPath, { recursive: true });
    copyFileSync(src, settingsPath);
    applyServerSettingsCreateDefaults(settingsPath, opts);
    return { ok: existsSync(settingsPath), created: true, path: settingsPath };
  } catch {
    return { ok: false, created: false, path: settingsPath };
  }
}

export function readServerSettingsNetworkFlags(serverPath: string): {
  visibility_lan: boolean;
  visibility_public: boolean;
  require_user_verification: boolean;
} {
  const settingsPath = join(serverPath, 'server-settings.json');
  if (!existsSync(settingsPath)) {
    return {
      visibility_lan: false,
      visibility_public: false,
      require_user_verification: false,
    };
  }
  try {
    const data = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<
      string,
      unknown
    >;
    const vis = (data.visibility as Record<string, unknown>) || {};
    return {
      visibility_lan: !!vis.lan,
      visibility_public: !!vis.public,
      require_user_verification: !!data.require_user_verification,
    };
  } catch {
    return {
      visibility_lan: false,
      visibility_public: false,
      require_user_verification: false,
    };
  }
}

export function readJsonPath(path: string): OpResult {
  if (!existsSync(path)) return { ok: false, error: 'not_found', data: null };
  try {
    return { ok: true, path, data: JSON.parse(readFileSync(path, 'utf-8')) };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
      data: null,
    };
  }
}

export function writeJsonPath(path: string, data: unknown): OpResult {
  if (data === undefined || data === null)
    return { ok: false, error: 'no_data' };
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    return { ok: true, path };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function copyFileUnique(
  src: string,
  dstDir: string,
  wantedName: string,
): string {
  mkdirSync(dstDir, { recursive: true });
  const parsedExt = extname(wantedName) || extname(src);
  const stem =
    basename(wantedName, parsedExt) || basename(src, extname(src)) || 'file';
  let name = `${safeName(stem, 'file')}${parsedExt}`;
  let dst = join(dstDir, name);
  let i = 1;
  while (existsSync(dst)) {
    name = `${safeName(stem, 'file')}_${i}${parsedExt}`;
    dst = join(dstDir, name);
    i += 1;
  }
  copyFileSync(src, dst);
  return name;
}

export function gameVersion(serverPath: string): string {
  const candidates = [
    join(serverPath, 'data', 'base', 'info.json'),
    join(serverPath, 'data', 'core', 'info.json'),
  ];
  for (const p of candidates) {
    try {
      if (!existsSync(p)) continue;
      const raw = JSON.parse(readFileSync(p, 'utf-8')) as { version?: unknown };
      const v = String(raw.version || '').trim();
      if (v) return v;
    } catch {
      /* ignore */
    }
  }
  return '';
}

/** True when Space Age data is present on disk (independent of mod-list). */
export function hasSpaceAgeInstalled(serverPath: string): boolean {
  const saInfo = join(serverPath, 'data', 'space-age', 'info.json');
  if (existsSync(saInfo)) {
    try {
      const raw = JSON.parse(readFileSync(saInfo, 'utf-8')) as {
        version?: unknown;
      };
      if (String(raw.version || '').trim()) return true;
    } catch {
      /* ignore */
    }
  }
  return (
    existsSync(join(serverPath, 'data', 'space-age')) ||
    existsSync(join(serverPath, 'data', 'space_age'))
  );
}

function modListSpaceAgeEnabled(serverPath: string): boolean {
  const modListPath = join(serverPath, 'mods', 'mod-list.json');
  if (!existsSync(modListPath)) return true;
  try {
    const data = JSON.parse(readFileSync(modListPath, 'utf-8')) as {
      mods?: { name?: string; enabled?: boolean }[];
    };
    let sawSpaceAge = false;
    for (const row of data.mods || []) {
      const n = String(row?.name || '')
        .trim()
        .toLowerCase()
        .replace(/_/g, '-');
      if (n !== 'space-age') continue;
      sawSpaceAge = true;
      return row?.enabled !== false;
    }
    return !sawSpaceAge;
  } catch {
    return true;
  }
}

/** True when Space Age is installed and the space-age mod is enabled in mod-list. */
export function hasSpaceAge(serverPath: string): boolean {
  return hasSpaceAgeInstalled(serverPath) && modListSpaceAgeEnabled(serverPath);
}

export function readModList(pm: PathManager): {
  mods: Record<string, unknown>[];
} {
  return readJsonFile<{ mods: Record<string, unknown>[] }>(pm.modList, {
    mods: [],
  });
}

export function writeModList(
  pm: PathManager,
  mods: Record<string, unknown>[],
): void {
  writeJsonFile(pm.modList, { mods });
}

export function ensureModListEntry(
  pm: PathManager,
  name: string,
  enabled = true,
): void {
  const data = readModList(pm);
  if (!data.mods.some((m) => String(m.name || '') === name)) {
    data.mods.push({ name, enabled });
    writeModList(pm, data.mods);
  }
}

export function installedModVersions(modsDir: string, name: string): string[] {
  if (!existsSync(modsDir)) return [];
  const re = new RegExp(
    `^${escapeRegExp(name)}_(\\d+\\.\\d+\\.\\d+)\\.zip$`,
    'i',
  );
  return readdirSync(modsDir)
    .map((f) => re.exec(f)?.[1] || '')
    .filter(Boolean)
    .sort(compareVersions);
}

export function compareVersions(a: string, b: string): number {
  const av = String(a)
    .split('.')
    .map((x) => parseInt(x, 10) || 0);
  const bv = String(b)
    .split('.')
    .map((x) => parseInt(x, 10) || 0);
  for (let i = 0; i < Math.max(av.length, bv.length); i++) {
    const d = (av[i] || 0) - (bv[i] || 0);
    if (d) return d;
  }
  return 0;
}

export function latestVersion(versions: string[]): string {
  return [...versions].sort(compareVersions).pop() || '';
}

export function readModManifest(
  zipPath: string,
): Record<string, unknown> | null {
  try {
    const zip = new AdmZip(zipPath);
    const info = zip
      .getEntries()
      .find(
        (e) =>
          !e.isDirectory &&
          e.entryName.replace(/\\/g, '/').endsWith('/info.json'),
      );
    if (!info) return null;
    return JSON.parse(zip.readAsText(info, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function modNameFromZip(fileName: string): string {
  return basename(fileName)
    .replace(/_\d+\.\d+\.\d+\.zip$/i, '')
    .replace(/\.zip$/i, '');
}

export const LOG_HISTORY_DEFAULT_TAIL = 25000;
export const LOG_HISTORY_TAIL_BYTES = 6 * 1024 * 1024;
/** Hard cap for loading an entire log file into the web UI (64 MB). */
export const LOG_HISTORY_FULL_MAX_BYTES = 64 * 1024 * 1024;

export function readLogFile(
  path: string,
  options?: {
    tail?: number;
    maxBytes?: number;
    full?: boolean;
    fullMaxBytes?: number;
  },
): {
  lines: string[];
  truncated: boolean;
  lineCapped: boolean;
  fileMissing: boolean;
  fileBytes: number;
  tooLarge: boolean;
} {
  const full = options?.full === true;
  const tailLimit = Math.max(1, options?.tail ?? LOG_HISTORY_DEFAULT_TAIL);
  const tailBytes = options?.maxBytes ?? LOG_HISTORY_TAIL_BYTES;
  const fullMaxBytes = options?.fullMaxBytes ?? LOG_HISTORY_FULL_MAX_BYTES;

  if (!existsSync(path)) {
    return {
      lines: [],
      truncated: false,
      lineCapped: false,
      fileMissing: true,
      fileBytes: 0,
      tooLarge: false,
    };
  }

  const size = statSync(path).size;
  if (full && size > fullMaxBytes) {
    return {
      lines: [],
      truncated: true,
      lineCapped: false,
      fileMissing: false,
      fileBytes: size,
      tooLarge: true,
    };
  }

  const truncated = !full && size > tailBytes;
  const buf = readFileSync(path);
  let text = (truncated ? buf.subarray(size - tailBytes) : buf).toString(
    'utf-8',
  );
  if (truncated) {
    const nl = text.indexOf('\n');
    if (nl >= 0) text = text.slice(nl + 1);
  }

  const allLines = text.split(/\r?\n/).filter((l) => l.trim());
  const lineCapped = !full && allLines.length > tailLimit;
  const lines = full ? allLines : allLines.slice(-tailLimit);

  return {
    lines,
    truncated,
    lineCapped,
    fileMissing: false,
    fileBytes: size,
    tooLarge: false,
  };
}

export function tailFile(
  path: string,
  tail: number,
  maxBytes = LOG_HISTORY_TAIL_BYTES,
): {
  lines: string[];
  truncated: boolean;
  fileMissing: boolean;
  fileBytes: number;
} {
  const res = readLogFile(path, { tail, maxBytes, full: false });
  return {
    lines: res.lines,
    truncated: res.truncated,
    fileMissing: res.fileMissing,
    fileBytes: res.fileBytes,
  };
}

/** Compact UTC timestamp `YYYYMMDDHHmmss` (no trailing dot — safe for Windows paths). */
export function nowStamp(): string {
  return new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14);
}

/** Readable local timestamp for save file names (`YYYY-MM-DD_HH-mm-ss`). */
export function readableSaveStamp(d = new Date()): string {
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
}

export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
