import { Repository } from 'typeorm';
import pidusage from 'pidusage';
import { MetricsCollectorService } from './metrics-collector.service';
import { InstanceRawMetric } from './entities/instance-raw-metric.entity';
import { InstanceHourlyMetric } from './entities/instance-hourly-metric.entity';
import { RuntimeService } from '../ops/runtime.service';
import { InstancesService } from '../instances/instances.service';
import { NotificationsService } from '../notifications/notifications.service';

jest.mock('pidusage');

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
  };

  let mockRawRepo: MockRawRepo;
  let mockHourlyRepo: MockHourlyRepo;
  let mockRuntime: MockRuntime;
  let mockInstances: Partial<Record<keyof InstancesService, jest.Mock>>;
  let mockNotifications: Partial<Record<keyof NotificationsService, jest.Mock>>;
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
});
