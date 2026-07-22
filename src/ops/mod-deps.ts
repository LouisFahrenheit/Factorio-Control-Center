import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { isFactorioSessionStartLine } from '../shared/factorio-log-timestamps';
import {
  compareVersions,
  gameVersion,
  hasSpaceAgeInstalled,
  modNameFromZip,
  readModManifest,
} from './ops-utils';

const BUILTIN_MODS = new Set([
  'base',
  'elevated-rails',
  'quality',
  'recycler',
  'space-age',
  'space_age',
]);

const SA_OFFICIAL_EXPANSION_MODS_BASE = [
  'elevated-rails',
  'quality',
  'space-age',
] as const;
const RECYCLER_BUILTIN_MOD = 'recycler';
const RECYCLER_MIN_GAME_VERSION = '2.1';

const SA_OFFICIAL_EXPANSION_MODS = [
  'elevated-rails',
  'quality',
  RECYCLER_BUILTIN_MOD,
  'space-age',
] as const;

export function serverHasBuiltinRecycler(gameVersion: string): boolean {
  const cur = String(gameVersion || '').trim();
  if (!cur) return false;
  return compareVersions(cur, RECYCLER_MIN_GAME_VERSION) >= 0;
}

export function saOfficialExpansionMods(
  gameVersion: string,
): readonly string[] {
  const mods: string[] = [...SA_OFFICIAL_EXPANSION_MODS_BASE];
  if (serverHasBuiltinRecycler(gameVersion)) {
    mods.splice(2, 0, RECYCLER_BUILTIN_MOD);
  }
  return mods;
}

export function normalizeModListName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
}

const SPACE_AGE_DEP_RE = /^\s*space-age(?:\s|>|<|=|$)/i;
const OPTIONAL_DEP_PREFIX_RE = /^(?:\(\?\)|\(optional\)|\?|~|\+)/i;

const MISSING_DEP_RE =
  /Missing\s+required\s+dependency\s+(.+?)(?:\s*>=|\s*$|\s*\()/i;

export function isConflictDependencyName(raw: string): boolean {
  return String(raw || '')
    .trim()
    .startsWith('!');
}

export function isInstallableMissingDepName(name: string): boolean {
  const s = String(name || '').trim();
  return !!s && !isConflictDependencyName(s) && !isBuiltinModName(s);
}

export function filterInstallableMissingDeps(names: string[]): string[] {
  return names.filter(isInstallableMissingDepName);
}

const DEP_NAME_VER_RE = /^(?<name>.+?)\s*(?<op>>=|<=|!=|>|<|=)\s*(?<ver>.+)$/;

function stripDependencyVersionToken(token: string): string {
  const name = String(token || '').trim();
  for (const sep of ['>=', '<=', '!=', '>', '<', '='] as const) {
    const idx = name.indexOf(sep);
    if (idx >= 0) return name.slice(0, idx).trim();
  }
  return name;
}

export function parseDependencyModName(raw: string): string {
  let s = String(raw || '').trim();
  if (isConflictDependencyName(s)) return '';
  for (let i = 0; i < 16; i++) {
    const prev = s;
    s = s
      .replace(/^\(optional\)\s*/i, '')
      .replace(/^\(\?\)\s*/, '')
      .replace(/^\?\s*/, '')
      .replace(/^~\s*/, '')
      .replace(/^\+\s*/, '');
    if (s === prev) break;
  }
  const m = DEP_NAME_VER_RE.exec(s);
  if (m?.groups?.name) return String(m.groups.name).trim();
  return stripDependencyVersionToken(s);
}

export function parseConflictModName(raw: string): string {
  const s = String(raw || '').trim();
  if (!isConflictDependencyName(s)) return '';
  const rest = s.replace(/^!\s*/, '').trim();
  const m = DEP_NAME_VER_RE.exec(rest);
  if (m?.groups?.name) return String(m.groups.name).trim();
  return stripDependencyVersionToken(rest);
}

export function releaseConflictNames(
  release: Record<string, unknown> | null | undefined,
): string[] {
  if (!release) return [];
  return manifestConflictNames({ dependencies: releaseDependencies(release) });
}

export function manifestConflictNames(
  manifest: Record<string, unknown> | null | undefined,
): string[] {
  if (!manifest) return [];
  const deps = manifest.dependencies;
  if (!Array.isArray(deps)) return [];
  const out: string[] = [];
  for (const dep of deps) {
    const raw = String(dep || '');
    if (!isConflictDependencyName(raw)) continue;
    const name = parseConflictModName(raw);
    if (!name || normalizeModListName(name) === 'base') continue;
    if (!out.some((x) => x.toLowerCase() === name.toLowerCase()))
      out.push(name);
  }
  return out;
}

export interface ModInstallConflictInfo {
  name: string;
  is_builtin: boolean;
  will_disable: boolean;
}

function modListRowEnabled(row: { enabled?: boolean } | undefined): boolean {
  return row?.enabled !== false;
}

export function buildInstallConflictInfo(
  modList: { mods?: { name?: string; enabled?: boolean }[] },
  conflictEntries: Iterable<{ name: string; is_builtin: boolean }>,
  installTreeLower: Set<string>,
): ModInstallConflictInfo[] {
  const byKey = new Map<string, ModInstallConflictInfo>();
  for (const entry of conflictEntries) {
    const name = String(entry.name || '').trim();
    if (!name) continue;
    const key = normalizeModListName(name);
    if (key === 'base') continue;
    if (!byKey.has(key)) {
      byKey.set(key, {
        name,
        is_builtin: !!entry.is_builtin,
        will_disable: false,
      });
    }
  }

  for (const row of modList.mods || []) {
    const n = String(row?.name || '').trim();
    if (!n) continue;
    const key = normalizeModListName(n);
    if (key === 'base' || installTreeLower.has(key)) continue;
    const hit = byKey.get(key);
    if (!hit || !modListRowEnabled(row)) continue;
    hit.will_disable = true;
  }

  return [...byKey.values()]
    .filter((x) => x.will_disable)
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
    );
}

