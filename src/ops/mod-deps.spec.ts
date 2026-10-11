import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import {
  serverHasBuiltinRecycler,
  saOfficialExpansionMods,
  normalizeModListName,
  isConflictDependencyName,
  isInstallableMissingDepName,
  filterInstallableMissingDeps,
  parseDependencyModName,
  parseConflictModName,
  manifestConflictNames,
  releaseConflictNames,
  buildInstallConflictInfo,
  resolveEnabledInstallConflicts,
  disableModListEntriesByName,
  isOptionalDependencyString,
  dependencyStringRequiresSpaceAge,
  isBuiltinModName,
  releaseDependencies,
  modListRequiresSpaceAge,
  portalDependencyNames,
  portalRecommendedDependencyNames,
  seedSpaceAgeModList,
  ensureSaOfficialExpansionRows,
  missingDepNamesFromLogLine,
  parseMissingStartupDependencies,
  logShowsModLoadFailure,
} from './mod-deps';

describe('mod-deps', () => {
  describe('recycler and Space Age expansion lists', () => {
    it('detects builtin recycler by game version', () => {
      expect(serverHasBuiltinRecycler('')).toBe(false);
      expect(serverHasBuiltinRecycler('1.1.107')).toBe(false);
      expect(serverHasBuiltinRecycler('2.0.28')).toBe(false);
      expect(serverHasBuiltinRecycler('2.1.0')).toBe(true);
      expect(serverHasBuiltinRecycler('2.1.4')).toBe(true);
      expect(serverHasBuiltinRecycler('2.2.0')).toBe(true);
    });

    it('returns official expansion mods with or without recycler', () => {
      const v20 = saOfficialExpansionMods('2.0.28');
      expect(v20).toEqual(['elevated-rails', 'quality', 'space-age']);

      const v21 = saOfficialExpansionMods('2.1.0');
      expect(v21).toEqual([
        'elevated-rails',
        'quality',
        'recycler',
        'space-age',
      ]);
    });
  });

  describe('mod naming and normalization', () => {
    it('normalizes mod list names with whitespace and underscores', () => {
      expect(normalizeModListName('  Space_Age  ')).toBe('space-age');
      expect(normalizeModListName('my_cool_mod')).toBe('my-cool-mod');
      expect(normalizeModListName('')).toBe('');
    });

    it('identifies builtin mods', () => {
      expect(isBuiltinModName('base')).toBe(true);
      expect(isBuiltinModName('space-age')).toBe(true);
      expect(isBuiltinModName('Space_Age')).toBe(true);
      expect(isBuiltinModName('quality')).toBe(true);
      expect(isBuiltinModName('elevated-rails')).toBe(true);
      expect(isBuiltinModName('recycler')).toBe(true);
      expect(isBuiltinModName('flib')).toBe(false);
      expect(isBuiltinModName('alien-biomes')).toBe(false);
    });
  });

  describe('dependency and conflict parsing', () => {
    it('identifies conflict dependency markers', () => {
      expect(isConflictDependencyName('! flib')).toBe(true);
      expect(isConflictDependencyName('!flib >= 1.0.0')).toBe(true);
      expect(isConflictDependencyName('flib >= 1.0.0')).toBe(false);
      expect(isConflictDependencyName('? optional-mod')).toBe(false);
    });

    it('parses dependency mod name correctly', () => {
      expect(parseDependencyModName('flib')).toBe('flib');
      expect(parseDependencyModName('flib >= 0.14.0')).toBe('flib');
      expect(parseDependencyModName('flib <= 1.0.0')).toBe('flib');
      expect(parseDependencyModName('flib > 0.5')).toBe('flib');
      expect(parseDependencyModName('flib < 2.0')).toBe('flib');
      expect(parseDependencyModName('flib = 1.0.0')).toBe('flib');
      expect(parseDependencyModName('flib != 0.9.0')).toBe('flib');
      expect(parseDependencyModName('? flib >= 1.0')).toBe('flib');
      expect(parseDependencyModName('(?) flib')).toBe('flib');
      expect(parseDependencyModName('(optional) flib')).toBe('flib');
      expect(parseDependencyModName('~ flib')).toBe('flib');
      expect(parseDependencyModName('+ flib')).toBe('flib');
      expect(parseDependencyModName('! conflict-mod')).toBe('');
    });

    it('parses conflict mod name correctly', () => {
      expect(parseConflictModName('! conflicting-mod')).toBe('conflicting-mod');
      expect(parseConflictModName('! conflicting-mod >= 2.0.0')).toBe(
        'conflicting-mod',
      );
      expect(parseConflictModName('normal-dep >= 1.0.0')).toBe('');
    });

    it('filters installable missing dependencies', () => {
      expect(isInstallableMissingDepName('flib')).toBe(true);
      expect(isInstallableMissingDepName('! conflict-mod')).toBe(false);
      expect(isInstallableMissingDepName('base')).toBe(false);
      expect(isInstallableMissingDepName('space-age')).toBe(false);
      expect(isInstallableMissingDepName('')).toBe(false);

      expect(
        filterInstallableMissingDeps(['flib', '! bad', 'base', 'krastorio2']),
      ).toEqual(['flib', 'krastorio2']);
    });

    it('extracts conflict names from manifests and releases', () => {
      const manifest = {
        dependencies: [
          'base >= 2.0',
          '! incompatible-mod-a',
          '! incompatible-mod-b >= 1.0.0',
          '! base',
          'flib >= 0.14.0',
        ],
      };
      expect(manifestConflictNames(manifest)).toEqual([
        'incompatible-mod-a',
        'incompatible-mod-b',
      ]);
      expect(manifestConflictNames(null)).toEqual([]);
      expect(
        releaseConflictNames({ dependencies: manifest.dependencies }),
      ).toEqual(['incompatible-mod-a', 'incompatible-mod-b']);
    });
  });

  describe('mod install conflict resolution and disabling', () => {
    it('builds install conflict info for enabled conflicting mods', () => {
      const modList = {
        mods: [
          { name: 'base', enabled: true },
          { name: 'mod-a', enabled: true },
          { name: 'mod-b', enabled: false },
          { name: 'mod-c', enabled: true },
        ],
      };

      const conflicts = [
        { name: 'mod-a', is_builtin: false },
        { name: 'mod-b', is_builtin: false },
        { name: 'mod-d', is_builtin: false },
      ];

      const installTree = new Set(['target-mod']);
      const result = buildInstallConflictInfo(modList, conflicts, installTree);

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('mod-a');
      expect(result[0].will_disable).toBe(true);
    });

    it('resolves enabled install conflict names', () => {
      const modList = {
        mods: [
          { name: 'base', enabled: true },
          { name: 'mod-a', enabled: true },
          { name: 'mod-b', enabled: false },
        ],
      };

      const result = resolveEnabledInstallConflicts(
        modList,
        ['mod-a', 'mod-b', 'mod-c'],
        new Set<string>(),
      );
      expect(result).toEqual(['mod-a']);
    });

    it('disables mod list entries by name', () => {
      const rows: Record<string, unknown>[] = [
        { name: 'base', enabled: true },
        { name: 'mod-a', enabled: true },
        { name: 'mod-b', enabled: true },
      ];

      const disabled = disableModListEntriesByName(rows, ['mod-a']);
      expect(disabled).toEqual(['mod-a']);
      expect(rows.find((r) => r.name === 'mod-a')?.enabled).toBe(false);
      expect(rows.find((r) => r.name === 'mod-b')?.enabled).toBe(true);
      expect(rows.find((r) => r.name === 'base')?.enabled).toBe(true);
    });
  });

  describe('Space Age requirements detection', () => {
    it('detects optional dependency strings', () => {
      expect(isOptionalDependencyString('? optional-dep')).toBe(true);
      expect(isOptionalDependencyString('(optional) optional-dep')).toBe(true);
      expect(isOptionalDependencyString('(?) optional-dep')).toBe(true);
      expect(isOptionalDependencyString('~ hidden-dep')).toBe(true);
      expect(isOptionalDependencyString('+ recommended-dep')).toBe(true);
      expect(isOptionalDependencyString('! conflict-dep')).toBe(true);
      expect(isOptionalDependencyString('')).toBe(true);
      expect(isOptionalDependencyString('required-dep >= 1.0')).toBe(false);
    });

    it('checks if a dependency requires Space Age', () => {
      expect(dependencyStringRequiresSpaceAge('space-age')).toBe(true);
      expect(dependencyStringRequiresSpaceAge('space-age >= 2.0.0')).toBe(true);
      expect(dependencyStringRequiresSpaceAge('? space-age')).toBe(false);
      expect(dependencyStringRequiresSpaceAge('flib >= 1.0')).toBe(false);
    });

    it('checks if mod list requires Space Age', () => {
      expect(
        modListRequiresSpaceAge({
          mods: [
            { name: 'base', enabled: true },
            { name: 'space-age', enabled: true },
          ],
        }),
      ).toBe(true);

      expect(
        modListRequiresSpaceAge({
          mods: [
            { name: 'base', enabled: true },
            { name: 'space-age', enabled: false },
          ],
        }),
      ).toBe(false);

      expect(
        modListRequiresSpaceAge({
          mods: [
            { name: 'base', enabled: true },
            { name: 'flib', enabled: true },
          ],
        }),
      ).toBe(false);
    });
  });

  describe('portal dependency extraction', () => {
    it('extracts release dependencies from array or info_json', () => {
      const releaseDirect = { dependencies: ['flib >= 0.14.0', 'base'] };
      expect(releaseDependencies(releaseDirect)).toEqual([
        'flib >= 0.14.0',
        'base',
      ]);

      const releaseInfoJson = {
        info_json: JSON.stringify({ dependencies: ['krastorio2 >= 1.0.0'] }),
      };
      expect(releaseDependencies(releaseInfoJson)).toEqual([
        'krastorio2 >= 1.0.0',
      ]);
    });

    it('extracts required portal dependencies filtering out optional and builtin', () => {
      const release = {
        dependencies: [
          'base >= 2.0',
          'space-age',
          '? optional-mod',
          'flib >= 0.14.0',
          '+ recommended-mod',
        ],
      };
      const required = portalDependencyNames(release);
      expect(required).toEqual(['flib']);
    });

    it('extracts recommended portal dependencies', () => {
      const release = {
        dependencies: [
          'base >= 2.0',
          'flib >= 0.14.0',
          '+ recommended-a',
          '+ recommended-b >= 1.0',
        ],
      };
      expect(portalRecommendedDependencyNames(release)).toEqual([
        'recommended-a',
        'recommended-b',
      ]);
    });
  });

  describe('mod list disk operations and seeding', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-mod-deps-test-'));
    });

    afterEach(() => {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    });

    it('seeds space age mod-list.json correctly', () => {
      const modsDir = path.join(tempDir, 'mods');
      seedSpaceAgeModList(modsDir, '2.0.28');

      const file = path.join(modsDir, 'mod-list.json');
      expect(fs.existsSync(file)).toBe(true);

      const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as {
        mods: { name: string; enabled: boolean }[];
      };
      const names = parsed.mods.map((m) => m.name);
      expect(names).toEqual(['base', 'elevated-rails', 'quality', 'space-age']);
      expect(parsed.mods.every((m) => m.enabled)).toBe(true);
    });

    it('ensures official Space Age expansion rows in existing mod-list.json', () => {
      const modListPath = path.join(tempDir, 'mod-list.json');
      fs.writeFileSync(
        modListPath,
        JSON.stringify({
          mods: [
            { name: 'base', enabled: true },
            { name: 'custom-mod', enabled: true },
          ],
        }),
        'utf-8',
      );

      ensureSaOfficialExpansionRows(modListPath, true, '2.0.28');

      const parsed = JSON.parse(fs.readFileSync(modListPath, 'utf-8')) as {
        mods: { name: string; enabled: boolean }[];
      };
      const names = parsed.mods.map((m) => m.name);
      expect(names).toEqual([
        'base',
        'elevated-rails',
        'quality',
        'space-age',
        'custom-mod',
      ]);
    });
  });

  describe('missing dependencies log parsing', () => {
    it('extracts missing dependency name from log line', () => {
      const line = 'Missing required dependency flib >= 0.14.0.';
      expect(missingDepNamesFromLogLine(line)).toEqual(['flib']);

      const plainLine = 'Missing required dependency alien-biomes';
      expect(missingDepNamesFromLogLine(line)).toEqual(['flib']);
      expect(missingDepNamesFromLogLine(plainLine)).toEqual(['alien-biomes']);

      const unrelated = 'Factorio initialised';
      expect(missingDepNamesFromLogLine(unrelated)).toEqual([]);
    });

    it('parses startup dependencies when loading fails', () => {
      const lines = [
        '0.000 2026-10-09 00:00:00; Factorio 2.0.28 (build 79999, win64, steam)',
        '1.000 Loading mods...',
        '2.000 Failed to load mod "my-mod"',
        '2.001 Missing required dependency flib >= 0.14.0',
        '2.002 Missing required dependency base >= 2.0.0',
      ];

      const missing = parseMissingStartupDependencies(lines, true);
      expect(missing).toEqual(['flib']);
      expect(logShowsModLoadFailure(lines)).toBe(true);
    });

    it('returns empty when session reached in-game', () => {
      const lines = [
        '0.000 2026-10-09 00:00:00; Factorio 2.0.28',
        '1.000 Failed to load mod "old-mod"',
        '1.001 Missing required dependency old-dep',
        '2.000 changing state from(CreatingGame) to(InGame)',
      ];

      expect(parseMissingStartupDependencies(lines, true)).toEqual([]);
      expect(logShowsModLoadFailure(lines)).toBe(false);
    });
  });
});
