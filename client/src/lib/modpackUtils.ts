import { isNetworkFetchError, resolveApiErrorMessage } from './networkErrors';
import { FCC_FILE_FORMAT, FCC_FILE_VERSION, unwrapModpackPayload } from './fccFileFormat';

export const MODPACK_BUILTIN_NAMES = new Set(['base', 'elevated-rails', 'quality', 'recycler', 'space-age']);
export const MODPACK_NAME_MAX_LEN = 80;
const MODPACK_NAME_RE = /^[\p{L}\p{N}_\- ]+$/u;

export interface ModpackModEntry {
  name?: string;
  version?: string;
  enabled?: boolean;
}

export interface ModpackFccData {
  name?: string;
  description?: string;
  factorio_version?: string;
  mod_settings_b64?: string;
  mods?: ModpackModEntry[];
}

export function localizeModpackError(
  err: string,
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  const k = String(err || '').trim();
  if (!k) return '';
  if (isNetworkFetchError(k)) return resolveApiErrorMessage(k, t);
  if (k === 'server_running') return t('server_running_mutate_blocked');
  if (k === 'not_found') return t('modpack_select_first');
  if (k === 'invalid_name') return t('modpack_name_invalid');
  if (k === 'exists') return t('modpack_name_exists');
  if (k === 'empty') return t('modpack_no_mods_in_folder');
  if (k === 'no_mods_dir') return t('mod_list_upload_no_mods_dir');
  if (k === 'invalid_format') return t('modpack_import_invalid_format', '');
  if (k === 'wrong_kind') return t('fcc_import_wrong_kind');
  if (k === 'no_credentials' || k === 'missing_credentials') return t('mod_list_portal_credentials_missing');
  if (k === 'mod_job_already_running') return t('mod_job_already_running');
  if (k === 'modpack_requires_space_age') return t('modpack_activate_requires_space_age');
  if (k === 'already_active') return t('modpack_activate_already_active');
  if (k === 'reset_failed') return t('modpack_reset_failed');
  return resolveApiErrorMessage(k, t);
}

export function modpackPayloadImpliesSpaceAge(payload: ModpackFccData | null | undefined): boolean {
  const mods = payload?.mods;
  if (!Array.isArray(mods)) return false;
  for (const m of mods) {
    if (!m || typeof m !== 'object') continue;
    if (String(m.name || '').trim().toLowerCase() === 'space-age' && m.enabled !== false) return true;
  }
  return false;
}

export function modpackValidateFccFile(payload: unknown): { ok: boolean; reason?: string; tooNew?: string } {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, reason: 'root must be object' };
  }
  const envelope = payload as Record<string, unknown>;
  if (envelope.format !== FCC_FILE_FORMAT) return { ok: false, reason: 'wrong magic' };
  const fv = envelope.format_version;
  if (typeof fv !== 'number' || !Number.isInteger(fv) || fv < 1) {
    return { ok: false, reason: 'wrong format_version' };
  }
  if (fv > FCC_FILE_VERSION) return { ok: true, tooNew: String(fv) };
  if (envelope.kind !== 'modpack') return { ok: false, reason: 'wrong kind' };
  const data = unwrapModpackPayload(payload);
  if (!data || !Array.isArray(data.mods)) return { ok: false, reason: 'no mods array' };
  return { ok: true };
}

export function modpackDataFromFile(parsed: unknown): ModpackFccData | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const envelope = parsed as Record<string, unknown>;
  const data = unwrapModpackPayload(parsed);
  if (!data) return null;
  return {
    name: String(envelope.name || data.name || '').trim() || undefined,
    description: String(envelope.description || data.description || '').trim() || undefined,
    factorio_version: String(data.factorio_version || '').trim() || undefined,
    mod_settings_b64: typeof data.mod_settings_b64 === 'string' ? data.mod_settings_b64 : undefined,
    mods: Array.isArray(data.mods) ? (data.mods as ModpackModEntry[]) : [],
  };
}

export function modpackIsValidName(name: string): boolean {
  const n = String(name || '').trim();
  if (!n || n.length > MODPACK_NAME_MAX_LEN) return false;
  if (!MODPACK_NAME_RE.test(n)) return false;
  return /[\p{L}\p{N}_]/u.test(n);
}

function modpackSanitizeBase(base: string): string {
  let b = String(base || '').replace(/[^\w\- ]/gu, '_');
  b = b.replace(/^[ _\-]+|[ _\-]+$/g, '') || 'imported';
  return b.slice(0, MODPACK_NAME_MAX_LEN);
}

export function modpackSuggestName(base: string, existingLower: Set<string>): string {
  const b = modpackSanitizeBase(base);
  if (!existingLower.has(b.toLowerCase())) return b;
  for (let i = 2; i < 100; i++) {
    const cand = b + ' (' + i + ')';
    if (!existingLower.has(cand.toLowerCase()) && cand.length <= MODPACK_NAME_MAX_LEN) return cand;
  }
  return b;
}

export function modpackUserModsFromPayload(payload: ModpackFccData): ModpackModEntry[] {
  const modsList = Array.isArray(payload.mods) ? payload.mods : [];
  return modsList.filter(
    (m) =>
      m &&
      typeof m === 'object' &&
      typeof m.name === 'string' &&
      m.name.trim() &&
      !MODPACK_BUILTIN_NAMES.has(m.name.trim().toLowerCase()),
  );
}

export async function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(fr.error || new Error('read_failed'));
    fr.onload = () => resolve(String(fr.result || ''));
    fr.readAsText(file);
  });
}