export function resolveEnabledInstallConflicts(
  modList: { mods?: { name?: string; enabled?: boolean }[] },
  conflictNames: Iterable<string>,
  installTreeLower: Set<string>,
): string[] {
  const conflictKeys = new Set<string>();
  for (const raw of conflictNames) {
    const n = String(raw || '').trim();
    if (!n) continue;
    conflictKeys.add(normalizeModListName(n));
  }

  const out: string[] = [];
  const seen = new Set<string>();
  for (const row of modList.mods || []) {
    if (!modListRowEnabled(row)) continue;
    const n = String(row?.name || '').trim();
    if (!n || normalizeModListName(n) === 'base') continue;
    const key = normalizeModListName(n);
    if (installTreeLower.has(key)) continue;
    if (!conflictKeys.has(key)) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out.sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
}

export function disableModListEntriesByName(
  rows: Record<string, unknown>[],
  names: string[],
): string[] {
  const keys = new Set(
    names
      .map((n) => normalizeModListName(String(n || '').trim()))
      .filter(Boolean),
  );
  if (!keys.size) return [];

  const disabled: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const n = String(row.name || '').trim();
    if (!n || normalizeModListName(n) === 'base') continue;
    if (!keys.has(normalizeModListName(n))) continue;
    if (row.enabled === false) continue;
    const key = normalizeModListName(n);
    if (seen.has(key)) continue;
    seen.add(key);
    row.enabled = false;
    disabled.push(n);
  }

  return disabled.sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  );
}

export function isOptionalDependencyString(raw: string): boolean {
  const s = String(raw || '').trim();
  return !s || s.startsWith('!') || OPTIONAL_DEP_PREFIX_RE.test(s);
}

export function dependencyStringRequiresSpaceAge(raw: string): boolean {
  const s = String(raw || '').trim();
  if (isOptionalDependencyString(s)) return false;
  if (SPACE_AGE_DEP_RE.test(s)) return true;
  return (
    parseDependencyModName(s).toLowerCase().replace(/_/g, '-') === 'space-age'
  );
}

