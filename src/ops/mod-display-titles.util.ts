import AdmZip from 'adm-zip';
import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { basename, dirname, extname, join, normalize, resolve } from 'path';

export type LocaleSections = Record<string, Record<string, string>>;

/** User UI language from X-FCC-UI-Lang, else panel default from fcc-settings.ini. */
export function normalizeModUiLang(
  raw: string | undefined,
  panelDefault: string,
): string {
  return (
    String(raw || panelDefault || 'en')
      .trim()
      .toLowerCase() || 'en'
  );
}

const EMOJI_IN_MOD_DISPLAY_RE =
  /[\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2700}-\u{27BF}\u{2600}-\u{26FF}]/gu;

function parseFactorioLocaleCfg(content: string): LocaleSections {
  const sections: LocaleSections = {};
  let current: string | null = null;
  for (const raw of content.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;
    if (line.startsWith('[') && line.endsWith(']')) {
      current = line.slice(1, -1).trim();
      sections[current] ??= {};
      continue;
    }
    const eq = raw.indexOf('=');
    if (eq < 0 || !current) continue;
    const k = raw.slice(0, eq).trim();
    const v = raw.slice(eq + 1).trim();
    if (k) sections[current][k] = v;
  }
  return sections;
}

function mergeLocaleText(sections: LocaleSections, text: string): void {
  let body = text;
  if (body.startsWith('\ufeff')) body = body.slice(1);
  const parsed = parseFactorioLocaleCfg(body);
  for (const [secName, pairs] of Object.entries(parsed)) {
    if (!pairs || typeof pairs !== 'object') continue;
    const bucket = sections[secName] ?? {};
    Object.assign(bucket, pairs);
    sections[secName] = bucket;
  }
}

function zipEntryIsLocaleCfg(entry: string, lc: string): boolean {
  const norm = entry.replace(/\\/g, '/');
  if (!norm.endsWith('.cfg')) return false;
  const parts = norm.split('/');
  for (let i = 0; i < parts.length - 1; i += 1) {
    if (parts[i] === 'locale' && parts[i + 1] === lc) return true;
  }
  return false;
}

function listCfgFilesRecursive(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) out.push(...listCfgFilesRecursive(p));
    else if (ent.isFile() && ent.name.toLowerCase().endsWith('.cfg'))
      out.push(p);
  }
  return out.sort();
}

const modsDirCache = new Map<string, { mtime: number; entries: { name: string; isDir: boolean }[] }>();

export function modPackagePathsForInternalName(
  modsDir: string,
  modInternal: string,
): string[] {
  if (!existsSync(modsDir)) return [];
  
  const stat = statSync(modsDir);
  let cached = modsDirCache.get(modsDir);
  if (!cached || cached.mtime !== stat.mtimeMs) {
    const entries = readdirSync(modsDir, { withFileTypes: true }).map(e => ({
      name: e.name,
      isDir: e.isDirectory()
    }));
    cached = { mtime: stat.mtimeMs, entries };
    modsDirCache.set(modsDir, cached);
  }

  const mi = modInternal.toLowerCase();
  const out: string[] = [];
  for (const ent of cached.entries) {
    if (ent.name === 'mod-list.json') continue;
    const p = join(modsDir, ent.name);
    const stem = ent.isDir ? ent.name : ent.name.replace(/\.zip$/i, '');
    const sl = stem.toLowerCase();
    if (sl === mi || sl.startsWith(`${mi}_`)) out.push(p);
  }
  return out;
}

const dataPacksLocaleCache = new Map<string, LocaleSections>();

