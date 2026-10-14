import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { trimPath } from '../common/trim.util';

@Injectable()
export class PathsService {
  readonly rootDir: string;
  readonly envFilePath: string;
  readonly dataDir: string;
  readonly localeDir: string;
  readonly publicDir: string;
  readonly clientDistDir: string;

  // Subdirectories in data/
  readonly dbDir: string;
  readonly storageDir: string;
  readonly securityDir: string;
  readonly backupsDir: string;
  readonly instanceLogsDir: string;

  // Specific storage subdirs
  readonly announcementsDir: string;
  readonly modpacksDir: string;
  readonly mapPresetsDir: string;
  readonly tlsDir: string;

  // Database file paths
  readonly databasePath: string;
  readonly metricsDatabasePath: string;

  // Root logs dir
  readonly logsDir: string;

  // Storage paths
  readonly maintenanceReportsPath: string;
  readonly maintenancePendingPath: string;
  readonly auditOpenSessionsPath: string;
  readonly notificationsStatePath: string;

  constructor() {
    const rootRaw = trimPath(process.env.FCC_ROOT_DIR) || process.cwd();
    this.rootDir = resolve(rootRaw);
    this.envFilePath = join(this.rootDir, '.env');
    this.dataDir = resolve(
      trimPath(process.env.FCC_DATA_DIR) || join(this.rootDir, 'data'),
    );
    this.localeDir = resolve(
      trimPath(process.env.FCC_LOCALE_DIR) || join(this.rootDir, 'locale'),
    );
    this.publicDir = resolve(
      trimPath(process.env.FCC_PUBLIC_DIR) || join(this.rootDir, 'public'),
    );
    this.clientDistDir = resolve(join(this.rootDir, 'client', 'dist'));

    // Structured subdirectories in data/
    this.dbDir = join(this.dataDir, 'db');
    this.storageDir = join(this.dataDir, 'storage');
    this.securityDir = join(this.dataDir, 'security');
    this.backupsDir = join(this.dataDir, 'backups');
    this.instanceLogsDir = join(this.dataDir, 'logs', 'instances');

    // Storage folders
    this.announcementsDir = join(this.storageDir, 'announcements');
    this.modpacksDir = join(this.storageDir, 'modpacks');
    this.mapPresetsDir = join(this.storageDir, 'map_presets');
    this.tlsDir = join(this.securityDir, 'tls');

    // Databases
    this.databasePath = join(this.dbDir, 'fcc_database.sqlite');
    this.metricsDatabasePath = join(this.dbDir, 'fcc_metrics.sqlite');

    // Root logs
    this.logsDir = resolve(
      trimPath(process.env.FCC_LOGS_DIR) || join(this.rootDir, 'logs'),
    );

    // Active storage file paths
    this.maintenanceReportsPath = join(
      this.dataDir,
      'maintenance_reports.json',
    );
    this.maintenancePendingPath = join(
      this.dataDir,
      'maintenance_pending_by_instance.json',
    );
    this.auditOpenSessionsPath = join(this.dataDir, 'audit_open_sessions.json');
    this.notificationsStatePath = join(
      this.dataDir,
      'notifications_state.json',
    );

    // Ensure all directories exist
    for (const d of [
      this.dataDir,
      this.dbDir,
      this.storageDir,
      this.securityDir,
      this.announcementsDir,
      this.modpacksDir,
      this.mapPresetsDir,
      this.tlsDir,
      this.backupsDir,
      this.instanceLogsDir,
      this.logsDir,
    ]) {
      if (!existsSync(d)) mkdirSync(d, { recursive: true });
    }
  }

  instanceLogPath(instanceId: string): string {
    return join(this.instanceLogsDir, instanceId, 'server.log');
  }

  webPanelLogPath(): string {
    return join(this.logsDir, 'web_panel.log');
  }

  maintenanceSchedulerLogPath(): string {
    return join(this.logsDir, 'maintenance_scheduler.log');
  }

  auditLogPath(): string {
    return join(this.logsDir, 'audit.log');
  }

  announcementsPath(instanceId: string): string {
    return join(this.announcementsDir, `${instanceId}.json`);
  }
}
