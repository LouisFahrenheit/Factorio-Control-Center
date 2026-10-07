import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import type { Request } from 'express';
import { AuthGuard, AUTH_USER_KEY } from '../auth/auth.guard';
import { InstanceRawMetric } from './entities/instance-raw-metric.entity';
import { InstanceHourlyMetric } from './entities/instance-hourly-metric.entity';
import { SessionUser } from '../common/types';

export interface MetricPoint {
  timestamp: string;
  cpu: number;
  cpuMax?: number;
  memory: number;
  memoryMax?: number;
  players: number;
  ups: number;
  upsMin?: number;
  saveSize: number;
  saveSizeMax?: number;
  spm: number;
  spmMax?: number;
}

interface RawHourlyAggregateRow {
  hourStr: string;
  cpuAvg: string | number;
  cpuMax: string | number;
  memoryAvg: string | number;
  memoryMax: string | number;
  playersMax: string | number;
  upsAvg: string | number;
  upsMin: string | number;
  saveSizeAvg: string | number;
  saveSizeMax: string | number;
  spmAvg: string | number;
  spmMax: string | number;
}

interface BlockTimeAggregateRow {
  blockTime: string;
  cpu: string | number;
  cpuMax: string | number;
  memory: string | number;
  memoryMax: string | number;
  players: string | number;
  ups: string | number;
  upsMin: string | number;
  saveSize: string | number;
  saveSizeMax: string | number;
  spm: string | number;
  spmMax: string | number;
}

@Controller('api')
@UseGuards(AuthGuard)
export class MetricsController {
  constructor(
    @InjectRepository(InstanceRawMetric, 'metricsConnection')
    private readonly rawRepo: Repository<InstanceRawMetric>,
    @InjectRepository(InstanceHourlyMetric, 'metricsConnection')
    private readonly hourlyRepo: Repository<InstanceHourlyMetric>,
  ) {}

  private me(req: Request): SessionUser {
    return (
      (req as Request & { [AUTH_USER_KEY]?: SessionUser })[AUTH_USER_KEY] ?? {
        username: '',
        role: 'moderator',
        tabs: [],
        instance_ids: [],
        enabled: false,
      }
    );
  }

  @Get('metrics/:instanceId')
  async getMetrics(
    @Param('instanceId') instanceId: string,
    @Query('range') range: string = '24h',
    @Req() req: Request,
  ) {
    const user = this.me(req);
    const instances = user.instance_ids || [];
    const isAllowed =
      user.role === 'administrator' ||
      instances.includes('*') ||
      instances.includes(instanceId);

    if (!isAllowed) {
      throw new ForbiddenException('access_denied_to_instance');
    }

    const now = new Date();
    let limitDate: Date;

    switch (range) {
      case '1h':
        limitDate = new Date(now.getTime() - 1 * 60 * 60 * 1000);
        return this.getRawMetrics(instanceId, limitDate);
      case '6h':
        limitDate = new Date(now.getTime() - 6 * 60 * 60 * 1000);
        return this.getRawMetrics(instanceId, limitDate);
      case '24h':
      default:
        limitDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        return this.getRawMetrics(instanceId, limitDate);
      case '7d':
        limitDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        return this.getHourlyMetrics(instanceId, limitDate);
      case '30d':
        limitDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        return this.getHourlyMetrics(instanceId, limitDate);
      case '90d':
        limitDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        return this.getHourlyMetrics(instanceId, limitDate);
      case '180d':
        limitDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
        return this.getHourlyMetrics(instanceId, limitDate);
      case '365d':
      case '1y':
        limitDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        return this.getYearlyMetrics(instanceId, limitDate);
    }
  }

