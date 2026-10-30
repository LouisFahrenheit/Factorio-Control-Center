import { ModsJobService } from './mods-job.service';
import type { InstancesService } from '../../instances/instances.service';
import type { ModPortalService } from '../mod-portal/mod-portal.service';
import type {
  ModPlanService,
  ModPlanItem,
  ModPlanLogHooks,
} from './mod-plan.service';
import type { RuntimeService } from '../runtime.service';
import type { FccConfigService } from '../../config/fcc-config.service';
import type { AuditLogService } from '../../maintenance/audit-log.service';
import type { InstanceHistoryService } from '../instance-history.service';
import type { InstanceItem } from '../../common/types';
import * as opsUtils from '../ops-utils';
import * as modGameReq from './mod-game-req';

jest.mock('../ops-utils', () => {
  const actual = jest.requireActual<typeof opsUtils>('../ops-utils');
  return {
    ...actual,
    selectedInstance: jest.fn(),
    installedModVersions: jest.fn(),
    latestVersion: jest.fn(),
    trackModInstallMeta: jest.fn(),
  };
});

jest.mock('./mod-game-req', () => ({
  firstPlanItemRequiringNewerGame: jest.fn(),
}));

jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  return {
    ...actual,
    mkdirSync: jest.fn(),
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    statSync: jest.fn(),
    readdirSync: jest.fn(),
    rmSync: jest.fn(),
  };
});

interface MockPortalService {
  loadCredentials: jest.Mock;
  parseModInput: jest.Mock;
  isValidPortalModId: jest.Mock;
  isBuiltin: jest.Mock;
  downloadRelease: jest.Mock;
  pruneOldZips: jest.Mock;
  modIdFromInput: jest.Mock;
}

interface MockPlanService {
  planInstall: jest.Mock;
  planInstallMany: jest.Mock;
  planUpdateAll: jest.Mock;
  conflictsToDisableForInstall: jest.Mock;
  disableConflictingMods: jest.Mock;
  updateRootModIds: jest.Mock;
}

interface MockRuntimeService {
  isRunning: jest.Mock;
}

