import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync } from 'fs';
import { join, resolve } from 'path';
import { trimPath } from '../common/trim.util';

@Injectable()
export class PathsService {
  readonly rootDir: string;
  readonly dataDir: string;
  readonly localeDir: string;
  readonly publicDir: string;
  readonly clientDistDir: string;
  readonly usersPath: string;
  readonly settingsPath: string;
  readonly instancesPath: string;
  readonly maintenancePath: string;
  readonly maintenanceReportsPath: string;
  readonly maintenancePendingPath: string;
  readonly auditOpenSessionsPath: string;
  readonly announcementsDir: string;
  readonly modpacksDir: string;
  readonly mapPresetsDir: string;
  readonly tlsDir: string;
  readonly logsDir: string;

  constructor() {
    const rootRaw = trimPath(process.env.FCC_ROOT_DIR) || process.cwd();
    this.rootDir = resolve(rootRaw);
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
    this.announcementsDir = join(this.dataDir, 'announcements');
    this.modpacksDir = join(this.dataDir, 'modpacks');
    this.mapPresetsDir = join(this.dataDir, 'map_presets');
    this.tlsDir = join(this.dataDir, 'tls');
    this.logsDir = resolve(
      trimPath(process.env.FCC_LOGS_DIR) || join(this.rootDir, 'logs'),
    );
    for (const d of [
      this.dataDir,
      this.announcementsDir,
      this.modpacksDir,
      this.mapPresetsDir,
      this.tlsDir,
      this.logsDir,
      join(this.dataDir, 'instance_logs'),
    ]) {
      if (!existsSync(d)) mkdirSync(d, { recursive: true });
    }
  }

  instanceLogPath(instanceId: string): string {
    return join(this.dataDir, 'instance_logs', instanceId, 'server.log');
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
