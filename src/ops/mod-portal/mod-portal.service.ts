import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  createWriteStream,
  existsSync,
  readdirSync,
  unlinkSync,
  readFileSync,
} from 'fs';
import { join } from 'path';
import { PathManager } from '../path-manager';
import { gameVersion } from '../ops-utils';
import { gameBelowModFactorioReq } from '../mods/mod-game-req';
import { safeStr, safeTrim } from '../../common/trim.util';

const BASE = 'https://mods.factorio.com';
const BUILTIN = new Set([
  'base',
  'elevated-rails',
  'quality',
  'recycler',
  'space-age',
]);
const VERIFY_CACHE_TTL_MS = 5 * 60 * 1000;
const VERIFY_NETWORK_FAIL_TTL_MS = 30 * 1000;
const VERIFY_REQUEST_TIMEOUT_MS = 12_000;

export interface ModPortalReleaseItem {
  version: string;
  factorio_version: string;
  released_at?: string;
  file_name?: string;
  sha1?: string;
  is_compatible?: boolean;
}

export interface ModPortalSearchItem {
  name: string;
  title: string;
  summary: string;
  owner: string;
  downloads_count: number;
  thumbnail: string;
  category: string;
  requires_space_age: boolean;
  latest_version: string;
  factorio_version: string;
  released_at: string;
  target_release_version?: string;
}

export type ModPortalSortBy =
  | 'relevance'
  | 'downloads'
  | 'updated'
  | 'trending';

export interface ModPortalSearchFacets {
  space_age: number;
  categories: Record<string, number>;
  bookmarked?: number;
}

export interface ModPortalFullImage {
  id: string;
  url: string;
  thumbnail: string;
}

export interface ModPortalLicenseInfo {
  title: string;
  url: string;
}

export interface ModPortalFullDetails {
  name: string;
  title: string;
  owner: string;
  summary: string;
  description: string;
  faq: string;
  changelog: string;
  category: string;
  tags: string[];
  downloads_count: number;
  created_at: string;
  updated_at: string;
  homepage: string;
  source_url: string;
  github_path: string;
  license: ModPortalLicenseInfo | null;
  thumbnail: string;
  images: ModPortalFullImage[];
  latest_version: string;
  released_at: string;
  requires_space_age: boolean;
  target_release_version: string;
  raw_dependencies: string[];
}

interface CatalogIndexEntry {
  item: ModPortalSearchItem;
  nameLower: string;
  titleLower: string;
  ownerLower: string;
  summaryLower: string;
  portalScore: number;
  releasedAtMs: number;
}

const CATALOG_CACHE_TTL_MS = 10 * 60 * 1000;
const CATALOG_REQUEST_TIMEOUT_MS = 20_000;
const THUMB_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const THUMB_REQUEST_TIMEOUT_MS = 8_000;
const BOOKMARKS_CACHE_TTL_MS = 2 * 60 * 1000;
const BOOKMARKS_REQUEST_TIMEOUT_MS = 10_000;

type VerifyCacheEntry = {
  ts: number;
  ok: boolean;
  username: string;
  ttlMs: number;
};

@Injectable()
export class ModPortalService {
  private verifyCache = new Map<string, VerifyCacheEntry>();
  private fullMetaCache = new Map<
    string,
    { time: number; data: Record<string, unknown> }
  >();
  private catalogCache = new Map<
    string,
    { time: number; entries: CatalogIndexEntry[] }
  >();
  private inFlightCatalog = new Map<string, Promise<CatalogIndexEntry[]>>();
  private thumbnailCache = new Map<string, { time: number; thumb: string }>();
  private inFlightThumb = new Map<string, Promise<string>>();
  private bookmarksCache = new Map<
    string,
    { time: number; mods: Map<string, string> }
  >();

  private normalizePortalThumbnail(raw: unknown): string {
    const clean = safeTrim(raw);
    if (!clean || clean === '/assets/.thumb.png') return '';
    return clean;
  }

  private rememberThumbnail(modName: string, rawThumb: unknown): string {
    const key = safeTrim(modName).toLowerCase();
    const thumb = this.normalizePortalThumbnail(rawThumb);
    if (!key) return thumb;
    this.thumbnailCache.set(key, { time: Date.now(), thumb });
    if (thumb) {
      for (const cached of this.catalogCache.values()) {
        for (const entry of cached.entries) {
          if (entry.nameLower === key) {
            entry.item.thumbnail = thumb;
          }
        }
      }
    }
    return thumb;
  }
  isBuiltin(name: string): boolean {
    return BUILTIN.has((name || '').trim().toLowerCase());
  }

  versionTuple(ver: string): number[] {
    return (ver || '').split('.').map((x) => parseInt(x, 10) || 0);
  }

  versionNewer(a: string, b: string): boolean {
    if (!b) return !!a;
    const ta = this.versionTuple(a);
    const tb = this.versionTuple(b);
    for (let i = 0; i < Math.max(ta.length, tb.length); i++) {
      const av = ta[i] ?? 0;
      const bv = tb[i] ?? 0;
      if (av > bv) return true;
      if (av < bv) return false;
    }
    return false;
  }

