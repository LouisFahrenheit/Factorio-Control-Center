import { Injectable } from '@nestjs/common';
import {
  copyFileSync,
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'fs';
import { join, relative } from 'path';
import { parse, stringify } from 'ini';
import { FccConfigService } from '../../config/fcc-config.service';
import { PathsService } from '../../config/paths.service';
import { InstancesService } from '../../instances/instances.service';
import { InstanceItem } from '../../common/types';
import { OpResult, readLogFile, LOG_HISTORY_DEFAULT_TAIL } from '../ops-utils';
import { LogRotationService } from '../../logging/log-rotation.service';
import { WebPanelListenerService } from '../../http/web-panel-listener.service';
import { tlsFilesExist } from '../../http/tls-path.util';
import {
  resolveBindPort,
  resolveDisplayHost,
  resolveDisplayPort,
} from '../../http/web-panel-bind.util';
import { trimHost } from '../../common/trim.util';
import {
  isValidGameBindIp,
  isValidGamePort,
  resolveGameBindIp,
} from '../../common/network-validation';
import { ModPortalService } from '../mod-portal/mod-portal.service';

const RUNTIME_TOUCH_KEYS = new Set([
  'tls_enabled',
  'tls_certfile',
  'tls_keyfile',
  'tls_key_password',
  'listen_host',
  'listen_port',
]);

const KNOWN_THEMES = [
  'fcc_classic',
  'dark_space',
  'vulcanus',
  'ion_storm',
  'cryogenics',
];

type IniData = Record<string, Record<string, string>>;

const TLS_UPLOAD_MAX_BYTES = 2 * 1024 * 1024;

@Injectable()
export class ProgramOpsService {
  constructor(
    private readonly paths: PathsService,
    private readonly config: FccConfigService,
    private readonly instances: InstancesService,
    private readonly logRotation: LogRotationService,
    private readonly listener: WebPanelListenerService,
    private readonly portal: ModPortalService,
  ) {}

  get(): OpResult {
    const ini = this.loadIni();
    const shared = ini.shared || {};
    const wp = this.config.webPanel;
    const langs = this.availableLanguages();
    const theme = this.normalizeTheme(shared.theme);
    const language = this.normalizeLang(ini.language?.code, langs);
    const selected = this.instances.getSelected();

    return {
      ok: true,
      autostart_server: !!selected?.autostartServer,
      translate_mod_names: this.bool(shared.translate_mod_names, true),
      web_disable_effects: wp.web_disable_effects,
      sync_bans_across_instances: wp.sync_bans_across_instances,
      sync_admins_across_instances: wp.sync_admins_across_instances,
      sync_whitelist_across_instances: wp.sync_whitelist_across_instances,
      require_unique_instance_game_ports: wp.require_unique_instance_game_ports,
      server_settings_default_public_off: wp.server_settings_default_public_off,
      server_settings_apply_global_credentials:
        wp.server_settings_apply_global_credentials,
      modpack_activate_use_symlinks: this.bool(
        shared.modpack_activate_use_symlinks,
        true,
      ),
      toast_duration_sec: wp.toast_duration_sec,
      log_rotation_max_mb: wp.log_rotation_max_mb,
      log_rotation_interval_hours: wp.log_rotation_interval_hours,
      log_rotation_backup_count: wp.log_rotation_backup_count,
      log_write_instance: wp.log_write_instance,
      log_write_web: wp.log_write_web,
      log_write_maintenance: wp.log_write_maintenance,
      log_write_audit: wp.log_write_audit,
      log_reformat_timestamps: wp.log_reformat_timestamps,
      theme,
      available_themes: [...KNOWN_THEMES],
      language,
      available_languages: langs,
      global_username: wp.global_username,
      global_token: wp.global_token,
      factorio_global_credentials_present: !!(
        wp.global_username && wp.global_token
      ),
      tls_enabled: wp.tls_enabled,
      tls_certfile: wp.tls_certfile,
      tls_keyfile: wp.tls_keyfile,
      tls_key_password: wp.tls_key_password,
      public_host: wp.public_host,
      public_port: wp.public_port,
      listen_host: wp.listen_host,
      listen_port: wp.listen_port,
      effective_listen_host: trimHost(wp.listen_host),
      effective_listen_port: resolveBindPort(wp),
      effective_public_host: resolveDisplayHost(wp),
      effective_public_port: resolveDisplayPort(wp, resolveBindPort(wp)),
    };
  }

  async verifyGlobalFactorioCredentials(): Promise<OpResult> {
    const username = String(this.config.webPanel.global_username || '').trim();
    const token = String(this.config.webPanel.global_token || '').trim();
    if (!username || !token) {
      return { ok: true, verified: false, portal_username: '' };
    }
    const verified = await this.portal.verifyCredentials(username, token);
    return {
      ok: true,
      verified: verified.ok,
      portal_username: verified.ok ? verified.username : '',
    };
  }

  async set(kwargs: Record<string, unknown>): Promise<OpResult> {
    const runtimeSnapshot = this.listener.captureSnapshot();
    const runtimeTouch = Object.keys(kwargs).some((k) =>
      RUNTIME_TOUCH_KEYS.has(k),
    );

    const ini = this.loadIni();
    ini.shared = ini.shared || {};
    const wpBackup = { ...(ini.web_panel || {}) };
    ini.web_panel = ini.web_panel || {};
    ini.language = ini.language || {};
    const settingsChanges: { key: string; from: string; to: string }[] = [];

    if ('global_username' in kwargs || 'global_token' in kwargs) {
      const wp = this.config.webPanel;
      const username = String(
        kwargs.global_username ??
          ini.web_panel.global_username ??
          wp.global_username ??
          '',
      ).trim();
      const token = String(
        kwargs.global_token ??
          ini.web_panel.global_token ??
          wp.global_token ??
          '',
      ).trim();
      if (!username || !token) {
        return { ok: false, error: 'factorio_credentials_incomplete' };
      }
      const verified = await this.portal.verifyCredentials(username, token);
      if (!verified.ok) {
        return { ok: false, error: 'factorio_credentials_invalid' };
      }
      this.portal.clearVerifyCache();
    }

    if ('autostart_server' in kwargs) {
      const val = this.bool(kwargs.autostart_server);
      const id = this.instances.getSelectedId();
      const item = id ? this.instances.getById(id) : undefined;
      if (item) this.instances.update(id, { ...item, autostartServer: val });
    }

    if ('translate_mod_names' in kwargs) {
      ini.shared.translate_mod_names = this.bool(kwargs.translate_mod_names)
        ? 'true'
        : 'false';
    }
    if ('modpack_activate_use_symlinks' in kwargs) {
      const prev = this.bool(ini.shared.modpack_activate_use_symlinks, true);
      const next = this.bool(kwargs.modpack_activate_use_symlinks, true);
      if (prev !== next) {
        settingsChanges.push({
          key: 'modpack_activate_use_symlinks',
          from: prev ? 'true' : 'false',
          to: next ? 'true' : 'false',
        });
      }
      ini.shared.modpack_activate_use_symlinks = next ? 'true' : 'false';
    }
    if ('theme' in kwargs) {
      ini.shared.theme = this.normalizeTheme(kwargs.theme);
    }
    if ('language' in kwargs) {
      ini.language.code = this.normalizeLang(
        kwargs.language,
        this.availableLanguages(),
      );
    }

    const wpKeys = [
      'web_disable_effects',
      'sync_bans_across_instances',
      'sync_admins_across_instances',
      'sync_whitelist_across_instances',
      'require_unique_instance_game_ports',
      'server_settings_default_public_off',
      'server_settings_apply_global_credentials',
      'toast_duration_sec',
      'log_rotation_max_mb',
      'log_rotation_interval_hours',
      'log_rotation_backup_count',
      'log_write_instance',
      'log_write_web',
      'log_write_maintenance',
      'log_write_audit',
      'log_reformat_timestamps',
      'global_username',
      'global_token',
      'tls_enabled',
      'tls_certfile',
      'tls_keyfile',
      'tls_key_password',
      'public_host',
      'public_port',
      'listen_host',
      'listen_port',
    ] as const;

    for (const key of wpKeys) {
      if (!(key in kwargs)) continue;
      const raw = kwargs[key];
      if (
        key === 'web_disable_effects' ||
        key.startsWith('sync_') ||
        key === 'require_unique_instance_game_ports' ||
        key === 'server_settings_default_public_off' ||
        key === 'server_settings_apply_global_credentials' ||
        key.startsWith('log_write_') ||
        key === 'log_reformat_timestamps' ||
        key === 'tls_enabled'
      ) {
        ini.web_panel[key] =
          typeof raw === 'boolean'
            ? raw
              ? 'true'
              : 'false'
            : this.bool(raw)
              ? 'true'
              : 'false';
      } else if (key === 'toast_duration_sec') {
        const n = parseInt(String(raw ?? '5'), 10);
        ini.web_panel[key] = String(
          Math.max(1, Math.min(20, Number.isFinite(n) ? n : 5)),
        );
      } else if (
        key === 'log_rotation_max_mb' ||
        key === 'log_rotation_interval_hours' ||
        key === 'log_rotation_backup_count'
      ) {
        const n = parseInt(String(raw ?? ''), 10);
        if (key === 'log_rotation_max_mb') {
          ini.web_panel[key] = String(
            Math.max(1, Math.min(2048, Number.isFinite(n) ? n : 50)),
          );
        } else if (key === 'log_rotation_interval_hours') {
          ini.web_panel[key] = String(
            Math.max(1, Math.min(8760, Number.isFinite(n) ? n : 24)),
          );
        } else {
          ini.web_panel[key] = String(
            Math.max(1, Math.min(20, Number.isFinite(n) ? n : 3)),
          );
        }
      } else if (key === 'listen_port') {
        const n = parseInt(String(raw ?? '80'), 10);
        ini.web_panel[key] = String(
          Math.max(1, Math.min(65535, Number.isFinite(n) ? n : 80)),
        );
      } else {
        ini.web_panel[key] = String(raw ?? '').trim();
      }
    }

    if (
      'tls_enabled' in kwargs ||
      'listen_host' in kwargs ||
      'listen_port' in kwargs
    ) {
      ini.web_panel.port_mode = 'custom';
    }

    const prevTls = this.bool(wpBackup.tls_enabled);
    const nextTls = this.bool(ini.web_panel.tls_enabled);
    const listenPort = parseInt(
      String(ini.web_panel.listen_port || '8080'),
      10,
    );
    if (Number.isFinite(listenPort) && prevTls !== nextTls) {
      if (nextTls) {
        if (listenPort === 80) ini.web_panel.listen_port = '443';
        else if (listenPort === 8080) ini.web_panel.listen_port = '8443';
      } else {
        if (listenPort === 443) ini.web_panel.listen_port = '80';
        else if (listenPort === 8443) ini.web_panel.listen_port = '8080';
      }
    }

    const tlsEnabled = this.bool(ini.web_panel.tls_enabled);
    if (tlsEnabled) {
      const cert = String(ini.web_panel.tls_certfile || '').trim();
      const key = String(ini.web_panel.tls_keyfile || '').trim();
      if (!tlsFilesExist(cert, key, this.paths.rootDir)) {
        ini.web_panel = wpBackup;
        return { ok: false, error: 'tls_cert_or_key_missing' };
      }
    }

    delete ini.program;
    this.saveIni(ini);
    this.logRotation.syncFromConfig();

    if (runtimeTouch) {
      const restarted = await this.listener.restartIfNeeded(runtimeSnapshot);
      if (!restarted.ok) {
        return {
          ok: false,
          error: restarted.error || 'web_panel_restart_failed',
        };
      }
    }

    return { ok: true, settings_changes: settingsChanges };
  }

  async restartWebPanel(): Promise<OpResult> {
    const restarted = await this.listener.restart();
    if (!restarted.ok)
      return {
        ok: false,
        error: restarted.error || 'web_panel_restart_failed',
      };
    return { ok: true };
  }

  programLogHistory(
    kind: string,
    tail = LOG_HISTORY_DEFAULT_TAIL,
    full = false,
  ): OpResult {
    const k = String(kind || '')
      .trim()
      .toLowerCase();
    if (k !== 'web' && k !== 'maintenance' && k !== 'audit')
      return { ok: false, error: 'invalid_log_kind' };
    const enabled =
      k === 'web'
        ? this.logRotation.logWriteWebEnabled()
        : k === 'maintenance'
          ? this.logRotation.logWriteMaintenanceEnabled()
          : this.logRotation.logWriteAuditEnabled();
    const path =
      k === 'web'
        ? this.paths.webPanelLogPath()
        : k === 'maintenance'
          ? this.paths.maintenanceSchedulerLogPath()
          : this.paths.auditLogPath();
    if (!enabled) {
      return {
        ok: true,
        lines: [],
        path,
        truncated: false,
        line_capped: false,
        full_loaded: false,
        file_missing: true,
        file_bytes: 0,
        program_log_disabled: true,
      };
    }
    const tailLimit = Math.max(
      1,
      Math.min(
        Number(tail) || LOG_HISTORY_DEFAULT_TAIL,
        LOG_HISTORY_DEFAULT_TAIL,
      ),
    );
    const res = readLogFile(path, full ? { full: true } : { tail: tailLimit });
    if (res.tooLarge) {
      return {
        ok: false,
        error: 'log_file_too_large',
        path,
        file_bytes: res.fileBytes,
      };
    }
    return {
      ok: true,
      lines: res.lines,
      path,
      truncated: res.truncated,
      line_capped: res.lineCapped,
      full_loaded: full,
      file_missing: res.fileMissing,
      file_bytes: res.fileBytes,
    };
  }

  getServerIni(): OpResult {
    const selected = this.instances.getSelected();
    if (!selected) return { ok: false, error: 'instance_not_found' };
    return {
      ok: true,
      ip: String(selected.ip || '0.0.0.0').trim() || '0.0.0.0',
      port: String(selected.port || '34197').trim() || '34197',
      save: String(selected.launchSave || 'latest').trim() || 'latest',
      latest_label: 'latest',
    };
  }

  uploadWebTlsFile(tmpPath: string, kind: string): OpResult {
    const k = String(kind || '')
      .trim()
      .toLowerCase();
    if (k !== 'cert' && k !== 'key')
      return { ok: false, error: 'tls_upload_invalid_kind' };
    if (!existsSync(tmpPath))
      return { ok: false, error: 'tls_upload_missing_tmp' };
    let size = 0;
    try {
      size = statSync(tmpPath).size;
    } catch {
      return { ok: false, error: 'tls_upload_missing_tmp' };
    }
    if (size <= 0 || size > TLS_UPLOAD_MAX_BYTES)
      return { ok: false, error: 'tls_upload_too_large' };
    const destName = k === 'cert' ? 'panel-cert.pem' : 'panel-key.pem';
    const dest = join(this.paths.tlsDir, destName);
    try {
      copyFileSync(tmpPath, dest);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    let rel = dest;
    try {
      rel = relative(this.paths.rootDir, dest).replace(/\\/g, '/');
    } catch {
      /* keep absolute */
    }
    return { ok: true, path: rel, kind: k };
  }

  modpackActivateUseSymlinks(): boolean {
    const ini = this.loadIni();
    return this.bool(ini.shared?.modpack_activate_use_symlinks, true);
  }

  setServerIni(kwargs: Record<string, unknown>): OpResult {
    const id = this.instances.getSelectedId();
    if (!id) return { ok: false, error: 'instance_not_found' };
    const selected = this.instances.getSelected();
    if (!selected) return { ok: false, error: 'instance_not_found' };

    const patch: Partial<InstanceItem> = {};
    const changes: { key: string; from: string; to: string }[] = [];

    if ('ip' in kwargs) {
      const raw = String(kwargs.ip ?? '').trim();
      if (raw && !isValidGameBindIp(raw)) {
        return { ok: false, error: 'invalid_ip' };
      }
      const next = resolveGameBindIp(raw);
      const prev = String(selected.ip || '0.0.0.0');
      if (next !== prev) changes.push({ key: 'ip', from: prev, to: next });
      patch.ip = next;
    }
    if ('port' in kwargs) {
      const port = String(kwargs.port ?? '').trim();
      if (!isValidGamePort(port)) {
        return { ok: false, error: 'invalid_port' };
      }
      if (this.config.webPanel.require_unique_instance_game_ports) {
        const busy = this.instances
          .load()
          .items.some((x) => x.id !== id && String(x.port || '') === port);
        if (busy) return { ok: false, error: 'port_in_use' };
      }
      const prev = String(selected.port || '');
      if (port !== prev)
        changes.push({ key: 'port', from: prev || '—', to: port });
      patch.port = port;
    }
    if ('save' in kwargs) {
      const next = String(kwargs.save ?? '').trim() || 'latest';
      const prev = String(selected.launchSave || 'latest');
      if (next !== prev) changes.push({ key: 'save', from: prev, to: next });
      patch.launchSave = next;
    }

    if (!Object.keys(patch).length) return { ok: true, settings_changes: [] };
    const updated = this.instances.update(id, patch);
    if (updated.ok === false) return updated;
    return { ok: true, settings_changes: changes };
  }

  private loadIni(): IniData {
    if (!existsSync(this.paths.settingsPath)) return {};
    const raw = readFileSync(this.paths.settingsPath, 'utf-8');
    const parsed = (raw ? parse(raw) : {}) as Record<
      string,
      Record<string, unknown>
    >;
    const out: IniData = {};
    for (const [sec, kv] of Object.entries(parsed)) {
      if (!kv || typeof kv !== 'object') continue;
      out[sec] = {};
      for (const [k, v] of Object.entries(kv)) {
        out[sec][k] = String(v ?? '').trim();
      }
    }
    return out;
  }

  private saveIni(data: IniData): void {
    writeFileSync(this.paths.settingsPath, stringify(data), 'utf-8');
    this.config.reload();
  }

  private availableLanguages(): string[] {
    const codes = new Set<string>();
    try {
      for (const f of readdirSync(this.paths.localeDir)) {
        const m = /^server_lang_([a-z]{2}(?:-[a-z]+)?)\.json$/i.exec(f);
        if (m?.[1]) codes.add(m[1].toLowerCase());
      }
    } catch {
      /* ignore */
    }
    if (!codes.size) codes.add('en');
    return [...codes].sort();
  }

  private bool(value: unknown, defaultTrue = false): boolean {
    if (value === undefined || value === null || value === '')
      return defaultTrue;
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'on'].includes(
      String(value).trim().toLowerCase(),
    );
  }

  private normalizeTheme(raw: unknown): string {
    const t = String(raw || 'fcc_classic').trim();
    return KNOWN_THEMES.includes(t) ? t : 'fcc_classic';
  }

  private normalizeLang(raw: unknown, available: string[]): string {
    const c = String(raw || 'en')
      .trim()
      .toLowerCase()
      .slice(0, 12);
    if (!c) return available.includes('en') ? 'en' : available[0] || 'en';
    if (available.includes(c)) return c;
    const short = c.slice(0, 2);
    if (available.includes(short)) return short;
    return available.includes('en') ? 'en' : available[0] || 'en';
  }
}
