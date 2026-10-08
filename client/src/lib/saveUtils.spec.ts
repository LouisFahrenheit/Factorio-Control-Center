import { describe, it, expect } from 'vitest';
import {
  saveDisplayLabel,
  filterSaveRows,
  normalizeSaveZipName,
  localizeSaveRenameError,
  localizeCreateSaveError,
  buildUniqueQuickSaveName,
  versionEqual,
  buildSaveModCompareRows,
} from './saveUtils';

describe('saveUtils lib', () => {
  describe('saveDisplayLabel', () => {
    it('strips .zip suffix case-insensitively', () => {
      expect(saveDisplayLabel('my_world.zip')).toBe('my_world');
      expect(saveDisplayLabel('MY_WORLD.ZIP')).toBe('MY_WORLD');
      expect(saveDisplayLabel('save_without_ext')).toBe('save_without_ext');
    });
  });

  describe('filterSaveRows', () => {
    const rows = [
      { name: 'alpha_world.zip' },
      { name: 'beta_test.zip' },
      { name: 'gamma_run.zip' },
    ];

    it('returns all rows if query is empty or whitespace', () => {
      expect(filterSaveRows(rows, '')).toEqual(rows);
      expect(filterSaveRows(rows, '   ')).toEqual(rows);
    });

    it('filters rows by save name or label matching query', () => {
      expect(filterSaveRows(rows, 'alpha')).toEqual([{ name: 'alpha_world.zip' }]);
      expect(filterSaveRows(rows, 'TEST')).toEqual([{ name: 'beta_test.zip' }]);
      expect(filterSaveRows(rows, 'nonexistent')).toEqual([]);
    });
  });

  describe('normalizeSaveZipName', () => {
    it('normalizes valid save file names with .zip extension', () => {
      expect(normalizeSaveZipName('my_save')).toBe('my_save.zip');
      expect(normalizeSaveZipName('my_save.zip')).toBe('my_save.zip');
      expect(normalizeSaveZipName('Мой мир 2.0')).toBe('Мой мир 2.0.zip');
    });

    it('rejects empty strings or dot-only strings', () => {
      expect(normalizeSaveZipName('')).toBeNull();
      expect(normalizeSaveZipName('   ')).toBeNull();
      expect(normalizeSaveZipName('.')).toBeNull();
      expect(normalizeSaveZipName('..')).toBeNull();
      expect(normalizeSaveZipName('...')).toBeNull();
    });

    it('rejects illegal path characters', () => {
      expect(normalizeSaveZipName('bad/name')).toBeNull();
      expect(normalizeSaveZipName('bad\\name')).toBeNull();
      expect(normalizeSaveZipName('name:test')).toBeNull();
      expect(normalizeSaveZipName('name*test')).toBeNull();
      expect(normalizeSaveZipName('name?test')).toBeNull();
      expect(normalizeSaveZipName('name"test')).toBeNull();
      expect(normalizeSaveZipName('name<test>')).toBeNull();
      expect(normalizeSaveZipName('name|test')).toBeNull();
    });
  });

  describe('localizeSaveRenameError', () => {
    const t = (key: string, ...args: (string | number)[]) =>
      args.length ? `${key}:${args.join(',')}` : `loc:${key}`;

    it('returns empty string on empty error', () => {
      expect(localizeSaveRenameError('', t)).toBe('');
    });

    it('passes targetName parameter when error is exists', () => {
      expect(localizeSaveRenameError('exists', t, 'save2.zip')).toBe(
        'saves_manager_rename_exists:save2.zip',
      );
    });

    it('localizes other standard errors', () => {
      expect(localizeSaveRenameError('invalid_name', t)).toBe(
        'loc:saves_manager_rename_invalid',
      );
    });
  });

  describe('localizeCreateSaveError', () => {
    const t = (key: string) => `loc:${key}`;

    it('maps known create save error keys', () => {
      expect(localizeCreateSaveError('invalid_name', t)).toBe(
        'loc:saves_manager_upload_invalid_name',
      );
      expect(localizeCreateSaveError('invalid_save_archive', t)).toBe(
        'loc:saves_manager_upload_invalid_archive',
      );
      expect(localizeCreateSaveError('invalid_save_zip', t)).toBe(
        'loc:saves_manager_upload_invalid_zip',
      );
      expect(localizeCreateSaveError('exists', t)).toBe(
        'loc:saves_manager_upload_exists',
      );
      expect(localizeCreateSaveError('rename_failed', t)).toBe(
        'loc:create_save_rename_failed',
      );
    });

    it('falls back to raw key if localization returns unchanged', () => {
      const identityT = (key: string) => key;
      expect(localizeCreateSaveError('unknown_error_code', identityT)).toBe(
        'unknown_error_code',
      );
    });
  });

  describe('buildUniqueQuickSaveName', () => {
    const t = (_key: string, seed: string | number) => `Quick Save ${seed}`;

    it('generates base name if not taken', () => {
      const existing = new Set<string>();
      const name = buildUniqueQuickSaveName(existing, t, 12345);
      expect(name).toBe('Quick Save 12345');
    });

    it('appends numbered increment if name is taken', () => {
      const existing = new Set<string>(['quick save 12345.zip']);
      const name = buildUniqueQuickSaveName(existing, t, 12345);
      expect(name).toBe('Quick Save 12345 (2)');
    });

    it('increments further if multiple copies are taken', () => {
      const existing = new Set<string>([
        'quick save 12345.zip',
        'quick save 12345 (2).zip',
      ]);
      const name = buildUniqueQuickSaveName(existing, t, 12345);
      expect(name).toBe('Quick Save 12345 (3)');
    });
  });

  describe('versionEqual', () => {
    it('returns true for matching versions', () => {
      expect(versionEqual('2.0.15', '2.0.15')).toBe(true);
      expect(versionEqual('1.0.0', '1.0.0')).toBe(true);
    });

    it('returns false for different versions or empty inputs', () => {
      expect(versionEqual('2.0.15', '2.0.16')).toBe(false);
      expect(versionEqual('', '1.0.0')).toBe(false);
      expect(versionEqual('1.0.0', '')).toBe(false);
    });
  });

  describe('buildSaveModCompareRows', () => {
    it('compares save mods with server disk mods', () => {
      const insp = {
        header: {
          factorio_version: '2.0.15',
          mods: [
            { name: 'base', version: '2.0.15' },
            { name: 'flib', display_name: 'Factorio Library', version: '0.14.0' },
            { name: 'obsolete-mod', version: '1.0.0' },
          ],
        },
      };

      const modList = {
        data: {
          mods: [
            { name: 'base', enabled: true },
            { name: 'flib', enabled: true },
            { name: 'new-server-mod', enabled: true },
          ],
        },
      };

      const modsAll = {
        game_version: '2.0.15',
        mods: [
          { name: 'flib', local_version: '0.14.0' },
          { name: 'new-server-mod', local_version: '2.0.0' },
        ],
      };

      const result = buildSaveModCompareRows(insp, modList, modsAll);
      expect(result.factorioVersion).toBe('2.0.15');

      // 'base' is in HIDDEN_SAVE_MOD_NAMES, so it should be omitted
      expect(result.rows.find((r) => r.name === 'base')).toBeUndefined();

      const flib = result.rows.find((r) => r.name === 'flib');
      expect(flib).toBeDefined();
      expect(flib?.display_name).toBe('Factorio Library');
      expect(flib?.saveVer).toBe('0.14.0');
      expect(flib?.diskVer).toBe('0.14.0');
      expect(flib?.nameClass).toBe('save-mod-name--ok');

      const obsolete = result.rows.find((r) => r.name === 'obsolete-mod');
      expect(obsolete).toBeDefined();
      expect(obsolete?.nameClass).toBe('save-mod-name--not-on-server');

      const newMod = result.rows.find((r) => r.name === 'new-server-mod');
      expect(newMod).toBeDefined();
      expect(newMod?.nameClass).toBe('save-mod-name--not-in-save');
    });
  });
});
