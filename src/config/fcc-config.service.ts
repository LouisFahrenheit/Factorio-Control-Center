import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { SystemPreference } from './system-preference.entity';
import { encryptString, decryptString } from '../common/crypto.util';

export interface WebPanelIni {
  listen_host: string;
  listen_port: number;
  port_mode: string;
  api_token: string;
  debug_logs: boolean;
  tls_enabled: boolean;
  tls_certfile: string;
  tls_keyfile: string;
  tls_key_password: string;
  public_host: string;
  public_port: string;
  web_disable_effects: boolean;
  toast_duration_sec: number;
  global_username: string;
  global_token: string;
  sync_bans_across_instances: boolean;
  sync_admins_across_instances: boolean;
  sync_whitelist_across_instances: boolean;
  require_unique_instance_game_ports: boolean;
  server_settings_default_public_off: boolean;
  server_settings_apply_global_credentials: boolean;
  log_rotation_max_mb: number;
  log_rotation_interval_hours: number;
  log_rotation_backup_count: number;
  log_write_instance: boolean;
  log_write_web: boolean;
  log_write_maintenance: boolean;
  log_write_audit: boolean;
  log_reformat_timestamps: boolean;
  mod_download_concurrency: number;
  public_page_enabled: boolean;
  public_page_allow_mod_downloads: boolean;
  public_page_route: string;
  public_page_title: string;
  public_page_subtitle: string;
  public_page_theme: string;
  public_page_hide_title: boolean;
  public_page_hide_subtitle: boolean;
  public_page_show_players: boolean;
  public_page_contact_link: string;
}

@Injectable()
export class FccConfigService implements OnModuleInit {
  private readonly log = new Logger(FccConfigService.name);
  private cache: Record<string, string> = {};

  constructor(
    @InjectRepository(SystemPreference)
    private readonly sysPrefs: Repository<SystemPreference>,
    private readonly env: ConfigService,
  ) {}

  async onModuleInit() {
    await this.reload();
  }

  async reload(): Promise<void> {
    const all = await this.sysPrefs.find();
    this.cache = {};
    const appSecret = this.env.get('APP_SECRET') || process.env.APP_SECRET || '';

    for (const p of all) {
      if (p.key.endsWith('.global_token')) {
        this.cache[p.key] = decryptString(p.value || '', appSecret);
      } else {
        this.cache[p.key] = p.value || '';
      }
    }
    this.log.debug(`Loaded ${all.length} preferences from database.`);
  }

  async updatePreferences(changes: Record<string, string>): Promise<void> {
    const appSecret = this.env.get('APP_SECRET') || process.env.APP_SECRET || '';

    for (const [key, value] of Object.entries(changes)) {
      let finalValue = value;
      if (key === 'web_panel.global_token' && value) {
        finalValue = encryptString(value, appSecret);
      }
      await this.sysPrefs.save({ key, value: finalValue });
    }

    await this.reload();
  }

  section(name: string): Record<string, string> {
    const out: Record<string, string> = {};
    const prefix = `${name}.`;
    for (const [k, v] of Object.entries(this.cache)) {
      if (k.startsWith(prefix)) {
        out[k.slice(prefix.length)] = v;
      }
    }
    return out;
  }

