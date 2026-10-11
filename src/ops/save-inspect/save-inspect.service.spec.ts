import {
  SaveInspectService,
  validateFactorioSaveInspect,
  saveModVersionStr,
  saveFactorioVersionStr,
  readSaveHeaderFromBuffer,
  SaveInspectResult,
  SaveHeaderInfo,
} from './save-inspect.service';
import AdmZip from 'adm-zip';
import { deflateSync } from 'zlib';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

function buildMockHeaderBuffer(
  version: [number, number, number, number] = [2, 0, 15, 79],
  mods: Array<{ name: string; ver: [number, number, number]; crc: number }> = [
    { name: 'base', ver: [2, 0, 15], crc: 123456 },
  ],
): Buffer {
  const parts: Buffer[] = [];

  // Version 8 bytes
  const verBuf = Buffer.alloc(8);
  verBuf.writeUInt16LE(version[0], 0);
  verBuf.writeUInt16LE(version[1], 2);
  verBuf.writeUInt16LE(version[2], 4);
  verBuf.writeUInt16LE(version[3], 6);
  parts.push(verBuf);

  // >= 0.17 byte
  parts.push(Buffer.from([0x00]));

  // campaign string (empty)
  parts.push(Buffer.from([0x00]));
  // level_name string (empty)
  parts.push(Buffer.from([0x00]));
  // base_mod string ("base")
  parts.push(Buffer.from([0x04, 0x62, 0x61, 0x73, 0x65]));

  // difficulty (1), finished (0), player_won (0)
  parts.push(Buffer.from([0x01, 0x00, 0x00]));

  // next_level string (empty)
  parts.push(Buffer.from([0x00]));

  // can_continue (1), finished_but_continuing (0)
  parts.push(Buffer.from([0x01, 0x00]));

  // saving_replay (0), allow_non_admin_debug_options (0)
  parts.push(Buffer.from([0x00, 0x00]));

  // loaded_from: 3 x optim uint 16 (< 255)
  parts.push(Buffer.from([version[0], version[1], version[2]]));

  // loaded_from_build (uint32LE for v >= 2)
  const buildBuf = Buffer.alloc(4);
  buildBuf.writeUInt32LE(version[3], 0);
  parts.push(buildBuf);

  // allowed_commands (1)
  parts.push(Buffer.from([0x01]));

  // fv[0] >= 2 dummy 4 bytes
  parts.push(Buffer.alloc(4));

  // modCount (optim uint32)
  parts.push(Buffer.from([mods.length]));

  // mods
  for (const mod of mods) {
    const nameBytes = Buffer.from(mod.name, 'utf8');
    parts.push(Buffer.from([nameBytes.length]));
    parts.push(nameBytes);
    // version 3 x optim uint16
    parts.push(Buffer.from([mod.ver[0], mod.ver[1], mod.ver[2]]));
    // crc uint32LE
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32LE(mod.crc, 0);
    parts.push(crcBuf);
  }

  return Buffer.concat(parts);
}

