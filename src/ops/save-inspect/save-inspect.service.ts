import { Injectable } from '@nestjs/common';
import StreamZip from 'node-stream-zip';
import { inflateSync } from 'zlib';

type ZipEntryLite = {
  name: string;
  size: number;
  compressedSize: number;
  isDirectory: boolean;
};

/** Mod entry from save header (major.minor.patch + optional CRC). */
export interface SaveModInfo {
  name: string;
  version: [number, number, number];
  crc: number;
}

/** Parsed Factorio save header (level-init.dat / level.dat / zlib level.dat0). */
export interface SaveHeaderInfo {
  factorio_version: [number, number, number, number];
  campaign: string;
  level_name: string;
  base_mod: string;
  difficulty: number;
  finished: boolean;
  player_won: boolean;
  next_level: string;
  can_continue: boolean;
  finished_but_continuing: boolean;
  saving_replay: boolean;
  allow_non_admin_debug_options: boolean;
  loaded_from: [number, number, number];
  loaded_from_build: number;
  allowed_commands: number;
  mods: SaveModInfo[];
}

export interface ZipMemberInfo {
  name: string;
  file_size: number;
  compress_size: number;
}

export interface SaveInspectResult {
  path: string;
  header: SaveHeaderInfo | null;
  header_error: string | null;
  header_source: string | null;
  members: ZipMemberInfo[];
  has_level_dat: boolean;
  has_level_init: boolean;
  script_output_files: string[];
}

/** Basic Factorio save.zip sanity check (after inspectSaveZip). */
export function validateFactorioSaveInspect(
  result: SaveInspectResult,
):
  | { ok: true }
  | { ok: false; error: 'invalid_save_zip' | 'invalid_save_archive' } {
  const headerError = String(result.header_error || '').trim();
  if (headerError.startsWith('bad_zip:')) {
    return { ok: false, error: 'invalid_save_zip' };
  }
  if (!result.has_level_dat && !result.has_level_init) {
    return { ok: false, error: 'invalid_save_archive' };
  }
  const header = result.header;
  if (!header) {
    return { ok: false, error: 'invalid_save_archive' };
  }
  const fv = header.factorio_version;
  if (
    !Array.isArray(fv) ||
    fv.length < 3 ||
    fv.some((n) => !Number.isFinite(n) || n < 0)
  ) {
    return { ok: false, error: 'invalid_save_archive' };
  }
  if (fv[0] > 99 || fv[1] > 999) {
    return { ok: false, error: 'invalid_save_archive' };
  }
  return { ok: true };
}

type VersionTuple = readonly number[];

function vLess(a: VersionTuple, b: VersionTuple): boolean {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const av = i < a.length ? a[i] : 0;
    const bv = i < b.length ? b[i] : 0;
    if (av < bv) return true;
    if (av > bv) return false;
  }
  return false;
}

function vGreater(a: VersionTuple, b: VersionTuple): boolean {
  return !vLess(a, b) && !versionsEqual(a, b);
}

function versionsEqual(a: VersionTuple, b: VersionTuple): boolean {
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) {
    if ((i < a.length ? a[i] : 0) !== (i < b.length ? b[i] : 0)) return false;
  }
  return true;
}

class BinaryReader {
  private pos = 0;

  constructor(private readonly buf: Buffer) {}

  readExact(n: number): Buffer {
    if (this.pos + n > this.buf.length) {
      throw new Error(`expected ${n} bytes, got ${this.buf.length - this.pos}`);
    }
    const chunk = this.buf.subarray(this.pos, this.pos + n);
    this.pos += n;
    return chunk;
  }

  readU8(): number {
    return this.readExact(1)[0];
  }
}

function readOptimUint(
  r: BinaryReader,
  game: VersionTuple,
  bitSize: 16 | 32,
): number {
  if (!vLess(game, [0, 14, 14, 0])) {
    const b0 = r.readU8();
    if (b0 !== 0xff) return b0;
  }
  const raw = r.readExact(bitSize / 8);
  if (bitSize === 16) return raw.readUInt16LE(0);
  return raw.readUInt32LE(0);
}

