import { localizeApiError } from './apiErrorUtils';
import { formatPanelDateTime } from './datetimeUtils';

export function saveDisplayLabel(fileName: string): string {
  return String(fileName || '').replace(/\.zip$/i, '');
}

export function filterSaveRows<T extends { name: string }>(rows: T[], query: string): T[] {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return rows;
  return rows.filter((row) => {
    const hay = [row.name || '', saveDisplayLabel(row.name)].join(' ').toLowerCase();
    return hay.includes(q);
  });
}

/** User-facing save .zip name (Unicode OK; no path separators or reserved chars). */
export function normalizeSaveZipName(raw: string): string | null {
  let n = String(raw || '').trim();
  if (!n) return null;
  n = n.replace(/\.zip$/i, '');
  if (!n || /^\.+$/.test(n)) return null;
  if (/[<>:"/\\|?*\x00-\x1f]/.test(n)) return null;
  return `${n}.zip`;
}

export function localizeSaveRenameError(
  err: string,
  t: (key: string, ...args: (string | number)[]) => string,
  targetName = '',
): string {
  const k = String(err || '').trim();
  if (!k) return '';
  if (k === 'exists') return localizeApiError(k, t, [targetName]);
  return localizeApiError(k, t);
}

export function localizeCreateSaveError(
  err: string,
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  const k = String(err || '').trim();
  if (k === 'invalid_name') return t('saves_manager_upload_invalid_name');
  if (k === 'invalid_save_archive') return t('saves_manager_upload_invalid_archive');
  if (k === 'invalid_save_zip') return t('saves_manager_upload_invalid_zip');
  if (k === 'invalid_format' || k === 'wrong_kind') return t('map_gen_preset_import_invalid');
  if (k === 'exists') return t('saves_manager_upload_exists');
  if (k === 'rename_failed') return t('create_save_rename_failed');
  const loc = t(k);
  return loc !== k ? loc : k;
}

export function localizeSaveUploadError(
  err: string,
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  return localizeCreateSaveError(err, t);
}

/** Strip characters invalid in save file names (Unicode letters kept). */
function sanitizeSaveStem(stem: string): string {
  return stem
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120);
}

/** Human-readable auto name stem (no .zip). */
export function formatQuickSaveAutoStem(
  t: (key: string, ...args: (string | number)[]) => string,
  seed: number | string,
): string {
  return sanitizeSaveStem(t('create_save_quick_name_auto', seed));
}

function isSaveNameTaken(stem: string, existingNames: Set<string>): boolean {
  const zip = normalizeSaveZipName(stem);
  return zip ? existingNames.has(zip.toLowerCase()) : false;
}

/** Auto name for quick save when the field is left empty (no .zip suffix). */
export function buildUniqueQuickSaveName(
  existingNames: Set<string>,
  t: (key: string, ...args: (string | number)[]) => string,
  seed: number | string,
): string {
  const base = formatQuickSaveAutoStem(t, seed) || `FCC Quick Save - ${seed}`;
  let stem = base;
  let i = 2;
  while (isSaveNameTaken(stem, existingNames)) {
    stem = `${base} (${i})`;
    i += 1;
  }
  return stem;
}

export function formatLocalTime(ts: number | undefined): string {
  if (!ts) return '-';
  return formatPanelDateTime(new Date(ts * 1000).toISOString(), '-');
}

export function versionEqual(a: string, b: string): boolean {
  const sa = String(a || '').trim();
  const sb = String(b || '').trim();
  if (!sa || !sb) return false;
  if (sa === sb) return true;
  const parse3 = (s: string) => s.split('.').slice(0, 3).map((x) => parseInt(x, 10) || 0);
  const pa = parse3(sa);
  const pb = parse3(sb);
  return pa.length === pb.length && pa.every((x, i) => x === pb[i]);
}

export interface SaveRow {
  name: string;
  mtime?: number;
  is_running_active?: boolean;
}

export interface SaveModCompareRow {
  name: string;
  display_name: string;
  saveVer: string;
  diskVer: string;
  nameClass: string;
}

const BUILTIN_MODS = new Set(['base', 'elevated-rails', 'quality', 'recycler', 'space-age']);
const HIDDEN_SAVE_MOD_NAMES = new Set(['base']);

export function buildSaveModCompareRows(
  insp: {
    header?: { factorio_version?: string; mods?: { name?: string; display_name?: string; version?: string }[] };
  },
  modList: { data?: { mods?: { name?: string; enabled?: boolean }[] } },
  modsAll: { mods?: { name?: string; display_name?: string; local_version?: string }[]; game_version?: string },
): { factorioVersion: string; rows: SaveModCompareRow[] } {
  const factorioVersion = String(insp?.header?.factorio_version || '').trim() || '-';
  const saveMods = new Map<string, string>();
  const saveDisplay = new Map<string, string>();
  (insp?.header?.mods || []).forEach((m) => {
    const n = String(m.name || '').trim();
    if (!n) return;
    saveMods.set(n, String(m.version || '').trim());
    saveDisplay.set(n, String(m.display_name || '').trim() || n);
  });

  const enabled = new Set<string>();
  (modList?.data?.mods || []).forEach((r) => {
    const n = String(r?.name || '').trim();
    if (n && r?.enabled) enabled.add(n);
  });

  const disk = new Map<string, string>();
  const serverDisplay = new Map<string, string>();
  (modsAll?.mods || []).forEach((m) => {
    const n = String(m.name || '').trim();
    if (!n) return;
    disk.set(n, String(m.local_version || '').trim());
    serverDisplay.set(n, String(m.display_name || '').trim() || n);
  });
  const gameVersion = String(modsAll?.game_version || '').trim();

  const names = new Set([...saveMods.keys(), ...enabled]);
  const ordered = [...names]
    .filter((n) => !HIDDEN_SAVE_MOD_NAMES.has(n.toLowerCase()))
    .sort((a, b) => a.localeCompare(b));

  const rows = ordered.map((name) => {
    const saveVer = saveMods.get(name) || '';
    const isBuiltin = BUILTIN_MODS.has(name.toLowerCase());
    const onServer = enabled.has(name) || (isBuiltin && !!gameVersion);
    let diskVer = disk.get(name) || '';
    if (!diskVer && isBuiltin && gameVersion) diskVer = gameVersion;

    let nameClass = '';
    if (saveVer && onServer) {
      nameClass = versionEqual(saveVer, diskVer) ? 'save-mod-name--ok' : 'save-mod-name--ver-diff';
    } else if (!saveVer && onServer) {
      nameClass = 'save-mod-name--not-in-save';
    } else if (saveVer && !onServer) {
      nameClass = 'save-mod-name--not-on-server';
    }

    return {
      name,
      display_name: saveDisplay.get(name) || serverDisplay.get(name) || name,
      saveVer: saveVer || '-',
      diskVer: diskVer || '-',
      nameClass,
    };
  });

  return { factorioVersion, rows };
}
