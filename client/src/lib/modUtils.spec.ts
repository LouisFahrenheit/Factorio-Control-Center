import { describe, it, expect } from 'vitest';
import {
  versionTuple,
  compareModVersionDesc,
  compareModVersionAsc,
  portalVersionNewer,
  maxInstalledModVersion,
  modAuthorPlain,
  modAuthorParts,
  formatModAuthorDisplay,
  modsDefaultAscForColumn,
  formatModpackSizeBytes,
  formatModpackFactorioDisplay,
  getModPortalUrl,
  getModOpenUrl,
  BUILTIN_MOD_CONTENT_URL,
  sortModRows,
  filterModRows,
  parseModInput,
} from './modUtils';
import type { ModRow } from '../types/mods';

describe('modUtils lib', () => {
  describe('versionTuple', () => {
    it('converts semver string to number array', () => {
      expect(versionTuple('1.2.3')).toEqual([1, 2, 3]);
      expect(versionTuple('2.0.15')).toEqual([2, 0, 15]);
      expect(versionTuple('0.18')).toEqual([0, 18]);
    });

    it('handles empty or invalid strings', () => {
      expect(versionTuple('')).toEqual([]);
      expect(versionTuple('invalid')).toEqual([]);
      expect(versionTuple('1.x.3')).toEqual([1]);
    });
  });

  describe('compareModVersionDesc and compareModVersionAsc', () => {
    it('compares versions in descending order', () => {
      expect(compareModVersionDesc('2.0.10', '2.0.2')).toBeLessThan(0);
      expect(compareModVersionDesc('1.0.0', '2.0.0')).toBeGreaterThan(0);
      expect(compareModVersionDesc('1.1.0', '1.1.0')).toBe(0);
    });

    it('compares versions in ascending order', () => {
      expect(compareModVersionAsc('1.0.0', '2.0.0')).toBeLessThan(0);
      expect(compareModVersionAsc('2.0.10', '2.0.2')).toBeGreaterThan(0);
      expect(compareModVersionAsc('1.5.0', '1.5.0')).toBe(0);
    });
  });

  describe('portalVersionNewer', () => {
    it('detects when portal version is newer than local', () => {
      expect(portalVersionNewer('2.0.1', '2.0.0')).toBe(true);
      expect(portalVersionNewer('1.1.10', '1.1.2')).toBe(true);
      expect(portalVersionNewer('2.0.0', '2.0.0')).toBe(false);
      expect(portalVersionNewer('1.0.0', '2.0.0')).toBe(false);
    });

    it('handles missing local or portal versions', () => {
      expect(portalVersionNewer('1.0.0', '')).toBe(true);
      expect(portalVersionNewer('', '1.0.0')).toBe(false);
      expect(portalVersionNewer('invalid', '1.0.0')).toBe(false);
    });
  });

  describe('maxInstalledModVersion', () => {
    it('returns highest version from available_versions', () => {
      const row: ModRow = {
        name: 'test-mod',
        local_version: '1.0.0',
        available_versions: ['1.0.0', '1.2.0', '1.1.5'],
      };
      expect(maxInstalledModVersion(row)).toBe('1.2.0');
    });

    it('falls back to local_version when available_versions is empty', () => {
      const row: ModRow = {
        name: 'test-mod',
        local_version: '0.9.5',
        available_versions: [],
      };
      expect(maxInstalledModVersion(row)).toBe('0.9.5');
    });
  });

  describe('modAuthor helpers', () => {
    it('extracts plain author text from various fields', () => {
      expect(modAuthorPlain({ name: 'm', author: 'Author1' })).toBe('Author1');
      expect(modAuthorPlain({ name: 'm', authors: ['Dev A', 'Dev B'] })).toBe('Dev A, Dev B');
      expect(modAuthorPlain({ name: 'm', owner: 'OwnerDev' })).toBe('OwnerDev');
      expect(modAuthorPlain({ name: 'm' })).toBe('');
    });

    it('splits comma-separated author parts', () => {
      expect(modAuthorParts('Dev1, Dev2, Dev3')).toEqual(['Dev1', 'Dev2', 'Dev3']);
      expect(modAuthorParts('—')).toEqual([]);
      expect(modAuthorParts('')).toEqual([]);
    });

    it('formats author display with truncation', () => {
      expect(formatModAuthorDisplay('SoloDev')).toEqual({
        display: 'SoloDev',
        full: 'SoloDev',
        truncated: false,
      });

      expect(formatModAuthorDisplay('DevA, DevB, DevC', 2)).toEqual({
        display: 'DevA, DevB +1',
        full: 'DevA, DevB, DevC',
        truncated: true,
      });

      expect(formatModAuthorDisplay('')).toEqual({
        display: '—',
        full: '—',
        truncated: false,
      });
    });
  });

  describe('modsDefaultAscForColumn', () => {
    it('returns true for text columns and false for metrics', () => {
      expect(modsDefaultAscForColumn('name')).toBe(true);
      expect(modsDefaultAscForColumn('author')).toBe(true);
      expect(modsDefaultAscForColumn('installed_by')).toBe(true);
      expect(modsDefaultAscForColumn('size')).toBe(false);
      expect(modsDefaultAscForColumn('version')).toBe(false);
      expect(modsDefaultAscForColumn('installed')).toBe(false);
    });
  });

  describe('formatModpackSizeBytes', () => {
    it('formats bytes into human readable string', () => {
      expect(formatModpackSizeBytes(0)).toBe('0 MB');
      expect(formatModpackSizeBytes(10 * 1024 * 1024)).toBe('10.00 MB');
      expect(formatModpackSizeBytes(1.5 * 1024 * 1024 * 1024)).toBe('1.50 GB');
      expect(formatModpackSizeBytes(null)).toBe('—');
      expect(formatModpackSizeBytes(-50)).toBe('—');
      expect(formatModpackSizeBytes('invalid')).toBe('—');
    });
  });

  describe('formatModpackFactorioDisplay', () => {
    it('appends SA flag when space age is required', () => {
      expect(formatModpackFactorioDisplay('2.0', true)).toBe('2.0 SA');
      expect(formatModpackFactorioDisplay('2.0', false)).toBe('2.0');
      expect(formatModpackFactorioDisplay('')).toBe('');
    });
  });

  describe('getModPortalUrl and getModOpenUrl', () => {
    it('builds portal URL encoding special characters', () => {
      expect(getModPortalUrl('space-exploration')).toBe(
        'https://mods.factorio.com/mod/space-exploration',
      );
      expect(getModPortalUrl('')).toBe('');
    });

    it('returns space age URL for builtin mods', () => {
      expect(getModOpenUrl('space-age', true)).toBe(BUILTIN_MOD_CONTENT_URL);
      expect(getModOpenUrl('flib', false)).toBe('https://mods.factorio.com/mod/flib');
    });
  });

  describe('parseModInput', () => {
    it('parses Factorio portal URL with version query', () => {
      expect(
        parseModInput('https://mods.factorio.com/mod/flib?version=0.14.0'),
      ).toEqual({
        modName: 'flib',
        version: '0.14.0',
      });
    });

    it('parses Factorio portal URL without version query', () => {
      expect(parseModInput('https://mods.factorio.com/mod/my-mod')).toEqual({
        modName: 'my-mod',
        version: undefined,
      });
    });

    it('parses zip filename format', () => {
      expect(parseModInput('space-exploration_0.6.120.zip')).toEqual({
        modName: 'space-exploration',
        version: '0.6.120',
      });
    });

    it('parses separator syntax with @ or ==', () => {
      expect(parseModInput('boblogistics@1.2.3')).toEqual({
        modName: 'boblogistics',
        version: '1.2.3',
      });
      expect(parseModInput('bobplates == 2.0.0')).toEqual({
        modName: 'bobplates',
        version: '2.0.0',
      });
    });

    it('falls back to plain string', () => {
      expect(parseModInput('aai-industry')).toEqual({
        modName: 'aai-industry',
      });
      expect(parseModInput('')).toEqual({
        modName: '',
      });
    });
  });

  describe('filterModRows', () => {
    const rows: ModRow[] = [
      { name: 'alpha-mod', display_name: 'Alpha Craft', local_version: '1.0.0' },
      { name: 'beta-mod', display_name: 'Beta Transport', local_version: '2.1.0' },
      { name: 'gamma-core', display_name: 'Gamma Core', portal_version: '3.0.0' },
    ];

    it('returns all rows when query is empty', () => {
      expect(filterModRows(rows, '')).toEqual(rows);
    });

    it('filters rows matching query across display name, name, or version', () => {
      expect(filterModRows(rows, 'craft')).toEqual([rows[0]]);
      expect(filterModRows(rows, 'beta')).toEqual([rows[1]]);
      expect(filterModRows(rows, '3.0.0')).toEqual([rows[2]]);
      expect(filterModRows(rows, 'none')).toEqual([]);
    });
  });

  describe('sortModRows', () => {
    const rows: ModRow[] = [
      { name: 'beta-mod', display_name: 'Beta', enabled: false, zip_size_bytes: 500, local_version: '1.0.0' },
      { name: 'alpha-mod', display_name: 'Alpha', enabled: true, zip_size_bytes: 100, local_version: '2.0.0' },
      { name: 'gamma-mod', display_name: 'Gamma', enabled: true, zip_size_bytes: 300, local_version: '1.5.0' },
    ];
    const order = ['alpha-mod', 'beta-mod', 'gamma-mod'];

    it('sorts by initial list order if sortColumn is empty', () => {
      const sorted = sortModRows(rows, order, '', true);
      expect(sorted.map((r) => r.name)).toEqual(['alpha-mod', 'beta-mod', 'gamma-mod']);
    });

    it('sorts by name ascending and descending', () => {
      const asc = sortModRows(rows, order, 'name', true);
      expect(asc.map((r) => r.name)).toEqual(['alpha-mod', 'beta-mod', 'gamma-mod']);

      const desc = sortModRows(rows, order, 'name', false);
      expect(desc.map((r) => r.name)).toEqual(['gamma-mod', 'beta-mod', 'alpha-mod']);
    });

    it('sorts by enabled state', () => {
      const asc = sortModRows(rows, order, 'enabled', true);
      // enabled: true comes before enabled: false in ascending
      expect(asc[0].enabled).toBe(true);
      expect(asc[2].enabled).toBe(false);
    });

    it('sorts by size', () => {
      const asc = sortModRows(rows, order, 'size', true);
      expect(asc.map((r) => r.name)).toEqual(['alpha-mod', 'gamma-mod', 'beta-mod']);
    });

    it('sorts by version', () => {
      const asc = sortModRows(rows, order, 'version', true);
      expect(asc.map((r) => r.local_version)).toEqual(['1.0.0', '1.5.0', '2.0.0']);
    });
  });
});