function readString(
  r: BinaryReader,
  game: VersionTuple,
  forceOptimized: boolean,
): string {
  let n: number;
  if (!vLess(game, [0, 16, 0, 0]) || forceOptimized) {
    n = readOptimUint(r, game, 32);
  } else {
    n = r.readExact(4).readUInt32LE(0);
  }
  if (n > 256 * 1024 * 1024) throw new Error('unreasonable string length');
  return r.readExact(n).toString('utf8');
}

function readVersion48(
  r: BinaryReader,
  game: VersionTuple,
): [number, number, number] {
  return [
    readOptimUint(r, game, 16),
    readOptimUint(r, game, 16),
    readOptimUint(r, game, 16),
  ];
}

function readMod(r: BinaryReader, game: VersionTuple): SaveModInfo {
  const name = readString(r, game, true);
  const ver = readVersion48(r, game);
  let crc = 0;
  if (game[0] >= 2 || vGreater(game, [0, 15, 0, 91])) {
    crc = r.readExact(4).readUInt32LE(0);
  }
  return { name, version: ver, crc };
}

function readStatsLegacy(r: BinaryReader): void {
  const n = r.readExact(4).readUInt32LE(0);
  for (let i = 0; i < n; i++) {
    r.readExact(1);
    for (let j = 0; j < 3; j++) {
      const rawLen = r.readExact(4).readUInt32LE(0);
      for (let k = 0; k < rawLen; k++) {
        r.readExact(2);
        r.readExact(4);
      }
    }
  }
}

export function readSaveHeaderFromBuffer(buf: Buffer): SaveHeaderInfo {
  const r = new BinaryReader(buf);
  const scratch = r.readExact(8);
  const fv: [number, number, number, number] = [
    scratch.readUInt16LE(0),
    scratch.readUInt16LE(2),
    scratch.readUInt16LE(4),
    scratch.readUInt16LE(6),
  ];

  const atLeast016 = !vLess(fv, [0, 16, 0, 0]);

  if (!vLess(fv, [0, 17, 0, 0])) {
    r.readExact(1);
  }

  const campaign = readString(r, fv, false);
  const level_name = readString(r, fv, false);
  const base_mod = readString(r, fv, false);

  const difficulty = r.readU8();
  const finished = r.readU8() !== 0;
  const player_won = r.readU8() !== 0;
  const next_level = readString(r, fv, false);

  let can_continue = false;
  let finished_but_continuing = false;
  if (!vLess(fv, [0, 12, 0, 0])) {
    can_continue = r.readU8() !== 0;
    finished_but_continuing = r.readU8() !== 0;
  }

  const saving_replay = r.readU8() !== 0;

  let allow_non_admin_debug_options = false;
  if (atLeast016) {
    allow_non_admin_debug_options = r.readU8() !== 0;
  }

  const loaded_from = readVersion48(r, fv);
  const loaded_from_build =
    fv[0] >= 2
      ? r.readExact(4).readUInt32LE(0)
      : r.readExact(2).readUInt16LE(0);
  let allowed_commands = r.readU8();

  if (vLess(fv, [0, 13, 0, 87])) {
    allowed_commands = allowed_commands === 0 ? 2 : 1;
  }

  if (vLess(fv, [0, 13, 0, 42])) {
    readStatsLegacy(r);
  }

  if (fv[0] >= 2) {
    r.readExact(4);
  }

  const modCount = atLeast016
    ? readOptimUint(r, fv, 32)
    : r.readExact(4).readUInt32LE(0);

  const mods: SaveModInfo[] = [];
  for (let i = 0; i < modCount; i++) {
    mods.push(readMod(r, fv));
  }

  return {
    factorio_version: fv,
    campaign,
    level_name,
    base_mod,
    difficulty,
    finished,
    player_won,
    next_level,
    can_continue,
    finished_but_continuing,
    saving_replay,
    allow_non_admin_debug_options,
    loaded_from,
    loaded_from_build,
    allowed_commands,
    mods,
  };
}

function errLabel(e: unknown): string {
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e) return e;
  return e != null && typeof e === 'object' && 'constructor' in e
    ? (e as { constructor: { name: string } }).constructor.name
    : String(e);
}

function normMember(fn: string): string {
  return fn.replace(/\\/g, '/');
}

function zipMembersByBasename(
  entries: ZipEntryLite[],
): Map<string, ZipEntryLite> {
  const out = new Map<string, ZipEntryLite>();
  for (const zi of entries) {
    const base = normMember(zi.name).split('/').pop()!;
    out.set(base, zi);
  }
  return out;
}

