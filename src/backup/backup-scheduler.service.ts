import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SystemPreference } from "../config/system-preference.entity";
import { BackupService } from "./backup.service";

const SECTION = "backup";

export interface AutoBackupSettings {
  enabled: boolean;
  intervalHours: number;
  maxCount: number;
  includeMetrics: boolean;
  includeLogs: boolean;
  lastRunAt: string;
  nextRunAt: string;
}

@Injectable()
export class BackupSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(BackupSchedulerService.name);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private settings: AutoBackupSettings = {
    enabled: false,
    intervalHours: 24,
    maxCount: 5,
    includeMetrics: false,
    includeLogs: false,
    lastRunAt: "",
    nextRunAt: "",
  };

  constructor(
    @InjectRepository(SystemPreference)
    private readonly sysPrefs: Repository<SystemPreference>,
    private readonly backups: BackupService,
  ) {}

  async onModuleInit() {
    await this.loadSettings();
    this.schedule();
  }

  onModuleDestroy() {
    this.clear();
  }

  getSettings(): AutoBackupSettings {
    return { ...this.settings };
  }

  async saveSettings(patch: Partial<AutoBackupSettings>): Promise<void> {
    Object.assign(this.settings, patch);
    const keys: (keyof AutoBackupSettings)[] = [
      "enabled", "intervalHours", "maxCount",
      "includeMetrics", "includeLogs",
      "lastRunAt", "nextRunAt",
    ];
    for (const k of keys) {
      const val = (this.settings as any)[k];
      await this.sysPrefs.upsert(
        { key: `${SECTION}.${k}`, value: String(val ?? "") },
        ["key"],
      );
    }
    this.schedule();
  }

  private async loadSettings(): Promise<void> {
    const all = await this.sysPrefs.find();
    const section: Record<string, string> = {};
    const prefix = `${SECTION}.`;
    for (const p of all) {
      if (p.key.startsWith(prefix)) section[p.key.slice(prefix.length)] = p.value ?? "";
    }
    const bool = (k: string, def = false) =>
      ["1", "true", "yes", "on"].includes(String(section[k] ?? def).toLowerCase());
    const num = (k: string, def: number) => {
      const n = parseInt(section[k] ?? "", 10);
      return Number.isFinite(n) ? n : def;
    };
    this.settings = {
      enabled: bool("enabled"),
      intervalHours: num("intervalHours", 24),
      maxCount: num("maxCount", 5),
      includeMetrics: bool("includeMetrics"),
      includeLogs: bool("includeLogs"),
      lastRunAt: section["lastRunAt"] ?? "",
      nextRunAt: section["nextRunAt"] ?? "",
    };
  }

  private schedule() {
    this.clear();
    if (!this.settings.enabled) return;

    const intervalMs = Math.max(1, this.settings.intervalHours) * 60 * 60 * 1000;
    const lastRun = this.settings.lastRunAt ? new Date(this.settings.lastRunAt).getTime() : 0;
    const now = Date.now();
    const elapsed = now - lastRun;
    const delay = Math.max(0, intervalMs - elapsed);

    const nextRunAt = new Date(now + delay).toISOString();
    this.settings.nextRunAt = nextRunAt;

    this.log.log(
      `Auto-backup scheduled in ${Math.round(delay / 1000 / 60)}min (next: ${nextRunAt})`,
    );

    this.timer = setTimeout(() => void this.run(), delay);
  }

  private async run() {
    this.log.log("Auto-backup: running scheduled backup");
    try {
      await this.backups.createBackup({
        includeMetrics: this.settings.includeMetrics,
        includeLogs: this.settings.includeLogs,
        type: "auto",
      });
      await this.backups.pruneOldBackups(this.settings.maxCount);
      this.settings.lastRunAt = new Date().toISOString();
      await this.saveSettings({});
      this.log.log("Auto-backup: done");
    } catch (err) {
      this.log.error("Auto-backup failed", err);
    }
    this.schedule(); // reschedule next run
  }

  private clear() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
