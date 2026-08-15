import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ModuleRef } from '@nestjs/core';
import { existsSync, renameSync, writeFileSync } from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { encryptString } from '../common/crypto.util';
import { PathsService } from '../config/paths.service';
import { readJsonFile } from '../common/json-store';
import { User } from '../auth/user.entity';
import { GameInstance } from '../instances/game-instance.entity';
import { MaintenanceSchedule } from '../maintenance/maintenance-schedule.entity';
import { SystemPreference } from '../config/system-preference.entity';
import { InstancesService } from '../instances/instances.service';
import { FccConfigService } from '../config/fcc-config.service';
import { CommandsCatalogService } from '../ops/commands-catalog.service';

@Injectable()
export class LegacyMigrationService implements OnModuleInit {
  private readonly log = new Logger(LegacyMigrationService.name);
  private reportLines: string[] = [];

  constructor(
    private readonly moduleRef: ModuleRef,
    private readonly paths: PathsService,
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(GameInstance)
    private readonly instancesRepo: Repository<GameInstance>,
    @InjectRepository(MaintenanceSchedule)
    private readonly maintenanceRepo: Repository<MaintenanceSchedule>,
    @InjectRepository(SystemPreference)
    private readonly prefsRepo: Repository<SystemPreference>,
  ) {}

  async onModuleInit(): Promise<void> {
    this.reportLines = [];
    
    await this.migrateUsers();
    await this.migrateInstances();
    await this.migrateMaintenance();
    await this.migrateSettings();
    
    if (this.reportLines.length > 0) {
      this.log.log(
        `\n\n` +
        `======================================================\n` +
        `LEGACY DATABASE MIGRATION REPORT\n` +
        `======================================================\n` +
        this.reportLines.join('\n') + `\n` +
        `======================================================\n`
      );

      // Reload caches for services that might have started with empty DB
      try {
        const instancesSvc = this.moduleRef.get(InstancesService, { strict: false });
        if (instancesSvc) await instancesSvc.reloadCache();
      } catch {}
      try {
        const configSvc = this.moduleRef.get(FccConfigService, { strict: false });
        if (configSvc) await configSvc.reload();
      } catch {}
    } else {
      this.log.debug(`No legacy files found. Migration skipped.`);
    }
  }

  private async migrateUsers(): Promise<void> {
    const path = this.paths.usersPath;
    if (!existsSync(path)) return;

    const data = readJsonFile<{ users?: any[] }>(path, {});
    const users = Array.isArray(data.users) ? data.users : [];
    
    if (users.length > 0) {
      const existing = await this.usersRepo.count();
      if (existing <= 1) { // 1 means UsersService already seeded 'admin'
        if (existing === 1) await this.usersRepo.clear();
        
        for (const u of users) {
          const perms = Array.isArray(u.permissions) ? u.permissions : [];
          let role: 'administrator' | 'server_engineer' | 'moderator' = 'moderator';
          if (perms.includes('manage_users') || perms.includes('sys_admin')) {
            role = 'administrator';
          } else if (perms.includes('manage_server_global') || u.role === 'server_engineer') {
            role = 'server_engineer';
          }
          if (u.role === 'administrator') role = 'administrator';
          
          const userEnt = this.usersRepo.create({
            username: u.username,
            passwordHash: u.password_hash || u.passwordHash,
            role: u.role || role,
            enabled: u.enabled !== false,
            tabs: Array.isArray(u.tabs) ? u.tabs : [],
            instanceIds: Array.isArray(u.instance_ids) ? u.instance_ids : Array.isArray(u.instanceIds) ? u.instanceIds : [],
          });
          await this.usersRepo.save(userEnt);
        }
        this.reportLines.push(` -> Migrated ${users.length} user(s) to DB`);
        this.backupFile(path);
      }
    }
  }

