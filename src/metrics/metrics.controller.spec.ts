import { ForbiddenException } from '@nestjs/common';
import { Repository } from 'typeorm';
import type { Request } from 'express';
import { MetricsController } from './metrics.controller';
import { InstanceRawMetric } from './entities/instance-raw-metric.entity';
import { InstanceHourlyMetric } from './entities/instance-hourly-metric.entity';
import { AUTH_USER_KEY } from '../auth/auth.guard';
import { SessionUser } from '../common/types';

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
  let mockQueryRunner: {
    query: jest.Mock;
    release: jest.Mock;
  };

  const createFakeReq = (overrides: Partial<SessionUser> = {}): Request =>
    ({
      [AUTH_USER_KEY]: {
        username: 'test_user',
        role: 'moderator',
        tabs: ['instances'],
        instance_ids: ['inst-1'],
        enabled: true,
        ...overrides,
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

    controller = new MetricsController(
      mockRawRepo as unknown as Repository<InstanceRawMetric>,
      mockHourlyRepo as unknown as Repository<InstanceHourlyMetric>,
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
        },
      ]);

      const req = createFakeReq({ instance_ids: ['inst-1'] });
      const points = await controller.getMetrics('inst-1', '1y', req);

      expect(points).toHaveLength(1);
      expect(points[0].cpu).toBe(18);
      expect(points[0].cpuMax).toBe(30);
      expect(mockQueryRunner.release).toHaveBeenCalled();
    });
  });
});
