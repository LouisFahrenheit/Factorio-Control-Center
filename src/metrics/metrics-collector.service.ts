import {
  Injectable,
  OnModuleInit,
  OnModuleDestroy,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { existsSync, promises as fsPromises, statSync } from 'fs';
import { join } from 'path';
import { InstanceRawMetric } from './entities/instance-raw-metric.entity';
import { InstanceHourlyMetric } from './entities/instance-hourly-metric.entity';
import { RuntimeService } from '../ops/runtime.service';
import { InstancesService } from '../instances/instances.service';
import { NotificationsService } from '../notifications/notifications.service';
import { resolveTechnologyTitle } from '../ops/mod-display-titles.util';
import pidusage from 'pidusage';

interface RawAggregateRow {
  instanceId: string;
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
  espmAvg: string | number;
  espmMax: string | number;
  evolutionAvg: string | number;
  evolutionMax: string | number;
  evolutionGlebaAvg: string | number;
  evolutionGlebaMax: string | number;
  pollutionAvg: string | number;
  pollutionMax: string | number;
  pollutionAbsorbedAvg: string | number;
  pollutionAbsorbedMax: string | number;
  pollutionGlebaAvg: string | number;
  pollutionGlebaMax: string | number;
  pollutionGlebaAbsorbedAvg: string | number;
  pollutionGlebaAbsorbedMax: string | number;
  pollutionTotalAvg: string | number;
  pollutionTotalMax: string | number;
  pollutionGlebaTotalAvg: string | number;
  pollutionGlebaTotalMax: string | number;
}

export interface CompanionEvolutionData {
  factor?: number;
  percent?: number;
  nauvis_percent?: number;
  gleba_percent?: number;
}

export interface CompanionPollutionData {
  nauvis?: number;
  nauvis_absorbed?: number;
  nauvis_total?: number;
  gleba?: number;
  gleba_absorbed?: number;
  gleba_total?: number;
}

export interface CompanionResearchData {
  name?: string;
  localised_name?: string;
  level?: number;
  progress_percent?: number;
  units_done?: number;
  units_total?: number;
  eta_seconds?: number | null;
  ingredients?: Array<{ name: string; amount: number }>;
}

export interface CompanionLiveMetrics {
  active: boolean;
  disabled?: boolean;
  game_speed?: number;
  paused?: boolean;
  research?: CompanionResearchData | null;
  evolution?: CompanionEvolutionData;
  pollution?: CompanionPollutionData;
  updatedAt?: number;
}

export interface CompanionMetricsPayload {
  ok?: boolean;
  tick?: number;
  ups?: number;
  spm?: number;
  espm?: number;
  total_spm?: number;
  game_speed?: number;
  paused?: boolean;
  evolution?: CompanionEvolutionData;
  pollution?: CompanionPollutionData;
  research?: CompanionResearchData;
}

@Injectable()
export class MetricsCollectorService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(MetricsCollectorService.name);
  private timer: NodeJS.Timeout | null = null;
  private dailyTimer: NodeJS.Timeout | null = null;
  private startupTimer: NodeJS.Timeout | null = null;
  private lastTicks = new Map<string, { tick: number; time: number }>();
  private lowUpsStreak = new Map<string, number>();
  private lowUpsAlerted = new Set<string>();
  private latestCompanionMetrics = new Map<string, CompanionLiveMetrics>();

  constructor(
    @InjectRepository(InstanceRawMetric, 'metricsConnection')
    private readonly rawRepo: Repository<InstanceRawMetric>,
    @InjectRepository(InstanceHourlyMetric, 'metricsConnection')
    private readonly hourlyRepo: Repository<InstanceHourlyMetric>,
    private readonly runtime: RuntimeService,
    private readonly instances: InstancesService,
    private readonly notifications: NotificationsService,
  ) {}

  private instanceLabel(id: string): string {
    const item = this.instances.getById(id);
    const name = item?.name?.trim();
    if (name && name !== id) {
      return `"${name}" (${id})`;
    }
    return id;
  }

  onModuleInit() {
    // Collect metrics every 60 seconds
    this.timer = setInterval(() => void this.collect(), 60000);

    // Run daily aggregation and cleanup (starts 10 seconds after boot, then runs every 24 hours)
    this.startupTimer = setTimeout(() => {
      this.startupTimer = null;
      void this.aggregateAndCleanup();
      this.dailyTimer = setInterval(
        () => void this.aggregateAndCleanup(),
        24 * 60 * 60 * 1000,
      );
    }, 10000);
  }

  onModuleDestroy() {
    if (this.startupTimer) clearTimeout(this.startupTimer);
    if (this.timer) clearInterval(this.timer);
    if (this.dailyTimer) clearInterval(this.dailyTimer);
    pidusage.clear();
  }

  async collect(): Promise<void> {
    try {
      const activeInstances = [...this.runtime.runtimes.entries()].filter(
        ([, rt]) => rt.proc && rt.proc.pid && rt.proc.exitCode === null,
      );

      if (activeInstances.length === 0) return;

      const timestamp = new Date();
      const records: InstanceRawMetric[] = [];

      for (const [id, rt] of activeInstances) {
        const pid = rt.proc?.pid;
        if (!pid) continue;

        try {
          const stats = await pidusage(pid);

          // Calculate game UPS and SPM by checking tick delta and science pack consumption via RCON.
          // Only runs if the instance has collectGameMetrics enabled (disabled by default to protect achievements).
          let ups = 60.0;
          let spm = 0.0;
          let espm = 0.0;
          let evolution = 0.0;
          let evolutionGleba = 0.0;
          let pollution = 0.0;
          let pollutionAbsorbed = 0.0;
          let pollutionTotal = 0.0;
          let pollutionGleba = 0.0;
          let pollutionGlebaAbsorbed = 0.0;
          let pollutionGlebaTotal = 0.0;
          const item = this.instances.getById(id);
          if (item?.collectGameMetrics) {
            const gameMetrics = await this.collectInstanceGameMetrics(id);
            ups = gameMetrics.ups;
            spm = gameMetrics.spm;
            espm = gameMetrics.espm;

            const companion = this.latestCompanionMetrics.get(id);
            if (companion?.evolution) {
              if (typeof companion.evolution.nauvis_percent === 'number') {
                evolution = companion.evolution.nauvis_percent;
              } else if (typeof companion.evolution.percent === 'number') {
                evolution = companion.evolution.percent;
              }

              if (typeof companion.evolution.gleba_percent === 'number') {
                evolutionGleba = companion.evolution.gleba_percent;
              }
            }

            if (companion?.pollution) {
              if (typeof companion.pollution.nauvis === 'number') {
                pollution = companion.pollution.nauvis;
              }
              if (typeof companion.pollution.nauvis_absorbed === 'number') {
                pollutionAbsorbed = companion.pollution.nauvis_absorbed;
              }
              if (typeof companion.pollution.nauvis_total === 'number') {
                pollutionTotal = companion.pollution.nauvis_total;
              } else {
                try {
                  const res = await this.runtime.rconExec(
                    id,
                    '/silent-command local sn=game.surfaces["nauvis"]; local sg=game.surfaces["gleba"]; rcon.print((sn and sn.get_total_pollution() or 0) .. "," .. (sg and sg.get_total_pollution() or 0))',
                  );
                  if (res?.ok && res.output) {
                    const parts = res.output.trim().split(',');
                    const nTot = parseFloat(parts[0]);
                    const gTot = parseFloat(parts[1]);
                    if (!isNaN(nTot))
                      pollutionTotal = Math.round(nTot * 10) / 10;
                    if (!isNaN(gTot))
                      pollutionGlebaTotal = Math.round(gTot * 10) / 10;
                  }
                } catch {
                  // Ignore RCON failures
                }
              }
              if (typeof companion.pollution.gleba === 'number') {
                pollutionGleba = companion.pollution.gleba;
              }
              if (typeof companion.pollution.gleba_absorbed === 'number') {
                pollutionGlebaAbsorbed = companion.pollution.gleba_absorbed;
              }
              if (typeof companion.pollution.gleba_total === 'number') {
                pollutionGlebaTotal = companion.pollution.gleba_total;
              }
            }

            const onlineCount = Object.keys(rt.onlinePlayers || {}).length;
            const notifCfg = this.notifications.getResolvedInstanceConfig(id);
            const lowUpsThreshold = notifCfg?.notif_low_ups_threshold ?? 55.0;
            const isLagging =
              ups > 0 && ups < lowUpsThreshold && onlineCount > 0;

            if (isLagging) {
              const streak = (this.lowUpsStreak.get(id) || 0) + 1;
              this.lowUpsStreak.set(id, streak);
              if (streak >= 1 && !this.lowUpsAlerted.has(id)) {
                this.lowUpsAlerted.add(id);
                void this.notifications.onLowUps(
                  id,
                  Number(ups.toFixed(1)),
                  streak,
                );
              }
            } else if (ups >= lowUpsThreshold) {
              this.lowUpsStreak.delete(id);
              this.lowUpsAlerted.delete(id);
            }
          }

          // Calculate save size from disk
          let saveSize = 0;
          try {
            const savePath = join(rt.serverPath, 'saves', rt.saveName);
            if (existsSync(savePath)) {
              const st = statSync(savePath);
              saveSize = st.size;
            }
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.log.debug(
              `Failed to get save size for instance ${this.instanceLabel(id)}: ${msg}`,
            );
          }

          const record = this.rawRepo.create({
            instanceId: id,
            timestamp,
            cpuPercent: stats.cpu, // 0 - 100% (or more if multi-core, standard pidusage behavior)
            memoryBytes: stats.memory, // RAM RSS in bytes
            onlinePlayers: Object.keys(rt.onlinePlayers || {}).length,
            ups,
            saveSize,
            spm,
            espm,
            evolution,
            evolutionGleba,
            pollution,
            pollutionAbsorbed,
            pollutionGleba,
            pollutionGlebaAbsorbed,
            pollutionTotal,
            pollutionGlebaTotal,
          });
          records.push(record);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.log.debug(
            `Failed to collect metrics for instance ${this.instanceLabel(id)} (PID ${pid}): ${msg}`,
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
    } catch (err) {
      this.log.error(`Error during metrics collection: ${err}`);
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

        const queryRunner =
          this.rawRepo.metadata.connection.createQueryRunner();

        // SQLite query to group by hour and calculate aggregates
        const rawAggregates = (await queryRunner.query(
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
            MAX(spm) as spmMax,
            AVG(espm) as espmAvg,
            MAX(espm) as espmMax,
            AVG(evolution) as evolutionAvg,
            MAX(evolution) as evolutionMax,
            AVG(evolutionGleba) as evolutionGlebaAvg,
            MAX(evolutionGleba) as evolutionGlebaMax,
            AVG(pollution) as pollutionAvg,
            MAX(pollution) as pollutionMax,
            AVG(pollutionAbsorbed) as pollutionAbsorbedAvg,
            MAX(pollutionAbsorbed) as pollutionAbsorbedMax,
            AVG(pollutionGleba) as pollutionGlebaAvg,
            MAX(pollutionGleba) as pollutionGlebaMax,
            AVG(pollutionGlebaAbsorbed) as pollutionGlebaAbsorbedAvg,
            MAX(pollutionGlebaAbsorbed) as pollutionGlebaAbsorbedMax,
            AVG(pollutionTotal) as pollutionTotalAvg,
            MAX(pollutionTotal) as pollutionTotalMax,
            AVG(pollutionGlebaTotal) as pollutionGlebaTotalAvg,
            MAX(pollutionGlebaTotal) as pollutionGlebaTotalMax
          FROM instance_raw_metrics
          WHERE timestamp < ?
          GROUP BY instanceId, hourStr
        `,
          [thirtyDaysAgo.toISOString()],
        )) as RawAggregateRow[];
        await queryRunner.release();

        const hourlyRecords: InstanceHourlyMetric[] = [];
        for (const agg of rawAggregates) {
          const record = this.hourlyRepo.create({
            instanceId: agg.instanceId,
            timestamp: new Date(agg.hourStr),
            cpuAvg: Number(agg.cpuAvg) || 0,
            cpuMax: Number(agg.cpuMax) || 0,
            memoryAvg: Math.round(Number(agg.memoryAvg)) || 0,
            memoryMax: parseInt(String(agg.memoryMax), 10) || 0,
            playersMax: parseInt(String(agg.playersMax), 10) || 0,
            upsAvg: Number(agg.upsAvg) || 60.0,
            upsMin: Number(agg.upsMin) || 60.0,
            saveSizeAvg: Math.round(Number(agg.saveSizeAvg)) || 0,
            saveSizeMax: parseInt(String(agg.saveSizeMax), 10) || 0,
            spmAvg: Number(agg.spmAvg) || 0,
            spmMax: Number(agg.spmMax) || 0,
            espmAvg: Number(agg.espmAvg) || 0,
            espmMax: Number(agg.espmMax) || 0,
            evolutionAvg: Number(agg.evolutionAvg) || 0,
            evolutionMax: Number(agg.evolutionMax) || 0,
            evolutionGlebaAvg: Number(agg.evolutionGlebaAvg) || 0,
            evolutionGlebaMax: Number(agg.evolutionGlebaMax) || 0,
            pollutionAvg: Math.round(Number(agg.pollutionAvg)) || 0,
            pollutionMax: Math.round(Number(agg.pollutionMax)) || 0,
            pollutionAbsorbedAvg:
              Math.round(Number(agg.pollutionAbsorbedAvg)) || 0,
            pollutionAbsorbedMax:
              Math.round(Number(agg.pollutionAbsorbedMax)) || 0,
            pollutionGlebaAvg: Math.round(Number(agg.pollutionGlebaAvg)) || 0,
            pollutionGlebaMax: Math.round(Number(agg.pollutionGlebaMax)) || 0,
            pollutionGlebaAbsorbedAvg:
              Math.round(Number(agg.pollutionGlebaAbsorbedAvg)) || 0,
            pollutionGlebaAbsorbedMax:
              Math.round(Number(agg.pollutionGlebaAbsorbedMax)) || 0,
            pollutionTotalAvg: Math.round(Number(agg.pollutionTotalAvg)) || 0,
            pollutionTotalMax: Math.round(Number(agg.pollutionTotalMax)) || 0,
            pollutionGlebaTotalAvg:
              Math.round(Number(agg.pollutionGlebaTotalAvg)) || 0,
            pollutionGlebaTotalMax:
              Math.round(Number(agg.pollutionGlebaTotalMax)) || 0,
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
      const vacuumRunner = this.rawRepo.metadata.connection.createQueryRunner();
      await vacuumRunner.query('VACUUM');
      await vacuumRunner.release();
      this.log.log('VACUUM complete on fcc_metrics.sqlite.');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.log.error(`Error during metrics aggregation/cleanup: ${msg}`);
    }
  }

  /**
   * Reads in-game UPS and SPM metrics exclusively from script-output/factorio-control-center/metrics.json
   * exported periodically by the FCC: Metrics mod.
   * 100% achievement-safe, passive, and never sends RCON commands (avoids waking the server during auto-pause).
   */
  private async collectInstanceGameMetrics(
    id: string,
  ): Promise<{ ups: number; spm: number; espm: number }> {
    let ups = 60.0;
    let spm = 0.0;
    let espm = 0.0;
    const now = Date.now();
    const rt = this.runtime.get(id);
    if (!rt?.serverPath) {
      return { ups, spm, espm };
    }

    // Check if the mod is explicitly disabled in mods/mod-list.json
    const modListPath = join(rt.serverPath, 'mods', 'mod-list.json');
    if (existsSync(modListPath)) {
      try {
        const rawModList = await fsPromises.readFile(modListPath, 'utf-8');
        const parsedModList = JSON.parse(rawModList) as {
          mods?: Array<{ name?: string; enabled?: boolean }>;
        };
        if (Array.isArray(parsedModList?.mods)) {
          const entry = parsedModList.mods.find(
            (m) =>
              m?.name &&
              (m.name === 'fcc-metrics' ||
                m.name === 'factorio-control-center-metrics' ||
                m.name === 'fcc_metrics' ||
                m.name.startsWith('fcc-metrics') ||
                m.name.startsWith('factorio-control-center-metrics') ||
                m.name.startsWith('fcc_metrics')),
          );
          if (entry && entry.enabled === false) {
            this.latestCompanionMetrics.set(id, {
              active: false,
              disabled: true,
              updatedAt: now,
            });
            return { ups: 60.0, spm: 0.0, espm: 0.0 };
          }
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        this.log.debug(
          `Failed to check mod-list.json for instance ${this.instanceLabel(id)}: ${msg}`,
        );
      }
    }

    const filePath = join(
      rt.serverPath,
      'script-output',
      'factorio-control-center',
      'metrics.json',
    );

    if (!existsSync(filePath)) {
      this.latestCompanionMetrics.set(id, {
        active: false,
        disabled: false,
        updatedAt: now,
      });
      return { ups: 0.0, spm: 0.0, espm: 0.0 };
    }

    try {
      const st = statSync(filePath);
      const ageMs = Math.max(0, now - st.mtimeMs);
      const raw = await fsPromises.readFile(filePath, 'utf-8');
      const data = JSON.parse(raw) as CompanionMetricsPayload;

      if (data && data.ok && typeof data.tick === 'number') {
        if (typeof data.spm === 'number') {
          spm = data.spm;
        }
        if (typeof data.espm === 'number') {
          espm = data.espm;
        }

        // The mod exports metrics every 60 ticks (1 second).
        // If mtime is older than 3.5 seconds, or game.tick_paused is true, the simulation is paused.
        const isPaused = Boolean(data.paused) || ageMs > 3500;

        if (isPaused) {
          ups = 0.0;
        } else {
          const last = this.lastTicks.get(id);
          if (last && data.tick >= last.tick) {
            const tickDiff = data.tick - last.tick;
            const timeDiffSec = (now - last.time) / 1000;
            if (timeDiffSec > 0) {
              const maxExpected = (data.game_speed || 1.0) * 60.0;
              ups = Math.min(
                maxExpected,
                Math.max(0.0, tickDiff / timeDiffSec),
              );
            }
          } else {
            ups = (data.game_speed || 1.0) * 60.0;
          }
        }

        this.lastTicks.set(id, { tick: data.tick, time: now });

        this.latestCompanionMetrics.set(id, {
          active: true,
          disabled: false,
          game_speed:
            typeof data.game_speed === 'number' ? data.game_speed : 1.0,
          paused: isPaused,
          research: data.research ?? null,
          evolution: data.evolution,
          pollution: data.pollution,
          updatedAt: now,
        });
      } else {
        this.latestCompanionMetrics.set(id, {
          active: false,
          disabled: false,
          updatedAt: now,
        });
      }
    } catch (err: unknown) {
      this.latestCompanionMetrics.set(id, {
        active: false,
        disabled: false,
        updatedAt: now,
      });
      const message = err instanceof Error ? err.message : String(err);
      this.log.debug(
        `Failed to read companion metrics JSON for instance ${this.instanceLabel(id)}: ${message}`,
      );
    }

    return { ups, spm, espm };
  }

  async getLiveMetrics(
    id: string,
    uiLang?: string,
  ): Promise<CompanionLiveMetrics | null> {
    const rt = this.runtime.get(id);
    if (!rt?.proc || rt.proc.exitCode !== null) {
      return null;
    }

    await this.collectInstanceGameMetrics(id);
    const metrics = this.latestCompanionMetrics.get(id);
    if (!metrics) {
      return null;
    }

    if (metrics.pollution && metrics.pollution.nauvis_total === undefined) {
      try {
        const res = await this.runtime.rconExec(
          id,
          '/silent-command local sn=game.surfaces["nauvis"]; local sg=game.surfaces["gleba"]; rcon.print((sn and sn.get_total_pollution() or 0) .. "," .. (sg and sg.get_total_pollution() or 0))',
        );
        if (res?.ok && res.output) {
          const parts = res.output.trim().split(',');
          const nTot = parseFloat(parts[0]);
          const gTot = parseFloat(parts[1]);
          if (!isNaN(nTot)) {
            metrics.pollution.nauvis_total = Math.round(nTot * 10) / 10;
          }
          if (!isNaN(gTot)) {
            metrics.pollution.gleba_total = Math.round(gTot * 10) / 10;
          }
        }
      } catch {
        // Ignore RCON failures
      }
    }

    if (metrics.research?.name && rt.serverPath) {
      const resolved = resolveTechnologyTitle(
        rt.serverPath,
        metrics.research.name,
        uiLang || 'en',
      );
      if (resolved) {
        return {
          ...metrics,
          research: {
            ...metrics.research,
            localised_name: resolved,
          },
        };
      }
    }

    return metrics;
  }

  getLatestCompanionMetrics(id: string): CompanionLiveMetrics | null {
    return this.latestCompanionMetrics.get(id) ?? null;
  }
}