  private async migrateInstances(): Promise<void> {
    const path = this.paths.instancesPath;
    if (!existsSync(path)) return;

    const data = readJsonFile<{ items?: any[]; selected_id?: string }>(path, {});
    const items = Array.isArray(data.items) ? data.items : [];
    
    if (items.length > 0) {
      const existing = await this.instancesRepo.count();
      if (existing === 0) {
        for (const i of items) {
          const instEnt = this.instancesRepo.create({
            id: i.id,
            name: i.name || '',
            serverPath: i.serverPath || i.server_path || '',
            ip: i.ip || '',
            port: i.port || '',
            rconPort: Number(i.rconPort || i.rcon_port || 0),
            rconPassword: i.rconPassword || i.rcon_password || '',
            launchSave: i.launchSave || i.launch_save || '',
            autostartServer: !!(i.autostartServer || i.autostart_server),
            autoEnterPanel: !!(i.autoEnterPanel || i.auto_enter_panel),
            blockUpdates: !!(i.blockUpdates || i.block_updates),
            experimentalUpdates: !!(i.experimentalUpdates || i.experimental_updates),
            isPublic: !!i.isPublic,
            publicDescription: i.publicDescription || '',
            publicConnectionAddress: i.publicConnectionAddress || '',
          });
          await this.instancesRepo.save(instEnt);
        }
        this.reportLines.push(` -> Migrated ${items.length} instance(s) to DB`);
        this.backupFile(path);
      }
    }
    
    if (data.selected_id) {
      let pref = await this.prefsRepo.findOneBy({ key: 'instances.selected_id' });
      if (!pref) {
        pref = this.prefsRepo.create({ key: 'instances.selected_id', value: String(data.selected_id) });
        await this.prefsRepo.save(pref);
      }
    }
  }

  private async migrateMaintenance(): Promise<void> {
    const path = this.paths.maintenancePath;
    if (!existsSync(path)) return;

    const data = readJsonFile<{ tasks?: any[]; scheduler_tz?: string }>(path, {});
    const tasks = Array.isArray(data.tasks) ? data.tasks : [];
    
    if (tasks.length > 0) {
      const existing = await this.maintenanceRepo.count();
      if (existing === 0) {
        for (const t of tasks) {
          const taskEnt = this.maintenanceRepo.create({
            id: t.id,
            active: t.active !== false,
            timeHhmm: t.time_hhmm || '04:00',
            weekdays: Array.isArray(t.weekdays) ? t.weekdays : [],
            repeatWeekly: t.repeat_weekly !== false,
            manualOnly: !!t.manual_only,
            timezone: t.timezone || '',
            instanceIds: Array.isArray(t.instance_ids) ? t.instance_ids : [],
            options: t.options || {},
            lastRunKey: t.last_run_key || '',
          });
          await this.maintenanceRepo.save(taskEnt);
        }
        this.reportLines.push(` -> Migrated ${tasks.length} maintenance task(s) to DB`);
        this.backupFile(path);
      }
    }

    if (data.scheduler_tz) {
      let pref = await this.prefsRepo.findOneBy({ key: 'maintenance.scheduler_tz' });
      if (!pref) {
        pref = this.prefsRepo.create({ key: 'maintenance.scheduler_tz', value: String(data.scheduler_tz) });
        await this.prefsRepo.save(pref);
      }
    }
  }

