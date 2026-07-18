import type { InstanceItem } from '../types/instance';

export function pickFreePort(preferred: number, usedSet: Set<number>): number {
  let p = Number(preferred);
  if (!Number.isInteger(p) || p < 1 || p > 65535) p = 1;
  for (let cur = p; cur <= 65535; cur += 1) {
    if (!usedSet.has(cur)) return cur;
  }
  for (let cur = 1024; cur < p; cur += 1) {
    if (!usedSet.has(cur)) return cur;
  }
  return p;
}

export function suggestFreeInstancePorts(rows: InstanceItem[]): { gamePort: number; rconPort: number } {
  const usedGame = new Set<number>();
  const usedRcon = new Set<number>();
  rows.forEach((it) => {
    const gp = Number(String(it.port || '').trim());
    if (Number.isInteger(gp) && gp >= 1 && gp <= 65535) usedGame.add(gp);
    const rp = Number(String(it.rconPort || '').trim());
    if (Number.isInteger(rp) && rp >= 1 && rp <= 65535) usedRcon.add(rp);
  });
  return {
    gamePort: pickFreePort(34197, usedGame),
    rconPort: pickFreePort(27015, usedRcon),
  };
}

export function generateRconPassword(): string {
  try {
    const bytes = new Uint8Array(18);
    (window.crypto || (window as unknown as { msCrypto?: Crypto }).msCrypto)!.getRandomValues(bytes);
    let out = '';
    for (let i = 0; i < bytes.length; i += 1) {
      out += 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[(bytes[i] || 0) % 62];
    }
    return out;
  } catch {
    return 'rcon_' + Math.random().toString(36).slice(2, 18);
  }
}

export function cmpVersionsDesc(a: string, b: string): number {
  const pa = String(a || '')
    .split('.')
    .map((x) => parseInt(x, 10));
  const pb = String(b || '')
    .split('.')
    .map((x) => parseInt(x, 10));
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i += 1) {
    const va = Number.isFinite(pa[i]) ? pa[i] : 0;
    const vb = Number.isFinite(pb[i]) ? pb[i] : 0;
    if (va !== vb) return vb - va;
  }
  return 0;
}

export interface ReleaseVersions {
  stable: string[];
  experimental: string[];
}

export function collectReleaseVersions(raw: unknown): ReleaseVersions {
  const stable: string[] = [];
  const experimental: string[] = [];
  const seenStable = new Set<string>();
  const seenExperimental = new Set<string>();
  const putStable = (v: unknown) => {
    const s = String(v || '').trim();
    if (!/^\d+(?:\.\d+){1,3}$/.test(s)) return;
    if (seenStable.has(s)) return;
    seenStable.add(s);
    stable.push(s);
  };
  const putExperimental = (v: unknown) => {
    const s = String(v || '').trim();
    if (!/^\d+(?:\.\d+){1,3}$/.test(s)) return;
    if (seenExperimental.has(s) || seenStable.has(s)) return;
    seenExperimental.add(s);
    experimental.push(s);
  };
  if (raw && typeof raw === 'object' && Array.isArray((raw as { stable?: unknown }).stable)) {
    const r = raw as { stable?: unknown[]; experimental?: unknown[] };
    r.stable?.forEach((v) => putStable(v));
    if (Array.isArray(r.experimental)) r.experimental.forEach((v) => putExperimental(v));
    stable.sort(cmpVersionsDesc);
    experimental.sort(cmpVersionsDesc);
    return { stable, experimental };
  }
  const walk = (node: unknown) => {
    if (!node) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (typeof node === 'object') {
      Object.keys(node as object).forEach((k) => {
        putStable(k);
        walk((node as Record<string, unknown>)[k]);
      });
      return;
    }
    putStable(node);
  };
  walk(raw);
  stable.sort(cmpVersionsDesc);
  return { stable, experimental };
}

export function mergeReleaseVersionList(
  stable: string[],
  experimental: string[],
  includeExperimental: boolean,
): { merged: string[]; expSet: Set<string> } {
  const expSet = new Set(experimental);
  const seen = new Set<string>();
  const merged: string[] = [];
  const add = (v: string) => {
    const s = String(v || '').trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    merged.push(s);
  };
  stable.forEach((v) => {
    if (!includeExperimental && expSet.has(String(v || '').trim())) return;
    add(v);
  });
  if (includeExperimental) expSet.forEach((v) => add(v));
  merged.sort(cmpVersionsDesc);
  return { merged, expSet };
}

export function versionOptionLabel(
  version: string,
  experimental: boolean,
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  return experimental ? t('instances_download_version_experimental', version) : version;
}

export interface InstanceEditorForm {
  name: string;
  serverPath: string;
  ip: string;
  port: string;
  rconPort: string;
  rconPassword: string;
  autostartServer: boolean;
  autoEnterPanel: boolean;
  blockUpdates: boolean;
  experimentalUpdates: boolean;
  downloadServerPackage: boolean;
  packageBuild: string;
  packageVersion: string;
  packageVersionCustom: string;
  showExperimental: boolean;
}

export function emptyEditorForm(rows: InstanceItem[]): InstanceEditorForm {
  const ports = suggestFreeInstancePorts(rows);
  return {
    name: '',
    serverPath: '',
    ip: '0.0.0.0',
    port: String(ports.gamePort),
    rconPort: String(ports.rconPort),
    rconPassword: generateRconPassword(),
    autostartServer: false,
    autoEnterPanel: false,
    blockUpdates: false,
    experimentalUpdates: false,
    downloadServerPackage: false,
    packageBuild: 'expansion',
    packageVersion: 'latest',
    packageVersionCustom: '',
    showExperimental: false,
  };
}

export function editorFormFromItem(item: InstanceItem): InstanceEditorForm {
  return {
    name: String(item.name || ''),
    serverPath: String(item.serverPath || ''),
    ip: String(item.ip || '0.0.0.0'),
    port: String(item.port || '34197'),
    rconPort: String(item.rconPort || '27015'),
    rconPassword: String(item.rconPassword || ''),
    autostartServer: !!item.autostartServer,
    autoEnterPanel: !!item.autoEnterPanel,
    blockUpdates: !!item.blockUpdates,
    experimentalUpdates: !!item.experimentalUpdates,
    downloadServerPackage: false,
    packageBuild: 'expansion',
    packageVersion: 'latest',
    packageVersionCustom: '',
    showExperimental: false,
  };
}

export interface BootstrapStatus {
  ok?: boolean;
  phase?: string;
  error?: string;
  error_args?: (string | number)[];
  download_cur?: number;
  download_tot?: number;
  server_path?: string;
  added_id?: string;
}
