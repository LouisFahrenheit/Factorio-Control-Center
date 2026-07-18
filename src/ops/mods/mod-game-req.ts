import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { compareVersions, gameVersion, hasSpaceAge } from '../ops-utils';
import { isOptionalDependencyString } from '../mod-deps';

const GAME_ENGINE_DEP_VER_RE =
  /^(?<name>.+?)\s*(?<op>>=|<=|!=|>|<|=)\s*(?<ver>.+)$/;

export interface ModGameUpgradeHint {
  name: string;
  current_factorio: string;
  required_factorio: string;
}

function stripOptionalDepChain(raw: string): {
  optional: boolean;
  rest: string;
} {
  let opt = false;
  let s = String(raw || '').trim();
  for (let i = 0; i < 16; i++) {
    let changed = false;
    if (s.length >= 10 && s.slice(0, 10).toLowerCase() === '(optional)') {
      opt = true;
      s = s.slice(10).trim();
      changed = true;
    } else if (s.startsWith('(?)')) {
      opt = true;
      s = s.slice(3).trim();
      changed = true;
    } else if (s.startsWith('?')) {
      opt = true;
      s = s.slice(1).trim();
      changed = true;
    } else if (s.startsWith('~')) {
      s = s.slice(1).trim();
      changed = true;
    }
    if (!changed) break;
  }
  return { optional: opt, rest: s };
}

function parseRequiredGameEngineDep(
  raw: string,
): { name: string; op: string; ver: string } | null {
  const { optional, rest } = stripOptionalDepChain(raw);
  if (optional || !rest || rest.startsWith('!')) return null;
  const m = GAME_ENGINE_DEP_VER_RE.exec(rest);
  if (!m?.groups?.name) return null;
  const name = String(m.groups.name).trim().toLowerCase();
  if (name !== 'base' && name !== 'space-age') return null;
  return {
    name,
    op: String(m.groups.op || '').trim(),
    ver: String(m.groups.ver || '').trim(),
  };
}

function stripFactorioVersionSpecPrefix(spec: string): string {
  let s = String(spec || '').trim();
  while (s && '>=<!~'.includes(s[0])) s = s.slice(1).trim();
  if (!s) return '';
  for (const delim of [' ', ',', ';']) {
    if (s.includes(delim)) {
      const head = s.split(delim, 1)[0]?.trim() || '';
      if (head && /^\d/.test(head)) {
        s = head;
        break;
      }
    }
  }
  if (s.includes('-')) {
    const [left, right] = s.split('-', 2);
    if (
      left?.trim() &&
      /^\d/.test(left.trim()) &&
      right?.trim() &&
      /^\d/.test(right.trim())
    ) {
      s = left.trim();
    }
  }
  return s;
}

function versionTuple(s: string): number[] {
  const cleaned = String(s || '')
    .replace(/\s+SA\s*$/i, '')
    .trim();
  if (!cleaned) return [];
  const out: number[] = [];
  for (const x of cleaned.split('.')) {
    const n = parseInt(x, 10);
    if (Number.isNaN(n)) break;
    out.push(n);
  }
  return out;
}

function tupleGePadded(a: number[], b: number[]): boolean {
  if (!b.length) return true;
  if (!a.length) return false;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av > bv;
  }
  return true;
}

function installedMeetsVersionOp(
  inst: number[],
  op: string,
  req: number[],
): boolean {
  if (!req.length) return true;
  if (!inst.length) return false;
  if (op === '>=') return tupleGePadded(inst, req);
  if (op === '=') {
    const n = Math.max(inst.length, req.length);
    for (let i = 0; i < n; i++)
      if ((inst[i] ?? 0) !== (req[i] ?? 0)) return false;
    return true;
  }
  if (op === '>') {
    const n = Math.max(inst.length, req.length);
    for (let i = 0; i < n; i++) {
      const av = inst[i] ?? 0;
      const bv = req[i] ?? 0;
      if (av !== bv) return av > bv;
    }
    return false;
  }
  return true;
}

function summarizeEngineBounds(
  bounds: { op: string; ver: string }[],
  label: string,
): string {
  if (!bounds.length) return '';
  let geMax: number[] = [];
  const strictGt: number[][] = [];
  const eqParts: string[] = [];
  for (const { op, ver } of bounds) {
    const tok = stripFactorioVersionSpecPrefix(ver);
    const vt = versionTuple(tok);
    if (!vt.length) continue;
    if (op === '>=') {
      if (!geMax.length || tupleGePadded(vt, geMax)) geMax = vt;
    } else if (op === '>') {
      strictGt.push(vt);
    } else if (op === '=') {
      eqParts.push(`${label} = ${vt.join('.')}`);
    }
  }
  const parts: string[] = [];
  if (geMax.length) parts.push(`${label} ≥ ${geMax.join('.')}`);
  for (const vt of strictGt) parts.push(`${label} > ${vt.join('.')}`);
  parts.push(...eqParts);
  return parts.join('; ');
}