  get webPanel(): WebPanelIni {
    const w = this.section('web_panel');

    // strict-env: always read from .env (for secrets/debug)
    const strictEnvBool = (envKey: string, d = false) => {
      const v = this.env.get(envKey);
      return ['1', 'true', 'yes', 'on'].includes(String(v ?? d).toLowerCase());
    };
    const strictEnvStr = (envKey: string, d = '') => {
      return String(this.env.get(envKey) ?? d);
    };

    // override: DB wins; .env overrides ONLY when explicitly non-empty.
    // Empty string or missing key in .env = "use DB" (UI changes persist).
    const overrideBool = (k: string, envKey: string, d = false) => {
      const envVal = this.env.get(envKey);
      const v = (envVal !== undefined && envVal !== '') ? envVal : w[k];
      return ['1', 'true', 'yes', 'on'].includes(String(v ?? d).toLowerCase());
    };
    const overrideNum = (k: string, envKey: string, d: number) => {
      const envVal = this.env.get(envKey);
      const v = (envVal !== undefined && envVal !== '') ? envVal : w[k];
      const n = parseInt(String(v ?? d), 10);
      return Number.isFinite(n) ? n : d;
    };
    const overrideStr = (k: string, envKey: string, d = '') => {
      const envVal = this.env.get(envKey);
      if (envVal !== undefined && envVal !== '') return String(envVal);
      return String(w[k] ?? d);
    };

    return {
      // Security/Debug — .env always wins, no DB fallback
      api_token: strictEnvStr('API_TOKEN', ''),
      debug_logs: strictEnvBool('DEBUG_LOGS'),

      // Network / infrastructure — DB wins; non-empty .env forces override
      listen_host: overrideStr('listen_host', 'HOST', '0.0.0.0'),
      listen_port: overrideNum('listen_port', 'PORT', 8080),
      port_mode: overrideStr('port_mode', 'PORT_MODE', 'auto'),
      tls_enabled: overrideBool('tls_enabled', 'TLS_ENABLED'),
      tls_certfile: overrideStr('tls_certfile', 'TLS_CERTFILE', ''),
      tls_keyfile: overrideStr('tls_keyfile', 'TLS_KEYFILE', ''),
      tls_key_password: overrideStr('tls_key_password', 'TLS_KEY_PASSWORD', ''),
      public_host: overrideStr('public_host', 'PUBLIC_HOST', ''),
      public_port: overrideStr('public_port', 'PUBLIC_PORT', ''),
      web_disable_effects: overrideBool('web_disable_effects', 'WEB_DISABLE_EFFECTS'),
      toast_duration_sec: overrideNum('toast_duration_sec', 'TOAST_DURATION_SEC', 3),

      // Factorio credentials — stored in DB/shared, no env override
      global_username: String(
        w.global_username || this.section('shared').global_username || '',
      ),
      global_token: String(
        w.global_token || this.section('shared').global_token || '',
      ),

      // UI-configurable — DB wins; non-empty .env value forces override
      sync_bans_across_instances: overrideBool('sync_bans_across_instances', 'SYNC_BANS_ACROSS_INSTANCES', true),
      sync_admins_across_instances: overrideBool('sync_admins_across_instances', 'SYNC_ADMINS_ACROSS_INSTANCES', true),
      sync_whitelist_across_instances: overrideBool(
        'sync_whitelist_across_instances',
        'SYNC_WHITELIST_ACROSS_INSTANCES',
        true,
      ),
      require_unique_instance_game_ports: overrideBool(
        'require_unique_instance_game_ports',
        'REQUIRE_UNIQUE_INSTANCE_GAME_PORTS',
        true,
      ),
      server_settings_default_public_off: overrideBool(
        'server_settings_default_public_off',
        'SERVER_SETTINGS_DEFAULT_PUBLIC_OFF',
        true,
      ),
      server_settings_apply_global_credentials: overrideBool(
        'server_settings_apply_global_credentials',
        'SERVER_SETTINGS_APPLY_GLOBAL_CREDENTIALS',
        true,
      ),
      log_rotation_max_mb: overrideNum('log_rotation_max_mb', 'LOG_ROTATION_MAX_MB', 50),
      log_rotation_interval_hours: overrideNum('log_rotation_interval_hours', 'LOG_ROTATION_INTERVAL_HOURS', 24),
      log_rotation_backup_count: overrideNum('log_rotation_backup_count', 'LOG_ROTATION_BACKUP_COUNT', 3),
      log_write_instance: overrideBool('log_write_instance', 'LOG_WRITE_INSTANCE', true),
      log_write_web: overrideBool('log_write_web', 'LOG_WRITE_WEB'),
      log_write_maintenance: overrideBool('log_write_maintenance', 'LOG_WRITE_MAINTENANCE'),
      log_write_audit: overrideBool('log_write_audit', 'LOG_WRITE_AUDIT'),
      log_reformat_timestamps: overrideBool('log_reformat_timestamps', 'LOG_REFORMAT_TIMESTAMPS', true),
      mod_download_concurrency: Math.max(
        1,
        Math.min(8, overrideNum('mod_download_concurrency', 'MOD_DOWNLOAD_CONCURRENCY', 4)),
      ),
      public_page_enabled: overrideBool('public_page_enabled', 'PUBLIC_PAGE_ENABLED', false),
      public_page_allow_mod_downloads: overrideBool('public_page_allow_mod_downloads', 'PUBLIC_PAGE_ALLOW_MOD_DOWNLOADS', false),
      public_page_route: overrideStr('public_page_route', 'PUBLIC_PAGE_ROUTE', '/servers'),
      public_page_title: overrideStr('public_page_title', 'PUBLIC_PAGE_TITLE', ''),
      public_page_subtitle: overrideStr('public_page_subtitle', 'PUBLIC_PAGE_SUBTITLE', ''),
      public_page_theme: overrideStr('public_page_theme', 'PUBLIC_PAGE_THEME', ''),
      public_page_hide_title: overrideBool('public_page_hide_title', 'PUBLIC_PAGE_HIDE_TITLE', false),
      public_page_hide_subtitle: overrideBool('public_page_hide_subtitle', 'PUBLIC_PAGE_HIDE_SUBTITLE', false),
      public_page_show_players: overrideBool('public_page_show_players', 'PUBLIC_PAGE_SHOW_PLAYERS', false),
      public_page_contact_link: overrideStr('public_page_contact_link', 'PUBLIC_PAGE_CONTACT_LINK', ''),
    };
  }

