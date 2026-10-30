import { ModSettingsSchemaService } from './mod-settings-schema.service';
import { InstancesService } from '../../instances/instances.service';
import { FccConfigService } from '../../config/fcc-config.service';
import { InstanceItem } from '../../common/types';
import * as fs from 'fs';
import * as codec from '../factorio-data-codec';
import * as displayTitles from '../mod-display-titles.util';
import * as luaUtil from './mod-settings-lua.util';

jest.mock('fs', () => ({
  ...jest.requireActual<Record<string, unknown>>('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  readdirSync: jest.fn(),
  statSync: jest.fn(),
}));

jest.mock('adm-zip', () => {
  return jest.fn().mockImplementation(() => ({
    getEntries: jest.fn().mockReturnValue([
      { isDirectory: false, entryName: 'settings.lua' },
      { isDirectory: true, entryName: 'sub/' },
      { isDirectory: false, entryName: 'info.json' },
    ]),
    readAsText: jest.fn().mockReturnValue('data:extend({})'),
  }));
});

jest.mock('../factorio-data-codec', () => ({
  ModSettings: {
    load: jest.fn().mockReturnValue({}),
  },
  modSettingsToJsonObject: jest.fn(),
}));

jest.mock('../mod-display-titles.util', () => ({
  ...jest.requireActual<Record<string, unknown>>('../mod-display-titles.util'),
  loadFactorioLocaleSections: jest.fn(),
  lookupLocaleString: jest.fn(),
  modPackagePathsForInternalName: jest.fn(),
  resolveModDisplayTitlesBatch: jest.fn(),
}));

jest.mock('./mod-settings-lua.util', () => ({
  ...jest.requireActual<Record<string, unknown>>('./mod-settings-lua.util'),
  ingestSettingsLuaText: jest.fn(),
}));

describe('ModSettingsSchemaService', () => {
  let service: ModSettingsSchemaService;
  let mockInstances: {
    getSelected: jest.Mock;
    load: jest.Mock;
  };
  let mockConfig: {
    langCode: string;
    translateModNames: boolean;
  };

  const mockFs = jest.mocked(fs);
  const mockCodec = jest.mocked(codec);
  const mockDisplayTitles = jest.mocked(displayTitles);
  const mockLuaUtil = jest.mocked(luaUtil);

  const fakeInstance = {
    id: 'inst-1',
    name: 'Instance 1',
    serverPath: '/factorio/server',
  } as unknown as InstanceItem;

  beforeEach(() => {
    jest.clearAllMocks();

    mockInstances = {
      getSelected: jest.fn().mockReturnValue(fakeInstance),
      load: jest.fn().mockReturnValue({ items: [fakeInstance] }),
    };

    mockConfig = {
      langCode: 'ru',
      translateModNames: true,
    };

    mockFs.existsSync.mockReturnValue(true);
    mockFs.statSync.mockReturnValue({
      mtimeMs: 123456,
      size: 1024,
      isDirectory: () => false,
      isFile: () => true,
    } as unknown as fs.Stats);

    mockFs.readFileSync.mockImplementation((p: fs.PathOrFileDescriptor) => {
      const s = String(p);
      if (s.includes('mod-list.json')) {
        return JSON.stringify({
          mods: [
            { name: 'base', enabled: true },
            { name: 'my-mod', enabled: true },
            { name: 'disabled-mod', enabled: false },
          ],
        });
      }
      return 'data:extend({})';
    });

    (mockFs.readdirSync as unknown as jest.Mock).mockReturnValue([
      { name: 'settings.lua', isDirectory: () => false, isFile: () => true },
    ]);

    mockCodec.modSettingsToJsonObject.mockReturnValue({
      data: {
        startup: {
          'my-mod-setting-bool': { value: true },
        },
        'runtime-global': {
          'my-mod-setting-choice': { value: 'fast' },
        },
        'runtime-per-user': {
          unowned_setting: { value: 10 },
        },
      },
    });

    mockDisplayTitles.modPackagePathsForInternalName.mockReturnValue([
      '/factorio/server/mods/my-mod_1.0.0.zip',
    ]);

    mockDisplayTitles.loadFactorioLocaleSections.mockReturnValue({
      active: {
        'mod-setting-name': {
          'my-mod-setting-bool': 'Переключатель',
          'my-mod-setting-choice': 'Режим',
        },
        'mod-setting-description': {
          'my-mod-setting-bool': 'Описание переключателя',
        },
        'string-mod-setting': {
          'my-mod-setting-choice-fast': 'Быстрый',
        },
      },
      en: {
        'mod-setting-name': {
          'my-mod-setting-bool': 'Toggle',
          'my-mod-setting-choice': 'Mode',
        },
      },
    });

    mockDisplayTitles.lookupLocaleString.mockImplementation(
      (
        sections: displayTitles.LocaleSections,
        cat: string,
        key: string,
      ): string | undefined => {
        return sections?.[cat]?.[key];
      },
    );

    mockDisplayTitles.resolveModDisplayTitlesBatch.mockReturnValue({
      'my-mod': 'Мой мод',
    });

    mockLuaUtil.ingestSettingsLuaText.mockImplementation(
      (
        _text: string,
        mod: string,
        ownerMod: Record<string, string>,
        allowedValues: Record<string, unknown[]>,
        ui: luaUtil.LuaSettingUiRefs,
      ) => {
        ownerMod['my-mod-setting-bool'] = mod;
        ownerMod['my-mod-setting-choice'] = mod;
        allowedValues['my-mod-setting-choice'] = ['fast', 'slow'];
        ui.titles['my-mod-setting-bool'] = 'Inline Toggle';
        ui.descriptions['my-mod-setting-bool'] = 'Inline Description';
      },
    );

    service = new ModSettingsSchemaService(
      mockInstances as unknown as InstancesService,
      mockConfig as unknown as FccConfigService,
    );
  });

  describe('get() and status()', () => {
    it('returns error if no instance is selected', () => {
      mockInstances.getSelected.mockReturnValue(null);
      expect(service.get()).toEqual({
        ok: false,
        error: 'instance_not_found',
      });
      expect(service.status()).toEqual({
        ok: false,
        error: 'instance_not_found',
      });
    });

    it('starts background job when not cached and returns pending', async () => {
      const res = service.get('ru');
      expect(res.ok).toBe(true);
      expect(res['pending']).toBe(true);
      expect(res['progress']).toBeDefined();

      // Calling get again while running returns pending
      const resPending = service.get('ru');
      expect(resPending['pending']).toBe(true);

      // Checking status while running
      const statRunning = service.status();
      expect(statRunning.ok).toBe(true);
      expect(statRunning['running']).toBe(true);
      expect(statRunning['ready']).toBe(false);

      // Wait for async job completion
      await new Promise((resolve) => setTimeout(resolve, 50));

      const statDone = service.status();
      expect(statDone.ok).toBe(true);
      expect(statDone['running']).toBe(false);
      expect(statDone['ready']).toBe(true);
      expect(statDone['settings']).toBeDefined();
      expect(statDone['group_titles']).toEqual({ 'my-mod': 'Мой мод' });

      // Calling get again returns cached result
      const resCached = service.get('ru');
      expect(resCached.ok).toBe(true);
      expect(resCached['cached']).toBe(true);
      expect(resCached['settings']).toBeDefined();
    });

    it('forces refresh when refresh parameter is true', async () => {
      // First populate cache
      service.get('ru');
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Request with refresh = true
      const refreshed = service.get('ru', true);
      expect(refreshed.ok).toBe(true);
      expect(refreshed['pending']).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 60));
    });

    it('status returns idle when no job has been started', () => {
      const stat = service.status();
      expect(stat).toEqual({
        ok: true,
        running: false,
        ready: false,
        progress: { phase: 'idle' },
      });
    });

    it('status reports error when runJob fails', async () => {
      mockDisplayTitles.loadFactorioLocaleSections.mockImplementationOnce(
        () => {
          throw new Error('Locale loading failure');
        },
      );

      service.get('fr');
      await new Promise((resolve) => setTimeout(resolve, 60));

      const stat = service.status();
      expect(stat.ok).toBe(false);
      expect(stat['error']).toBe('Locale loading failure');
      expect(stat['ready']).toBe(true);
    });
  });

  describe('invalidateInstance()', () => {
    it('clears cached schema and resets active job for instance', async () => {
      service.get('ru');
      await new Promise((resolve) => setTimeout(resolve, 50));

      service.invalidateInstance('inst-1');

      const stat = service.status();
      expect(stat['ready']).toBe(false);
      expect(stat['running']).toBe(false);
    });
  });

  describe('directory and unpack scanning', () => {
    it('scans unpacked directory mods for lua settings files', async () => {
      service.invalidateInstance('inst-1');
      mockDisplayTitles.modPackagePathsForInternalName.mockReturnValue([
        '/factorio/server/mods/my-mod', // directory path
      ]);

      (mockFs.readdirSync as unknown as jest.Mock).mockImplementation(
        (dir: string) => {
          if (String(dir).includes('sub-folder')) return [];
          return [
            {
              name: 'settings.lua',
              isDirectory: () => false,
              isFile: () => true,
            },
            {
              name: 'sub-folder',
              isDirectory: () => true,
              isFile: () => false,
            },
          ];
        },
      );

      service.get('ru');
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(mockLuaUtil.ingestSettingsLuaText).toHaveBeenCalled();
    });
  });

  describe('mod grouping and naming variants', () => {
    it('groups settings by prefix, hyphens, underscores and falls back to other', async () => {
      mockCodec.modSettingsToJsonObject.mockReturnValue({
        data: {
          startup: {
            'mod-a-speed': { value: 1 },
            mod_b_power: { value: 2 },
            random_key: { value: 'none' },
          },
        },
      });

      mockDisplayTitles.modPackagePathsForInternalName.mockImplementation(
        (_dir: string, name: string) => {
          if (name === 'mod-a' || name === 'mod_b') return ['/path'];
          return [];
        },
      );

      service.get('en');
      await new Promise((resolve) => setTimeout(resolve, 50));

      const stat = service.status();
      const settings = stat['settings'] as Record<
        string,
        { group: string; display_name: string }
      >;
      expect(settings['mod-a-speed'].group).toBe('mod-a');
      expect(settings['mod_b_power'].group).toBe('mod_b');
      expect(settings['random_key'].group).toBe('\0other');
    });

    it('humanizes setting keys when no locale exists', async () => {
      mockCodec.modSettingsToJsonObject.mockReturnValue({
        data: {
          startup: {
            'unlocalized-setting-name': { value: 1 },
          },
        },
      });

      mockDisplayTitles.lookupLocaleString.mockReturnValue(undefined);

      service.get('en');
      await new Promise((resolve) => setTimeout(resolve, 50));

      const stat = service.status();
      const settings = stat['settings'] as Record<
        string,
        { display_name: string; description: string }
      >;
      expect(settings['unlocalized-setting-name'].display_name).toBe(
        'Unlocalized Setting Name',
      );
      expect(settings['unlocalized-setting-name'].description).toBe('');
    });
  });

  describe('choice display resolution', () => {
    it('resolves choices for boolean, string and dotted values', async () => {
      mockCodec.modSettingsToJsonObject.mockReturnValue({
        data: {
          startup: {
            'choice-setting': { value: 'opt.val' },
            'bool-setting': { value: true },
          },
        },
      });

      mockLuaUtil.ingestSettingsLuaText.mockImplementation(
        (
          _text: string,
          mod: string,
          ownerMod: Record<string, string>,
          allowedValues: Record<string, unknown[]>,
        ) => {
          ownerMod['choice-setting'] = mod;
          ownerMod['bool-setting'] = mod;
          allowedValues['choice-setting'] = ['opt.val', true, 123];
        },
      );

      mockDisplayTitles.lookupLocaleString.mockImplementation(
        (
          _sections: displayTitles.LocaleSections,
          cat: string,
          key: string,
        ): string | undefined => {
          if (cat === 'opt' && key === 'val') return 'Dotted Value Label';
          return undefined;
        },
      );

      service.get('en');
      await new Promise((resolve) => setTimeout(resolve, 50));

      const stat = service.status();
      const settings = stat['settings'] as Record<
        string,
        {
          allowed_values?: { value: unknown; label: string }[];
        }
      >;

      const allowed = settings['choice-setting'].allowed_values;
      expect(allowed).toBeDefined();
      expect(allowed?.[0]).toEqual({
        value: 'opt.val',
        label: 'Dotted Value Label',
      });
      expect(allowed?.[1]).toEqual({
        value: true,
        label: 'yes',
      });
      expect(allowed?.[2]).toEqual({
        value: 123,
        label: '123',
      });
    });
  });
});
