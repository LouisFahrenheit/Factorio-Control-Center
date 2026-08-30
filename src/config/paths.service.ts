import { Injectable, Logger } from '@nestjs/common';
import { existsSync, mkdirSync, renameSync, copyFileSync, rmSync, unlinkSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { trimPath } from '../common/trim.util';

@Injectable()
export class PathsService {
  private readonly log = new Logger(PathsService.name);

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

  // Legacy paths for migration checks
  readonly usersPath: string;
  readonly settingsPath: string;
  readonly instancesPath: string;
  readonly maintenancePath: string;
  readonly maintenanceReportsPath: string;
  readonly maintenancePendingPath: string;
  readonly auditOpenSessionsPath: string;

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

    // Legacy paths
    this.usersPath = join(this.dataDir, 'web_users.json');
    this.settingsPath = resolve(
      trimPath(process.env.FCC_SETTINGS_PATH) ||
        join(this.rootDir, 'fcc-settings.ini'),
    );
    this.instancesPath = join(this.dataDir, 'instances.json');
    this.maintenancePath = join(this.dataDir, 'maintenance.json');
    this.maintenanceReportsPath = join(
      this.dataDir,
      'maintenance_reports.json',
    );
    this.maintenancePendingPath = join(
      this.dataDir,
      'maintenance_pending_by_instance.json',
    );
    this.auditOpenSessionsPath = join(this.dataDir, 'audit_open_sessions.json');

    // 1. Perform auto-migration of old directory layout if needed
    this.migrateLegacyDataStructure();

    // 2. Ensure all directories exist
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

  private migrateLegacyDataStructure(): void {
    const moveIfExists = (oldPath: string, newPath: string) => {
      if (existsSync(oldPath) && !existsSync(newPath)) {
        try {
          const parent = dirname(newPath);
          if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
          renameSync(oldPath, newPath);
        } catch {
          // Fallback to copy+remove if cross-device or permission issue
          try {
            copyFileSync(oldPath, newPath);
            unlinkSync(oldPath);
          } catch { /* ignore */ }
        }
      }
    };

    const moveDirIfExists = (oldDir: string, newDir: string) => {
      if (existsSync(oldDir) && !existsSync(newDir)) {
        try {
          const parent = dirname(newDir);
          if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
          renameSync(oldDir, newDir);
        } catch {
          // If rename fails, try recursive copy
          try {
            mkdirSync(newDir, { recursive: true });
            // Let it stay or copy if needed
          } catch { /* ignore */ }
        }
      }
    };

    // Databases: data/fcc_database.sqlite -> data/db/fcc_database.sqlite
    moveIfExists(join(this.dataDir, 'fcc_database.sqlite'), this.databasePath);
    moveIfExists(join(this.dataDir, 'fcc_database.sqlite-shm'), `${this.databasePath}-shm`);
    moveIfExists(join(this.dataDir, 'fcc_database.sqlite-wal'), `${this.databasePath}-wal`);
    moveIfExists(join(this.dataDir, 'fcc_metrics.sqlite'), this.metricsDatabasePath);
    moveIfExists(join(this.dataDir, 'fcc_metrics.sqlite-shm'), `${this.metricsDatabasePath}-shm`);
    moveIfExists(join(this.dataDir, 'fcc_metrics.sqlite-wal'), `${this.metricsDatabasePath}-wal`);

    // Storage: data/modpacks -> data/storage/modpacks
    moveDirIfExists(join(this.dataDir, 'modpacks'), this.modpacksDir);
    // Storage: data/map_presets -> data/storage/map_presets
    moveDirIfExists(join(this.dataDir, 'map_presets'), this.mapPresetsDir);
    // Storage: data/announcements -> data/storage/announcements
    moveDirIfExists(join(this.dataDir, 'announcements'), this.announcementsDir);
    // Security: data/tls -> data/security/tls
    moveDirIfExists(join(this.dataDir, 'tls'), this.tlsDir);
    // Logs: data/instance_logs -> data/logs/instances
    moveDirIfExists(join(this.dataDir, 'instance_logs'), this.instanceLogsDir);

    // Clean up obsolete residual files from root data/
    const legacyFiles = [
      join(this.dataDir, 'maintenance_scheduler.log'),
      join(this.dataDir, 'announcements.json'),
      join(this.dataDir, 'audit_open_sessions.json'),
      join(this.dataDir, 'maintenance_pending_by_instance.json'),
      join(this.dataDir, 'maintenance_reports.json'),
      join(this.dataDir, 'update-cache.json'),
    ];
    for (const f of legacyFiles) {
      if (existsSync(f)) {
        try { unlinkSync(f); } catch { /* ignore */ }
      }
    }

    // Clean up empty legacy residual folders if any
    const legacyServersDir = join(this.dataDir, 'servers');
    if (existsSync(legacyServersDir)) {
      try {
        rmSync(legacyServersDir, { recursive: true, force: true });
      } catch { /* ignore */ }
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
