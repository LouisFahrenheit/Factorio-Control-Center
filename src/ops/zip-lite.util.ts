import { closeSync, fstatSync, openSync, readSync } from 'fs';
import { inflateRawSync } from 'zlib';

/**
 * Minimal synchronous zip reader: parses only the central directory and reads
 * single entries on demand, so large mod archives are never loaded whole.
 * Supports stored (0) and deflate (8) entries. Returns null for zip64 or
 * malformed archives so callers can fall back to a full reader.
 */
export interface LiteZip {
  /** File entry names (directories excluded), as stored in the archive. */
  names: string[];
  readText(name: string): string;
}

interface LiteEntry {
  method: number;
  compressedSize: number;
  localHeaderOffset: number;
}

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;
const EOCD_MIN = 22;
const EOCD_MAX_SEARCH = EOCD_MIN + 0xffff;

function readAt(fd: number, position: number, length: number): Buffer {
  const buf = Buffer.alloc(length);
  const n = readSync(fd, buf, 0, length, position);
  if (n !== length) throw new Error('zip: unexpected end of file');
  return buf;
}

function readCentralDirectory(fd: number): Map<string, LiteEntry> | null {
  const size = fstatSync(fd).size;
  if (size < EOCD_MIN) return null;
  const tailLen = Math.min(size, EOCD_MAX_SEARCH);
  const tail = readAt(fd, size - tailLen, tailLen);

  let eocd = -1;
  for (let i = tailLen - EOCD_MIN; i >= 0; i -= 1) {
    if (tail.readUInt32LE(i) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;

  const count = tail.readUInt16LE(eocd + 10);
  const cdSize = tail.readUInt32LE(eocd + 12);
  const cdOffset = tail.readUInt32LE(eocd + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    return null; // zip64
  }
  if (cdOffset + cdSize > size) return null;

  const cd = readAt(fd, cdOffset, cdSize);
  const entries = new Map<string, LiteEntry>();
  let p = 0;
  for (let i = 0; i < count; i += 1) {
    if (p + 46 > cd.length || cd.readUInt32LE(p) !== CEN_SIG) return null;
    const method = cd.readUInt16LE(p + 10);
    const compressedSize = cd.readUInt32LE(p + 20);
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    const localHeaderOffset = cd.readUInt32LE(p + 42);
    if (compressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      return null; // zip64 entry
    }
    const name = cd.toString('utf8', p + 46, p + 46 + nameLen);
    if (!name.endsWith('/')) {
      entries.set(name, { method, compressedSize, localHeaderOffset });
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntry(zipPath: string, entry: LiteEntry): Buffer {
  const fd = openSync(zipPath, 'r');
  try {
    const loc = readAt(fd, entry.localHeaderOffset, 30);
    if (loc.readUInt32LE(0) !== LOC_SIG) throw new Error('zip: bad header');
    const dataStart =
      entry.localHeaderOffset +
      30 +
      loc.readUInt16LE(26) +
      loc.readUInt16LE(28);
    const raw = readAt(fd, dataStart, entry.compressedSize);
    if (entry.method === 0) return raw;
    if (entry.method === 8) return inflateRawSync(raw);
    throw new Error(`zip: unsupported compression method ${entry.method}`);
  } finally {
    closeSync(fd);
  }
}

export function openLiteZip(zipPath: string): LiteZip | null {
  let entries: Map<string, LiteEntry> | null;
  const fd = openSync(zipPath, 'r');
  try {
    entries = readCentralDirectory(fd);
  } finally {
    closeSync(fd);
  }
  if (!entries) return null;
  const map = entries;
  return {
    names: [...map.keys()],
    readText(name: string): string {
      const entry = map.get(name);
      if (!entry) throw new Error(`zip: entry not found: ${name}`);
      return readEntry(zipPath, entry).toString('utf8');
    },
  };
}