describe('SaveInspectService', () => {
  let service: SaveInspectService;
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-save-inspect-test-'));
    service = new SaveInspectService();
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe('saveModVersionStr and saveFactorioVersionStr', () => {
    it('formats mod version tuple as dotted string', () => {
      expect(saveModVersionStr([1, 2, 3])).toBe('1.2.3');
      expect(saveModVersionStr([0, 18, 0])).toBe('0.18.0');
    });

    it('formats 4-element factorio version tuple into 3-element semver', () => {
      expect(saveFactorioVersionStr([2, 0, 15, 79])).toBe('2.0.15');
      expect(saveFactorioVersionStr([1, 1, 100, 5000])).toBe('1.1.100');
    });
  });

  describe('validateFactorioSaveInspect', () => {
    const baseMockHeader: SaveHeaderInfo = {
      factorio_version: [2, 0, 15, 79],
      campaign: '',
      level_name: '',
      base_mod: 'base',
      difficulty: 1,
      finished: false,
      player_won: false,
      next_level: '',
      can_continue: true,
      finished_but_continuing: false,
      saving_replay: false,
      allow_non_admin_debug_options: false,
      loaded_from: [2, 0, 15],
      loaded_from_build: 79,
      allowed_commands: 1,
      mods: [],
    };

    it('detects corrupted zip archive error', () => {
      const inspectRes: SaveInspectResult = {
        path: '/save.zip',
        header: null,
        header_error: 'bad_zip: corrupted central directory',
        header_source: null,
        members: [],
        has_level_dat: false,
        has_level_init: false,
        script_output_files: [],
      };

      const val = validateFactorioSaveInspect(inspectRes);
      expect(val).toEqual({ ok: false, error: 'invalid_save_zip' });
    });

    it('rejects save without level.dat or level-init.dat', () => {
      const inspectRes: SaveInspectResult = {
        path: '/save.zip',
        header: { ...baseMockHeader },
        header_error: null,
        header_source: null,
        members: [],
        has_level_dat: false,
        has_level_init: false,
        script_output_files: [],
      };

      const val = validateFactorioSaveInspect(inspectRes);
      expect(val).toEqual({ ok: false, error: 'invalid_save_archive' });
    });

    it('rejects save with missing header or invalid version', () => {
      const noHeader: SaveInspectResult = {
        path: '/save.zip',
        header: null,
        header_error: null,
        header_source: null,
        members: [],
        has_level_dat: true,
        has_level_init: false,
        script_output_files: [],
      };
      expect(validateFactorioSaveInspect(noHeader)).toEqual({
        ok: false,
        error: 'invalid_save_archive',
      });

      const badVersion: SaveInspectResult = {
        ...noHeader,
        header: {
          ...baseMockHeader,
          factorio_version: [105, 0, 0, 0], // major > 99
        },
      };
      expect(validateFactorioSaveInspect(badVersion)).toEqual({
        ok: false,
        error: 'invalid_save_archive',
      });
    });

    it('approves a valid save inspection', () => {
      const valid: SaveInspectResult = {
        path: '/save.zip',
        header: { ...baseMockHeader },
        header_error: null,
        header_source: 'level.dat',
        members: [],
        has_level_dat: true,
        has_level_init: false,
        script_output_files: [],
      };

      expect(validateFactorioSaveInspect(valid)).toEqual({ ok: true });
    });
  });

  describe('readSaveHeaderFromBuffer', () => {
    it('parses modern Factorio 2.0 binary header buffer', () => {
      const buf = buildMockHeaderBuffer(
        [2, 0, 20, 85],
        [
          { name: 'base', ver: [2, 0, 20], crc: 111 },
          { name: 'space-age', ver: [2, 0, 20], crc: 222 },
        ],
      );

      const header = readSaveHeaderFromBuffer(buf);
      expect(header.factorio_version).toEqual([2, 0, 20, 85]);
      expect(header.base_mod).toBe('base');
      expect(header.loaded_from_build).toBe(85);
      expect(header.mods.length).toBe(2);
      expect(header.mods[0].name).toBe('base');
      expect(header.mods[1].name).toBe('space-age');
    });

    it('throws error when buffer is truncated', () => {
      const buf = Buffer.from([0x02, 0x00]);
      expect(() => readSaveHeaderFromBuffer(buf)).toThrow();
    });
  });

  describe('inspectSaveZip', () => {
    it('inspects a zip archive containing level.dat', async () => {
      const headerBuf = buildMockHeaderBuffer(
        [2, 0, 15, 79],
        [{ name: 'base', ver: [2, 0, 15], crc: 123 }],
      );

      const zip = new AdmZip();
      zip.addFile('mysave/level.dat', headerBuf);
      zip.addFile(
        'script-output/blueprint.txt',
        Buffer.from('blueprint-string'),
      );

      const zipPath = path.join(tempDir, 'valid-save.zip');
      zip.writeZip(zipPath);

      const res = await service.inspectSaveZip(zipPath);

      expect(res.has_level_dat).toBe(true);
      expect(res.header_error).toBeNull();
      expect(res.header).toBeDefined();
      expect(res.header?.factorio_version).toEqual([2, 0, 15, 79]);
      expect(res.script_output_files).toContain('script-output/blueprint.txt');
    });

    it('inspects a zip archive containing zlib level.dat0', async () => {
      const headerBuf = buildMockHeaderBuffer([2, 0, 10, 60]);
      const compressed0 = deflateSync(headerBuf);

      const zip = new AdmZip();
      zip.addFile('mysave/level.dat0', compressed0);

      const zipPath = path.join(tempDir, 'dat0-save.zip');
      zip.writeZip(zipPath);

      const res = await service.inspectSaveZip(zipPath);

      expect(res.has_level_dat).toBe(true);
      expect(res.header_error).toBeNull();
      expect(res.header).toBeDefined();
      expect(res.header?.factorio_version).toEqual([2, 0, 10, 60]);
    });

    it('returns error when zip has no level.dat or level-init.dat', async () => {
      const zip = new AdmZip();
      zip.addFile('mysave/random.txt', Buffer.from('hello'));

      const zipPath = path.join(tempDir, 'empty-save.zip');
      zip.writeZip(zipPath);

      const res = await service.inspectSaveZip(zipPath);

      expect(res.has_level_dat).toBe(false);
      expect(res.header).toBeNull();
      expect(res.header_error).toBe('no_level_init_or_level_dat');
    });

    it('handles corrupted zip files with error message', async () => {
      const corruptPath = path.join(tempDir, 'corrupt.zip');
      fs.writeFileSync(corruptPath, Buffer.from('not a zip file at all'));

      const res = await service.inspectSaveZip(corruptPath);

      expect(res.header).toBeNull();
      expect(res.header_error).toBe('Bad archive');
    });
  });
});