function mergeDataPacksLocalePass(
  dataDir: string,
  lc: string,
  sections: LocaleSections,
): void {
  const key = `${dataDir}::${lc}`;
  let cached = dataPacksLocaleCache.get(key);
  
  if (!cached) {
    cached = {};
    if (existsSync(dataDir)) {
      let packs: { name: string; path: string }[] = [];
      try {
        packs = readdirSync(dataDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => ({ name: d.name, path: join(dataDir, d.name) }))
          .sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
          );
      } catch {
        // ignore
      }
      for (const pack of packs) {
        const locDir = join(pack.path, 'locale', lc);
        for (const cfg of listCfgFilesRecursive(locDir)) {
          try {
            mergeLocaleText(cached, readFileSync(cfg, 'utf-8'));
          } catch {
            /* ignore */
          }
        }
      }
    }
    dataPacksLocaleCache.set(key, cached);
  }

  for (const [secName, pairs] of Object.entries(cached)) {
    if (!sections[secName]) {
      sections[secName] = Object.create(pairs);
    } else {
      Object.setPrototypeOf(sections[secName], pairs);
    }
  }
}

const admZipCache = new Map<string, { mtime: number, zip: AdmZip }>();

function getAdmZipCached(zipPath: string): AdmZip | null {
  try {
    const stat = statSync(zipPath);
    const cached = admZipCache.get(zipPath);
    if (cached && cached.mtime === stat.mtimeMs) return cached.zip;
    const zip = new AdmZip(zipPath);
    admZipCache.set(zipPath, { mtime: stat.mtimeMs, zip });
    if (admZipCache.size > 200) {
      const firstKey = admZipCache.keys().next().value;
      if (firstKey) admZipCache.delete(firstKey);
    }
    return zip;
  } catch {
    return null;
  }
}

function mergeLocaleOneMod(
  modsDir: string,
  mod: string,
  lc: string,
  sections: LocaleSections,
): void {
  for (const pkg of modPackagePathsForInternalName(modsDir, mod)) {
    try {
      if (existsSync(pkg) && !pkg.toLowerCase().endsWith('.zip')) {
        const locDir = join(pkg, 'locale', lc);
        for (const cfg of listCfgFilesRecursive(locDir)) {
          try {
            mergeLocaleText(sections, readFileSync(cfg, 'utf-8'));
          } catch {
            /* ignore */
          }
        }
      } else if (pkg.toLowerCase().endsWith('.zip')) {
        const zip = getAdmZipCached(pkg);
        if (!zip) continue;
        for (const name of zip
          .getEntries()
          .map((e) => e.entryName)
          .sort()) {
          if (!zipEntryIsLocaleCfg(name, lc)) continue;
          try {
            mergeLocaleText(sections, zip.readAsText(name, 'utf8'));
          } catch {
            /* ignore */
          }
        }
      }
    } catch {
      /* ignore */
    }
  }
}

function locLookup(
  sections: LocaleSections,
  section: string,
  key: string,
): string | undefined {
  const v = sections[section]?.[key];
  return typeof v === 'string' && v.trim() ? v.trim() : undefined;
}

function sanitizeModDisplayName(raw: string, fallback: string): string {
  const stripped = raw
    ? raw
        .replace(EMOJI_IN_MOD_DISPLAY_RE, '')
        .replace(/\ufe0f/g, '')
        .replace(/\s+/g, ' ')
        .trim()
    : '';
  if (stripped) return stripped;
  const fb = String(fallback || '').trim();
  if (fb) return fb;
  return String(raw || '').trim() || '?';
}

function displayTitleFromInfoDict(
  info: Record<string, unknown>,
  sections: LocaleSections,
): string | null {
  const title = info.title;
  if (typeof title === 'string' && title.trim()) return title.trim();
  if (Array.isArray(title) && title.length) {
    const parts = title.filter((x): x is string => typeof x === 'string');
    if (parts.length >= 2) {
      const got = locLookup(sections, parts[0], parts[1]);
      if (got) return got;
    }
    if (parts.length === 1 && parts[0].includes('.')) {
      const dot = parts[0].indexOf('.');
      const a = parts[0].slice(0, dot);
      const b = parts[0].slice(dot + 1);
      if (a && b) {
        const got = locLookup(sections, a, b);
        if (got) return got;
      }
    }
  }
  const nm = info.name;
  if (typeof nm === 'string' && nm.trim()) {
    for (const mk of [nm.trim(), nm.trim().toLowerCase()]) {
      const got = locLookup(sections, 'mod-name', mk);
      if (got) return got;
    }
  }
  return null;
}