  private async getRawMetrics(
    instanceId: string,
    since: Date,
  ): Promise<MetricPoint[]> {
    const records = await this.rawRepo.find({
      where: {
        instanceId,
        timestamp: MoreThanOrEqual(since),
      },
      order: { timestamp: 'ASC' },
    });

    return records.map((r) => ({
      timestamp: r.timestamp.toISOString(),
      cpu: r.cpuPercent,
      memory: Number(r.memoryBytes), // convert bigint to number
      players: r.onlinePlayers,
      ups: r.ups,
      saveSize: Number(r.saveSize),
      spm: r.spm,
    }));
  }

  private async getHourlyMetrics(
    instanceId: string,
    since: Date,
  ): Promise<MetricPoint[]> {
    // 1. Fetch from hourly table
    const hourlyRecords = await this.hourlyRepo.find({
      where: {
        instanceId,
        timestamp: MoreThanOrEqual(since),
      },
      order: { timestamp: 'ASC' },
    });

    const hourlyMap = new Map<string, MetricPoint>();
    for (const r of hourlyRecords) {
      const ts = r.timestamp.toISOString();
      hourlyMap.set(ts, {
        timestamp: ts,
        cpu: r.cpuAvg,
        cpuMax: r.cpuMax,
        memory: Number(r.memoryAvg),
        memoryMax: Number(r.memoryMax),
        players: r.playersMax,
        ups: r.upsAvg,
        upsMin: r.upsMin,
        saveSize: Number(r.saveSizeAvg),
        saveSizeMax: Number(r.saveSizeMax),
        spm: r.spmAvg,
        spmMax: r.spmMax,
      });
    }

    // 2. Fetch and aggregate from raw table
    const queryRunner = this.rawRepo.metadata.connection.createQueryRunner();
    const rawAggregates = (await queryRunner.query(
      `
      SELECT 
        strftime('%Y-%m-%dT%H:00:00.000Z', timestamp) as hourStr,
        AVG(cpuPercent) as cpuAvg,
        MAX(cpuPercent) as cpuMax,
        AVG(memoryBytes) as memoryAvg,
        MAX(memoryBytes) as memoryMax,
        MAX(onlinePlayers) as playersMax,
        AVG(ups) as upsAvg,
        MIN(ups) as upsMin,
        AVG(saveSize) as saveSizeAvg,
        MAX(saveSize) as saveSizeMax,
        AVG(spm) as spmAvg,
        MAX(spm) as spmMax
      FROM instance_raw_metrics
      WHERE instanceId = ? AND timestamp >= ?
      GROUP BY hourStr
      ORDER BY hourStr ASC
    `,
      [instanceId, since.toISOString()],
    )) as RawHourlyAggregateRow[];
    await queryRunner.release();

    for (const agg of rawAggregates) {
      const ts = new Date(agg.hourStr).toISOString();
      // Raw data is more recent, so override hourly table if there's any overlap
      hourlyMap.set(ts, {
        timestamp: ts,
        cpu: Number(agg.cpuAvg) || 0,
        cpuMax: Number(agg.cpuMax) || 0,
        memory: Math.round(Number(agg.memoryAvg)) || 0,
        memoryMax: parseInt(String(agg.memoryMax), 10) || 0,
        players: parseInt(String(agg.playersMax), 10) || 0,
        ups: Number(agg.upsAvg) || 60.0,
        upsMin: Number(agg.upsMin) || 60.0,
        saveSize: Math.round(Number(agg.saveSizeAvg)) || 0,
        saveSizeMax: parseInt(String(agg.saveSizeMax), 10) || 0,
        spm: Number(agg.spmAvg) || 0,
        spmMax: Number(agg.spmMax) || 0,
      });
    }

    // Convert map to array and sort by timestamp
    return Array.from(hourlyMap.values()).sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );
  }

  private async getYearlyMetrics(
    instanceId: string,
    since: Date,
  ): Promise<MetricPoint[]> {
    const queryRunner = this.hourlyRepo.metadata.connection.createQueryRunner();
    const yearlyMap = new Map<string, MetricPoint>();

    // 1. Fetch and group from hourly table
    const hourlyAggregates = (await queryRunner.query(
      `
      SELECT 
        strftime('%Y-%m-%d ', timestamp) || printf('%02d', CAST(strftime('%H', timestamp) / 6 AS INTEGER) * 6) || ':00:00.000Z' as blockTime,
        AVG(cpuAvg) as cpu,
        MAX(cpuMax) as cpuMax,
        AVG(memoryAvg) as memory,
        MAX(memoryMax) as memoryMax,
        MAX(playersMax) as players,
        AVG(upsAvg) as ups,
        MIN(upsMin) as upsMin,
        AVG(saveSizeAvg) as saveSize,
        MAX(saveSizeMax) as saveSizeMax,
        AVG(spmAvg) as spm,
        MAX(spmMax) as spmMax
      FROM instance_hourly_metrics
      WHERE instanceId = ? AND timestamp >= ?
      GROUP BY blockTime
      ORDER BY blockTime ASC
    `,
      [instanceId, since.toISOString()],
    )) as BlockTimeAggregateRow[];

    for (const agg of hourlyAggregates) {
      const bt = new Date(agg.blockTime).toISOString();
      yearlyMap.set(bt, {
        timestamp: bt,
        cpu: Number(agg.cpu) || 0,
        cpuMax: Number(agg.cpuMax) || 0,
        memory: Math.round(Number(agg.memory)) || 0,
        memoryMax: parseInt(String(agg.memoryMax), 10) || 0,
        players: parseInt(String(agg.players), 10) || 0,
        ups: Number(agg.ups) || 0,
        upsMin: Number(agg.upsMin) || 0,
        saveSize: Math.round(Number(agg.saveSize)) || 0,
        saveSizeMax: parseInt(String(agg.saveSizeMax), 10) || 0,
        spm: Number(agg.spm) || 0,
        spmMax: Number(agg.spmMax) || 0,
      });
    }

    // 2. Fetch and group from raw table (group directly by 6-hour blocks)
    const rawAggregates = (await queryRunner.query(
      `
      SELECT 
        strftime('%Y-%m-%d ', timestamp) || printf('%02d', CAST(strftime('%H', timestamp) / 6 AS INTEGER) * 6) || ':00:00.000Z' as blockTime,
        AVG(cpuPercent) as cpu,
        MAX(cpuPercent) as cpuMax,
        AVG(memoryBytes) as memory,
        MAX(memoryBytes) as memoryMax,
        MAX(onlinePlayers) as players,
        AVG(ups) as ups,
        MIN(ups) as upsMin,
        AVG(saveSize) as saveSize,
        MAX(saveSize) as saveSizeMax,
        AVG(spm) as spm,
        MAX(spm) as spmMax
      FROM instance_raw_metrics
      WHERE instanceId = ? AND timestamp >= ?
      GROUP BY blockTime
      ORDER BY blockTime ASC
    `,
      [instanceId, since.toISOString()],
    )) as BlockTimeAggregateRow[];
    await queryRunner.release();

    for (const agg of rawAggregates) {
      const bt = new Date(agg.blockTime).toISOString();
      // Override or write new blocks
      yearlyMap.set(bt, {
        timestamp: bt,
        cpu: Number(agg.cpu) || 0,
        cpuMax: Number(agg.cpuMax) || 0,
        memory: Math.round(Number(agg.memory)) || 0,
        memoryMax: parseInt(String(agg.memoryMax), 10) || 0,
        players: parseInt(String(agg.players), 10) || 0,
        ups: Number(agg.ups) || 0,
        upsMin: Number(agg.upsMin) || 0,
        saveSize: Math.round(Number(agg.saveSize)) || 0,
        saveSizeMax: parseInt(String(agg.saveSizeMax), 10) || 0,
        spm: Number(agg.spm) || 0,
        spmMax: Number(agg.spmMax) || 0,
      });
    }

    return Array.from(yearlyMap.values()).sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );
  }
}