function memberPathsForBasename(
  entries: ZipEntryLite[],
  basename: string,
): string[] {
  const out: string[] = [];
  for (const zi of entries) {
    if (zi.isDirectory) continue;
    const n = normMember(zi.name);
    if (n === basename || n.endsWith(`/${basename}`)) out.push(n);
  }
  out.sort((a, b) => {
    const da = a.split('/').length;
    const db = b.split('/').length;
    if (da !== db) return da - db;
    if (a.length !== b.length) return a.length - b.length;
    return a.toLowerCase().localeCompare(b.toLowerCase());
  });
  return out;
}

function levelDat0Paths(entries: ZipEntryLite[]): string[] {
  return memberPathsForBasename(entries, 'level.dat0');
}

function pickDat0NextToInit(
  initPaths: string[],
  dat0Paths: string[],
): string | null {
  if (dat0Paths.length === 0) return null;
  if (initPaths.length > 0) {
    const initDir = normMember(initPaths[0]).split('/').slice(0, -1).join('/');
    for (const d of dat0Paths) {
      const dDir = normMember(d).split('/').slice(0, -1).join('/');
      if (dDir === initDir) return d;
    }
  }
  return dat0Paths[0];
}

function tryHeaderFromZlibLevelDat0(raw: Buffer): {
  header: SaveHeaderInfo | null;
  error: string | null;
} {
  if (raw.length < 2 || raw[0] !== 0x78) {
    return { header: null, error: 'level.dat0_not_zlib' };
  }
  try {
    const decompressed = inflateSync(raw);
    try {
      return { header: readSaveHeaderFromBuffer(decompressed), error: null };
    } catch (e) {
      return { header: null, error: errLabel(e) };
    }
  } catch (e) {
    return { header: null, error: `zlib:${errLabel(e)}` };
  }
}

export function saveModVersionStr(ver: [number, number, number]): string {
  return ver.map(String).join('.');
}

/** Public Factorio version from save header (4th field is build id, not patch). */
export function saveFactorioVersionStr(
  ver: [number, number, number, number] | number[],
): string {
  return ver.slice(0, 3).map(String).join('.');
}

type HeaderCandidate = [
  priority: number,
  key: string,
  source: string,
  header: SaveHeaderInfo | null,
  err: string | null,
];

