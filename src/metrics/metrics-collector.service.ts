import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { existsSync, statSync } from 'fs';
import { join } from 'path';
import { InstanceRawMetric } from './entities/instance-raw-metric.entity';
import { InstanceHourlyMetric } from './entities/instance-hourly-metric.entity';
import { RuntimeService } from '../ops/runtime.service';
import { InstancesService } from '../instances/instances.service';
import pidusage from 'pidusage';

@Injectable()
export class MetricsCollectorService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(MetricsCollectorService.name);
  private timer: NodeJS.Timeout | null = null;
  private dailyTimer: NodeJS.Timeout | null = null;
  private lastTicks = new Map<string, { tick: number; time: number }>();

  constructor(
    @InjectRepository(InstanceRawMetric, 'metricsConnection')
    private readonly rawRepo: Repository<InstanceRawMetric>,
    @InjectRepository(InstanceHourlyMetric, 'metricsConnection')
    private readonly hourlyRepo: Repository<InstanceHourlyMetric>,
    private readonly runtime: RuntimeService,
    private readonly instances: InstancesService,
  ) {}

  onModuleInit() {
    // Collect metrics every 60 seconds
    this.timer = setInterval(() => void this.collect(), 60000);

    // Run daily aggregation and cleanup (starts 10 seconds after boot, then runs every 24 hours)
    setTimeout(() => {
      void this.aggregateAndCleanup();
      this.dailyTimer = setInterval(
        () => void this.aggregateAndCleanup(),
        24 * 60 * 60 * 1000,
      );
    }, 10000);
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
    if (this.dailyTimer) clearInterval(this.dailyTimer);
    pidusage.clear();
  }

  async collect(): Promise<void> {
    const activeInstances = [...this.runtime.runtimes.entries()].filter(
      ([_, rt]) => rt.proc && rt.proc.pid && rt.proc.exitCode === null,
    );

    if (activeInstances.length === 0) return;

    const timestamp = new Date();
    const records: InstanceRawMetric[] = [];

    for (const [id, rt] of activeInstances) {
      if (!rt.proc || !rt.proc.pid) continue;
      try {
        const stats = await pidusage(rt.proc.pid);

        // Calculate game UPS and SPM by checking tick delta and science pack consumption via RCON
        let ups = 60.0;
        let spm = 0.0;
        const luaScript = `
          local tick = game.tick
          local max_spm = 0
          local force = game.forces['player']
          if force then
            local packs = {
              "automation-science-pack",
              "logistic-science-pack",
              "military-science-pack",
              "chemical-science-pack",
              "production-science-pack",
              "utility-science-pack",
              "space-science-pack",
              "metallurgic-science-pack",
              "electromagnetic-science-pack",
              "agricultural-science-pack",
              "cryogenic-science-pack",
              "promethium-science-pack"
            }
            local item_prototypes = prototypes and prototypes.item or game.item_prototypes
            for _, p in ipairs(packs) do
              if item_prototypes and item_prototypes[p] then
                local total_count = 0
                if type(force.get_item_production_statistics) == "function" then
                  for _, surface in pairs(game.surfaces) do
                    local stats = force.get_item_production_statistics(surface)
                    if stats then
                      total_count = total_count + (stats.get_flow_count{name=p, category="output", precision_index=defines.flow_precision_index.one_minute} or 0)
                    end
                  end
                else
                  local stats = force.item_production_statistics
                  if stats then
                    total_count = (stats.get_flow_count{name=p, category="output", precision_index=defines.flow_precision_index.one_minute} or 0)
                  end
                end
                if total_count > max_spm then
                  max_spm = total_count
                end
              end
            end
          end
          rcon.print(tick .. "," .. max_spm)
        `;

        const res = await this.runtime.rconExec(
          id,
          `/silent-command ${luaScript.replace(/\s+/g, ' ').trim()}`,
          false,
        );
        if (res.ok && res.output) {
          const parts = res.output.trim().split(',');
          const currentTick = parseInt(parts[0], 10);
          if (parts[1]) {
            spm = parseFloat(parts[1]) || 0.0;
          }

          if (!isNaN(currentTick)) {
            const last = this.lastTicks.get(id);
            const currentTime = Date.now();
            if (last && currentTick >= last.tick) {
              const tickDiff = currentTick - last.tick;
              const timeDiffSec = (currentTime - last.time) / 1000;
              if (timeDiffSec > 0) {
                // Calculate UPS = ticks / seconds, max 60.0
                ups = Math.min(60.0, Math.max(0.0, tickDiff / timeDiffSec));
              }
            }
            this.lastTicks.set(id, { tick: currentTick, time: currentTime });
          }
        } else {
          // If RCON command failed, server could be starting, sleeping, or frozen
          ups = 0.0;
        }

        // Calculate save size from disk
        let saveSize = 0;
        try {
          const savePath = join(rt.serverPath, 'saves', rt.saveName);
          if (existsSync(savePath)) {
            const st = statSync(savePath);
            saveSize = st.size;
          }
        } catch (err) {
          this.log.debug(`Failed to get save size for instance ${id}: ${err}`);
        }

        const record = this.rawRepo.create({
          instanceId: id,
          timestamp,
          cpuPercent: stats.cpu, // 0 - 100% (or more if multi-core, standard pidusage behavior)
          memoryBytes: stats.memory, // RAM RSS in bytes
          onlinePlayers: Object.keys(rt.onlinePlayers).length,
          ups,
          saveSize,
          spm,
        });
        records.push(record);
      } catch (err) {
        this.log.debug(
          `Failed to collect metrics for instance ${id} (PID ${rt.proc.pid}): ${err}`,
        );
      }
    }

    if (records.length > 0) {
      try {
        await this.rawRepo.save(records);
      } catch (err) {
        this.log.error(`Failed to save raw metrics: ${err}`);
      }
    }
  }

  async aggregateAndCleanup(): Promise<void> {
    this.log.log('Starting daily metrics aggregation and cleanup job...');
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);

    try {
      const rawCount = await this.rawRepo.count({
        where: { timestamp: LessThan(thirtyDaysAgo) },
      });

      if (rawCount > 0) {
        this.log.log(
          `Found ${rawCount} raw metrics older than 30 days. Grouping into hourly aggregates...`,
        );

        const queryRunner = this.rawRepo.metadata.connection.createQueryRunner(
          'metricsConnection' as any,
        );

        // SQLite query to group by hour and calculate aggregates
        const rawAggregates = await queryRunner.query(
          `
          SELECT 
            instanceId,
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
          WHERE timestamp < ?
          GROUP BY instanceId, hourStr
        `,
          [thirtyDaysAgo.toISOString()],
        );

        const hourlyRecords: InstanceHourlyMetric[] = [];
        for (const agg of rawAggregates) {
          const record = this.hourlyRepo.create({
            instanceId: agg.instanceId,
            timestamp: new Date(agg.hourStr),
            cpuAvg: parseFloat(agg.cpuAvg) || 0,
            cpuMax: parseFloat(agg.cpuMax) || 0,
            memoryAvg: Math.round(parseFloat(agg.memoryAvg)) || 0,
            memoryMax: parseInt(agg.memoryMax, 10) || 0,
            playersMax: parseInt(agg.playersMax, 10) || 0,
            upsAvg: parseFloat(agg.upsAvg) || 60.0,
            upsMin: parseFloat(agg.upsMin) || 60.0,
            saveSizeAvg: Math.round(parseFloat(agg.saveSizeAvg)) || 0,
            saveSizeMax: parseInt(agg.saveSizeMax, 10) || 0,
            spmAvg: parseFloat(agg.spmAvg) || 0,
            spmMax: parseFloat(agg.spmMax) || 0,
          });
          hourlyRecords.push(record);
        }

        if (hourlyRecords.length > 0) {
          const chunkSize = 100;
          for (let i = 0; i < hourlyRecords.length; i += chunkSize) {
            await this.hourlyRepo.save(hourlyRecords.slice(i, i + chunkSize));
          }
          this.log.log(
            `Successfully aggregated and saved ${hourlyRecords.length} hourly records.`,
          );
        }

        const deleteRawResult = await this.rawRepo.delete({
          timestamp: LessThan(thirtyDaysAgo),
        });
        this.log.log(
          `Deleted ${deleteRawResult.affected || 0} raw metrics older than 30 days.`,
        );
      }

      const deleteHourlyResult = await this.hourlyRepo.delete({
        timestamp: LessThan(oneYearAgo),
      });
      this.log.log(
        `Deleted ${deleteHourlyResult.affected || 0} hourly metrics older than 365 days.`,
      );

      // Free SQLite database space
      const queryRunner = this.rawRepo.metadata.connection.createQueryRunner(
        'metricsConnection' as any,
      );
      await queryRunner.query('VACUUM');
      this.log.log('VACUUM complete on fcc_metrics.sqlite.');
    } catch (err) {
      this.log.error(`Error during metrics aggregation/cleanup: ${err}`);
    }
  }
}
