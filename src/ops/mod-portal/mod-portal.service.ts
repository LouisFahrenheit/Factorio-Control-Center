import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import { createWriteStream, existsSync, readdirSync, unlinkSync } from 'fs';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { PathManager } from '../path-manager';

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

type VerifyCacheEntry = {
  ts: number;
  ok: boolean;
  username: string;
  ttlMs: number;
};

@Injectable()
export class ModPortalService {
  private verifyCache = new Map<string, VerifyCacheEntry>();
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

  modIdFromInput(raw: string): string {
    let s = (raw || '').trim();
    if (!s) return '';
    if (s.includes('factorio.com')) {
      const m = /\/mod\/([^/?#]+)/i.exec(s.replace(/\\/g, '/'));
      if (m) {
        try {
          s = decodeURIComponent(m[1].trim());
        } catch {
          s = m[1].trim();
        }
        return this.isValidPortalModId(s) ? s : '';
      }
    }
    s = s.replace(/^mod\s*=\s*/i, '').trim();
    return this.isValidPortalModId(s) ? s : '';
  }

  isValidPortalModId(mod: string): boolean {
    const s = (mod || '').trim();
    return !!s && /^[A-Za-z0-9_ \-]+$/.test(s);
  }

  async fetchFull(modName: string): Promise<Record<string, unknown>> {
    const url = `${BASE}/api/mods/${encodeURIComponent(modName)}/full`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'FactorioControlCenter/2.0' },
    });
    if (!res.ok) throw new Error(`http_${res.status}`);
    return (await res.json()) as Record<string, unknown>;
  }

  lastRelease(meta: Record<string, unknown>): Record<string, unknown> | null {
    const rels = meta.releases;
    if (!Array.isArray(rels) || rels.length === 0) return null;
    return rels[rels.length - 1] as Record<string, unknown>;
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