  private async migrateSettings(): Promise<void> {
    const iniPath = this.paths.settingsPath; // e.g. fcc-settings.ini
    if (!existsSync(iniPath)) return;

    const ini = await import('ini');
    const fs = await import('fs');
    const path = await import('path');

    let parsed;
    try {
      parsed = ini.parse(fs.readFileSync(iniPath, 'utf-8'));
    } catch {
      return;
    }

    let dbCount = 0;

    // Collect values for env template
    const w = parsed.web_panel || {};
    
    // Check if APP_SECRET exists in environment, otherwise generate a secure one
    const appSecret = process.env.APP_SECRET || randomBytes(32).toString('base64');

const envTemplate = `# Factorio Control Center - Environment Configuration
# ===================================================
# IMPORTANT: By default, most of these settings are managed in the database via the UI.
# Setting a value here acts as a strict OVERRIDE, disabling changes via the UI.
# Any changes made to this file require a panel restart to take effect.
# ===================================================

# ---------------------------------------------------
# 1. Network Settings
# ---------------------------------------------------

# IP address to bind the web server to. 
# Default: 0.0.0.0 (listens on all available interfaces)
HOST=

# Port for the web server to listen on.
# Default: 8080
PORT=

# Port assignment mode (auto / custom).
# Default: auto
PORT_MODE=

# ---------------------------------------------------
# 2. Public Access
# ---------------------------------------------------

# Public-facing host and port used for generating shareable links.
# Useful if the panel is running behind a reverse proxy or NAT.
PUBLIC_HOST=
PUBLIC_PORT=

# ---------------------------------------------------
# 3. Security
# ---------------------------------------------------

# Secret token for external API access
API_TOKEN=${w.api_token ?? ''}

# Secret key for encrypting sensitive data in the database (e.g. game tokens).
# Must be a randomly generated 64-character base64 or hex string.
# DO NOT lose this key, or encrypted data will be unrecoverable.
APP_SECRET=${appSecret}

# ---------------------------------------------------
# 4. HTTPS / TLS Configuration
# ---------------------------------------------------

# Enable HTTPS. 
# Default: false
TLS_ENABLED=

# Absolute paths to your SSL certificate and private key files.
TLS_CERTFILE=
TLS_KEYFILE=

# Password for the private key (if encrypted).
TLS_KEY_PASSWORD=

# ---------------------------------------------------
# 5. Appearance Overrides
# ---------------------------------------------------

# Force a specific language for all users, overriding the UI setting.
# Supported codes: 'en', 'ru', 'uk', 'zh', 'de'
PANEL_LANGUAGE=

# Force a specific theme for all users, overriding the UI setting.
# Options: 'fcc_classic', 'dark_space', 'vulcanus', 'ion_storm', 'cryogenics'
PANEL_THEME=

# ---------------------------------------------------
# 6. Debugging & Maintenance
# ---------------------------------------------------

# Enable verbose logging for troubleshooting purposes.
# Default: false
DEBUG_LOGS=${w.debug_logs ?? 'false'}
`;


    const envKeys = [
      'api_token', 'debug_logs', 'app_secret'
    ];

    for (const [section, values] of Object.entries(parsed)) {
      if (typeof values !== 'object' || values === null) continue;

      for (const [k, v] of Object.entries(values)) {
        if (section === 'web_panel' && envKeys.includes(k)) {
          continue; // Handled by template
        } else if (section === 'language' && k === 'code') {
          continue; // Handled by template
        } else if (section === 'shared' && k === 'theme') {
          continue; // Handled by template
        } else {
          // DB preference
          const key = `${section}.${k}`;
          let value = typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
          
          if (k === 'global_token') {
             value = encryptString(value, appSecret);
          }
          
          const prefEnt = this.prefsRepo.create({ key, value });
          await this.prefsRepo.save(prefEnt);
          dbCount++;
        }
      }
    }

    const envPath = path.join(this.paths.rootDir, '.env');
    if (!existsSync(envPath)) {
      writeFileSync(envPath, envTemplate, 'utf-8');
      this.reportLines.push(` -> Created .env file from settings`);
    }

    if (dbCount > 0) {
      this.reportLines.push(` -> Migrated ${dbCount} settings to DB`);
    }

    this.backupFile(iniPath);
  }

  private backupFile(originalPath: string): void {
    try {
      const backupPath = `${originalPath}.bak`;
      if (existsSync(originalPath)) {
        renameSync(originalPath, backupPath);
        this.reportLines.push(`    (Renamed ${originalPath.split(/[\\/]/).pop()} to .bak)`);
      }
    } catch (e) {
      // Ignored
    }
  }
}