function readTitleFromInfoPath(
  path: string,
  sections: LocaleSections,
): string | null {
  try {
    const info = JSON.parse(readFileSync(path, 'utf-8')) as Record<
      string,
      unknown
    >;
    return displayTitleFromInfoDict(info, sections);
  } catch {
    return null;
  }
}

function readTitleFromZip(
  zipPath: string,
  sections: LocaleSections,
): string | null {
  try {
    const zip = getAdmZipCached(zipPath);
    if (!zip) return null;
    for (const ent of zip.getEntries()) {
      if (ent.isDirectory) continue;
      const parts = ent.entryName.replace(/\\/g, '/').split('/');
      if (parts.length === 2 && parts[1] === 'info.json') {
        const info = JSON.parse(zip.readAsText(ent, 'utf8')) as Record<
          string,
          unknown
        >;
        const got = displayTitleFromInfoDict(info, sections);
        if (got) return got;
      }
    }
  } catch {
    /* ignore */
  }
  return null;
}

function loadModListLocales(
  modsDir: string,
  dataDir: string,
  modNames: string[],
  uiLang: string,
): { active: LocaleSections; en: LocaleSections } {
  const active: LocaleSections = {};
  const lang =
    String(uiLang || 'en')
      .trim()
      .toLowerCase() || 'en';
  mergeDataPacksLocalePass(dataDir, 'en', active);
  for (const mod of modNames) mergeLocaleOneMod(modsDir, mod, 'en', active);
  
  const en: LocaleSections = {};
  for (const [k, v] of Object.entries(active)) {
    const proto = Object.getPrototypeOf(v);
    const clone = Object.create(proto);
    Object.assign(clone, v);
    en[k] = clone;
  }
  
  if (lang !== 'en') {
    mergeDataPacksLocalePass(dataDir, lang, active);
    for (const mod of modNames) mergeLocaleOneMod(modsDir, mod, lang, active);
  }
  return { active, en };
}

export function loadFactorioLocaleSections(
  modsDir: string,
  dataDir: string,
  modNames: string[],
  uiLang: string,
): { active: LocaleSections; en: LocaleSections } {
  return loadModListLocales(modsDir, dataDir, modNames, uiLang);
}

export function lookupLocaleString(
  sections: LocaleSections,
  section: string,
  key: string,
): string | undefined {
  return locLookup(sections, section, key);
}

function resolveModRowTitle(
  modInternal: string,
  modsDir: string,
  dataDir: string,
  sections: LocaleSections,
  cache: Map<string, string>,
): string {
  if (cache.has(modInternal)) return cache.get(modInternal)!;
  for (const mk of [modInternal, modInternal.toLowerCase()]) {
    const locTitle = locLookup(sections, 'mod-name', mk);
    if (locTitle) {
      const out = sanitizeModDisplayName(locTitle, modInternal);
      cache.set(modInternal, out);
      return out;
    }
  }
  let title = modInternal;
  for (const pkg of modPackagePathsForInternalName(modsDir, modInternal)) {
    try {
      if (existsSync(pkg) && !pkg.toLowerCase().endsWith('.zip')) {
        const tip = join(pkg, 'info.json');
        if (existsSync(tip)) {
          const got = readTitleFromInfoPath(tip, sections);
          if (got) {
            title = got;
            break;
          }
        }
      } else if (pkg.toLowerCase().endsWith('.zip')) {
        const got = readTitleFromZip(pkg, sections);
        if (got) {
          title = got;
          break;
        }
      }
    } catch {
      /* ignore */
    }
  }
  if (title === modInternal && existsSync(dataDir)) {
    const pack = join(dataDir, modInternal);
    const tip = join(pack, 'info.json');
    if (existsSync(tip)) {
      const got = readTitleFromInfoPath(tip, sections);
      if (got) title = got;
    }
  }
  const out = sanitizeModDisplayName(title, modInternal);
  cache.set(modInternal, out);
  return out;
}

