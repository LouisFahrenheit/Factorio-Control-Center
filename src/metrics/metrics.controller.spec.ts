import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import { MetricsController } from './metrics.controller';
import { InstanceRawMetric } from './entities/instance-raw-metric.entity';
import { InstanceHourlyMetric } from './entities/instance-hourly-metric.entity';
import { AUTH_USER_KEY } from '../auth/auth.guard';
import { SessionUser } from '../common/types';

import { MetricsCollectorService } from './metrics-collector.service';

describe('MetricsController', () => {
  let controller: MetricsController;
  type MockRepoWithConnection = {
    find: jest.Mock;
    metadata: {
      connection: {
        createQueryRunner: jest.Mock;
      };
    };
  };

  let mockRawRepo: MockRepoWithConnection;
  let mockHourlyRepo: MockRepoWithConnection;
  let mockCollector: {
    getLiveMetrics: jest.Mock;
  };
  let mockQueryRunner: {
    query: jest.Mock;
    release: jest.Mock;
  };

  const createFakeReq = (
    overrides: Partial<SessionUser> = {},
    headers: Record<string, string> = {},
  ): Request =>
    ({
      [AUTH_USER_KEY]: {
        username: 'test_user',
        role: 'moderator',
        tabs: ['instances'],
        instance_ids: ['inst-1'],
        enabled: true,
        ...overrides,
      },
      headers: {
        ...headers,
      },
    }) as unknown as Request;

  beforeEach(() => {
    mockQueryRunner = {
      query: jest.fn().mockResolvedValue([]),
      release: jest.fn().mockResolvedValue(undefined),
    };

    mockRawRepo = {
      find: jest.fn().mockResolvedValue([]),
      metadata: {
        connection: {
          createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
        },
      },
    };

    mockHourlyRepo = {
      find: jest.fn().mockResolvedValue([]),
      metadata: {
        connection: {
          createQueryRunner: jest.fn().mockReturnValue(mockQueryRunner),
        },
      },
    };

    mockCollector = {
      getLiveMetrics: jest.fn().mockResolvedValue({
        active: true,
        game_speed: 1.0,
        paused: false,
        research: {
          name: 'automation-2',
          progress_percent: 45.5,
        },
      }),
    };

    controller = new MetricsController(
      mockRawRepo as unknown as Repository<InstanceRawMetric>,
      mockHourlyRepo as unknown as Repository<InstanceHourlyMetric>,
      mockCollector as unknown as MetricsCollectorService,
    );
  });

  describe('access control', () => {
    it('allows administrator to access any instance metrics', async () => {
      const req = createFakeReq({ role: 'administrator', instance_ids: [] });
      await expect(
        controller.getMetrics('any-inst', '24h', req),
      ).resolves.toEqual([]);
    });

    it('allows user with wildcard instance access to access any instance', async () => {
      const req = createFakeReq({ role: 'moderator', instance_ids: ['*'] });
      await expect(
        controller.getMetrics('inst-99', '24h', req),
      ).resolves.toEqual([]);
    });

    it('allows user assigned to specific instance to access that instance', async () => {
      const req = createFakeReq({
        role: 'moderator',
        instance_ids: ['inst-1', 'inst-2'],
      });
      await expect(
        controller.getMetrics('inst-1', '24h', req),
      ).resolves.toEqual([]);
    });

    it('throws ForbiddenException when user is not assigned to instance', async () => {
      const req = createFakeReq({
        role: 'moderator',
        instance_ids: ['inst-1'],
      });
      await expect(
        controller.getMetrics('inst-other', '24h', req),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('range queries', () => {
    const fakeRawMetrics: InstanceRawMetric[] = [
      {
        id: 1,
        instanceId: 'inst-1',
        timestamp: new Date('2026-10-14T10:00:00Z'),
        cpuPercent: 15.5,
        memoryBytes: 104857600,
        onlinePlayers: 3,
        ups: 60.0,
        saveSize: 5242880,
        spm: 120.0,
        espm: 150.0,
        evolution: 0.45,
        evolutionGleba: 0.1,
        pollution: 150,
        pollutionAbsorbed: 140,
        pollutionGleba: 25,
        pollutionGlebaAbsorbed: 20,
        pollutionTotal: 50000,
        pollutionGlebaTotal: 0,
      },
    ];

    it('fetches raw metrics for 1h, 6h, and default 24h ranges', async () => {
      mockRawRepo.find?.mockResolvedValue(fakeRawMetrics);
      const req = createFakeReq({ instance_ids: ['inst-1'] });

      const points = await controller.getMetrics('inst-1', '1h', req);
      expect(points).toHaveLength(1);
      expect(points[0]).toEqual({
        timestamp: '2026-10-14T10:00:00.000Z',
        cpu: 15.5,
        memory: 104857600,
        players: 3,
        ups: 60.0,
        saveSize: 5242880,
        spm: 120.0,
        espm: 150.0,
        evolution: 0.45,
        evolutionGleba: 0.1,
        pollution: 150,
        pollutionAbsorbed: 140,
        pollutionGleba: 25,
        pollutionGlebaAbsorbed: 20,
        pollutionTotal: 50000,
        pollutionGlebaTotal: 0,
      });

      await controller.getMetrics('inst-1', '6h', req);
      await controller.getMetrics('inst-1', '24h', req);
      expect(mockRawRepo.find).toHaveBeenCalledTimes(3);
    });

    it('fetches hourly aggregated metrics for 7d, 30d, 90d, 180d ranges', async () => {
      const fakeHourly: InstanceHourlyMetric[] = [
        {
          id: 1,
          instanceId: 'inst-1',
          timestamp: new Date('2026-10-14T09:00:00Z'),
          cpuAvg: 10,
          cpuMax: 20,
          memoryAvg: 1000,
          memoryMax: 2000,
          playersMax: 5,
          upsAvg: 59.9,
          upsMin: 58.0,
          saveSizeAvg: 5000,
          saveSizeMax: 6000,
          spmAvg: 100,
          spmMax: 150,
          espmAvg: 120,
          espmMax: 180,
          evolutionAvg: 0.4,
          evolutionMax: 0.45,
          evolutionGlebaAvg: 0.1,
          evolutionGlebaMax: 0.15,
          pollutionAvg: 100,
          pollutionMax: 150,
          pollutionAbsorbedAvg: 90,
          pollutionAbsorbedMax: 130,
          pollutionGlebaAvg: 20,
          pollutionGlebaMax: 30,
          pollutionGlebaAbsorbedAvg: 15,
          pollutionGlebaAbsorbedMax: 25,
          pollutionTotalAvg: 45000,
          pollutionTotalMax: 50000,
          pollutionGlebaTotalAvg: 0,
          pollutionGlebaTotalMax: 0,
        },
      ];
      mockHourlyRepo.find?.mockResolvedValue(fakeHourly);
      mockQueryRunner.query.mockResolvedValue([
        {
          hourStr: '2026-10-14T10:00:00.000Z',
          cpuAvg: '12',
          cpuMax: '25',
          memoryAvg: '1200',
          memoryMax: '2200',
          playersMax: '6',
          upsAvg: '60',
          upsMin: '59',
          saveSizeAvg: '5200',
          saveSizeMax: '6100',
          spmAvg: '110',
          spmMax: '160',
          evolutionAvg: '0.42',
          evolutionMax: '0.45',
          evolutionGlebaAvg: '0.12',
          evolutionGlebaMax: '0.15',
          pollutionAvg: '110',
          pollutionMax: '160',
          pollutionAbsorbedAvg: '100',
          pollutionAbsorbedMax: '140',
          pollutionGlebaAvg: '22',
          pollutionGlebaMax: '35',
          pollutionGlebaAbsorbedAvg: '18',
          pollutionGlebaAbsorbedMax: '30',
        },
      ]);

      const req = createFakeReq({ instance_ids: ['inst-1'] });
      const points = await controller.getMetrics('inst-1', '7d', req);

      expect(points).toHaveLength(2);
      expect(mockHourlyRepo.find).toHaveBeenCalled();
      expect(mockQueryRunner.query).toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });

    it('fetches yearly metrics aggregated in 6-hour blocks for 365d/1y range', async () => {
      mockQueryRunner.query.mockResolvedValue([
        {
          blockTime: '2026-10-14 06:00:00',
          cpu: '18',
          cpuMax: '30',
          memory: '1500000',
          memoryMax: '2000000',
          players: '4',
          ups: '60',
          upsMin: '59.5',
          saveSize: '7000',
          saveSizeMax: '8000',
          spm: '130',
          spmMax: '170',
          evolution: '0.4',
          evolutionMax: '0.5',
          evolutionGleba: '0.1',
          evolutionGlebaMax: '0.2',
          pollution: '120',
          pollutionMax: '200',
          pollutionAbsorbed: '110',
          pollutionAbsorbedMax: '180',
          pollutionGleba: '25',
          pollutionGlebaMax: '40',
          pollutionGlebaAbsorbed: '20',
          pollutionGlebaAbsorbedMax: '35',
        },
      ]);

      const req = createFakeReq({ instance_ids: ['inst-1'] });
      const points = await controller.getMetrics('inst-1', '1y', req);

      expect(points).toHaveLength(1);
      expect(points[0].cpu).toBe(18);
      expect(points[0].cpuMax).toBe(30);
      expect(points[0].evolution).toBe(0.4);
      expect(points[0].pollution).toBe(120);
      expect(points[0].pollutionMax).toBe(200);
      expect(points[0].pollutionAbsorbed).toBe(110);
      expect(points[0].pollutionAbsorbedMax).toBe(180);
      expect(points[0].pollutionGleba).toBe(25);
      expect(points[0].pollutionGlebaMax).toBe(40);
      expect(points[0].pollutionGlebaAbsorbed).toBe(20);
      expect(points[0].pollutionGlebaAbsorbedMax).toBe(35);
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });

  describe('getLiveMetrics', () => {
    it('returns live metrics when access is allowed', async () => {
      const req = createFakeReq(
        { instance_ids: ['inst-1'] },
        { 'x-fcc-ui-lang': 'ru' },
      );
      const live = await controller.getLiveMetrics('inst-1', req);
      expect(mockCollector.getLiveMetrics).toHaveBeenCalledWith('inst-1', 'ru');
      expect(live?.active).toBe(true);
      expect(live?.research?.name).toBe('automation-2');
    });

    it('falls back to en when x-fcc-ui-lang header is absent', async () => {
      const req = createFakeReq({ instance_ids: ['inst-1'] });
      await controller.getLiveMetrics('inst-1', req);
      expect(mockCollector.getLiveMetrics).toHaveBeenCalledWith('inst-1', 'en');
    });

    it('throws ForbiddenException when user does not have access', async () => {
      const req = createFakeReq({ instance_ids: ['inst-other'] });
      await expect(controller.getLiveMetrics('inst-1', req)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});