  parseModInput(raw: string): { modName: string; version?: string } {
    let s = String(raw || '').trim();
    if (!s) return { modName: '' };

    let extractedVersion: string | undefined;

    if (s.includes('factorio.com')) {
      const parsedUrl = s.replace(/\\/g, '/');
      const verMatch = /[?&]version=([^&#]+)/i.exec(parsedUrl);
      if (verMatch) {
        try {
          extractedVersion = decodeURIComponent(verMatch[1].trim());
        } catch {
          extractedVersion = verMatch[1].trim();
        }
      }
      const m = /\/mod\/([^/?#]+)/i.exec(parsedUrl);
      if (m) {
        let modId = '';
        try {
          modId = decodeURIComponent(m[1].trim());
        } catch {
          modId = m[1].trim();
        }
        if (this.isValidPortalModId(modId)) {
          return { modName: modId, version: extractedVersion };
        }
      }
    }

    s = s.replace(/^mod\s*=\s*/i, '').trim();

    // Check for "ModName@1.0.5", "ModName:1.0.5", "ModName==1.0.5", "ModName=1.0.5", "ModName 1.0.5"
    const sepMatch =
      /^([A-Za-z0-9_\- ]+?)\s*(?:[@:=]|==|\s+)\s*(\d+(?:\.\d+)*)$/i.exec(s);
    if (sepMatch) {
      const candidateName = sepMatch[1].trim();
      const candidateVer = sepMatch[2].trim();
      if (this.isValidPortalModId(candidateName)) {
        return { modName: candidateName, version: candidateVer };
      }
    }

    // Check for "ModName_1.0.5.zip" or "ModName_1.0.5"
    const zipMatch = /^([A-Za-z0-9_\- ]+?)_(\d+(?:\.\d+)+)(?:\.zip)?$/i.exec(s);
    if (zipMatch) {
      const candidateName = zipMatch[1].trim();
      const candidateVer = zipMatch[2].trim();
      if (this.isValidPortalModId(candidateName)) {
        return { modName: candidateName, version: candidateVer };
      }
    }

    if (this.isValidPortalModId(s)) {
      return { modName: s };
    }

    return { modName: '' };
  }

  modIdFromInput(raw: string): string {
    return this.parseModInput(raw).modName;
  }

  isValidPortalModId(mod: string): boolean {
    const s = (mod || '').trim();
    return !!s && /^[A-Za-z0-9_ -]+$/.test(s);
  }

  private inFlightFetch = new Map<string, Promise<Record<string, unknown>>>();
  private activeFetches = 0;
  private fetchQueue: (() => void)[] = [];

  private async acquireFetchSlot(): Promise<() => void> {
    const MAX_CONCURRENT = 5;
    if (this.activeFetches < MAX_CONCURRENT) {
      this.activeFetches++;
      let released = false;
      return () => {
        if (!released) {
          released = true;
          this.activeFetches--;
          const next = this.fetchQueue.shift();
          if (next) next();
        }
      };
    }
    return new Promise<() => void>((resolve) => {
      this.fetchQueue.push(() => {
        this.activeFetches++;
        let released = false;
        resolve(() => {
          if (!released) {
            released = true;
            this.activeFetches--;
            const next = this.fetchQueue.shift();
            if (next) next();
          }
        });
      });
    });
  }

  async fetchFull(modName: string): Promise<Record<string, unknown>> {
    const raw = String(modName || '').trim();
    const cleanId = this.modIdFromInput(raw) || raw;
    const key = cleanId.toLowerCase();
    if (!key || this.isBuiltin(key)) {
      throw new Error('builtin');
    }

    const cached = this.fullMetaCache.get(key);
    if (cached && Date.now() - cached.time < 300_000) {
      return cached.data;
    }
    const existing = this.inFlightFetch.get(key);
    if (existing) {
      return existing;
    }

    const req = (async () => {
      let lastErr: unknown;
      for (let attempt = 1; attempt <= 3; attempt++) {
        const releaseSlot = await this.acquireFetchSlot();
        try {
          const url = `${BASE}/api/mods/${encodeURIComponent(cleanId)}/full`;
          const res = await fetch(url, {
            headers: {
              'User-Agent': 'FactorioControlCenter/2.0',
              Accept: 'application/json',
            },
            signal: AbortSignal.timeout(12_000),
          });
          if (res.status === 404) {
            throw new Error('http_404');
          }
          if (!res.ok) {
            throw new Error(`http_${res.status}`);
          }
          const data = (await res.json()) as Record<string, unknown>;
          this.fullMetaCache.set(key, { time: Date.now(), data });
          this.rememberThumbnail(cleanId, data.thumbnail);
          return data;
        } catch (e) {
          lastErr = e;
          const msg = e instanceof Error ? e.message : String(e);
          if (msg === 'http_404' || msg === 'builtin') {
            throw e;
          }
          if (attempt < 3) {
            await new Promise((r) => setTimeout(r, 250 * attempt));
          }
        } finally {
          releaseSlot();
        }
      }
      throw lastErr instanceof Error
        ? lastErr
        : new Error(safeStr(lastErr, 'fetch_failed'));
    })();

    this.inFlightFetch.set(key, req);
    try {
      return await req;
    } finally {
      this.inFlightFetch.delete(key);
    }
  }

  factorioMajorMinor(ver: string): string {
    const cleaned = String(ver || '')
      .trim()
      .replace(/^(?:>=|<=|=|>|<)/, '')
      .trim();
    const parts = cleaned.split('.');
    if (parts.length >= 2 && parts[0] && parts[1]) {
      const maj = parseInt(parts[0], 10);
      const min = parseInt(parts[1], 10);
      if (Number.isFinite(maj) && Number.isFinite(min)) {
        return `${maj}.${min}`;
      }
    }
    return '';
  }

  releaseInfo(
    release: Record<string, unknown> | null | undefined,
  ): Record<string, unknown> | null {
    if (!release) return null;
    const raw = release.info_json;
    if (typeof raw === 'string' && raw.trim()) {
      try {
        return JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return null;
      }
    }
    if (raw && typeof raw === 'object') {
      return raw as Record<string, unknown>;
    }
    return null;
  }

  releaseFactorioVersion(release: Record<string, unknown>): string {
    const info = this.releaseInfo(release);
    if (!info) return '';
    const raw = info.factorio_version;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return this.factorioMajorMinor(
        safeStr((raw as Record<string, unknown>).base),
      );
    }
    return this.factorioMajorMinor(safeStr(raw));
  }

  resolveRelease(
    meta: Record<string, unknown>,
    options?: {
      version?: string;
      gameVersion?: string;
      serverPath?: string;
    },
  ): Record<string, unknown> | null {
    const rels = Array.isArray(meta.releases)
      ? (meta.releases as Record<string, unknown>[])
      : [];
    if (!rels.length) return null;

    if (options?.version) {
      const targetVer = String(options.version).trim();
      const match = rels.find((r) => safeTrim(r.version) === targetVer);
      if (match) return match;
    }

    const gv =
      options?.gameVersion ||
      (options?.serverPath ? gameVersion(options.serverPath) : '');
    const targetFv = this.factorioMajorMinor(gv);

    if (targetFv) {
      const matchingFv = rels.filter(
        (r) => this.releaseFactorioVersion(r) === targetFv,
      );
      if (matchingFv.length > 0) {
        if (options?.serverPath || gv) {
          const compatible = matchingFv.filter((r) => {
            const check = gameBelowModFactorioReq(
              options?.serverPath || '',
              r,
              gv,
            );
            return !check?.below;
          });
          if (compatible.length > 0) {
            return compatible.sort((a, b) =>
              this.versionNewer(safeStr(a.version), safeStr(b.version))
                ? -1
                : 1,
            )[0];
          }
        }
        return matchingFv.sort((a, b) =>
          this.versionNewer(safeStr(a.version), safeStr(b.version)) ? -1 : 1,
        )[0];
      }
    }

    // Fallback: highest version overall
    return (
      rels
        .slice()
        .sort((a, b) =>
          this.versionNewer(safeStr(a.version), safeStr(b.version)) ? -1 : 1,
        )[0] || rels[rels.length - 1]
    );
  }

  lastRelease(
    meta: Record<string, unknown>,
    options?: {
      version?: string;
      gameVersion?: string;
      serverPath?: string;
    },
  ): Record<string, unknown> | null {
    if (options) {
      return this.resolveRelease(meta, options);
    }
    const rels = meta.releases;
    if (!Array.isArray(rels) || rels.length === 0) return null;
    return (rels[rels.length - 1] as Record<string, unknown>) || null;
  }

  listReleasesSummary(
    meta: Record<string, unknown>,
    serverPath?: string,
    gameVersionStr?: string,
  ): ModPortalReleaseItem[] {
    const rels = Array.isArray(meta.releases)
      ? (meta.releases as Record<string, unknown>[])
      : [];
    const gv = gameVersionStr || (serverPath ? gameVersion(serverPath) : '');
    const targetFv = this.factorioMajorMinor(gv);

    const list: ModPortalReleaseItem[] = rels.map((r) => {
      const ver = safeTrim(r.version);
      const fv = this.releaseFactorioVersion(r);
      let isComp = true;
      if (targetFv) {
        isComp = fv === targetFv;
        if (isComp && serverPath) {
          isComp = !gameBelowModFactorioReq(serverPath, r).below;
        }
      }
      return {
        version: ver,
        factorio_version: fv,
        released_at: safeStr(r.released_at),
        file_name: safeStr(r.file_name),
        sha1: safeStr(r.sha1),
        is_compatible: isComp,
      };
    });

    return list.sort((a, b) =>
      this.versionNewer(a.version, b.version) ? -1 : 1,
    );
  }

  listZipVersions(modName: string, modsDir: string): string[] {
    if (!existsSync(modsDir)) return [];
    const pat = new RegExp(
      `^${this.escapeRe(modName)}_(\\d+\\.\\d+\\.\\d+)\\.zip$`,
      'i',
    );
    const out: string[] = [];
    for (const f of readdirSync(modsDir)) {
      const m = pat.exec(f);
      if (m) out.push(m[1]);
    }
    return out.sort((a, b) =>
      this.versionNewer(a, b) ? 1 : this.versionNewer(b, a) ? -1 : 0,
    );
  }

  findZipPath(
    modName: string,
    modsDir: string,
    version: string,
  ): string | null {
    const p = join(modsDir, `${modName}_${version}.zip`);
    return existsSync(p) ? p : null;
  }

  installedZipVersion(modName: string, modsDir: string): string {
    const vs = this.listZipVersions(modName, modsDir);
    return vs[vs.length - 1] || '';
  }

  async downloadRelease(
    release: Record<string, unknown>,
    modsDir: string,
    username: string,
    token: string,
    onProgress?: (cur: number, tot: number) => void,
    shouldAbort?: () => boolean,
  ): Promise<string> {
    const dl = safeStr(release.download_url);
    const fileName = safeStr(release.file_name);
    if (!dl.startsWith('/') || !fileName.endsWith('.zip')) {
      throw new Error('invalid_release');
    }
    const sep = dl.includes('?') ? '&' : '?';
    const url = `${BASE}${dl}${sep}username=${encodeURIComponent(username)}&token=${encodeURIComponent(token)}`;
    const dest = join(modsDir, fileName);
    const ac = new AbortController();
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FactorioControlCenter/2.0' },
      signal: ac.signal,
    });
    if (!res.ok || !res.body) throw new Error(`download_http_${res.status}`);
    const total =
      parseInt(String(res.headers.get('content-length') || '0'), 10) || 0;
    onProgress?.(0, total);
    const hash = createHash('sha1');
    const ws = createWriteStream(dest);
    const wsState: { err: Error | null } = { err: null };
    ws.on?.('error', (err: Error) => {
      wsState.err = err;
    });
    const reader = res.body.getReader();
    let cur = 0;
    try {
      while (true) {
        if (shouldAbort?.()) {
          ac.abort();
          await reader.cancel().catch(() => undefined);
          throw new Error('cancelled');
        }
        if (wsState.err) throw wsState.err;
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        hash.update(chunk);
        ws.write(chunk);
        cur += chunk.length;
        onProgress?.(cur, total || cur);
      }
      await new Promise<void>((resolve, reject) => {
        if (wsState.err) {
          reject(wsState.err);
          return;
        }
        ws.end((e?: Error) => (e ? reject(e) : resolve()));
      });
    } catch (e) {
      ws.destroy();
      try {
        unlinkSync(dest);
      } catch {
        /* ignore */
      }
      if (
        shouldAbort?.() ||
        (e instanceof Error && e.message === 'cancelled')
      ) {
        throw new Error('cancelled');
      }
      throw e;
    }
    const expected = safeTrim(release.sha1).toLowerCase();
    if (expected && hash.digest('hex').toLowerCase() !== expected) {
      try {
        unlinkSync(dest);
      } catch {
        /* ignore */
      }
      throw new Error('sha1_mismatch');
    }
    return fileName;
  }

  pruneOldZips(modName: string, keepVersion: string, modsDir: string): void {
    const pat = new RegExp(
      `^${this.escapeRe(modName)}_(\\d+\\.\\d+\\.\\d+)\\.zip$`,
      'i',
    );
    for (const f of readdirSync(modsDir)) {
      const m = pat.exec(f);
      if (m && m[1] !== keepVersion) {
        try {
          unlinkSync(join(modsDir, f));
        } catch {
          /* ignore */
        }
      }
    }
  }

  resolveCredentials(
    pm: PathManager,
    configUser?: string,
    configToken?: string,
  ): { user: string; token: string } | null {
    const cfgUser = String(configUser || '').trim();
    const cfgToken = String(configToken || '').trim();
    if (cfgUser && cfgToken) return { user: cfgUser, token: cfgToken };
    return this.readCredentialsFile(pm.serverSettings);
  }

  clearVerifyCache(): void {
    this.verifyCache.clear();
  }

  async verifyCredentials(
    user: string,
    token: string,
  ): Promise<{ ok: boolean; username: string }> {
    const username = String(user || '').trim();
    const authToken = String(token || '').trim();
    if (!username || !authToken) return { ok: false, username: '' };

    const cacheKey = createHash('sha256')
      .update(`${username}\0${authToken}`)
      .digest('hex');
    const cached = this.verifyCache.get(cacheKey);
    if (cached && Date.now() - cached.ts < cached.ttlMs) {
      return { ok: cached.ok, username: cached.username };
    }

    const url =
      `${BASE}/api/bookmarks?username=${encodeURIComponent(username)}` +
      `&token=${encodeURIComponent(authToken)}`;
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'FactorioControlCenter/2.0' },
        signal: AbortSignal.timeout(VERIFY_REQUEST_TIMEOUT_MS),
      });
      const ok = res.status >= 200 && res.status < 300;
      const entry: VerifyCacheEntry = {
        ts: Date.now(),
        ok,
        username: ok ? username : '',
        ttlMs: VERIFY_CACHE_TTL_MS,
      };
      this.verifyCache.set(cacheKey, entry);
      return { ok, username: entry.username };
    } catch {
      this.verifyCache.set(cacheKey, {
        ts: Date.now(),
        ok: false,
        username: '',
        ttlMs: VERIFY_NETWORK_FAIL_TTL_MS,
      });
      return { ok: false, username: '' };
    }
  }

  async resolveVerifiedServerSettingsUsername(
    pm: PathManager,
  ): Promise<string> {
    const creds = this.readCredentialsFile(pm.serverSettings);
    if (!creds) return '';
    const verified = await this.verifyCredentials(creds.user, creds.token);
    return verified.ok ? verified.username : '';
  }

  loadCredentials(
    pm: PathManager,
    configUser?: string,
    configToken?: string,
  ): {
    user: string;
    token: string;
  } | null {
    return this.resolveCredentials(pm, configUser, configToken);
  }

  private readCredentialsFile(
    path: string,
  ): { user: string; token: string } | null {
    if (!existsSync(path)) return null;
    try {
      const data = JSON.parse(readFileSync(path, 'utf-8')) as Record<
        string,
        string
      >;
      const u = (data['service-username'] || data.username || '').trim();
      const t = (data['service-token'] || data.token || '').trim();
      if (u && t) return { user: u, token: t };
    } catch {
      /* ignore */
    }
    return null;
  }

  private extractBookmarkNames(payload: unknown): string[] {
    const pickItems = (arr: unknown[]): string[] => {
      const out: string[] = [];
      for (const el of arr) {
        if (typeof el === 'string') {
          const clean = safeTrim(el);
          if (clean) out.push(clean);
        } else if (el && typeof el === 'object') {
          const name = safeTrim((el as Record<string, unknown>).name);
          if (name) out.push(name);
        }
      }
      return out;
    };

    if (Array.isArray(payload)) {
      return pickItems(payload);
    }
    if (payload && typeof payload === 'object') {
      const obj = payload as Record<string, unknown>;
      if (Array.isArray(obj.bookmarks)) return pickItems(obj.bookmarks);
      if (Array.isArray(obj.results)) return pickItems(obj.results);
      if (Array.isArray(obj.mods)) return pickItems(obj.mods);
    }
    return [];
  }

  async fetchBookmarks(user: string, token: string): Promise<string[]> {
    const u = safeTrim(user);
    const t = safeTrim(token);
    if (!u || !t) return [];
    const cacheKey = u.toLowerCase();
    const cached = this.bookmarksCache.get(cacheKey);
    if (cached && Date.now() - cached.time < BOOKMARKS_CACHE_TTL_MS) {
      return Array.from(cached.mods.values());
    }

    const qs = new URLSearchParams({ username: u, token: t });
    const res = await fetch(`${BASE}/api/bookmarks?${qs.toString()}`, {
      headers: {
        'User-Agent': 'FactorioControlCenter/2.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(BOOKMARKS_REQUEST_TIMEOUT_MS),
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error('invalid_credentials');
    }
    if (!res.ok) {
      throw new Error(`http_${res.status}`);
    }
    const data = (await res.json()) as unknown;
    const names = this.extractBookmarkNames(data);
    const map = new Map<string, string>();
    for (const n of names) {
      map.set(n.toLowerCase(), n);
    }
    this.bookmarksCache.set(cacheKey, { time: Date.now(), mods: map });
    return Array.from(map.values());
  }

  async toggleBookmark(
    user: string,
    token: string,
    modName: string,
    enabled: boolean,
  ): Promise<{ bookmarked: boolean; bookmarks: string[] }> {
    const u = safeTrim(user);
    const t = safeTrim(token);
    const cleanMod = safeTrim(modName);
    if (!u || !t) {
      throw new Error('missing_credentials');
    }
    if (!cleanMod || !this.isValidPortalModId(cleanMod)) {
      throw new Error('invalid_mod_id');
    }

    const qs = new URLSearchParams({
      username: u,
      token: t,
      mod: cleanMod,
      state: enabled ? 'on' : 'off',
    });
    const res = await fetch(`${BASE}/api/bookmarks/toggle?${qs.toString()}`, {
      method: 'POST',
      headers: {
        'User-Agent': 'FactorioControlCenter/2.0',
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(BOOKMARKS_REQUEST_TIMEOUT_MS),
    });
    if (res.status === 401 || res.status === 403) {
      throw new Error('invalid_credentials');
    }
    if (!res.ok) {
      throw new Error(`http_${res.status}`);
    }

    const cacheKey = u.toLowerCase();
    let entry = this.bookmarksCache.get(cacheKey);
    if (!entry) {
      entry = { time: Date.now(), mods: new Map<string, string>() };
      this.bookmarksCache.set(cacheKey, entry);
    }
    if (enabled) {
      entry.mods.set(cleanMod.toLowerCase(), cleanMod);
    } else {
      entry.mods.delete(cleanMod.toLowerCase());
    }
    entry.time = Date.now();

    return {
      bookmarked: enabled,
      bookmarks: Array.from(entry.mods.values()),
    };
  }

  invalidateCatalogCache(): void {
    this.catalogCache.clear();
    this.fullMetaCache.clear();
    this.bookmarksCache.clear();
  }

  lookupCatalogModTitle(modName: string): string {
    const target = safeTrim(modName).toLowerCase();
    if (!target) return '';
    for (const cached of this.catalogCache.values()) {
      const hit = cached.entries.find((e) => e.nameLower === target);
      if (hit?.item.title) return hit.item.title;
    }
    return '';
  }

  async fetchModDetails(
    modName: string,
    options?: { serverPath?: string; gameVersion?: string },
  ): Promise<ModPortalFullDetails> {
    const meta = await this.fetchFull(modName);
    const name = safeTrim(meta.name) || safeTrim(modName);
    const title = safeTrim(meta.title) || name;
    const owner = safeTrim(meta.owner);
    const summary = safeTrim(meta.summary);
    const description =
      typeof meta.description === 'string' ? meta.description : '';
    const faq = typeof meta.faq === 'string' ? meta.faq : '';
    const changelog = typeof meta.changelog === 'string' ? meta.changelog : '';
    const category = safeTrim(meta.category).toLowerCase() || 'no-category';
    const tags = Array.isArray(meta.tags)
      ? meta.tags.map((t) => safeTrim(t)).filter(Boolean)
      : [];
    const downloadsCount =
      typeof meta.downloads_count === 'number' &&
      Number.isFinite(meta.downloads_count)
        ? meta.downloads_count
        : 0;
    const createdAt = safeTrim(meta.created_at);
    const updatedAt = safeTrim(meta.updated_at);
    const homepage = safeTrim(meta.homepage);
    const sourceUrl = safeTrim(meta.source_url);
    const githubPath = safeTrim(meta.github_path);

    let license: ModPortalLicenseInfo | null = null;
    if (meta.license && typeof meta.license === 'object') {
      const licObj = meta.license as Record<string, unknown>;
      const licTitle = safeTrim(licObj.title) || safeTrim(licObj.name);
      const licUrl = safeTrim(licObj.url);
      if (licTitle) {
        license = { title: licTitle, url: licUrl };
      }
    }

    const thumbnail = this.normalizePortalThumbnail(meta.thumbnail);
    const images: ModPortalFullImage[] = [];
    if (Array.isArray(meta.images)) {
      for (const rawImg of meta.images) {
        if (!rawImg || typeof rawImg !== 'object') continue;
        const imgObj = rawImg as Record<string, unknown>;
        const url = safeTrim(imgObj.url);
        const thumb = safeTrim(imgObj.thumbnail) || url;
        const id = safeTrim(imgObj.id) || url;
        if (url) {
          images.push({ id, url, thumbnail: thumb });
        }
      }
    }

    let latestVersion = '';
    let releasedAt = updatedAt;
    if (Array.isArray(meta.releases) && meta.releases.length > 0) {
      const lastRel = meta.releases[meta.releases.length - 1] as Record<
        string,
        unknown
      >;
      latestVersion = safeTrim(lastRel?.version);
      const relDate = safeTrim(lastRel?.released_at);
      if (relDate) releasedAt = relDate;
    }

    const targetRel = this.resolveRelease(meta, options);
    const targetReleaseVersion = targetRel
      ? safeTrim(targetRel.version) || latestVersion
      : latestVersion;
    const targetInfo = targetRel ? this.releaseInfo(targetRel) : null;
    const rawDepsArr = Array.isArray(targetRel?.dependencies)
      ? targetRel.dependencies
      : Array.isArray(targetInfo?.dependencies)
        ? targetInfo.dependencies
        : [];
    const rawDependencies = rawDepsArr.map((d) => safeTrim(d)).filter(Boolean);

    return {
      name,
      title,
      owner,
      summary,
      description,
      faq,
      changelog,
      category,
      tags,
      downloads_count: downloadsCount,
      created_at: createdAt,
      updated_at: updatedAt,
      homepage,
      source_url: sourceUrl,
      github_path: githubPath,
      license,
      thumbnail,
      images,
      latest_version: latestVersion,
      released_at: releasedAt,
      requires_space_age: Boolean(meta.requires_space_age),
      target_release_version: targetReleaseVersion,
      raw_dependencies: rawDependencies,
    };
  }

  private async fetchCatalog(
    factorioMajorMinorVer: string,
    includeDeprecated = false,
    forceRefresh = false,
  ): Promise<CatalogIndexEntry[]> {
    const cacheKey = `${factorioMajorMinorVer || 'all'}:dep=${includeDeprecated ? '1' : '0'}`;
    if (forceRefresh) {
      this.invalidateCatalogCache();
    }
    const cached = this.catalogCache.get(cacheKey);
    if (cached && Date.now() - cached.time < CATALOG_CACHE_TTL_MS) {
      return cached.entries;
    }
    const existing = this.inFlightCatalog.get(cacheKey);
    if (existing) {
      return existing;
    }

    const req = (async () => {
      let lastErr: unknown;
      for (let attempt = 1; attempt <= 2; attempt++) {
        try {
          const qs = new URLSearchParams({
            page_size: 'max',
            hide_deprecated: includeDeprecated ? 'false' : 'true',
          });
          if (factorioMajorMinorVer) {
            qs.set('version', factorioMajorMinorVer);
          }
          const url = `${BASE}/api/mods?${qs.toString()}`;
          const res = await fetch(url, {
            headers: {
              'User-Agent': 'FactorioControlCenter/2.0',
              Accept: 'application/json',
            },
            signal: AbortSignal.timeout(CATALOG_REQUEST_TIMEOUT_MS),
          });
          if (!res.ok) {
            throw new Error(`http_${res.status}`);
          }
          const payload = (await res.json()) as {
            results?: Record<string, unknown>[];
          };
          const rawResults = Array.isArray(payload.results)
            ? payload.results
            : [];
          const entries: CatalogIndexEntry[] = [];
          for (const row of rawResults) {
            const name = safeTrim(row.name);
            if (!name || this.isBuiltin(name)) continue;
            const title = safeTrim(row.title) || name;
            const summary = safeTrim(row.summary);
            const owner = safeTrim(row.owner);
            const downloadsCount =
              typeof row.downloads_count === 'number' &&
              Number.isFinite(row.downloads_count)
                ? row.downloads_count
                : 0;
            const cachedThumb = this.thumbnailCache.get(name.toLowerCase());
            const thumbnail =
              this.normalizePortalThumbnail(row.thumbnail) ||
              (cachedThumb && Date.now() - cachedThumb.time < THUMB_CACHE_TTL_MS
                ? cachedThumb.thumb
                : '');
            const rawCat = safeTrim(row.category).toLowerCase();
            const category = rawCat || 'no-category';
            const requiresSpaceAge = Boolean(row.requires_space_age);
            const latestRel =
              row.latest_release && typeof row.latest_release === 'object'
                ? (row.latest_release as Record<string, unknown>)
                : null;
            const latestVersion = latestRel ? safeTrim(latestRel.version) : '';
            const releasedAt = latestRel ? safeTrim(latestRel.released_at) : '';
            const relFv = latestRel
              ? this.releaseFactorioVersion(latestRel)
              : '';
            const portalScore =
              typeof row.score === 'number' && Number.isFinite(row.score)
                ? row.score
                : 0;
            const releasedAtMs = releasedAt ? Date.parse(releasedAt) || 0 : 0;
            const item: ModPortalSearchItem = {
              name,
              title,
              summary,
              owner,
              downloads_count: downloadsCount,
              thumbnail,
              category,
              requires_space_age: requiresSpaceAge,
              latest_version: latestVersion,
              factorio_version: relFv || factorioMajorMinorVer,
              released_at: releasedAt,
            };
            entries.push({
              item,
              nameLower: name.toLowerCase(),
              titleLower: title.toLowerCase(),
              ownerLower: owner.toLowerCase(),
              summaryLower: summary.toLowerCase(),
              portalScore,
              releasedAtMs,
            });
          }
          this.catalogCache.set(cacheKey, { time: Date.now(), entries });
          return entries;
        } catch (err: unknown) {
          lastErr = err;
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 300));
          }
        }
      }
      throw lastErr instanceof Error
        ? lastErr
        : new Error(safeStr(lastErr, 'fetch_failed'));
    })();

    this.inFlightCatalog.set(cacheKey, req);
    try {
      return await req;
    } finally {
      this.inFlightCatalog.delete(cacheKey);
    }
  }

  async searchMods(
    query: string,
    options?: {
      factorioVersion?: string;
      gameVersion?: string;
      page?: number;
      limit?: number;
      sort?: ModPortalSortBy;
      onlyCompatible?: boolean;
      includeDeprecated?: boolean;
      spaceAgeMode?: 'neutral' | 'include' | 'exclude';
      includeCategories?: string[];
      excludeCategories?: string[];
      onlyBookmarked?: boolean;
      bookmarkedNamesLower?: Set<string> | Promise<Set<string>>;
      searchInDescription?: boolean;
      owner?: string;
      hideInstalled?: boolean;
      onlyInstalled?: boolean;
      installedNamesLower?: Set<string>;
      /** Caller-side predicate applied after built-in filters (e.g. "has update"). */
      extraFilter?: (item: ModPortalSearchItem) => boolean;
      /** Return names of every matched mod across all pages. */
      collectAllNames?: boolean;
      forceRefresh?: boolean;
    },
  ): Promise<{
    results: ModPortalSearchItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    factorioVersion: string;
    facets: ModPortalSearchFacets;
    allNames?: string[];
    installedVersions?: Record<string, string>;
  }> {
    let fv = '';
    if (options?.factorioVersion !== undefined) {
      const cleanFv = safeTrim(options.factorioVersion).toLowerCase();
      fv =
        cleanFv === 'all' || cleanFv === 'any'
          ? ''
          : this.factorioMajorMinor(cleanFv) || cleanFv;
    } else if (options?.onlyCompatible !== false) {
      fv = this.factorioMajorMinor(options?.gameVersion || '');
    }

    const limit = Math.max(1, Math.min(60, Math.floor(options?.limit || 40)));
    const includeDeprecated = Boolean(options?.includeDeprecated);
    const entries = await this.fetchCatalog(
      fv,
      includeDeprecated,
      Boolean(options?.forceRefresh),
    );

    const incCats = new Set(
      (options?.includeCategories || [])
        .map((c) => safeTrim(c).toLowerCase())
        .filter(Boolean),
    );
    const excCats = new Set(
      (options?.excludeCategories || [])
        .map((c) => safeTrim(c).toLowerCase())
        .filter(Boolean),
    );
    const spaceAgeMode = options?.spaceAgeMode || 'neutral';
    const onlyBookmarked = Boolean(options?.onlyBookmarked);
    const bookmarksSet =
      options?.bookmarkedNamesLower instanceof Promise
        ? await options.bookmarkedNamesLower
        : options?.bookmarkedNamesLower;
    const hideInstalled = Boolean(options?.hideInstalled);
    const onlyInstalled = !hideInstalled && Boolean(options?.onlyInstalled);
    const installedSet = options?.installedNamesLower;
    const extraFilter = options?.extraFilter;
    let ownerFilterLower = safeTrim(options?.owner).toLowerCase();

    const rawQuery = safeTrim(query);
    const parsedInput = rawQuery
      ? this.parseModInput(rawQuery)
      : { modName: '' };
    const effectiveQuery = parsedInput.modName || rawQuery;
    const qLowerRaw = effectiveQuery.toLowerCase();
    const rawTokens = qLowerRaw ? qLowerRaw.split(/\s+/).filter(Boolean) : [];
    const tokens: string[] = [];
    for (const tok of rawTokens) {
      if (tok.startsWith('owner:') && tok.length > 6) {
        ownerFilterLower = tok.slice(6);
      } else {
        tokens.push(tok);
      }
    }
    const qLower = tokens.join(' ');

    const matchesCategoryFilter = (cat: string): boolean => {
      const normalized = cat || 'no-category';
      if (excCats.has(normalized)) return false;
      if (incCats.size > 0 && !incCats.has(normalized)) return false;
      return true;
    };

    const matchesSpaceAgeFilter = (reqSa: boolean): boolean => {
      if (spaceAgeMode === 'include') return reqSa;
      if (spaceAgeMode === 'exclude') return !reqSa;
      return true;
    };

    const categoryCounts: Record<string, number> = {};
    let spaceAgeCount = 0;
    let bookmarkedCount = 0;

    const matched: { entry: CatalogIndexEntry; score: number }[] = [];
    for (const entry of entries) {
      if (ownerFilterLower && entry.ownerLower !== ownerFilterLower) {
        continue;
      }
      if (hideInstalled && installedSet?.has(entry.nameLower)) {
        continue;
      }
      if (onlyInstalled && !installedSet?.has(entry.nameLower)) {
        continue;
      }
      if (extraFilter && !extraFilter(entry.item)) {
        continue;
      }
      if (onlyBookmarked) {
        if (!bookmarksSet || !bookmarksSet.has(entry.nameLower)) continue;
      }

      let score = 0;
      if (tokens.length > 0) {
        let allMatched = true;
        let tokenScore = 0;
        for (const tok of tokens) {
          const inTitle = entry.titleLower.includes(tok);
          const inName = entry.nameLower.includes(tok);
          const inOwner = entry.ownerLower.includes(tok);
          const inSummary =
            options?.searchInDescription !== false &&
            entry.summaryLower.includes(tok);
          if (!inTitle && !inName && !inOwner && !inSummary) {
            allMatched = false;
            break;
          }
          if (inTitle || inName) tokenScore += 400;
          else if (inOwner) tokenScore += 200;
          else tokenScore += 80;
        }
        if (!allMatched) continue;

        score = tokenScore;
        if (entry.nameLower === qLower || entry.titleLower === qLower) {
          score += 10_000;
        } else if (
          entry.nameLower.startsWith(qLower) ||
          entry.titleLower.startsWith(qLower)
        ) {
          score += 5_000;
        } else if (
          entry.titleLower.includes(qLower) ||
          entry.nameLower.includes(qLower)
        ) {
          score += 2_500;
        }
        if (entry.ownerLower === qLower) {
          score += 1_500;
        }
        score += entry.portalScore * 15;
        score += Math.log10((entry.item.downloads_count || 0) + 1) * 80;
      }

      const catOk = matchesCategoryFilter(entry.item.category);
      const saOk = matchesSpaceAgeFilter(entry.item.requires_space_age);

      if (catOk && entry.item.requires_space_age) {
        spaceAgeCount += 1;
      }
      if (saOk) {
        const catKey = entry.item.category || 'no-category';
        categoryCounts[catKey] = (categoryCounts[catKey] || 0) + 1;
      }

      if (catOk && saOk) {
        if (bookmarksSet?.has(entry.nameLower)) {
          bookmarkedCount += 1;
        }
        matched.push({ entry, score });
      }
    }

    const sortBy: ModPortalSortBy = options?.sort || 'relevance';

    if (sortBy === 'downloads') {
      matched.sort(
        (a, b) =>
          b.entry.item.downloads_count - a.entry.item.downloads_count ||
          b.entry.portalScore - a.entry.portalScore,
      );
    } else if (sortBy === 'updated') {
      matched.sort(
        (a, b) =>
          b.entry.releasedAtMs - a.entry.releasedAtMs ||
          b.entry.item.downloads_count - a.entry.item.downloads_count,
      );
    } else if (sortBy === 'trending') {
      matched.sort(
        (a, b) =>
          b.entry.portalScore - a.entry.portalScore ||
          b.entry.item.downloads_count - a.entry.item.downloads_count,
      );
    } else if (tokens.length === 0) {
      matched.sort(
        (a, b) =>
          b.entry.releasedAtMs - a.entry.releasedAtMs ||
          b.entry.portalScore - a.entry.portalScore ||
          b.entry.item.downloads_count - a.entry.item.downloads_count,
      );
    } else {
      matched.sort(
        (a, b) =>
          b.score - a.score ||
          b.entry.portalScore - a.entry.portalScore ||
          b.entry.item.downloads_count - a.entry.item.downloads_count,
      );
    }

    const total = matched.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const safePage = Math.max(
      1,
      Math.min(totalPages, Math.floor(options?.page || 1)),
    );
    const offset = (safePage - 1) * limit;
    const pageItems = matched
      .slice(offset, offset + limit)
      .map((s) => s.entry.item);

    const missingThumbs = pageItems
      .filter((item) => !item.thumbnail)
      .map((item) => item.name);
    if (missingThumbs.length > 0) {
      const thumbs = await this.fetchThumbnails(missingThumbs);
      for (const item of pageItems) {
        if (!item.thumbnail && thumbs[item.name]) {
          item.thumbnail = thumbs[item.name];
        }
      }
    }

    return {
      results: pageItems,
      total,
      page: safePage,
      pageSize: limit,
      totalPages,
      factorioVersion: fv,
      facets: {
        space_age: spaceAgeCount,
        categories: categoryCounts,
        bookmarked: bookmarkedCount,
      },
      ...(options?.collectAllNames
        ? { allNames: matched.map((s) => s.entry.item.name) }
        : {}),
      ...(options?.collectAllNames && installedSet && installedSet.size > 0
        ? {
            installedVersions: Object.fromEntries(
              entries
                .filter(
                  (e) => installedSet.has(e.nameLower) && e.item.latest_version,
                )
                .map((e) => [e.item.name, e.item.latest_version]),
            ),
          }
        : {}),
    };
  }

  private async fetchSingleThumbnail(modName: string): Promise<string> {
    const clean = safeTrim(modName);
    const key = clean.toLowerCase();
    if (!clean || this.isBuiltin(key) || !this.isValidPortalModId(clean)) {
      return '';
    }
    const cached = this.thumbnailCache.get(key);
    if (cached && Date.now() - cached.time < THUMB_CACHE_TTL_MS) {
      return cached.thumb;
    }
    const inflight = this.inFlightThumb.get(key);
    if (inflight) {
      return inflight;
    }

    const req = (async () => {
      try {
        const url = `${BASE}/api/mods/${encodeURIComponent(clean)}`;
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'FactorioControlCenter/2.0',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(THUMB_REQUEST_TIMEOUT_MS),
        });
        if (!res.ok) {
          if (res.status === 404) {
            return this.rememberThumbnail(clean, '');
          }
          return '';
        }
        const data = (await res.json()) as Record<string, unknown>;
        return this.rememberThumbnail(clean, data.thumbnail);
      } catch {
        return '';
      }
    })();

    this.inFlightThumb.set(key, req);
    try {
      return await req;
    } finally {
      this.inFlightThumb.delete(key);
    }
  }

  async fetchThumbnails(names: string[]): Promise<Record<string, string>> {
    const unique: string[] = [];
    const seen = new Set<string>();
    for (const raw of names) {
      const clean = safeTrim(raw);
      const key = clean.toLowerCase();
      if (!clean || seen.has(key)) continue;
      seen.add(key);
      unique.push(clean);
      if (unique.length >= 40) break;
    }

    const out: Record<string, string> = {};
    let idx = 0;
    const concurrency = Math.min(12, unique.length);
    const workers = Array.from({ length: concurrency }, async () => {
      while (idx < unique.length) {
        const current = unique[idx++];
        if (!current) continue;
        const thumb = await this.fetchSingleThumbnail(current);
        out[current] = thumb;
      }
    });
    await Promise.all(workers);
    return out;
  }

  private escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