  get langCode(): string {
    // DB has priority; PANEL_LANGUAGE in .env overrides only when explicitly non-empty
    const fromEnv = this.env.get('PANEL_LANGUAGE');
    if (fromEnv !== undefined && fromEnv !== '') return String(fromEnv).slice(0, 12);
    const fromDb = this.section('language').code;
    return String(fromDb ?? 'en').slice(0, 12);
  }

  get translateModNames(): boolean {
    const raw = this.section('shared').translate_mod_names;
    if (raw === undefined || raw === '') return true;
    return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
  }

  get sharedTheme(): string {
    // DB has priority; PANEL_THEME in .env overrides only when explicitly non-empty
    const fromEnv = this.env.get('PANEL_THEME');
    if (fromEnv !== undefined && fromEnv !== '') return String(fromEnv);
    const fromDb = this.section('shared').theme;
    return String(fromDb ?? 'fcc_classic');
  }

  get firewallUdpRuleDone(): boolean {
    const raw = this.section('program').windows_firewall_udp_rule_done;
    return ['1', 'true', 'yes', 'on'].includes(
      String(raw || '')
        .trim()
        .toLowerCase(),
    );
  }

  async setFirewallUdpRuleDone(done: boolean): Promise<void> {
    await this.saveKeys('program', { windows_firewall_udp_rule_done: done });
  }

  async saveWebPanelKeys(updates: Partial<WebPanelIni>): Promise<void> {
    await this.saveKeys('web_panel', updates);
  }

  private async saveKeys(section: string, updates: Record<string, any>): Promise<void> {
    const appSecret = this.env.get('APP_SECRET') || process.env.APP_SECRET || '';

    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) continue;
      const key = `${section}.${k}`;
      const value = typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
      this.cache[key] = value; // Cache plaintext
      
      const dbValue = k === 'global_token' ? encryptString(value, appSecret) : value;

      await this.sysPrefs.upsert({ key: key, value: dbValue }, ['key']);
    }
  }
}