export function installedBaseSpaceAgeVersions(serverPath: string): {
  base: string;
  spaceAge: string;
} {
  let base = '';
  let spaceAge = '';
  try {
    const baseInfo = join(serverPath, 'data', 'base', 'info.json');
    if (existsSync(baseInfo)) {
      const raw = JSON.parse(readFileSync(baseInfo, 'utf-8')) as {
        version?: unknown;
      };
      base = String(raw.version || '').trim();
    }
  } catch {
    /* ignore */
  }
  try {
    const saInfo = join(serverPath, 'data', 'space-age', 'info.json');
    if (existsSync(saInfo)) {
      const raw = JSON.parse(readFileSync(saInfo, 'utf-8')) as {
        version?: unknown;
      };
      spaceAge = String(raw.version || '').trim();
    }
  } catch {
    /* ignore */
  }
  return { base, spaceAge };
}

function releaseInfoJson(
  release: Record<string, unknown> | null | undefined,
): Record<string, unknown> | null {
  if (!release) return null;
  const infoRaw = release.info_json;
  if (typeof infoRaw === 'string' && infoRaw.trim()) {
    try {
      return JSON.parse(infoRaw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (infoRaw && typeof infoRaw === 'object')
    return infoRaw as Record<string, unknown>;
  return null;
}

function releaseFactorioRequirementString(
  release: Record<string, unknown>,
): string {
  const info = releaseInfoJson(release);
  if (!info) return '';
  const raw = info.factorio_version;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return String((raw as Record<string, unknown>).base || '').trim();
  }
  return String(raw || '').trim();
}

/** True if installed base/space-age builds are below portal release requirements. */
export function gameBelowModFactorioReq(
  serverPath: string,
  release: Record<string, unknown>,
): { below: boolean; current: string; required: string } {
  const { base: baseCur, spaceAge: saCur } =
    installedBaseSpaceAgeVersions(serverPath);
  const baseCurT = versionTuple(baseCur);
  const saCurT = versionTuple(saCur);

  const baseBounds: { op: string; ver: string }[] = [];
  const saBounds: { op: string; ver: string }[] = [];

  const fv = releaseFactorioRequirementString(release);
  if (fv) {
    const tok = stripFactorioVersionSpecPrefix(fv);
    if (tok) baseBounds.push({ op: '>=', ver: tok });
  }

  const info = releaseInfoJson(release);
  const deps = info?.dependencies;
  if (Array.isArray(deps)) {
    for (const raw of deps) {
      if (isOptionalDependencyString(String(raw || ''))) continue;
      const parsed = parseRequiredGameEngineDep(String(raw || ''));
      if (!parsed) continue;
      if (parsed.name === 'base')
        baseBounds.push({ op: parsed.op, ver: parsed.ver });
      else if (parsed.name === 'space-age')
        saBounds.push({ op: parsed.op, ver: parsed.ver });
    }
  }

  if (!baseBounds.length && !saBounds.length) {
    return { below: false, current: '', required: '' };
  }

  let below = false;
  for (const { op, ver } of baseBounds) {
    const reqT = versionTuple(stripFactorioVersionSpecPrefix(ver));
    if (!reqT.length) continue;
    if (!installedMeetsVersionOp(baseCurT, op, reqT)) {
      below = true;
      break;
    }
  }

  if (!below && hasSpaceAge(serverPath)) {
    for (const { op, ver } of saBounds) {
      const reqT = versionTuple(stripFactorioVersionSpecPrefix(ver));
      if (!reqT.length) continue;
      if (!saCurT.length || !installedMeetsVersionOp(saCurT, op, reqT)) {
        below = true;
        break;
      }
    }
  }

  const curParts: string[] = [];
  if (baseCur) curParts.push(`base ${baseCur}`);
  if (saCur && hasSpaceAge(serverPath)) curParts.push(`space-age ${saCur}`);
  const cur = curParts.length ? curParts.join(', ') : gameVersion(serverPath);

  const reqParts = [
    summarizeEngineBounds(baseBounds, 'base'),
    summarizeEngineBounds(saBounds, 'space-age'),
  ].filter(Boolean);
  const required = reqParts.join('; ') || fv || '?';

  return { below, current: cur, required };
}

export function firstPlanItemRequiringNewerGame(
  serverPath: string,
  planItems: { name?: string; release?: Record<string, unknown> }[],
): { mod: string; current: string; required: string } | null {
  for (const item of planItems) {
    const rel = item.release || {};
    const { below, current, required } = gameBelowModFactorioReq(
      serverPath,
      rel,
    );
    if (below) {
      return { mod: String(item.name || '').trim() || '?', current, required };
    }
  }
  return null;
}
