import * as fs from 'fs';
import { Test, TestingModule } from '@nestjs/testing';
import { FccConfigService } from '../../config/fcc-config.service';
import { InstancesService } from '../../instances/instances.service';
import { AuditLogService } from '../../maintenance/audit-log.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { InstanceHistoryService } from '../instance-history.service';
import { RuntimeService } from '../runtime.service';
import { FactorioUpdateService } from './factorio-update.service';
import type { InstanceItem } from '../../common/types';
import { markFactorioUpdated } from '../instance-server-data';

jest.mock('../instance-server-data', () => ({
  markFactorioUpdated: jest.fn(),
}));

jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: jest.fn(actual.existsSync),
    readFileSync: jest.fn(actual.readFileSync),
  };
});

describe('FactorioUpdateService', () => {
  let service: FactorioUpdateService;
  let mockInstances: {
    getSelected: jest.Mock;
    load: jest.Mock;
    withInstance: jest.Mock;
    select: jest.Mock;
  };
  let mockRuntime: {
    isRunning: jest.Mock;
  };
  let mockConfig: {
    webPanel: Record<string, string>;
  };
  let mockAuditLog: {
    record: jest.Mock;
  };
  let mockInstanceHistory: {
    recordFactorioUpdate: jest.Mock;
  };
  let mockNotifications: {
    onFactorioUpdateAvailable: jest.Mock;
    onFactorioUpdatesBatch: jest.Mock;
  };

  const sampleInstance: InstanceItem = {
    id: 'inst-1',
    name: 'Server 1',
    serverPath: '/servers/srv1',
    ip: '0.0.0.0',
    port: '34197',
    rconPort: 27015,
    rconPassword: 'pass',
    autostartServer: false,
    autoEnterPanel: false,
    launchSave: 'world.zip',
    blockUpdates: false,
    experimentalUpdates: false,
  };

  beforeEach(async () => {
    mockInstances = {
      getSelected: jest.fn().mockReturnValue(sampleInstance),
      load: jest.fn().mockReturnValue({
        version: 1,
        selectedId: 'inst-1',
        items: [sampleInstance],
      }),
      withInstance: jest
        .fn()
        .mockImplementation((_id: string, fn: () => Promise<unknown>) => fn()),
      select: jest.fn().mockResolvedValue(undefined),
    };

    mockRuntime = {
      isRunning: jest.fn().mockReturnValue(false),
    };

    mockConfig = {
      webPanel: {
        global_username: 'factorio_user',
        global_token: 'factorio_token',
      },
    };

    mockAuditLog = {
      record: jest.fn(),
    };

    mockInstanceHistory = {
      recordFactorioUpdate: jest.fn(),
    };

    mockNotifications = {
      onFactorioUpdateAvailable: jest.fn(),
      onFactorioUpdatesBatch: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FactorioUpdateService,
        { provide: InstancesService, useValue: mockInstances },
        { provide: RuntimeService, useValue: mockRuntime },
        { provide: FccConfigService, useValue: mockConfig },
        { provide: AuditLogService, useValue: mockAuditLog },
        { provide: InstanceHistoryService, useValue: mockInstanceHistory },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get<FactorioUpdateService>(FactorioUpdateService);
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest
      .mocked(fs.existsSync)
      .mockImplementation(
        jest.requireActual<typeof import('fs')>('fs').existsSync,
      );
    jest
      .mocked(fs.readFileSync)
      .mockImplementation(
        jest.requireActual<typeof import('fs')>('fs').readFileSync,
      );
  });

  describe('module lifecycle timers', () => {
    it('should schedule startup check after 2 minutes and recurring check every 6 hours', () => {
      jest.useFakeTimers();
      const checkAllSpy = jest
        .spyOn(service, 'checkAll')
        .mockResolvedValue({ ok: true });

      service.onModuleInit();

      // Before 2 minutes: checkAll not called yet
      jest.advanceTimersByTime(119_000);
      expect(checkAllSpy).not.toHaveBeenCalled();

      // At 2 minutes: startup check runs
      jest.advanceTimersByTime(1000);
      expect(checkAllSpy).toHaveBeenCalledTimes(1);

      // At 6 hours later: recurring check runs
      jest.advanceTimersByTime(6 * 60 * 60 * 1000);
      expect(checkAllSpy).toHaveBeenCalledTimes(2);

      service.onModuleDestroy();
      jest.advanceTimersByTime(6 * 60 * 60 * 1000);
      expect(checkAllSpy).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });

  describe('check for updates', () => {
    it('should return error if no instance is selected', async () => {
      mockInstances.getSelected.mockReturnValue(null);
      const res = await service.check();
      expect(res).toEqual({ ok: false, error: 'instance_not_found' });
    });

    it('should return check_skipped when updates are blocked by instance setting', async () => {
      mockInstances.getSelected.mockReturnValue({
        ...sampleInstance,
        blockUpdates: true,
      });

      jest
        .spyOn(
          service as unknown as {
            prepareLocalVersionOnly: () => Promise<{
              ok: boolean;
              ver: string;
            }>;
          },
          'prepareLocalVersionOnly',
        )
        .mockResolvedValue({ ok: true, ver: '2.0.10' });

      const res = await service.check();
      expect(res).toEqual({
        ok: true,
        current: '2.0.10',
        latest_stable: '2.0.10',
        updates: [],
        check_skipped: 'updates_blocked_by_instance_setting',
      });
    });

    it('should return error if prepareLocalVersionOnly fails for blocked instance', async () => {
      mockInstances.getSelected.mockReturnValue({
        ...sampleInstance,
        blockUpdates: true,
      });

      jest
        .spyOn(
          service as unknown as {
            prepareLocalVersionOnly: () => Promise<{
              ok: boolean;
              error: string;
            }>;
          },
          'prepareLocalVersionOnly',
        )
        .mockResolvedValue({
          ok: false,
          error: 'about_factorio_update_version_unknown',
        });

      const res = await service.check();
      expect(res).toEqual({
        ok: false,
        error: 'about_factorio_update_version_unknown',
      });
    });

    it('should check and find updates, emitting notification', async () => {
      jest
        .spyOn(
          service as unknown as {
            prepare: () => Promise<Record<string, unknown>>;
          },
          'prepare',
        )
        .mockResolvedValue({
          ok: true,
          ver: '2.0.10',
          avail: {
            'core-win64': [
              { from: '', stable: '2.0.12' },
              { from: '2.0.10', to: '2.0.11' },
              { from: '2.0.11', to: '2.0.12' },
            ],
          },
          pkg: 'core-win64',
          serverPath: '/servers/srv1',
        });

      const res = await service.check();
      expect(res.ok).toBe(true);
      expect(res.current).toBe('2.0.10');
      expect(res.latest_stable).toBe('2.0.12');
      expect(res.updates).toEqual([
        { from: '2.0.10', to: '2.0.11' },
        { from: '2.0.11', to: '2.0.12' },
      ]);
      expect(mockNotifications.onFactorioUpdateAvailable).toHaveBeenCalledWith(
        '2.0.10',
        '2.0.12',
        'inst-1',
        'Server 1',
      );
    });

    it('should suppress notification when options.notify is false', async () => {
      jest
        .spyOn(
          service as unknown as {
            prepare: () => Promise<Record<string, unknown>>;
          },
          'prepare',
        )
        .mockResolvedValue({
          ok: true,
          ver: '2.0.10',
          avail: {
            'core-win64': [
              { from: '', stable: '2.0.11' },
              { from: '2.0.10', to: '2.0.11' },
            ],
          },
          pkg: 'core-win64',
          serverPath: '/servers/srv1',
        });

      await service.check({ notify: false });
      expect(
        mockNotifications.onFactorioUpdateAvailable,
      ).not.toHaveBeenCalled();
    });
  });

  describe('checkAll', () => {
    it('should process all instances and batch notify pending updates', async () => {
      mockInstances.load.mockReturnValue({
        selectedId: 'inst-1',
        items: [
          { ...sampleInstance, id: 'inst-1', name: 'Server 1' },
          {
            ...sampleInstance,
            id: 'inst-2',
            name: 'Server 2',
            blockUpdates: true,
          },
        ],
      });

      jest.spyOn(service, 'check').mockResolvedValue({
        ok: true,
        current: '2.0.10',
        latest_stable: '2.0.12',
        updates: [{ from: '2.0.10', to: '2.0.12' }],
      });

      const res = await service.checkAll();
      expect(res.ok).toBe(true);
      const items = res.items as Record<string, unknown>[];
      expect(items).toHaveLength(2);
      expect(items[0]).toEqual({
        id: 'inst-1',
        name: 'Server 1',
        ok: true,
        has_updates: true,
        latest_stable: '2.0.12',
        updates_count: 1,
      });
      expect(items[1]).toEqual({
        id: 'inst-2',
        name: 'Server 2',
        ok: true,
        has_updates: false,
        latest_stable: '',
        updates_count: 0,
        check_skipped: 'updates_blocked_by_instance_setting',
      });

      expect(mockNotifications.onFactorioUpdatesBatch).toHaveBeenCalledWith([
        {
          instanceId: 'inst-1',
          instanceName: 'Server 1',
          currentVersion: '2.0.10',
          targetVersion: '2.0.12',
        },
      ]);
      expect(mockInstances.select).toHaveBeenCalledWith('inst-1');
    });

    it('should handle failure of individual instance check in checkAll', async () => {
      mockInstances.load.mockReturnValue({
        selectedId: 'inst-1',
        items: [{ ...sampleInstance, id: 'inst-1' }],
      });

      jest.spyOn(service, 'check').mockResolvedValue({
        ok: false,
        error: 'connection_refused',
      });

      const res = await service.checkAll();
      expect(res.ok).toBe(true);
      const items = res.items as Record<string, unknown>[];
      expect(items[0]).toEqual({
        id: 'inst-1',
        name: 'Server 1',
        ok: false,
        error: 'connection_refused',
      });
      expect(mockNotifications.onFactorioUpdatesBatch).not.toHaveBeenCalled();
    });
  });

  describe('releases', () => {
    it('should parse stable and experimental releases from HTML archive page', async () => {
      const mockHtml = `
        <a class="version-button-stable" href="/download/archive/2.0.12">2.0.12</a>
        <a class="version-button-stable" href="/download/archive/2.0.10">2.0.10</a>
        <a class="version-button-experimental" href="/download/archive/2.0.13">2.0.13</a>
      `;

      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        text: jest.fn().mockResolvedValue(mockHtml),
      });

      const res = await service.releases();
      expect(res.ok).toBe(true);
      expect(res.releases).toEqual({
        stable: ['2.0.12', '2.0.10'],
        experimental: ['2.0.13'],
      });
    });

    it('should fallback to latest-releases API when HTML scraping yields no releases', async () => {
      const mockApiData = {
        stable: { alpha: '2.0.12', headless: '2.0.12' },
        experimental: { alpha: '2.0.13', headless: '2.0.13' },
      };

      global.fetch = jest
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          text: jest.fn().mockResolvedValue(''),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: jest.fn().mockResolvedValue(mockApiData),
        });

      const res = await service.releases();
      expect(res.ok).toBe(true);
      const releases = res.releases as {
        stable?: string[];
        experimental?: string[];
      };
      expect(releases.stable).toContain('2.0.12');
    });

    it('should return error when all release endpoints fail', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const res = await service.releases();
      expect(res.ok).toBe(false);
      expect(res.error).toBe('instance_releases_fetch_failed');
    });
  });

  describe('pickUpdates and selectPackage algorithm', () => {
    it('should chain sequential update patches up to latest stable version', () => {
      const avail = {
        'core-win64': [
          { from: '', stable: '2.0.12' },
          { from: '2.0.10', to: '2.0.11' },
          { from: '2.0.11', to: '2.0.12' },
          { from: '2.0.12', to: '2.0.13' }, // experimental
        ],
      };

      const pickedStable = (
        service as unknown as {
          pickUpdates: (
            avail: Record<string, unknown>,
            pkg: string,
            from: string,
            exp: boolean,
          ) => {
            updates: { from: string; to: string }[];
            latest: [string, string];
          };
        }
      ).pickUpdates(avail, 'core-win64', '2.0.10', false);

      expect(pickedStable.updates).toEqual([
        { from: '2.0.10', to: '2.0.11' },
        { from: '2.0.11', to: '2.0.12' },
      ]);
      expect(pickedStable.latest[0]).toBe('2.0.12');

      const pickedExp = (
        service as unknown as {
          pickUpdates: (
            avail: Record<string, unknown>,
            pkg: string,
            from: string,
            exp: boolean,
          ) => {
            updates: { from: string; to: string }[];
            latest: [string, string];
          };
        }
      ).pickUpdates(avail, 'core-win64', '2.0.10', true);

      expect(pickedExp.updates).toHaveLength(3);
      expect(pickedExp.updates[2]).toEqual({ from: '2.0.12', to: '2.0.13' });
    });

    it('should select expansion package key when flavor is expansion', () => {
      const avail = {
        'core-win64': [],
        'expansion-win64': [],
      };

      const selected = (
        service as unknown as {
          selectPackage: (
            avail: Record<string, unknown>,
            defaultPkg: string,
            flavor: string,
          ) => string;
        }
      ).selectPackage(avail, 'core-win64', 'expansion');

      expect(selected).toBe('expansion-win64');
    });

    it('should select base core package key when flavor is base', () => {
      const avail = {
        'core-win64': [],
        'expansion-win64': [],
      };

      const selected = (
        service as unknown as {
          selectPackage: (
            avail: Record<string, unknown>,
            defaultPkg: string,
            flavor: string,
          ) => string;
        }
      ).selectPackage(avail, 'core-win64', 'base');

      expect(selected).toBe('core-win64');
    });

    it('should select linux expansion package key when flavor is expansion on any runner', () => {
      const avail = {
        'core-linux_headless64': [],
        'expansion-linux_headless64': [],
      };

      const selected = (
        service as unknown as {
          selectPackage: (
            avail: Record<string, unknown>,
            defaultPkg: string,
            flavor: string,
          ) => string;
        }
      ).selectPackage(avail, 'core-linux_headless64', 'expansion');

      expect(selected).toBe('expansion-linux_headless64');
    });
  });

  describe('start, status, and stop', () => {
    it('should reject start if server is currently running', async () => {
      mockRuntime.isRunning.mockReturnValue(true);

      const res = await service.start();
      expect(res).toEqual({ ok: false, error: 'server_running' });
      expect(mockRuntime.isRunning).toHaveBeenCalledWith('inst-1');
    });

    it('should reject start if updates are blocked on instance', async () => {
      mockInstances.getSelected.mockReturnValue({
        ...sampleInstance,
        blockUpdates: true,
      });

      const res = await service.start();
      expect(res).toEqual({
        ok: false,
        error: 'updates_blocked_by_instance_setting',
      });
    });

    it('should reject start if already running', async () => {
      (service as unknown as { state: { running: boolean } }).state.running =
        true;

      const res = await service.start();
      expect(res).toEqual({
        ok: false,
        error: 'factorio_update_already_running',
      });
    });

    it('should report updated: false if no new updates are available', async () => {
      jest
        .spyOn(
          service as unknown as {
            prepare: () => Promise<Record<string, unknown>>;
          },
          'prepare',
        )
        .mockResolvedValue({
          ok: true,
          ver: '2.0.12',
          avail: { 'core-win64': [{ from: '', stable: '2.0.12' }] },
          pkg: 'core-win64',
          serverPath: '/servers/srv1',
        });

      const res = await service.start();
      expect(res).toEqual({
        ok: true,
        updated: false,
        current: '2.0.12',
        latest_stable: '2.0.12',
      });
    });

    it('should reject start if requested targetVersion is not available in update path', async () => {
      jest
        .spyOn(
          service as unknown as {
            prepare: () => Promise<Record<string, unknown>>;
          },
          'prepare',
        )
        .mockResolvedValue({
          ok: true,
          ver: '2.0.10',
          avail: {
            'core-win64': [
              { from: '', stable: '2.0.12' },
              { from: '2.0.10', to: '2.0.11' },
            ],
          },
          pkg: 'core-win64',
          serverPath: '/servers/srv1',
        });

      const res = await service.start('2.0.99');
      expect(res.ok).toBe(false);
      expect(res.error).toBe('target_version_not_available');
      expect(res.available).toEqual(['2.0.11']);
    });

    it('should initiate worker and filter steps up to targetVersion', async () => {
      jest
        .spyOn(
          service as unknown as {
            prepare: () => Promise<Record<string, unknown>>;
          },
          'prepare',
        )
        .mockResolvedValue({
          ok: true,
          ver: '2.0.10',
          avail: {
            'core-win64': [
              { from: '', stable: '2.0.12' },
              { from: '2.0.10', to: '2.0.11' },
              { from: '2.0.11', to: '2.0.12' },
            ],
          },
          pkg: 'core-win64',
          serverPath: '/servers/srv1',
        });

      const workerSpy = jest
        .spyOn(
          service as unknown as {
            worker: (ctx: unknown, updates: unknown[]) => Promise<void>;
          },
          'worker',
        )
        .mockResolvedValue();

      const res = await service.start('2.0.11', { actor: 'alice' });
      expect(res).toEqual({
        ok: true,
        started: true,
        steps: 1,
        from: '2.0.10',
        to: '2.0.11',
      });
      expect(workerSpy).toHaveBeenCalled();

      const st = service.status();
      expect(st.ok).toBe(true);
      expect(st.running).toBe(true);
      expect(st.actor).toBe('alice');
      expect(st.audit_trigger).toBe('manual');
    });

    it('should allow stop when running and mark stop_requested', () => {
      (
        service as unknown as {
          state: { running: boolean; stop_requested: boolean };
        }
      ).state.running = true;

      const res = service.stop();
      expect(res).toEqual({ ok: true });
      expect(service.status().stop_requested).toBe(true);
    });

    it('should return error on stop when not running', () => {
      const res = service.stop();
      expect(res).toEqual({
        ok: false,
        error: 'factorio_update_not_running',
      });
    });
  });

  describe('prepare pipeline and credentials', () => {
    it('should return no_factorio_exe if exe is not found', async () => {
      jest.mocked(fs.existsSync).mockReturnValue(false);
      const res = await (
        service as unknown as {
          prepare: () => Promise<{ ok: boolean; error: string }>;
        }
      ).prepare();
      expect(res).toEqual({ ok: false, error: 'no_factorio_exe' });
    });

    it('should return version_unknown if installedVersion cannot be determined', async () => {
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest
        .spyOn(
          service as unknown as {
            installedVersion: () => Promise<string>;
          },
          'installedVersion',
        )
        .mockResolvedValue('');

      const res = await (
        service as unknown as {
          prepare: () => Promise<{ ok: boolean; error: string }>;
        }
      ).prepare();
      expect(res).toEqual({
        ok: false,
        error: 'about_factorio_update_version_unknown',
      });
    });

    it('should return no_credentials if credentials cannot be resolved', async () => {
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest
        .spyOn(
          service as unknown as {
            installedVersion: () => Promise<string>;
          },
          'installedVersion',
        )
        .mockResolvedValue('2.0.10');
      jest
        .spyOn(
          service as unknown as {
            resolveCredentials: () => { user: string; token: string } | null;
          },
          'resolveCredentials',
        )
        .mockReturnValue(null);

      const res = await (
        service as unknown as {
          prepare: () => Promise<{ ok: boolean; error: string }>;
        }
      ).prepare();
      expect(res).toEqual({
        ok: false,
        error: 'about_factorio_update_no_credentials',
      });
    });

    it('should return package_missing if selected package key is not an array in available versions', async () => {
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest
        .spyOn(
          service as unknown as {
            installedVersion: () => Promise<string>;
          },
          'installedVersion',
        )
        .mockResolvedValue('2.0.10');
      jest
        .spyOn(
          service as unknown as {
            resolveCredentials: () => { user: string; token: string } | null;
          },
          'resolveCredentials',
        )
        .mockReturnValue({ user: 'u', token: 't' });
      jest
        .spyOn(
          service as unknown as {
            getJson: () => Promise<Record<string, unknown>>;
          },
          'getJson',
        )
        .mockResolvedValue({ other_pkg: [] });
      jest
        .spyOn(
          service as unknown as {
            selectPackage: () => string;
          },
          'selectPackage',
        )
        .mockReturnValue('core-win64');

      const res = await (
        service as unknown as {
          prepare: () => Promise<{
            ok: boolean;
            error: string;
            package: string;
          }>;
        }
      ).prepare();
      expect(res).toEqual({
        ok: false,
        error: 'about_factorio_update_package_missing',
        package: 'core-win64',
      });
    });

    it('should return prepared context when all checks succeed', async () => {
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest
        .spyOn(
          service as unknown as {
            installedVersion: () => Promise<string>;
          },
          'installedVersion',
        )
        .mockResolvedValue('2.0.10');
      jest
        .spyOn(
          service as unknown as {
            resolveCredentials: () => { user: string; token: string } | null;
          },
          'resolveCredentials',
        )
        .mockReturnValue({ user: 'usr', token: 'tok' });
      jest
        .spyOn(
          service as unknown as {
            getJson: () => Promise<Record<string, unknown>>;
          },
          'getJson',
        )
        .mockResolvedValue({
          'core-win64': [{ from: '2.0.10', to: '2.0.11' }],
        });
      jest
        .spyOn(
          service as unknown as {
            selectPackage: () => string;
          },
          'selectPackage',
        )
        .mockReturnValue('core-win64');

      const res = await (
        service as unknown as {
          prepare: () => Promise<{
            ok: boolean;
            ver: string;
            user: string;
            token: string;
            pkg: string;
          }>;
        }
      ).prepare();
      expect(res.ok).toBe(true);
      expect(res.ver).toBe('2.0.10');
      expect(res.user).toBe('usr');
      expect(res.token).toBe('tok');
      expect(res.pkg).toBe('core-win64');
    });
  });

  describe('resolveCredentials', () => {
    it('should return global credentials when configured in webPanel', () => {
      mockConfig.webPanel = {
        global_username: 'global_user',
        global_token: 'global_tok',
      };
      const res = (
        service as unknown as {
          resolveCredentials: (
            path: string,
          ) => { user: string; token: string } | null;
        }
      ).resolveCredentials('/some/path');
      expect(res).toEqual({ user: 'global_user', token: 'global_tok' });
    });

    it('should read credentials from settings JSON when global credentials are empty', () => {
      mockConfig.webPanel = {
        global_username: '',
        global_token: '',
      };
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          'service-username': 'svc_user',
          'service-token': 'svc_token',
        }),
      );

      const res = (
        service as unknown as {
          resolveCredentials: (
            path: string,
          ) => { user: string; token: string } | null;
        }
      ).resolveCredentials('/servers/srv1/server-settings.json');
      expect(res).toEqual({ user: 'svc_user', token: 'svc_token' });
    });

    it('should support alternative username/token keys in settings JSON', () => {
      mockConfig.webPanel = {
        global_username: '',
        global_token: '',
      };
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest.mocked(fs.readFileSync).mockReturnValue(
        JSON.stringify({
          username: 'alt_user',
          token: 'alt_token',
        }),
      );

      const res = (
        service as unknown as {
          resolveCredentials: (
            path: string,
          ) => { user: string; token: string } | null;
        }
      ).resolveCredentials('/servers/srv1/server-settings.json');
      expect(res).toEqual({ user: 'alt_user', token: 'alt_token' });
    });

    it('should return null if file does not exist or has invalid JSON', () => {
      mockConfig.webPanel = {
        global_username: '',
        global_token: '',
      };
      jest.mocked(fs.existsSync).mockReturnValue(false);
      const res = (
        service as unknown as {
          resolveCredentials: (
            path: string,
          ) => { user: string; token: string } | null;
        }
      ).resolveCredentials('/nonexistent');
      expect(res).toBeNull();
    });
  });

  describe('logging and fail handling', () => {
    it('should cap log entries at 500 items', () => {
      const helper = service as unknown as {
        log: (
          level: string,
          text: string,
          key?: string,
          args?: unknown[],
        ) => void;
        state: { log: Record<string, unknown>[] };
      };

      for (let i = 0; i < 550; i += 1) {
        helper.log('info', `entry ${i}`);
      }

      expect(helper.state.log.length).toBe(500);
      expect(helper.state.log[0]?.text).toBe('entry 50');
      expect(helper.state.log[499]?.text).toBe('entry 549');
    });

    it('should record key and args in log entry when key is provided', () => {
      const helper = service as unknown as {
        log: (
          level: string,
          text: string,
          key?: string,
          args?: unknown[],
        ) => void;
        state: { log: Record<string, unknown>[] };
      };

      helper.log('warn', '', 'warn_key', ['arg1', 42]);
      const entry = helper.state.log[helper.state.log.length - 1];
      expect(entry?.key).toBe('warn_key');
      expect(entry?.args).toEqual(['arg1', 42]);
    });

    it('should set error state and append to log on fail', () => {
      const helper = service as unknown as {
        fail: (error: string, key?: string, args?: unknown[]) => void;
        state: {
          phase: string;
          error: string;
          error_key: string;
          error_args: unknown[];
          log: Record<string, unknown>[];
        };
      };

      helper.fail('Failed to connect');
      expect(helper.state.phase).toBe('error');
      expect(helper.state.error).toBe('Failed to connect');
      expect(helper.state.log[helper.state.log.length - 1]?.text).toBe(
        'Failed to connect',
      );
    });
  });

  describe('recordUpdateAudit', () => {
    it('should skip recording if phase is not done, error, or cancelled', () => {
      const helper = service as unknown as {
        state: { phase: string };
        recordUpdateAudit: () => void;
      };
      helper.state.phase = 'preparing';
      helper.recordUpdateAudit();
      expect(mockAuditLog.record).not.toHaveBeenCalled();
      expect(mockInstanceHistory.recordFactorioUpdate).not.toHaveBeenCalled();
    });

    it('should record audit log, mark updated, and record history on success (done)', () => {
      const helper = service as unknown as {
        state: {
          phase: string;
          current: string;
          final_to: string;
          started_at: number;
          finished_at: number;
          actor: string;
          server_path: string;
        };
        recordUpdateAudit: () => void;
      };
      helper.state.phase = 'done';
      helper.state.current = '2.0.10';
      helper.state.final_to = '2.0.12';
      helper.state.started_at = 1700000000;
      helper.state.finished_at = 1700000060;
      helper.state.actor = 'admin';
      helper.state.server_path = '/servers/srv1';

      helper.recordUpdateAudit();

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event_kind: 'factorio_update',
          instance_id: 'inst-1',
          instance_name: 'Server 1',
          actor: 'admin',
          success: true,
          message_key: 'audit_event_factorio_update',
          detail: {
            from: '2.0.10',
            to: '2.0.12',
            partial: false,
            cancelled: false,
          },
        }),
      );
      expect(markFactorioUpdated).toHaveBeenCalledWith('/servers/srv1');
      expect(mockInstanceHistory.recordFactorioUpdate).toHaveBeenCalledWith(
        '/servers/srv1',
        'admin',
        true,
        {
          from: '2.0.10',
          to: '2.0.12',
          partial: false,
          error: undefined,
        },
      );
    });

    it('should skip auditLog when maintenance_auto is true but still record history', () => {
      const helper = service as unknown as {
        state: {
          phase: string;
          current: string;
          final_to: string;
          maintenance_auto: boolean;
          server_path: string;
        };
        recordUpdateAudit: () => void;
      };
      helper.state.phase = 'done';
      helper.state.maintenance_auto = true;
      helper.state.server_path = '/servers/srv1';

      helper.recordUpdateAudit();

      expect(mockAuditLog.record).not.toHaveBeenCalled();
      expect(mockInstanceHistory.recordFactorioUpdate).toHaveBeenCalled();
    });

    it('should record audit log with cancelled flag when phase is cancelled', () => {
      const helper = service as unknown as {
        state: {
          phase: string;
          current: string;
          final_to: string;
          server_path: string;
        };
        recordUpdateAudit: () => void;
      };
      helper.state.phase = 'cancelled';
      helper.state.server_path = '/servers/srv1';

      helper.recordUpdateAudit();

      expect(mockAuditLog.record).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          detail: {
            from: '',
            to: '',
            partial: false,
            cancelled: true,
          },
        }),
      );
    });
  });

  describe('getDownloadLink', () => {
    it('should return url when getJson returns array with url', async () => {
      jest
        .spyOn(
          service as unknown as {
            getJson: () => Promise<unknown>;
          },
          'getJson',
        )
        .mockResolvedValue(['https://updater.factorio.com/download/file.zip']);

      const res = await (
        service as unknown as {
          getDownloadLink: (
            u: string,
            t: string,
            p: string,
            from: string,
            to: string,
          ) => Promise<string>;
        }
      ).getDownloadLink('user', 'tok', 'core-win64', '2.0.10', '2.0.11');

      expect(res).toBe('https://updater.factorio.com/download/file.zip');
    });

    it('should return url when getJson returns string', async () => {
      jest
        .spyOn(
          service as unknown as {
            getJson: () => Promise<unknown>;
          },
          'getJson',
        )
        .mockResolvedValue('https://updater.factorio.com/download/file.zip');

      const res = await (
        service as unknown as {
          getDownloadLink: (
            u: string,
            t: string,
            p: string,
            from: string,
            to: string,
          ) => Promise<string>;
        }
      ).getDownloadLink('user', 'tok', 'core-win64', '2.0.10', '2.0.11');

      expect(res).toBe('https://updater.factorio.com/download/file.zip');
    });

    it('should throw error when getJson returns unexpected response', async () => {
      jest
        .spyOn(
          service as unknown as {
            getJson: () => Promise<unknown>;
          },
          'getJson',
        )
        .mockResolvedValue({ not_a_link: true });

      await expect(
        (
          service as unknown as {
            getDownloadLink: (
              u: string,
              t: string,
              p: string,
              from: string,
              to: string,
            ) => Promise<string>;
          }
        ).getDownloadLink('user', 'tok', 'core-win64', '2.0.10', '2.0.11'),
      ).rejects.toThrow('Unexpected get-download-link response');
    });
  });

  describe('tryFinishPartialUpdate', () => {
    it('should return false if installed version is below last applied version', async () => {
      const res = await (
        service as unknown as {
          tryFinishPartialUpdate: (
            ctx: {
              exe: string;
              user: string;
              token: string;
              pkg: string;
              serverPath: string;
            },
            installedVer: string,
            planned: { from: string; to: string }[],
            failedIndex: number,
          ) => Promise<boolean>;
        }
      ).tryFinishPartialUpdate(
        {
          exe: 'exe',
          user: 'u',
          token: 't',
          pkg: 'core-win64',
          serverPath: '/srv',
        },
        '2.0.9',
        [
          { from: '2.0.9', to: '2.0.10' },
          { from: '2.0.10', to: '2.0.11' },
        ],
        1,
      );
      expect(res).toBe(false);
    });

    it('should mark done partial and return true if no further updates remain from installed version', async () => {
      jest
        .spyOn(
          service as unknown as {
            getJson: () => Promise<Record<string, unknown>>;
          },
          'getJson',
        )
        .mockResolvedValue({
          'core-win64': [
            { from: '', stable: '2.0.10' },
            { from: '2.0.9', to: '2.0.10' },
          ],
        });

      const helper = service as unknown as {
        tryFinishPartialUpdate: (
          ctx: {
            exe: string;
            user: string;
            token: string;
            pkg: string;
            serverPath: string;
          },
          installedVer: string,
          planned: { from: string; to: string }[],
          failedIndex: number,
        ) => Promise<boolean>;
        state: {
          phase: string;
          updated: boolean;
          partial: boolean;
          final_to: string;
        };
      };

      const res = await helper.tryFinishPartialUpdate(
        {
          exe: 'exe',
          user: 'u',
          token: 't',
          pkg: 'core-win64',
          serverPath: '/srv',
        },
        '2.0.10',
        [
          { from: '2.0.9', to: '2.0.10' },
          { from: '2.0.10', to: '2.0.11' },
        ],
        1,
      );

      expect(res).toBe(true);
      expect(helper.state.phase).toBe('done');
      expect(helper.state.updated).toBe(true);
      expect(helper.state.partial).toBe(true);
      expect(helper.state.final_to).toBe('2.0.10');
    });
  });

  describe('worker flow', () => {
    it('should skip patch if already at target version', async () => {
      jest
        .spyOn(
          service as unknown as {
            installedVersion: () => Promise<string>;
          },
          'installedVersion',
        )
        .mockResolvedValue('2.0.12');

      const getDlSpy = jest.spyOn(
        service as unknown as {
          getDownloadLink: () => Promise<string>;
        },
        'getDownloadLink',
      );

      await (
        service as unknown as {
          worker: (
            ctx: {
              exe: string;
              user: string;
              token: string;
              pkg: string;
              flavor: string;
              serverPath: string;
              avail: Record<string, unknown>;
              experimental: boolean;
            },
            updates: { from: string; to: string }[],
          ) => Promise<void>;
          state: { phase: string; updated: boolean };
        }
      ).worker(
        {
          exe: 'factorio.exe',
          user: 'u',
          token: 't',
          pkg: 'core-win64',
          flavor: 'base',
          serverPath: '/srv',
          avail: {},
          experimental: false,
        },
        [{ from: '2.0.10', to: '2.0.11' }],
      );

      expect(getDlSpy).not.toHaveBeenCalled();
      expect(
        (service as unknown as { state: { phase: string; updated: boolean } })
          .state.phase,
      ).toBe('done');
    });

    it('should set phase to cancelled when stop_requested is true', async () => {
      const helper = service as unknown as {
        worker: (
          ctx: {
            exe: string;
            user: string;
            token: string;
            pkg: string;
            flavor: string;
            serverPath: string;
            avail: Record<string, unknown>;
            experimental: boolean;
          },
          updates: { from: string; to: string }[],
        ) => Promise<void>;
        state: { stop_requested: boolean; phase: string; cancelled: boolean };
        installedVersion: () => Promise<string>;
      };

      jest.spyOn(helper, 'installedVersion').mockResolvedValue('2.0.10');
      helper.state.stop_requested = true;

      await helper.worker(
        {
          exe: 'factorio.exe',
          user: 'u',
          token: 't',
          pkg: 'core-win64',
          flavor: 'base',
          serverPath: '/srv',
          avail: {},
          experimental: false,
        },
        [{ from: '2.0.10', to: '2.0.11' }],
      );

      expect(helper.state.phase).toBe('cancelled');
      expect(helper.state.cancelled).toBe(true);
    });
  });

  describe('shouldWarnExpansionCoreMismatch', () => {
    it('should return false if flavor is not expansion', () => {
      const res = (
        service as unknown as {
          shouldWarnExpansionCoreMismatch: (
            flavor: string,
            pkg: string,
            avail: Record<string, unknown>,
          ) => boolean;
        }
      ).shouldWarnExpansionCoreMismatch('base', 'core-win64', {});
      expect(res).toBe(false);
    });

    it('should return false if package name includes expansion', () => {
      const res = (
        service as unknown as {
          shouldWarnExpansionCoreMismatch: (
            flavor: string,
            pkg: string,
            avail: Record<string, unknown>,
          ) => boolean;
        }
      ).shouldWarnExpansionCoreMismatch('expansion', 'expansion-win64', {});
      expect(res).toBe(false);
    });
  });
});
