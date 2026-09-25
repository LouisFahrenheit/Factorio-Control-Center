import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { createWriteStream, existsSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { PathManager } from '../path-manager';
import { gameVersion } from '../ops-utils';
import { gameBelowModFactorioReq } from '../mods/mod-game-req';

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
    const zipMatch =
      /^([A-Za-z0-9_\- ]+?)_(\d+(?:\.\d+)+)(?:\.zip)?$/i.exec(s);
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
    return !!s && /^[A-Za-z0-9_ \-]+$/.test(s);
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
        : new Error(String(lastErr || 'fetch_failed'));
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
        String((raw as Record<string, unknown>).base || ''),
      );
    }
    return this.factorioMajorMinor(String(raw || ''));
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
      const match = rels.find(
        (r) => String(r.version || '').trim() === targetVer,
      );
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
        if (options?.serverPath) {
          const compatible = matchingFv.filter(
            (r) => !gameBelowModFactorioReq(options.serverPath!, r).below,
          );
          if (compatible.length > 0) {
            return compatible.sort((a, b) =>
              this.versionNewer(
                String(a.version || ''),
                String(b.version || ''),
              )
                ? -1
                : 1,
            )[0];
          }
        }
        return matchingFv.sort((a, b) =>
          this.versionNewer(
            String(a.version || ''),
            String(b.version || ''),
          )
            ? -1
            : 1,
        )[0];
      }
    }

    // Fallback: highest version overall
    return (
      rels.slice().sort((a, b) =>
        this.versionNewer(
          String(a.version || ''),
          String(b.version || ''),
        )
          ? -1
          : 1,
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
      const ver = String(r.version || '').trim();
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
        released_at: String(r.released_at || ''),
        file_name: String(r.file_name || ''),
        sha1: String(r.sha1 || ''),
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
    const dl = String(release.download_url || '');
    const fileName = String(release.file_name || '');
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
    const reader = res.body.getReader();
    let cur = 0;
    try {
      while (true) {
        if (shouldAbort?.()) {
          ac.abort();
          await reader.cancel().catch(() => undefined);
          throw new Error('cancelled');
        }
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = Buffer.from(value);
        hash.update(chunk);
        ws.write(chunk);
        cur += chunk.length;
        onProgress?.(cur, total || cur);
      }
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
    await new Promise<void>((resolve, reject) => {
      ws.end((e?: Error) => (e ? reject(e) : resolve()));
    });
    const expected = String(release.sha1 || '').toLowerCase();
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
      const data = JSON.parse(
        require('fs').readFileSync(path, 'utf-8'),
      ) as Record<string, string>;
      const u = (data['service-username'] || data.username || '').trim();
      const t = (data['service-token'] || data.token || '').trim();
      if (u && t) return { user: u, token: t };
    } catch {
      /* ignore */
    }
    return null;
  }

  private escapeRe(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
