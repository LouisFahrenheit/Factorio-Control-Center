import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import { join } from 'path';
import { ModsOpsService } from './mods-ops.service';
import { InstancesService } from '../../instances/instances.service';
import { RuntimeService } from '../runtime.service';
import { ModPortalService } from '../mod-portal/mod-portal.service';
import { FccConfigService } from '../../config/fcc-config.service';
import { ModsJobService } from './mods-job.service';
import { ModPlanService } from './mod-plan.service';
import * as opsUtils from '../ops-utils';
import * as serverData from '../instance-server-data';
import type { InstanceItem } from '../../common/types';
import { PathManager } from '../path-manager';

jest.mock('adm-zip', () => {
  return jest.fn().mockImplementation(() => ({
    getEntries: jest.fn().mockReturnValue([{ entryName: 'changelog.txt' }]),
    readAsText: jest.fn().mockReturnValue('Changelog content'),
    addLocalFile: jest.fn(),
    writeZip: jest.fn(),
  }));
});

jest.mock('fs', () => ({
  ...jest.requireActual<Record<string, unknown>>('fs'),
  mkdirSync: jest.fn(),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  copyFileSync: jest.fn(),
  statSync: jest.fn().mockReturnValue({ size: 2048 }),
  readdirSync: jest.fn().mockReturnValue([]),
  rmSync: jest.fn(),
}));

jest.mock('../ops-utils', () => {
  const actual = jest.requireActual<typeof opsUtils>('../ops-utils');
  return {
    ...actual,
    selectedInstance: jest.fn(),
    readModList: jest.fn(),
    writeModList: jest.fn(),
    installedModVersions: jest.fn(),
    latestVersion: jest.fn(),
    readModManifest: jest.fn(),
    gameVersion: jest.fn(),
    hasSpaceAge: jest.fn(),
    ensureModListEntry: jest.fn(),
    safeName: jest.fn((n: string) => n || 'server'),
  };
});

jest.mock('../instance-server-data', () => {
  const actual = jest.requireActual<typeof serverData>(
    '../instance-server-data',
  );
  return {
    ...actual,
    loadServerData: jest.fn().mockReturnValue({
      mod_install_dates: {},
      mod_install_by: {},
      mod_prefs: { remove_old_zips: true },
    }),
    saveServerData: jest.fn(),
    trackModInstallMeta: jest.fn(),
    resolveBuiltinModInstallDate: jest.fn().mockReturnValue('2026-10-01'),
  };
});

jest.mock('../mod-display-titles.util', () => ({
  normalizeModUiLang: jest.fn((l?: string) => l || 'ru'),
  resolveModDisplayTitlesBatch: jest.fn(() => ({})),
}));

