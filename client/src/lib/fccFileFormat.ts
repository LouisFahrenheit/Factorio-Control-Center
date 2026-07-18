import { getToken } from '../api/client';
import { parseContentDispositionFilename } from './downloadFilename';

export const FCC_FILE_FORMAT = 'fcc-file';
export const FCC_FILE_VERSION = 1;

export type FccFileKind = 'modpack' | 'map_preset' | 'map_presets';

const FCC_FILE_KIND_I18N: Record<FccFileKind, string> = {
  modpack: 'fcc_file_contains_modpack',
  map_preset: 'fcc_file_contains_map_preset',
  map_presets: 'fcc_file_contains_map_presets',
};

const FCC_FILE_KIND_DEFAULTS: Record<FccFileKind, string> = {
  modpack: 'Modpack',
  map_preset: 'Map preset',
  map_presets: 'Map presets',
};

export function fccFileKindContainsLabel(
  kind: FccFileKind,
  t: (key: string) => string,
): string {
  const i18nKey = FCC_FILE_KIND_I18N[kind];
  const loc = t(i18nKey);
  return loc !== i18nKey ? loc : FCC_FILE_KIND_DEFAULTS[kind];
}

export interface MapPresetFileEntry {
  name: string;
  state: Record<string, unknown>;
}

export interface FccFileEnvelope {
  format: typeof FCC_FILE_FORMAT;
  format_version: typeof FCC_FILE_VERSION;
  kind: FccFileKind;
  contains: string;
  name: string;
  description?: string;
  created_at?: string;
  data: unknown;
}

export function buildFccFileEnvelope(
  kind: FccFileKind,
  name: string,
  data: unknown,
  opts?: { description?: string; created_at?: string; contains?: string },
): FccFileEnvelope {
  const trimmedName = String(name || '').trim();
  const description = String(opts?.description || '').trim();
  return {
    format: FCC_FILE_FORMAT,
    format_version: FCC_FILE_VERSION,
    kind,
    contains: String(opts?.contains || FCC_FILE_KIND_DEFAULTS[kind]),
    name: trimmedName,
    ...(description ? { description } : {}),
    ...(opts?.created_at ? { created_at: opts.created_at } : {}),
    data,
  };
}

export function parseJsonObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function unwrapModpackPayload(parsed: unknown): Record<string, unknown> | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.format === FCC_FILE_FORMAT) {
    if (obj.kind !== 'modpack') return null;
    const data = obj.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    return data as Record<string, unknown>;
  }
  return null;
}

export function unwrapMapPresetPayload(
  parsed: unknown,
): { name: string; description?: string; state: Record<string, unknown> } | null {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.format === FCC_FILE_FORMAT) {
    if (obj.kind !== 'map_preset') return null;
    const data = obj.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
    const rec = data as Record<string, unknown>;
    const state = rec.state;
    if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
    const name = String(obj.name || rec.name || '').trim();
    if (!name) return null;
    const description = String(obj.description || rec.description || '').trim();
    return {
      name,
      ...(description ? { description } : {}),
      state: state as Record<string, unknown>,
    };
  }
  return null;
}

function mapPresetEntryFromRow(
  row: unknown,
  fallbackName = '',
): MapPresetFileEntry | null {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
  const rec = row as Record<string, unknown>;
  const state = rec.state;
  if (!state || typeof state !== 'object' || Array.isArray(state)) return null;
  const name = String(rec.name || fallbackName || '').trim();
  if (!name) return null;
  return { name, state: state as Record<string, unknown> };
}

export function unwrapMapPresetsFromFile(parsed: unknown): MapPresetFileEntry[] | null {
  const single = unwrapMapPresetPayload(parsed);
  if (single) return [{ name: single.name, state: single.state }];

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  if (obj.format !== FCC_FILE_FORMAT || obj.kind !== 'map_presets') return null;
  const data = obj.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const presets = (data as Record<string, unknown>).presets;
  if (!Array.isArray(presets)) return null;

  const out: MapPresetFileEntry[] = [];
  for (const row of presets) {
    const entry = mapPresetEntryFromRow(row);
    if (entry) out.push(entry);
  }
  return out.length ? out : null;
}

export function buildMapPresetsFccFile(
  presets: MapPresetFileEntry[],
  collectionName: string,
  t: (key: string) => string,
): FccFileEnvelope {
  return buildFccFileEnvelope('map_presets', collectionName, {
    presets: presets.map((preset) => ({
      name: preset.name,
      state: preset.state,
    })),
  }, { contains: fccFileKindContainsLabel('map_presets', t) });
}

export function downloadFccFile(envelope: FccFileEnvelope, filename?: string): void {
  const safeStub =
    String(envelope.name || 'fcc-file')
      .replace(/[^A-Za-z0-9_.-]+/g, '_')
      .replace(/^\.+|\.+$/g, '') || 'fcc-file';
  const outName = filename || `${safeStub}.fcc`;
  const blob = new Blob([JSON.stringify(envelope, null, 2) + '\n'], {
    type: 'application/json;charset=utf-8',
  });
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = outName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
}

export async function downloadFccExport(url: string, fallbackName: string): Promise<string> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(url, { headers });
  if (!r.ok) {
    const text = await r.text();
    let parsed: { error?: string; detail?: string } | null = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* ignore */
    }
    throw new Error(String(parsed?.error || parsed?.detail || text || r.status));
  }
  let outName = fallbackName;
  const cd = r.headers.get('Content-Disposition') || '';
  outName = parseContentDispositionFilename(cd, fallbackName);
  const blob = await r.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = outName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
  return outName;
}
