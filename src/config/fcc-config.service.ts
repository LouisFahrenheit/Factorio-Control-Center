import { Injectable } from '@nestjs/common';
import { readFileSync, existsSync } from 'fs';
import { parse } from 'ini';
import { PathsService } from './paths.service';

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
}

@Injectable()
export class FccConfigService {
  private cache: Record<string, Record<string, string>> = {};

  constructor(private readonly paths: PathsService) {
    this.reload();
  }

  reload(): void {
    if (!existsSync(this.paths.settingsPath)) {
      this.cache = {};
      return;
    }
    const raw = readFileSync(this.paths.settingsPath, 'utf-8');
    this.cache = parse(raw);
  }

  section(name: string): Record<string, string> {
    const sec = this.cache[name] || {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(sec)) {
      out[k] = String(v ?? '').trim();
    }
    return out;
  }

  get webPanel(): WebPanelIni {
    const w = this.section('web_panel');
    const bool = (k: string, d = false) =>
      ['1', 'true', 'yes', 'on'].includes(String(w[k] ?? d).toLowerCase());
    const num = (k: string, d: number) => {
      const n = parseInt(String(w[k] ?? d), 10);
      return Number.isFinite(n) ? n : d;
    };
    return {
      listen_host: String(w.listen_host || '0.0.0.0'),
      listen_port: num('listen_port', 80),
      port_mode: String(w.port_mode || 'auto'),
      api_token: String(w.api_token || ''),
      debug_logs: bool('debug_logs'),
      tls_enabled: bool('tls_enabled'),
      tls_certfile: String(w.tls_certfile || ''),
      tls_keyfile: String(w.tls_keyfile || ''),
      tls_key_password: String(w.tls_key_password || ''),
      public_host: String(w.public_host || ''),
      public_port: String(w.public_port || ''),
      web_disable_effects: bool('web_disable_effects'),
      toast_duration_sec: num('toast_duration_sec', 3),
      global_username: String(
        w.global_username || this.section('shared').global_username || '',
      ),
      global_token: String(
        w.global_token || this.section('shared').global_token || '',
      ),
      sync_bans_across_instances: bool('sync_bans_across_instances', true),
      sync_admins_across_instances: bool('sync_admins_across_instances', true),
      sync_whitelist_across_instances: bool(
        'sync_whitelist_across_instances',
        true,
      ),
      require_unique_instance_game_ports: bool(
        'require_unique_instance_game_ports',
        true,
      ),
      server_settings_default_public_off: bool(
        'server_settings_default_public_off',
        true,
      ),
      server_settings_apply_global_credentials: bool(
        'server_settings_apply_global_credentials',
        true,
      ),
      log_rotation_max_mb: num('log_rotation_max_mb', 50),
      log_rotation_interval_hours: num('log_rotation_interval_hours', 24),
      log_rotation_backup_count: num('log_rotation_backup_count', 3),
      log_write_instance: bool('log_write_instance', true),
      log_write_web: bool('log_write_web'),
      log_write_maintenance: bool('log_write_maintenance'),
      log_write_audit: bool('log_write_audit'),
      log_reformat_timestamps: bool('log_reformat_timestamps', true),
      mod_download_concurrency: Math.max(
        1,
        Math.min(8, num('mod_download_concurrency', 4)),
      ),
    };
  }

  get langCode(): string {
    return String(this.section('language').code || 'en').slice(0, 12);
  }

  get translateModNames(): boolean {
    const raw = this.section('shared').translate_mod_names;
    if (raw === undefined || raw === '') return true;
    return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
  }

  get sharedTheme(): string {
    return String(this.section('shared').theme || 'fcc_classic');
  }

  get firewallUdpRuleDone(): boolean {
    const raw = this.section('program').windows_firewall_udp_rule_done;
    return ['1', 'true', 'yes', 'on'].includes(
      String(raw || '')
        .trim()
        .toLowerCase(),
    );
  }

  setFirewallUdpRuleDone(done: boolean): void {
    const prog = { ...this.section('program') };
    prog.windows_firewall_udp_rule_done = done ? 'true' : 'false';
    this.cache.program = prog;
    this.persist();
  }

  saveWebPanelKeys(updates: Partial<WebPanelIni>): void {
    const w = { ...this.section('web_panel') };
    for (const [k, v] of Object.entries(updates)) {
      if (v === undefined) continue;
      w[k] = typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v);
    }
    this.cache.web_panel = w;
    this.persist();
  }

  private persist(): void {
    const lines: string[] = [];
    for (const [sec, kv] of Object.entries(this.cache)) {
      lines.push(`[${sec}]`);
      for (const [k, v] of Object.entries(kv)) {
        lines.push(`${k} = ${v}`);
      }
      lines.push('');
    }
    const { writeFileSync } = require('fs') as typeof import('fs');
    writeFileSync(this.paths.settingsPath, lines.join('\n'), 'utf-8');
    this.reload();
  }
}