describe('ModsJobService', () => {
  let service: ModsJobService;

  let mockInstances: { getSelected: jest.Mock };
  let mockPortal: MockPortalService;
  let mockPlan: MockPlanService;
  let mockRuntime: MockRuntimeService;
  let mockConfig: {
    webPanel: {
      global_username?: string;
      global_token?: string;
      mod_download_concurrency: number;
    };
  };
  let mockAuditLog: { record: jest.Mock };
  let mockInstanceHistory: { recordModsJob: jest.Mock };

  const mockSelectedInstance = opsUtils.selectedInstance as jest.Mock;
  const mockFirstPlanItem =
    modGameReq.firstPlanItemRequiringNewerGame as jest.Mock;

  const sampleInstance: InstanceItem = {
    id: 'inst-1',
    name: 'Factorio World',
    serverPath: '/mock/factorio/server',
    blockUpdates: false,
  } as unknown as InstanceItem;

  const samplePm = {
    modsDir: '/mock/factorio/server/mods',
    serverSettings: '/mock/factorio/server/data/server-settings.json',
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockSelectedInstance.mockReturnValue({
      item: sampleInstance,
      pm: samplePm,
    });

    mockInstances = {
      getSelected: jest.fn().mockReturnValue(sampleInstance),
    };

    mockPortal = {
      loadCredentials: jest
        .fn()
        .mockReturnValue({ user: 'player1', token: 'secret' }),
      parseModInput: jest.fn((str: string) => ({
        modName: str.split('@')[0],
        version: str.split('@')[1],
      })),
      isValidPortalModId: jest.fn().mockReturnValue(true),
      isBuiltin: jest.fn().mockReturnValue(false),
      downloadRelease: jest.fn().mockResolvedValue('flib_0.14.8.zip'),
      pruneOldZips: jest.fn(),
      modIdFromInput: jest.fn((str: string) => str.split('@')[0]),
    };

    mockPlan = {
      planInstall: jest.fn().mockResolvedValue([]),
      planInstallMany: jest.fn().mockResolvedValue([]),
      planUpdateAll: jest.fn().mockResolvedValue([]),
      conflictsToDisableForInstall: jest.fn().mockResolvedValue([]),
      disableConflictingMods: jest.fn().mockReturnValue([]),
      updateRootModIds: jest.fn().mockResolvedValue([]),
    };

    mockRuntime = {
      isRunning: jest.fn().mockReturnValue(false),
    };

    mockConfig = {
      webPanel: {
        global_username: 'globalUser',
        global_token: 'globalToken',
        mod_download_concurrency: 2,
      },
    };

    mockAuditLog = {
      record: jest.fn(),
    };

    mockInstanceHistory = {
      recordModsJob: jest.fn(),
    };

    service = new ModsJobService(
      mockInstances as unknown as InstancesService,
      mockPortal as unknown as ModPortalService,
      mockPlan as unknown as ModPlanService,
      mockRuntime as unknown as RuntimeService,
      mockConfig as unknown as FccConfigService,
      mockAuditLog as unknown as AuditLogService,
      mockInstanceHistory as unknown as InstanceHistoryService,
    );
  });

  describe('isRunningForInstance & status & stop', () => {
    it('returns false when no job is running', () => {
      expect(service.isRunningForInstance('inst-1')).toBe(false);
      expect(service.isRunningForInstance('')).toBe(false);
    });

    it('returns idle status snapshot initially', () => {
      const res = service.status();
      expect(res.ok).toBe(true);
      expect(res['running']).toBe(false);
      expect(res['phase']).toBe('idle');
    });

    it('fails to stop when no job is running', () => {
      const res = service.stop();
      expect(res).toEqual({ ok: false, error: 'mod_job_not_running' });
    });
  });

  describe('start pre-checks and validation', () => {
    it('returns error if no instance is selected', () => {
      mockSelectedInstance.mockReturnValue({
        ok: false,
        error: 'instance_not_found',
      });
      const res = service.start('install', { mod: 'flib' });
      expect(res).toEqual({ ok: false, error: 'instance_not_found' });
    });

    it('blocks update modes when instance has blockUpdates flag set', () => {
      mockSelectedInstance.mockReturnValue({
        item: { ...sampleInstance, blockUpdates: true },
        pm: samplePm,
      });

      const resUpdateOne = service.start('update', { mod: 'flib' });
      expect(resUpdateOne).toEqual({
        ok: false,
        error: 'updates_blocked_by_instance_setting',
      });

      const resUpdateAll = service.start('update_all', {});
      expect(resUpdateAll).toEqual({
        ok: false,
        error: 'updates_blocked_by_instance_setting',
      });
    });

    it('blocks job start when server instance is running', () => {
      mockRuntime.isRunning.mockReturnValue(true);
      const res = service.start('install', { mod: 'flib' });
      expect(res).toEqual({ ok: false, error: 'server_running' });
    });

    it('blocks duplicate start when job is already running', async () => {
      // Delay planInstall to keep job running
      mockPlan.planInstall.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 50)),
      );

      const first = service.start('install', { mod: 'flib' });
      expect(first.ok).toBe(true);
      expect(service.isRunningForInstance('inst-1')).toBe(true);

      const second = service.start('install', { mod: 'flib' });
      expect(second).toEqual({ ok: false, error: 'mod_job_already_running' });

      // Wait for background job to finish
      await new Promise((resolve) => setTimeout(resolve, 80));
    });
  });

  describe('worker error handling', () => {
    it('records error when portal credentials are missing', async () => {
      mockPortal.loadCredentials.mockReturnValue(null);

      service.start('install', { mod: 'flib' });
      await new Promise((resolve) => setTimeout(resolve, 20));

      const status = service.status();
      expect(status['phase']).toBe('error');
      expect(status['error']).toBe('mod_portal_no_credentials');
      expect(status['error_key']).toBe('missing_credentials');
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'mod_portal_no_credentials',
        }),
      );
    });

    it('fails when mod id is invalid or builtin in install mode', async () => {
      mockPortal.isValidPortalModId.mockReturnValue(false);

      service.start('install', { mod: 'invalid$$mod' });
      await new Promise((resolve) => setTimeout(resolve, 20));

      let status = service.status();
      expect(status['phase']).toBe('error');
      expect(status['error']).toBe('invalid_mod_id');

      mockPortal.isValidPortalModId.mockReturnValue(true);
      mockPortal.isBuiltin.mockReturnValue(true);

      service.start('install', { mod: 'base' });
      await new Promise((resolve) => setTimeout(resolve, 20));

      status = service.status();
      expect(status['phase']).toBe('error');
      expect(status['error']).toBe('builtin');
    });

    it('fails when newer factorio version is required and not confirmed', async () => {
      mockFirstPlanItem.mockReturnValue({
        mod: 'space-exploration',
        required: '2.0.0',
        current: '1.1.100',
      });

      mockPlan.planInstall.mockResolvedValue([
        {
          name: 'space-exploration',
          version: '0.6.0',
          local_version: '',
          release: {},
        },
      ]);

      service.start('install', {
        mod: 'space-exploration',
        allow_requires_game_update: false,
      });
      await new Promise((resolve) => setTimeout(resolve, 20));

      const status = service.status();
      expect(status['phase']).toBe('error');
      expect(status['error']).toBe('requires_game_update_confirm');
      expect(status['error_key']).toBe('mod_job_requires_newer_game_confirm');
    });
  });

  describe('install single mod flow', () => {
    it('successfully downloads and installs a mod with sequential processing', async () => {
      mockConfig.webPanel.mod_download_concurrency = 1;
      const planItem: ModPlanItem = {
        name: 'flib',
        version: '0.14.8',
        release: { version: '0.14.8', file_name: 'flib_0.14.8.zip' },
        local_version: '',
      };

      mockPlan.planInstall.mockResolvedValue([planItem]);
      mockFirstPlanItem.mockReturnValue(null);

      const res = service.start('install', { mod: 'flib', actor: 'AdminUser' });
      expect(res.ok).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 30));

      const status = service.status();
      expect(status['phase']).toBe('done');
      const summary = status['summary'] as { installed: unknown[] };
      expect(summary.installed.length).toBe(1);
      expect(summary.installed[0]).toEqual(
        expect.objectContaining({ name: 'flib', version: '0.14.8' }),
      );

      expect(mockPortal.downloadRelease).toHaveBeenCalled();
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event_kind: 'mod_install',
          actor: 'AdminUser',
          success: true,
        }),
      );
      expect(mockInstanceHistory.recordModsJob).toHaveBeenCalled();
    });

    it('handles empty plan (nothing to install)', async () => {
      mockPlan.planInstall.mockResolvedValue([]);
      mockFirstPlanItem.mockReturnValue(null);

      service.start('install', { mod: 'flib' });
      await new Promise((resolve) => setTimeout(resolve, 20));

      const status = service.status();
      expect(status['phase']).toBe('done');
      const summary = status['summary'] as { installed: unknown[] };
      expect(summary.installed.length).toBe(0);
    });
  });

  describe('parallel processing & update_all flow', () => {
    it('downloads multiple mods in parallel according to concurrency setting', async () => {
      mockConfig.webPanel.mod_download_concurrency = 2;
      const items: ModPlanItem[] = [
        {
          name: 'mod-a',
          version: '1.0.0',
          release: { version: '1.0.0' },
          local_version: '',
        },
        {
          name: 'mod-b',
          version: '2.0.0',
          release: { version: '2.0.0' },
          local_version: '',
        },
      ];

      mockPlan.planInstallMany.mockResolvedValue(items);
      mockFirstPlanItem.mockReturnValue(null);

      service.start('install_many', { mods: ['mod-a', 'mod-b'] });
      await new Promise((resolve) => setTimeout(resolve, 40));

      const status = service.status();
      expect(status['phase']).toBe('done');
      const summary = status['summary'] as { installed: unknown[] };
      expect(summary.installed.length).toBe(2);
      expect(mockPortal.downloadRelease).toHaveBeenCalledTimes(2);
    });

    it('runs update_all mode and properly collects skipped & failed items from plan callbacks', async () => {
      mockPlan.planUpdateAll.mockImplementation(
        (
          _pm: unknown,
          _allow: boolean,
          _dry: boolean,
          callbacks?: ModPlanLogHooks,
        ): Promise<ModPlanItem[]> => {
          callbacks?.onSkipped?.('skipped-mod', '1.0.0');
          callbacks?.onFailed?.('failed-mod', 'network_timeout');
          callbacks?.onSkippedRequiresGame?.(
            'future-mod',
            '2.1.0',
            '2.0.0',
            'base',
          );
          const result: ModPlanItem[] = [
            {
              name: 'updated-mod',
              version: '1.2.0',
              local_version: '1.1.0',
              release: { version: '1.2.0' },
            },
          ];
          return Promise.resolve(result);
        },
      );

      service.start('update_all', {});
      await new Promise((resolve) => setTimeout(resolve, 40));

      const status = service.status();
      expect(status['phase']).toBe('done');
      const summary = status['summary'] as {
        updated: unknown[];
        skipped: unknown[];
        failed: unknown[];
      };

      expect(summary.updated.length).toBe(1);
      expect(summary.skipped.length).toBe(2);
      expect(summary.failed.length).toBe(1);
      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event_kind: 'mod_update',
          success: true,
        }),
      );
    });
  });

  describe('job cancellation (stop)', () => {
    it('sets stop_requested and cancels worker gracefully', async () => {
      mockPlan.planInstall.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve([]), 50)),
      );

      service.start('install', { mod: 'flib' });
      expect(service.status()['running']).toBe(true);

      const stopRes = service.stop();
      expect(stopRes.ok).toBe(true);

      await new Promise((resolve) => setTimeout(resolve, 70));

      const status = service.status();
      expect(status['phase']).toBe('cancelled');
      expect(status['running']).toBe(false);
    });
  });

  describe('conflicts handling', () => {
    it('disables conflicting mods before installation', async () => {
      mockPlan.planInstall.mockResolvedValue([]);
      mockPlan.conflictsToDisableForInstall.mockResolvedValue([
        'conflicting-mod',
      ]);
      mockPlan.disableConflictingMods.mockReturnValue(['conflicting-mod']);

      service.start('install', { mod: 'my-mod' });
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(mockPlan.conflictsToDisableForInstall).toHaveBeenCalled();
      expect(mockPlan.disableConflictingMods).toHaveBeenCalled();
    });
  });
});
