import * as fs from 'fs';
import { Repository } from 'typeorm';
import pidusage from 'pidusage';
import { MetricsCollectorService } from './metrics-collector.service';
import { InstanceRawMetric } from './entities/instance-raw-metric.entity';
import { InstanceHourlyMetric } from './entities/instance-hourly-metric.entity';
import { RuntimeService } from '../ops/runtime.service';
import { InstancesService } from '../instances/instances.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as modDisplayTitles from '../ops/mod-display-titles.util';

jest.mock('pidusage');
jest.mock('fs', () => {
  const actual = jest.requireActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: jest.fn(actual.existsSync),
    statSync: jest.fn(actual.statSync),
    readFileSync: jest.fn(actual.readFileSync),
    promises: {
      ...actual.promises,
      readFile: jest.fn(actual.promises.readFile),
    },
  };
});

describe('MetricsCollectorService', () => {
  let service: MetricsCollectorService;
  type MockRawRepo = {
    find: jest.Mock;
    count: jest.Mock;
    create: jest.Mock;
    save: jest.Mock<Promise<InstanceRawMetric[]>, [InstanceRawMetric[]]>;
    delete: jest.Mock;
    metadata: {
      connection: {
        createQueryRunner: jest.Mock;
      };
    };
  };
  type MockHourlyRepo = {
    find: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    delete: jest.Mock;
  };
  type MockRuntime = {
    runtimes: Map<string, unknown>;
    rconExec: jest.Mock;
    isRunning: jest.Mock;
    get: jest.Mock;
  };

  let mockRawRepo: MockRawRepo;
  let mockHourlyRepo: MockHourlyRepo;
  let mockRuntime: MockRuntime;
  let mockInstances: {
    getById: jest.Mock;
  };
  let mockNotifications: {
    getResolvedInstanceConfig: jest.Mock;
    onLowUps: jest.Mock;
  };
  let mockQueryRunner: {
    query: jest.Mock;
    release: jest.Mock;
  };
  let saveMock: jest.Mock<Promise<InstanceRawMetric[]>, [InstanceRawMetric[]]>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockQueryRunner = {
      query: jest.fn().mockResolvedValue([]),
      release: jest.fn().mockResolvedValue(undefined),
    };

    saveMock = jest
      .fn<Promise<InstanceRawMetric[]>, [InstanceRawMetric[]]>()
      .mockImplementation((records: InstanceRawMetric[]) =>
        Promise.resolve(records),
      );

    mockRawRepo = {
      find: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
      create: jest.fn().mockImplementation(
        (data: Partial<InstanceRawMetric>) =>
          ({
            id: 1,
            ...data,
          }) as InstanceRawMetric,
      ),
      save: saveMock,
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
      metadata: {
        connection: {
          createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
        },
      },
    };

    mockHourlyRepo = {
      find: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(
        (data: Partial<InstanceHourlyMetric>) =>
          ({
            id: 1,
            ...data,
          }) as InstanceHourlyMetric,
      ),
      save: jest
        .fn()
        .mockImplementation((records: InstanceHourlyMetric[]) =>
          Promise.resolve(records),
        ),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    };

    mockRuntime = {
      runtimes: new Map(),
      rconExec: jest.fn().mockResolvedValue({ ok: true, output: '1000,0' }),
      isRunning: jest.fn().mockReturnValue(true),
      get: jest
        .fn()
        .mockImplementation((id: string) => mockRuntime.runtimes.get(id)),
    };

    mockInstances = {
      getById: jest.fn().mockReturnValue({ collectGameMetrics: false }),
    };

    mockNotifications = {
      getResolvedInstanceConfig: jest
        .fn()
        .mockReturnValue({ notif_low_ups_threshold: 55 }),
      onLowUps: jest.fn().mockResolvedValue(undefined),
    };

    service = new MetricsCollectorService(
      mockRawRepo as unknown as Repository<InstanceRawMetric>,
      mockHourlyRepo as unknown as Repository<InstanceHourlyMetric>,
      mockRuntime as unknown as RuntimeService,
      mockInstances as unknown as InstancesService,
      mockNotifications as unknown as NotificationsService,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
  });

  describe('lifecycle', () => {
    it('initializes timers on onModuleInit and clears them on onModuleDestroy', () => {
      service.onModuleInit();
      service.onModuleDestroy();
    });
  });

  describe('collect', () => {
    it('returns early when there are no active instances', async () => {
      mockRuntime.runtimes.clear();
      await service.collect();
      expect(mockRawRepo.save).not.toHaveBeenCalled();
    });

    it('collects pidusage stats and saves raw metrics for active instances', async () => {
      (pidusage as unknown as jest.Mock).mockResolvedValue({
        cpu: 25.4,
        memory: 1024 * 1024 * 500,
      });

      mockRuntime.runtimes.set('inst-active', {
        proc: { pid: 12345, exitCode: null },
        onlinePlayers: { player1: {}, player2: {} },
        serverPath: 'e:/factorio',
        saveName: 'save.zip',
      });

      await service.collect();

      expect(saveMock).toHaveBeenCalledTimes(1);
      const callArgs = saveMock.mock.calls[0];
      const saved = callArgs ? callArgs[0] : [];
      expect(saved).toHaveLength(1);
      expect(saved[0].instanceId).toBe('inst-active');
      expect(saved[0].cpuPercent).toBe(25.4);
      expect(saved[0].memoryBytes).toBe(1024 * 1024 * 500);
      expect(saved[0].onlinePlayers).toBe(2);
      expect(saved[0].ups).toBe(60.0);
    });

    it('collects UPS and SPM via companion mod when available', async () => {
      (pidusage as unknown as jest.Mock).mockResolvedValue({
        cpu: 10.0,
        memory: 1024 * 1024 * 100,
      });

      mockRuntime.runtimes.set('inst-mod', {
        proc: { pid: 22222, exitCode: null },
        onlinePlayers: {},
        serverPath: 'e:/factorio',
        saveName: 'save.zip',
      });

      mockInstances.getById.mockReturnValue({ collectGameMetrics: true });
      (fs.existsSync as jest.Mock).mockImplementation((p: string) => {
        if (typeof p === 'string' && p.includes('metrics.json')) return true;
        return false;
      });
      (fs.statSync as jest.Mock).mockReturnValue({
        mtimeMs: Date.now() - 500,
        size: 1024,
      });
      (fs.promises.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify({
          ok: true,
          mod: 'fcc-metrics',
          version: '1.0.0',
          tick: 50000,
          game_speed: 1.0,
          spm: 1250.5,
          espm: 1875.0,
          evolution: {
            factor: 0.75,
            percent: 75.0,
            nauvis_percent: 75.0,
            gleba_percent: 25.0,
          },
          pollution: {
            nauvis: 1250,
            nauvis_absorbed: 1100,
            nauvis_total: 45000,
            gleba: 340,
            gleba_absorbed: 300,
            gleba_total: 1200,
          },
        }),
      );

      await service.collect();

      expect(mockRuntime.rconExec).not.toHaveBeenCalled();

      const saved = saveMock.mock.calls[0][0];
      expect(saved[0].ups).toBe(60.0);
      expect(saved[0].spm).toBe(1250.5);
      expect(saved[0].espm).toBe(1875.0);
      expect(saved[0].evolution).toBe(75.0);
      expect(saved[0].evolutionGleba).toBe(25.0);
      expect(saved[0].pollution).toBe(1250);
      expect(saved[0].pollutionAbsorbed).toBe(1100);
      expect(saved[0].pollutionGleba).toBe(340);
      expect(saved[0].pollutionGlebaAbsorbed).toBe(300);
      expect(saved[0].pollutionTotal).toBe(45000);
      expect(saved[0].pollutionGlebaTotal).toBe(1200);

      const companionMetrics = service.getLatestCompanionMetrics('inst-mod');
      expect(companionMetrics?.evolution?.percent).toBe(75.0);
      expect(companionMetrics?.evolution?.gleba_percent).toBe(25.0);
      expect(companionMetrics?.pollution?.nauvis).toBe(1250);
      expect(companionMetrics?.pollution?.nauvis_absorbed).toBe(1100);
      expect(companionMetrics?.pollution?.nauvis_total).toBe(45000);
      expect(companionMetrics?.pollution?.gleba).toBe(340);
      expect(companionMetrics?.pollution?.gleba_absorbed).toBe(300);
      expect(companionMetrics?.pollution?.gleba_total).toBe(1200);
    });

    it('sets ups and spm to 0 when companion metrics file does not exist', async () => {
      (pidusage as unknown as jest.Mock).mockResolvedValue({
        cpu: 10.0,
        memory: 1024 * 1024 * 100,
      });

      mockRuntime.runtimes.set('inst-no-mod', {
        proc: { pid: 33333, exitCode: null },
        onlinePlayers: {},
        serverPath: 'e:/factorio',
        saveName: 'save.zip',
      });

      mockInstances.getById.mockReturnValue({ collectGameMetrics: true });
      (fs.existsSync as jest.Mock).mockReturnValue(false);

      await service.collect();

      expect(mockRuntime.rconExec).not.toHaveBeenCalled();

      const saved = saveMock.mock.calls[0][0];
      expect(saved[0].ups).toBe(0.0);
      expect(saved[0].spm).toBe(0.0);
    });
  });

  describe('aggregateAndCleanup', () => {
    it('skips aggregation if no raw metrics older than 30 days exist, and runs cleanup', async () => {
      mockRawRepo.count?.mockResolvedValue(0);

      await service.aggregateAndCleanup();

      expect(mockHourlyRepo.save).not.toHaveBeenCalled();
      expect(mockHourlyRepo.delete).toHaveBeenCalled();
      expect(mockQueryRunner.query).toHaveBeenCalledWith('VACUUM');
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('aggregates old raw metrics into hourly records, saves them, and deletes old entries', async () => {
      mockRawRepo.count?.mockResolvedValue(5);
      mockQueryRunner.query.mockImplementation((sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT')) {
          return Promise.resolve([
            {
              instanceId: 'inst-1',
              hourStr: '2026-09-01T12:00:00.000Z',
              cpuAvg: 15.0,
              cpuMax: 30.0,
              memoryAvg: 500000000,
              memoryMax: 600000000,
              playersMax: 4,
              upsAvg: 59.8,
              upsMin: 55.0,
              saveSizeAvg: 1000000,
              saveSizeMax: 1200000,
              spmAvg: 60,
              spmMax: 90,
            },
          ]);
        }
        return Promise.resolve([]);
      });

      await service.aggregateAndCleanup();

      expect(mockHourlyRepo.save).toHaveBeenCalled();
      expect(mockRawRepo.delete).toHaveBeenCalled();
      expect(mockHourlyRepo.delete).toHaveBeenCalled();
      expect(mockQueryRunner.query).toHaveBeenCalledWith('VACUUM');
    });
  });

  describe('getLiveMetrics', () => {
    it('returns null when instance is not running', async () => {
      const res = await service.getLiveMetrics('inst-stopped');
      expect(res).toBeNull();
    });

    it('returns live metrics with companion data when running and mod file is active', async () => {
      mockRuntime.runtimes.set('inst-running', {
        proc: { pid: 12345, exitCode: null },
        onlinePlayers: { player1: {} },
        serverPath: 'e:/factorio',
        saveName: 'save.zip',
      });
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({
        mtimeMs: Date.now() - 500,
        size: 1024,
      });
      (fs.promises.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify({
          ok: true,
          tick: 60000,
          game_speed: 1.5,
          paused: false,
          research: {
            name: 'energy-weapons-damage-1',
            level: 1,
            progress_percent: 88.2,
            units_done: 882,
            units_total: 1000,
            eta_seconds: 45,
          },
        }),
      );

      const res = await service.getLiveMetrics('inst-running');
      expect(res).toBeDefined();
      expect(res?.active).toBe(true);
      expect(res?.game_speed).toBe(1.5);
      expect(res?.paused).toBe(false);
      expect(res?.research?.name).toBe('energy-weapons-damage-1');
      expect(res?.research?.progress_percent).toBe(88.2);
      expect(mockRuntime.rconExec).not.toHaveBeenCalled();
    });

    it('returns paused: true when mod file is older than 3.5 seconds or paused: true', async () => {
      mockRuntime.runtimes.set('inst-paused', {
        proc: { pid: 12345, exitCode: null },
        onlinePlayers: {},
        serverPath: 'e:/factorio',
        saveName: 'save.zip',
      });
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({
        mtimeMs: Date.now() - 10000, // 10s old -> paused
        size: 1024,
      });
      (fs.promises.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify({
          ok: true,
          tick: 60000,
          game_speed: 1.0,
          paused: false,
          research: {
            name: 'worker-robots-speed-7',
            level: 17,
            progress_percent: 10.7,
            units_done: 219849,
            units_total: 2048000,
            eta_seconds: 33440,
          },
        }),
      );

      const res = await service.getLiveMetrics('inst-paused');
      expect(res?.paused).toBe(true);
      expect(res?.research?.level).toBe(17);
      expect(mockRuntime.rconExec).not.toHaveBeenCalled();
    });

    it('enriches research with localised_name when technology translation is resolved', async () => {
      mockRuntime.runtimes.set('inst-trans', {
        proc: { pid: 12345, exitCode: null },
        onlinePlayers: {},
        serverPath: 'e:/factorio',
        saveName: 'save.zip',
      });
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.statSync as jest.Mock).mockReturnValue({
        mtimeMs: Date.now() - 500,
        size: 1024,
      });
      (fs.promises.readFile as jest.Mock).mockResolvedValue(
        JSON.stringify({
          ok: true,
          tick: 60000,
          game_speed: 1.0,
          paused: false,
          research: {
            name: 'worker-robots-speed-7',
            level: 17,
            progress_percent: 50.0,
          },
        }),
      );

      jest
        .spyOn(modDisplayTitles, 'resolveTechnologyTitle')
        .mockReturnValue('Скорость рабочего дрона');

      const res = await service.getLiveMetrics('inst-trans', 'ru');
      expect(res?.research?.localised_name).toBe('Скорость рабочего дрона');
      expect(modDisplayTitles.resolveTechnologyTitle).toHaveBeenCalledWith(
        'e:/factorio',
        'worker-robots-speed-7',
        'ru',
      );
    });

    it('returns disabled: true and active: false when mod is disabled in mod-list.json', async () => {
      mockRuntime.runtimes.set('inst-disabled', {
        proc: { pid: 12345, exitCode: null },
        onlinePlayers: {},
        serverPath: 'e:/factorio',
        saveName: 'save.zip',
      });
      (fs.existsSync as jest.Mock).mockReturnValue(true);
      (fs.promises.readFile as jest.Mock).mockImplementation((path: string) => {
        if (typeof path === 'string' && path.includes('mod-list.json')) {
          return Promise.resolve(
            JSON.stringify({
              mods: [
                { name: 'base', enabled: true },
                { name: 'fcc-metrics', enabled: false },
              ],
            }),
          );
        }
        return Promise.resolve('{}');
      });

      const res = await service.getLiveMetrics('inst-disabled');
      expect(res).toBeDefined();
      expect(res?.active).toBe(false);
      expect(res?.disabled).toBe(true);
    });
  });
});