describe('ModsOpsService', () => {
  let service: ModsOpsService;
  let instancesMock: {
    getSelected: jest.Mock;
  };
  let runtimeMock: {
    isRunning: jest.MockedFunction<(id: string) => boolean>;
  };
  let portalMock: {
    isBuiltin: jest.MockedFunction<(name: string) => boolean>;
    resolveVerifiedServerSettingsUsername: jest.MockedFunction<
      (pm: PathManager) => Promise<string>
    >;
    modIdFromInput: jest.MockedFunction<(raw: string) => string>;
    isValidPortalModId: jest.MockedFunction<(id: string) => boolean>;
    fetchFull: jest.MockedFunction<
      (id: string) => Promise<Record<string, unknown>>
    >;
    listReleasesSummary: jest.MockedFunction<
      (
        meta: Record<string, unknown>,
        serverPath: string,
      ) => Array<{
        version: string;
        factorio_version: string;
        released_at: string;
        is_compatible: boolean;
      }>
    >;
    resolveRelease: jest.MockedFunction<
      (
        meta: Record<string, unknown>,
        opts: { serverPath?: string; gameVersion?: string },
      ) => { version: string } | null
    >;
    factorioMajorMinor: jest.MockedFunction<(v: string) => string>;
    pruneOldZips: jest.MockedFunction<
      (mod: string, ver: string, dir: string) => void
    >;
  };
  let configMock: {
    langCode: string;
    translateModNames: boolean;
  };
  let jobsMock: {
    start: jest.Mock;
    status: jest.Mock;
    stop: jest.Mock;
  };
  let modPlanMock: {
    installPlanDetail: jest.Mock;
    disableConflictingMods: jest.Mock;
    scanUpdatesNeedingNewerGame: jest.Mock;
    planUpdateAll: jest.Mock;
    updateRootModIds: jest.Mock;
    installConflictMetaForRoots: jest.Mock;
  };

  const mockSelectedInstance = opsUtils.selectedInstance as jest.MockedFunction<
    typeof opsUtils.selectedInstance
  >;
  const mockReadModList = opsUtils.readModList as jest.MockedFunction<
    typeof opsUtils.readModList
  >;
  const mockWriteModList = opsUtils.writeModList as jest.MockedFunction<
    typeof opsUtils.writeModList
  >;
  const mockInstalledModVersions =
    opsUtils.installedModVersions as jest.MockedFunction<
      typeof opsUtils.installedModVersions
    >;
  const mockLatestVersion = opsUtils.latestVersion as jest.MockedFunction<
    typeof opsUtils.latestVersion
  >;
  const mockReadModManifest = opsUtils.readModManifest as jest.MockedFunction<
    typeof opsUtils.readModManifest
  >;
  const mockGameVersion = opsUtils.gameVersion as jest.MockedFunction<
    typeof opsUtils.gameVersion
  >;
  const mockHasSpaceAge = opsUtils.hasSpaceAge as jest.MockedFunction<
    typeof opsUtils.hasSpaceAge
  >;

  const mockExistsSync = fs.existsSync as unknown as jest.Mock;
  const mockReaddirSync = fs.readdirSync as unknown as jest.Mock;
  const mockRmSync = fs.rmSync as unknown as jest.Mock;

  const fakeInstanceItem: InstanceItem = {
    id: 'inst-1',
    name: 'Main Server',
    serverPath: '/factorio/server',
    port: '34197',
    rconPort: 27015,
    rconPassword: 'pwd',
    blockUpdates: false,
    ip: '0.0.0.0',
    autostartServer: false,
    autoEnterPanel: false,
    launchSave: '',
  };

  const fakePm = new PathManager('/factorio/server');

  beforeEach(async () => {
    jest.clearAllMocks();

    instancesMock = {
      getSelected: jest.fn().mockReturnValue(fakeInstanceItem),
    };
    runtimeMock = {
      isRunning: jest.fn((_id: string) => false),
    };
    portalMock = {
      isBuiltin: jest.fn(
        (name: string) => name === 'base' || name === 'space-age',
      ),
      resolveVerifiedServerSettingsUsername: jest
        .fn()
        .mockResolvedValue('test-user'),
      modIdFromInput: jest.fn((raw: string) => raw.trim()),
      isValidPortalModId: jest.fn((_id: string) => true),
      fetchFull: jest.fn().mockResolvedValue({
        name: 'flib',
        title: 'Factorio Library',
        releases: [{ version: '0.14.0' }],
      }),
      listReleasesSummary: jest.fn().mockReturnValue([
        {
          version: '0.14.0',
          factorio_version: '2.0',
          released_at: '2026-01-01',
          is_compatible: true,
        },
      ]),
      resolveRelease: jest.fn().mockReturnValue({ version: '0.14.0' }),
      factorioMajorMinor: jest.fn((_v: string) => '2.0'),
      pruneOldZips: jest.fn(),
    };
    configMock = {
      langCode: 'ru',
      translateModNames: true,
    };
    jobsMock = {
      start: jest.fn().mockReturnValue({ ok: true, started: true }),
      status: jest.fn().mockReturnValue({ ok: true, running: false }),
      stop: jest.fn().mockReturnValue({ ok: true, cancelled: true }),
    };
    modPlanMock = {
      installPlanDetail: jest.fn().mockResolvedValue({
        ok: true,
        mods_needing_game_update: [],
        conflicts_to_disable: [],
        install_conflicts: [],
      }),
      disableConflictingMods: jest.fn().mockReturnValue(['conflicting-mod']),
      scanUpdatesNeedingNewerGame: jest.fn().mockResolvedValue([]),
      planUpdateAll: jest.fn().mockResolvedValue([]),
      updateRootModIds: jest.fn().mockResolvedValue(['flib']),
      installConflictMetaForRoots: jest.fn().mockResolvedValue({
        conflicts_to_disable: [],
        install_conflicts: [],
      }),
    };

    mockSelectedInstance.mockReturnValue({
      item: fakeInstanceItem,
      pm: fakePm,
    });
    mockGameVersion.mockReturnValue('2.0.28');
    mockHasSpaceAge.mockReturnValue(true);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ModsOpsService,
        { provide: InstancesService, useValue: instancesMock },
        { provide: RuntimeService, useValue: runtimeMock },
        { provide: ModPortalService, useValue: portalMock },
        { provide: FccConfigService, useValue: configMock },
        { provide: ModsJobService, useValue: jobsMock },
        { provide: ModPlanService, useValue: modPlanMock },
      ],
    }).compile();

    service = module.get<ModsOpsService>(ModsOpsService);
  });

  describe('list()', () => {
    it('returns error when no instance is selected', async () => {
      mockSelectedInstance.mockReturnValue({ ok: false, error: 'no_instance' });

      const res = await service.list();
      expect(res).toEqual({ ok: false, error: 'no_instance' });
    });

    it('returns list of installed and builtin mods', async () => {
      mockReadModList.mockReturnValue({
        mods: [
          { name: 'base', enabled: true },
          { name: 'space-age', enabled: true },
          { name: 'flib', enabled: true, version: '0.14.0' },
          { name: 'unpinned-mod', enabled: false },
        ],
      });
      mockInstalledModVersions.mockImplementation(
        (_dir: string, name: string) => {
          if (name === 'flib') return ['0.13.0', '0.14.0'];
          if (name === 'unpinned-mod') return ['1.0.0'];
          return [];
        },
      );
      mockLatestVersion.mockImplementation((versions: string[]) => {
        return versions[versions.length - 1] || '';
      });
      mockExistsSync.mockReturnValue(true);
      mockReadModManifest.mockReturnValue({
        name: 'flib',
        author: 'raiguard',
        version: '0.14.0',
      });

      const res = await service.list('ru');
      expect(res.ok).toBe(true);
      expect(res.game_version).toBe('2.0.28');
      expect(res.portal_username).toBe('test-user');

      const mods = res.mods as Array<Record<string, unknown>>;
      expect(mods.length).toBe(3); // base filtered out

      const flib = mods.find((m) => m.name === 'flib');
      expect(flib).toMatchObject({
        name: 'flib',
        enabled: true,
        is_builtin: false,
        pinned_version: '0.14.0',
        author: 'raiguard',
      });

      const spaceAge = mods.find((m) => m.name === 'space-age');
      expect(spaceAge).toMatchObject({
        name: 'space-age',
        is_builtin: true,
        installed_by: '__builtin__',
      });
    });
  });

  describe('setPrefs()', () => {
    it('saves remove_old_zips preference and returns diff', () => {
      const res = service.setPrefs(false);
      expect(res.ok).toBe(true);
      expect(res.remove_old_zips).toBe(false);
      expect(res.settings_changes).toEqual([
        { key: 'remove_old_zips', from: 'true', to: 'false' },
      ]);
    });
  });

  describe('checkUpdatesStart & checkUpdatesStatus', () => {
    it('returns error if instance has blockUpdates flag set', () => {
      mockSelectedInstance.mockReturnValue({
        item: { ...fakeInstanceItem, blockUpdates: true },
        pm: fakePm,
      });

      const res = service.checkUpdatesStart();
      expect(res).toEqual({
        ok: true,
        started: false,
        reason: 'updates_blocked_by_instance_setting',
        total: 0,
      });
    });

    it('returns no_portal_mods if only builtin mods exist in mod-list', () => {
      mockReadModList.mockReturnValue({
        mods: [
          { name: 'base', enabled: true },
          { name: 'space-age', enabled: true },
        ],
      });

      const res = service.checkUpdatesStart();
      expect(res).toEqual({
        ok: true,
        started: false,
        reason: 'no_portal_mods',
        total: 0,
      });
    });

    it('starts background check and returns started: true', () => {
      mockReadModList.mockReturnValue({
        mods: [{ name: 'flib', enabled: true }],
      });

      const res = service.checkUpdatesStart();
      expect(res.ok).toBe(true);
      expect(res.started).toBe(true);
      expect(res.total).toBe(1);

      // Calling again while running returns already_running
      const secondCall = service.checkUpdatesStart();
      expect(secondCall.started).toBe(false);
      expect(secondCall.reason).toBe('already_running');

      const status = service.checkUpdatesStatus();
      expect(status.ok).toBe(true);
      expect(status.total).toBe(1);
    });
  });

  describe('setEnabled and setAllNonBuiltinEnabled', () => {
    beforeEach(() => {
      mockReadModList.mockReturnValue({
        mods: [
          { name: 'base', enabled: true },
          { name: 'flib', enabled: true },
          { name: 'other', enabled: false },
        ],
      });
    });

    it('prevents mod state change when server is running', () => {
      runtimeMock.isRunning.mockReturnValue(true);

      expect(service.setEnabled('flib', false)).toEqual({
        ok: false,
        error: 'server_running',
      });
      expect(service.setAllNonBuiltinEnabled(true)).toEqual({
        ok: false,
        error: 'server_running',
      });
    });

    it('returns not_found if mod does not exist in mod-list.json', () => {
      const res = service.setEnabled('unknown-mod', false);
      expect(res).toEqual({ ok: false, error: 'not_found' });
    });

    it('updates enabled status for existing mod', () => {
      const res = service.setEnabled('flib', false);
      expect(res).toEqual({ ok: true });
      expect(mockWriteModList).toHaveBeenCalled();
    });

    it('enables all non-builtin mods and counts changes', () => {
      const res = service.setAllNonBuiltinEnabled(true);
      expect(res).toEqual({ ok: true, enabled: true, changed: 1 });
      expect(mockWriteModList).toHaveBeenCalled();
    });
  });

  describe('getChangelog', () => {
    it('returns not_found if mod has no installed versions', () => {
      mockInstalledModVersions.mockReturnValue([]);
      const res = service.getChangelog('missing-mod');
      expect(res).toEqual({ ok: false, error: 'not_found' });
    });

    it('reads changelog from zip archive', () => {
      mockInstalledModVersions.mockReturnValue(['1.0.0']);
      mockLatestVersion.mockReturnValue('1.0.0');

      const res = service.getChangelog('flib');
      expect(res).toEqual({
        ok: true,
        name: 'flib',
        version: '1.0.0',
        text: 'Changelog content',
      });
    });
  });

  describe('setVersion', () => {
    it('returns error if server is running', () => {
      runtimeMock.isRunning.mockReturnValue(true);
      expect(service.setVersion('flib', '1.0.0')).toEqual({
        ok: false,
        error: 'server_running',
      });
    });

    it('returns no_multi_version if mod has only 1 version', () => {
      mockInstalledModVersions.mockReturnValue(['1.0.0']);
      expect(service.setVersion('flib', '1.0.0')).toEqual({
        ok: false,
        error: 'no_multi_version',
      });
    });

    it('returns invalid_version if target version is not installed', () => {
      mockInstalledModVersions.mockReturnValue(['1.0.0', '1.1.0']);
      expect(service.setVersion('flib', '2.0.0')).toEqual({
        ok: false,
        error: 'invalid_version',
      });
    });

    it('updates version in mod-list.json when valid', () => {
      mockInstalledModVersions.mockReturnValue(['1.0.0', '1.1.0']);
      mockReadModList.mockReturnValue({
        mods: [{ name: 'flib', enabled: true, version: '1.0.0' }],
      });

      const res = service.setVersion('flib', '1.1.0');
      expect(res).toEqual({ ok: true });
      expect(mockWriteModList).toHaveBeenCalledWith(fakePm, [
        { name: 'flib', enabled: true, version: '1.1.0' },
      ]);
    });
  });

  describe('remove', () => {
    it('cannot remove builtin mods', () => {
      portalMock.isBuiltin.mockReturnValue(true);
      expect(service.remove('space-age')).toEqual({
        ok: false,
        error: 'builtin',
      });
    });

    it('removes specific version zip and updates mod list if remaining versions exist', () => {
      mockReadModList.mockReturnValue({
        mods: [{ name: 'flib', enabled: true, version: '1.0.0' }],
      });
      mockExistsSync.mockReturnValue(true);
      mockInstalledModVersions.mockReturnValue(['0.9.0']);
      mockLatestVersion.mockReturnValue('0.9.0');

      const res = service.remove('flib', 'version', '1.0.0');
      expect(res).toEqual({ ok: true });
      expect(mockRmSync).toHaveBeenCalled();
      expect(mockWriteModList).toHaveBeenCalledWith(fakePm, [
        { name: 'flib', enabled: true, version: '0.9.0' },
      ]);
    });

    it('removes all version zips when scope is all', () => {
      mockReadModList.mockReturnValue({
        mods: [{ name: 'flib', enabled: true }],
      });
      mockReaddirSync.mockReturnValue(['flib_1.0.0.zip', 'other_1.0.0.zip']);

      const res = service.remove('flib', 'all');
      expect(res).toEqual({ ok: true });
      expect(mockRmSync).toHaveBeenCalled();
      expect(mockWriteModList).toHaveBeenCalledWith(fakePm, []);
    });
  });

  describe('uploadArchive', () => {
    it('returns tmp_not_found if archive does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      expect(service.uploadArchive('/tmp/nonexistent.zip', 'mod.zip')).toEqual({
        ok: false,
        error: 'tmp_not_found',
      });
    });

    it('returns invalid_mod_archive if manifest cannot be read', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadModManifest.mockReturnValue(null);

      const res = service.uploadArchive('/tmp/bad.zip', 'bad.zip');
      expect(res.ok).toBe(false);
      expect(res.error).toBe('invalid_mod_archive');
    });

    it('rejects upload if Space Age required but server lacks it', () => {
      mockExistsSync.mockReturnValue(true);
      mockHasSpaceAge.mockReturnValue(false);
      mockReadModManifest.mockReturnValue({
        name: 'space-mod',
        version: '1.0.0',
        dependencies: ['space-age'],
      });

      const res = service.uploadArchive('/tmp/space-mod.zip', 'space-mod.zip');
      expect(res.ok).toBe(false);
      expect(res.error).toBe('requires_space_age');
    });

    it('copies archive and registers mod in mod-list on success', () => {
      mockExistsSync.mockReturnValue(true);
      mockHasSpaceAge.mockReturnValue(true);
      mockReadModManifest.mockReturnValue({
        name: 'good-mod',
        version: '1.0.0',
        dependencies: [],
      });
      mockReadModList.mockReturnValue({ mods: [] });

      const res = service.uploadArchive(
        '/tmp/good-mod.zip',
        'good-mod.zip',
        'admin',
      );
      expect(res.ok).toBe(true);
      expect(res.name).toBe('good-mod');
      expect(res.file).toBe('good-mod_1.0.0.zip');
    });
  });

  describe('disableConflicts', () => {
    it('disables conflicting mods using modPlanService', () => {
      const res = service.disableConflicts(['conflicting-mod']);
      expect(res).toEqual({
        ok: true,
        disabled: ['conflicting-mod'],
      });
      expect(modPlanMock.disableConflictingMods).toHaveBeenCalledWith(fakePm, [
        'conflicting-mod',
      ]);
    });

    it('returns empty array if no names provided', () => {
      const res = service.disableConflicts([]);
      expect(res).toEqual({ ok: true, disabled: [] });
    });
  });

  describe('downloadPath and buildArchive', () => {
    it('locates download path for mod by name or filename', () => {
      mockReaddirSync.mockReturnValue(['flib_1.0.0.zip', 'other_2.0.0.zip']);

      expect(service.downloadPath('flib_1.0.0.zip')).toEqual({
        ok: true,
        path: join(fakePm.modsDir, 'flib_1.0.0.zip'),
        name: 'flib_1.0.0.zip',
      });
      expect(service.downloadPath('nonexistent')).toEqual({
        ok: false,
        error: 'not_found',
      });
    });

    it('buildArchive creates a zip with local mods', () => {
      mockReaddirSync.mockReturnValue(['flib_1.0.0.zip']);

      const res = service.buildArchive();
      expect(res.ok).toBe(true);
      expect(res.name).toBe('Main Server-mods.zip');
      expect(res.path).toContain('fcc_mods_');
    });
  });

  describe('portalReleases', () => {
    it('returns error if mod id is invalid or builtin', async () => {
      portalMock.isBuiltin.mockReturnValue(true);
      const res = await service.portalReleases('base');
      expect(res).toEqual({ ok: false, error: 'invalid_mod_id' });
    });

    it('fetches releases from portal and includes local installed versions', async () => {
      mockInstalledModVersions.mockReturnValue(['0.14.0']);
      mockReadModList.mockReturnValue({
        mods: [{ name: 'flib', enabled: true, version: '0.14.0' }],
      });

      const res = await service.portalReleases('flib');
      expect(res.ok).toBe(true);
      expect(res.name).toBe('flib');
      expect(res.recommended_version).toBe('0.14.0');
      expect(res.installed_version).toBe('0.14.0');
    });

    it('falls back to local installed versions if portal fetch fails', async () => {
      portalMock.fetchFull.mockRejectedValue(new Error('Network error'));
      mockInstalledModVersions.mockReturnValue(['0.13.0']);
      mockReadModList.mockReturnValue({
        mods: [{ name: 'flib', enabled: true }],
      });
      mockLatestVersion.mockReturnValue('0.13.0');

      const res = await service.portalReleases('flib');
      expect(res.ok).toBe(true);
      expect(res.name).toBe('flib');
      expect(res.installed_version).toBe('0.13.0');
    });
  });

  describe('installPlanBatch and updateAllPlan', () => {
    it('returns empty_name if batch array is empty', async () => {
      const res = await service.installPlanBatch([]);
      expect(res).toEqual({ ok: false, error: 'empty_name' });
    });

    it('executes batch install plan for valid mods', async () => {
      const res = await service.installPlanBatch(['flib']);
      expect(res.ok).toBe(true);
      expect(res.mods).toEqual(['flib']);
      expect(modPlanMock.installPlanDetail).toHaveBeenCalledWith(
        fakePm,
        'flib',
      );
    });

    it('updateAllPlan checks updates and returns plan meta', async () => {
      mockReadModList.mockReturnValue({
        mods: [{ name: 'flib', enabled: true }],
      });
      modPlanMock.scanUpdatesNeedingNewerGame.mockResolvedValue([]);
      modPlanMock.planUpdateAll.mockResolvedValue([
        { name: 'flib_dep', version: '1.0.0' },
      ]);

      const res = await service.updateAllPlan();
      expect(res.ok).toBe(true);
      expect(res.dependencies).toEqual(['flib_dep']);
    });
  });

  describe('jobs delegation', () => {
    it('delegates start, status, and stop to jobs service', () => {
      expect(service.jobStart('install', { mod: 'flib' })).toEqual({
        ok: true,
        started: true,
      });
      expect(jobsMock.start).toHaveBeenCalledWith('install', { mod: 'flib' });

      expect(service.jobStatus()).toEqual({ ok: true, running: false });
      expect(jobsMock.status).toHaveBeenCalled();

      expect(service.jobStop()).toEqual({ ok: true, cancelled: true });
      expect(jobsMock.stop).toHaveBeenCalled();
    });
  });
});