@Injectable()
export class SaveInspectService {
  async inspectSaveZip(path: string): Promise<SaveInspectResult> {
    const members: ZipMemberInfo[] = [];
    let hasLevelDat = false;
    let hasLevelLiteral = false;
    let hasLevelDat0 = false;
    let hasLevelInit = false;
    const scriptOutputs: string[] = [];
    let header: SaveHeaderInfo | null = null;
    let headerError: string | null = null;
    let headerSource: string | null = null;

    const zip = new StreamZip.async({ file: path });
    try {
      const entriesObj = await zip.entries();
      const entries: ZipEntryLite[] = Object.values(entriesObj).map((zi) => ({
        name: normMember(zi.name),
        size: zi.size,
        compressedSize: zi.compressedSize,
        isDirectory: zi.isDirectory,
      }));

      for (const zi of entries) {
        const fn = zi.name;
        const base = fn.split('/').pop()!;
        if (base === 'level.dat') hasLevelLiteral = true;
        if (base === 'level.dat0') hasLevelDat0 = true;
        if (base === 'level-init.dat') hasLevelInit = true;
        if (fn.startsWith('script-output/')) {
          if (!zi.isDirectory) scriptOutputs.push(fn);
        }
        members.push({
          name: fn,
          file_size: zi.size,
          compress_size: zi.compressedSize,
        });
      }
      members.sort((a, b) =>
        a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
      );

      const byBase = zipMembersByBasename(entries);
      const initPaths = memberPathsForBasename(entries, 'level-init.dat');
      const dat0Paths = levelDat0Paths(entries);
      const dat0Chosen = pickDat0NextToInit(initPaths, dat0Paths);

      const candidates: HeaderCandidate[] = [];

      const readEntry = async (entryPath: string): Promise<Buffer> => {
        const raw = await zip.entryData(entryPath);
        if (!raw?.length) throw new Error(`empty entry: ${entryPath}`);
        return raw;
      };

      if (dat0Chosen) {
        try {
          const raw0 = await readEntry(dat0Chosen);
          const { header: h0, error: e0 } = tryHeaderFromZlibLevelDat0(raw0);
          const label0 = `${dat0Chosen} (zlib)`;
          candidates.push([0, 'level.dat0', label0, h0, e0]);
        } catch (e) {
          candidates.push([
            0,
            'level.dat0',
            `${dat0Chosen} (zlib)`,
            null,
            errLabel(e),
          ]);
        }
      }

      for (const ldPath of memberPathsForBasename(entries, 'level.dat')) {
        const key = `level.dat:${ldPath}`;
        try {
          const raw = await readEntry(ldPath);
          const h = readSaveHeaderFromBuffer(raw);
          candidates.push([1, key, ldPath, h, null]);
        } catch (e) {
          candidates.push([1, key, ldPath, null, errLabel(e)]);
        }
      }

      if (
        byBase.has('level.dat') &&
        !candidates.some((c) => c[1].startsWith('level.dat:'))
      ) {
        try {
          const raw = await readEntry(byBase.get('level.dat')!.name);
          const h = readSaveHeaderFromBuffer(raw);
          candidates.push([1, 'level.dat:legacy', 'level.dat', h, null]);
        } catch (e) {
          candidates.push([
            1,
            'level.dat:legacy',
            'level.dat',
            null,
            errLabel(e),
          ]);
        }
      }

      for (const lip of initPaths) {
        const key = `level-init.dat:${lip}`;
        try {
          const raw = await readEntry(lip);
          const h = readSaveHeaderFromBuffer(raw);
          candidates.push([2, key, lip, h, null]);
        } catch (e) {
          candidates.push([2, key, lip, null, errLabel(e)]);
        }
      }

      if (
        byBase.has('level-init.dat') &&
        !candidates.some((c) => c[1].startsWith('level-init.dat:'))
      ) {
        try {
          const raw = await readEntry(byBase.get('level-init.dat')!.name);
          const h = readSaveHeaderFromBuffer(raw);
          candidates.push([
            2,
            'level-init.dat:legacy',
            'level-init.dat',
            h,
            null,
          ]);
        } catch (e) {
          candidates.push([
            2,
            'level-init.dat:legacy',
            'level-init.dat',
            null,
            errLabel(e),
          ]);
        }
      }

      const nonempty = candidates
        .filter((c): c is HeaderCandidate & { 3: SaveHeaderInfo } => {
          const h = c[3];
          return h != null && h.mods.length > 0;
        })
        .map((c) => [c[0], c[2], c[3]] as [number, string, SaveHeaderInfo]);

      let chosen: SaveHeaderInfo | null = null;
      let chosenSource: string | null = null;

      if (nonempty.length > 0) {
        nonempty.sort((a, b) => {
          if (a[0] !== b[0]) return a[0] - b[0];
          if (b[2].mods.length !== a[2].mods.length)
            return b[2].mods.length - a[2].mods.length;
          return a[1].localeCompare(b[1]);
        });
        chosen = nonempty[0][2];
        chosenSource = nonempty[0][1];
      } else {
        const sorted = [...candidates].sort((a, b) => a[0] - b[0]);
        for (const [, , src, h, err] of sorted) {
          if (h != null) {
            chosen = h;
            chosenSource = src;
            break;
          }
          if (err && headerError == null) {
            headerError = `${src}:${err}`;
          }
        }
      }

      if (chosen != null) {
        header = chosen;
        headerSource = chosenSource;
        headerError = null;
      } else if (candidates.length === 0) {
        headerError = 'no_level_init_or_level_dat';
      } else if (headerError == null) {
        headerError = 'no_level_init_or_level_dat';
      }

      hasLevelDat = hasLevelLiteral || hasLevelDat0;
    } catch (e) {
      const msg = errLabel(e);
      if (/invalid|corrupt|zip|central directory|ADM-ZIP/i.test(msg)) {
        headerError = `bad_zip:${msg}`;
      } else {
        headerError = msg;
      }
    } finally {
      await zip.close().catch(() => undefined);
    }

    return {
      path,
      header,
      header_error: headerError,
      header_source: headerSource,
      members,
      has_level_dat: hasLevelDat,
      has_level_init: hasLevelInit,
      script_output_files: [...scriptOutputs].sort(),
    };
  }
}
