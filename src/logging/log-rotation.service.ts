import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  statSync,
  unlinkSync,
} from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { FccConfigService } from '../config/fcc-config.service';

const DEFAULT_MAX_MB = 50;
const DEFAULT_INTERVAL_HOURS = 24;
const DEFAULT_BACKUP_COUNT = 3;

@Injectable()
export class LogRotationService implements OnModuleInit {
  private maxBytes = DEFAULT_MAX_MB * 1024 * 1024;
  private intervalSec = DEFAULT_INTERVAL_HOURS * 3600;
  private backupCount = DEFAULT_BACKUP_COUNT;
  private logWriteInstance = true;
  private logWriteWeb = false;
  private logWriteMaintenance = false;
  private logWriteAudit = false;
  private lastCheckMonotonic = new Map<string, number>();

  constructor(private readonly config: FccConfigService) {}

  onModuleInit(): void {
    this.syncFromConfig();
  }

  syncFromConfig(): void {
    const wp = this.config.webPanel;
    const mb = clampInt(wp.log_rotation_max_mb, 1, 2048, DEFAULT_MAX_MB);
    const hours = clampInt(
      wp.log_rotation_interval_hours,
      1,
      8760,
      DEFAULT_INTERVAL_HOURS,
    );
    const backups = clampInt(
      wp.log_rotation_backup_count,
      1,
      20,
      DEFAULT_BACKUP_COUNT,
    );

    const newMax = mb * 1024 * 1024;
    const newInterval = hours * 3600;
    const inst = wp.log_write_instance;
    const web = wp.log_write_web;
    const maint = wp.log_write_maintenance;
    const audit = wp.log_write_audit;

    const changed =
      newMax !== this.maxBytes ||
      newInterval !== this.intervalSec ||
      backups !== this.backupCount ||
      inst !== this.logWriteInstance ||
      web !== this.logWriteWeb ||
      maint !== this.logWriteMaintenance ||
      audit !== this.logWriteAudit;

    this.maxBytes = newMax;
    this.intervalSec = newInterval;
    this.backupCount = backups;
    this.logWriteInstance = inst;
    this.logWriteWeb = web;
    this.logWriteMaintenance = maint;
    this.logWriteAudit = audit;

    if (changed) this.lastCheckMonotonic.clear();
  }

  logWriteInstanceEnabled(): boolean {
    return this.logWriteInstance;
  }

  logWriteWebEnabled(): boolean {
    return this.logWriteWeb;
  }

  logWriteMaintenanceEnabled(): boolean {
    return this.logWriteMaintenance;
  }

  logWriteAuditEnabled(): boolean {
    return this.logWriteAudit;
  }

  /** Append one line; size is checked for rotation at most once per interval per file. */
  appendLine(path: string, line: string): void {
    const msg = String(line ?? '').replace(/\r?\n$/, '');
    const p = String(path || '').trim();
    if (!p) return;

    try {
      mkdirSync(dirname(p), { recursive: true });
    } catch {
      return;
    }

    let key: string;
    try {
      key = resolve(p);
    } catch {
      key = p;
    }

    const now = performance.now();
    const last = this.lastCheckMonotonic.get(key);
    if (last === undefined || now - last >= this.intervalSec * 1000) {
      this.lastCheckMonotonic.set(key, now);
      if (existsSync(p)) {
        try {
          if (statSync(p).size >= this.maxBytes) {
            this.rotateNumberedBackups(p, this.backupCount);
          }
        } catch {
          /* ignore stat errors */
        }
      }
    }

    try {
      appendFileSync(p, msg + '\n', 'utf-8');
    } catch {
      /* ignore append errors */
    }
  }

  private rotateNumberedBackups(path: string, backupCount: number): void {
    if (backupCount < 1) return;
    const dir = dirname(path);
    const base = basename(path);

    const lastPath = join(dir, `${base}.${backupCount}`);
    if (existsSync(lastPath)) {
      try {
        unlinkSync(lastPath);
      } catch {
        /* ignore */
      }
    }

    for (let i = backupCount - 1; i >= 1; i--) {
      const src = join(dir, `${base}.${i}`);
      const dst = join(dir, `${base}.${i + 1}`);
      if (existsSync(src)) {
        try {
          renameSync(src, dst);
        } catch {
          /* ignore */
        }
      }
    }

    const one = join(dir, `${base}.1`);
    if (existsSync(path)) {
      try {
        renameSync(path, one);
      } catch {
        /* ignore */
      }
    }
  }
}

function clampInt(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