export function isBuiltinModName(name: string): boolean {
  const k = String(name || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
  return BUILTIN_MODS.has(k);
}

export function isSpaceAgeDependency(dep: string): boolean {
  return dependencyStringRequiresSpaceAge(dep);
}

export function manifestRequiresSpaceAge(
  manifest: Record<string, unknown> | null | undefined,
): boolean {
  if (!manifest) return false;
  const deps = manifest.dependencies;
  if (!Array.isArray(deps)) return false;
  return deps.some((d) => dependencyStringRequiresSpaceAge(String(d || '')));
}

export function releaseRequiresSpaceAge(
  release: Record<string, unknown> | null | undefined,
): boolean {
  if (!release) return false;
  const deps = releaseDependencies(release);
  return deps.some((d) => dependencyStringRequiresSpaceAge(d));
}

function releaseInfoJson(
  release: Record<string, unknown>,
): Record<string, unknown> | null {
  const infoRaw = release.info_json;
  if (typeof infoRaw === 'string' && infoRaw.trim()) {
    try {
      return JSON.parse(infoRaw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (infoRaw && typeof infoRaw === 'object' && !Array.isArray(infoRaw)) {
    return infoRaw as Record<string, unknown>;
  }
  return null;
}

export function releaseDependencies(
  release: Record<string, unknown>,
): string[] {
  const direct = release.dependencies;
  if (Array.isArray(direct)) return direct.map((d) => String(d || ''));
  const deps = releaseInfoJson(release)?.dependencies;
  if (Array.isArray(deps)) return deps.map((d) => String(d || ''));
  return [];
}

export function modListRequiresSpaceAge(data: {
  mods?: { name?: string; enabled?: boolean }[];
}): boolean {
  for (const row of data.mods || []) {
    const n = String(row?.name || '')
      .trim()
      .toLowerCase()
      .replace(/_/g, '-');
    if (n === 'space-age' && row?.enabled !== false) return true;
  }
  return false;
}

function modpackModListPaths(packDir: string): string[] {
  return [
    join(packDir, 'mods', 'mod-list.json'),
    join(packDir, 'mod-list.json'),
  ];
}

function modpackZipDirs(packDir: string): string[] {
  const modsDir = join(packDir, 'mods');
  if (existsSync(modsDir)) return [modsDir];
  return existsSync(packDir) ? [packDir] : [];
}

export function modpackModListIncludesSpaceAge(packDir: string): boolean {
  for (const p of modpackModListPaths(packDir)) {
    if (!existsSync(p)) continue;
    try {
      const data = JSON.parse(readFileSync(p, 'utf-8')) as {
        mods?: { name?: string; enabled?: boolean }[];
      };
      if (modListRequiresSpaceAge(data)) return true;
    } catch {
      /* ignore */
    }
  }
  return false;
}

export function modpackContainsSpaceAgeZip(packDir: string): boolean {
  for (const dir of modpackZipDirs(packDir)) {
    for (const f of readdirSync(dir)) {
      if (!f.toLowerCase().endsWith('.zip')) continue;
      if (modNameFromZip(f).toLowerCase() === 'space-age') return true;
    }
  }
  return false;
}

export function modpackZipManifestsRequireSpaceAge(packDir: string): boolean {
  for (const dir of modpackZipDirs(packDir)) {
    for (const f of readdirSync(dir)) {
      if (!f.toLowerCase().endsWith('.zip')) continue;
      const manifest = readModManifest(join(dir, f));
      if (manifestRequiresSpaceAge(manifest)) return true;
    }
  }
  return false;
}

export function modpackActivateNeedsSpaceAge(packDir: string): boolean {
  return (
    modpackModListIncludesSpaceAge(packDir) ||
    modpackContainsSpaceAgeZip(packDir) ||
    modpackZipManifestsRequireSpaceAge(packDir)
  );
}

export function portalDependencyNames(
  release: Record<string, unknown> | null | undefined,
): string[] {
  if (!release) return [];
  const out: string[] = [];
  for (const dep of releaseDependencies(release)) {
    if (isOptionalDependencyString(dep)) continue;
    const name = parseDependencyModName(dep);
    if (!name || isBuiltinModName(name)) continue;
    if (!out.some((x) => x.toLowerCase() === name.toLowerCase()))
      out.push(name);
  }
  return out;
}

export function portalRecommendedDependencyNames(
  release: Record<string, unknown> | null | undefined,
): string[] {
  if (!release) return [];
  const out: string[] = [];
  for (const dep of releaseDependencies(release)) {
    const raw = String(dep || '').trim();
    if (raw.startsWith('+')) {
      const name = parseDependencyModName(dep);
      if (!name || isBuiltinModName(name)) continue;
      if (!out.some((x) => x.toLowerCase() === name.toLowerCase())) {
        out.push(name);
      }
    }
  }
  return out;
}

/** set default mod-list */
export function resetServerModsDir(serverPath: string): number {
  const modsDir = join(serverPath, 'mods');
  let deleted = 0;
  if (existsSync(modsDir)) {
    for (const f of readdirSync(modsDir)) {
      rmSync(join(modsDir, f), { recursive: true, force: true });
      deleted += 1;
    }
  }
  if (hasSpaceAgeInstalled(serverPath)) {
    seedSpaceAgeModList(modsDir, gameVersion(serverPath));
  } else {
    mkdirSync(modsDir, { recursive: true });
  }
  return deleted;
}

/** Default mod-list for Space Age servers. */
export function seedSpaceAgeModList(modsDir: string, gameVersion = ''): void {
  mkdirSync(modsDir, { recursive: true });
  const expansionMods = saOfficialExpansionMods(gameVersion).map((name) => ({
    name,
    enabled: true,
  }));
  writeFileSync(
    join(modsDir, 'mod-list.json'),
    JSON.stringify(
      {
        mods: [{ name: 'base', enabled: true }, ...expansionMods],
      },
      null,
      2,
    ) + '\n',
    'utf-8',
  );
}

function modListRowToEntry(
  row: Record<string, unknown>,
): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    name: row.name,
    enabled: row.enabled !== false,
  };
  const version = String(row.version || '').trim();
  if (version) entry.version = version;
  return entry;
}

export function ensureSaOfficialExpansionRows(
  modListPath: string,
  serverHasSpaceAge: boolean,
  gameVersion = '',
): void {
  if (!serverHasSpaceAge || !existsSync(modListPath)) return;

  let data: { mods: Record<string, unknown>[] };
  try {
    data = JSON.parse(readFileSync(modListPath, 'utf-8')) as {
      mods: Record<string, unknown>[];
    };
    if (!Array.isArray(data.mods)) data.mods = [];
  } catch {
    return;
  }

  const officialSet = new Set<string>(SA_OFFICIAL_EXPANSION_MODS);
  const expansionMods = saOfficialExpansionMods(gameVersion);
  const includeRecycler = serverHasBuiltinRecycler(gameVersion);
  let base: Record<string, unknown> | null = null;
  const byLower = new Map<string, Record<string, unknown>>();
  const others: Record<string, unknown>[] = [];

  for (const row of data.mods) {
    const name = String(row?.name || '').trim();
    const key = name.toLowerCase();
    if (key === 'base') {
      base = row;
      continue;
    }
    if (officialSet.has(key)) {
      if (key === RECYCLER_BUILTIN_MOD && !includeRecycler) {
        others.push(row);
        continue;
      }
      byLower.set(key, row);
      continue;
    }
    others.push(row);
  }

  if (!base) base = { name: 'base', enabled: true };

  const saOrdered: Record<string, unknown>[] = [];
  for (const nm of expansionMods) {
    saOrdered.push(byLower.get(nm) ?? { name: nm, enabled: false });
  }

  data.mods = [
    modListRowToEntry(base),
    ...saOrdered.map(modListRowToEntry),
    ...others.map(modListRowToEntry),
  ];
  writeFileSync(modListPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export function missingDepNamesFromLogLine(line: string): string[] {
  const m = MISSING_DEP_RE.exec(line);
  if (!m) return [];
  let raw = String(m[1] || '')
    .trim()
    .replace(/^[•\s]+/, '');
  raw = raw.replace(/[.,);"'•]+$/g, '').trim();
  const name = parseDependencyModName(raw);
  return name ? [name] : [];
}

export function recordMissingStartupDepLine(
  order: string[],
  seen: Set<string>,
  line: string,
  serverHasSpaceAge: boolean,
): void {
  for (const name of missingDepNamesFromLogLine(line)) {
    if (!isInstallableMissingDepName(name)) continue;
    if (
      !serverHasSpaceAge &&
      name.toLowerCase().replace(/_/g, '-') === 'space-age'
    )
      continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    order.push(name);
  }
}

export function currentLogSessionLines(lines: string[]): string[] {
  if (!lines.length) return [];
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isFactorioSessionStartLine(lines[i])) return lines.slice(i);
  }
  return lines;
}

function logSessionReachedInGame(sessionLines: string[]): boolean {
  return sessionLines.some(
    (line) =>
      line.includes('changing state from(CreatingGame) to(InGame)') ||
      line.includes('changing state from (CreatingGame) to (InGame)'),
  );
}

function logBlockStartIndex(lines: string[]): number {
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (/Failed to load mod\s+"/i.test(line)) return i;
    if (/------------- Error -------------/.test(line)) return i;
  }
  return -1;
}

export function parseMissingStartupDependencies(
  lines: string[],
  serverHasSpaceAge: boolean,
): string[] {
  const session = currentLogSessionLines(lines);
  if (logSessionReachedInGame(session)) return [];

  const start = logBlockStartIndex(session);
  if (start < 0) return [];

  const seen = new Set<string>();
  const order: string[] = [];
  for (let i = start; i < session.length; i++) {
    recordMissingStartupDepLine(order, seen, session[i], serverHasSpaceAge);
  }
  return order;
}

export function logShowsModLoadFailure(lines: string[]): boolean {
  const session = currentLogSessionLines(lines);
  if (logSessionReachedInGame(session)) return false;
  return logBlockStartIndex(session) >= 0;
}