export function resolveModDisplayTitlesBatch(opts: {
  serverPath: string;
  modsDir: string;
  modNames: string[];
  uiLang: string;
  translateModNames: boolean;
}): Record<string, string> {
  const uniq = [
    ...new Set(
      opts.modNames.map((n) => String(n || '').trim()).filter(Boolean),
    ),
  ];
  if (!uniq.length) return {};
  const dataDir = join(opts.serverPath, 'data');
  const { active, en } = loadModListLocales(
    opts.modsDir,
    dataDir,
    uniq,
    opts.uiLang,
  );
  const sections = opts.translateModNames ? active : en;
  const cache = new Map<string, string>();
  const out: Record<string, string> = {};
  for (const name of uniq) {
    out[name] = resolveModRowTitle(
      name,
      opts.modsDir,
      dataDir,
      sections,
      cache,
    );
  }
  return out;
}

function getVersionFromInfo(pkgPath: string): string {
  try {
    if (!pkgPath.toLowerCase().endsWith('.zip')) {
      const infoPath = join(pkgPath, 'info.json');
      if (existsSync(infoPath)) {
        const info = JSON.parse(readFileSync(infoPath, 'utf-8'));
        if (typeof info.version === 'string' && info.version.trim()) {
          return info.version.trim();
        }
      }
    } else {
      const zip = getAdmZipCached(pkgPath);
      if (!zip) return '';
      for (const ent of zip.getEntries()) {
        if (ent.isDirectory) continue;
        const parts = ent.entryName.replace(/\\/g, '/').split('/');
        if (parts.length === 2 && parts[1] === 'info.json') {
          const info = JSON.parse(zip.readAsText(ent, 'utf8'));
          if (typeof info.version === 'string' && info.version.trim()) {
            return info.version.trim();
          }
          break;
        }
      }
    }
  } catch {
    /* ignore */
  }
  const base = basename(pkgPath).replace(/\.zip$/i, '');
  const idx = base.indexOf('_');
  return idx >= 0 ? base.slice(idx + 1) : '';
}

const modDetailsLangCache = new Map<string, Map<string, { mtime: number; title: string; version: string }>>();

export function getModDetailsCached(pkgPath: string, lang: string): { title: string; version: string } {
  const lc = String(lang || 'en').trim().toLowerCase();
  let langMap = modDetailsLangCache.get(lc);
  if (!langMap) {
    langMap = new Map();
    modDetailsLangCache.set(lc, langMap);
  }
  
  try {
    const stat = statSync(pkgPath);
    const mtime = stat.mtimeMs;
    const cached = langMap.get(pkgPath);
    if (cached && cached.mtime === mtime) {
      return { title: cached.title, version: cached.version };
    }
    
    const folder = dirname(pkgPath);
    const name = basename(pkgPath).replace(/\.zip$/i, '').split('_')[0];
    const dataDir = join(dirname(folder), 'data');
    
    const { active, en } = loadModListLocales(
      folder,
      dataDir,
      [name],
      lc,
    );
    const sections = lc !== 'en' ? active : en;
    const cache = new Map<string, string>();
    const title = resolveModRowTitle(
      name,
      folder,
      dataDir,
      sections,
      cache,
    );
    
    const version = getVersionFromInfo(pkgPath);
    const finalTitle = title || name;
    langMap.set(pkgPath, { mtime, title: finalTitle, version });
    return { title: finalTitle, version };
  } catch {
    const base = basename(pkgPath).replace(/\.zip$/i, '');
    const idx = base.indexOf('_');
    const name = idx >= 0 ? base.slice(0, idx) : base;
    const version = idx >= 0 ? base.slice(idx + 1) : '';
    return { title: name, version };
  }
}
