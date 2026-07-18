import { Injectable } from '@nestjs/common';
import { InstancesService } from '../instances/instances.service';
import { panelActorLogLabel } from '../shared/panel-actor';
import { WebPanelLogService } from './web-panel-log.service';

const LOGGED_OPS = new Set([
  'instances_add',
  'instances_remove',
  'instances_select',
  'instances_update',
  'instances_clone',
  'instance_bootstrap_start',
  'start_server',
  'stop_server',
  'restart_server',
  'kill_server',
  'save_game',
  'backup',
  'rcon_exec',
  'chat_send_text',
  'set_program_settings',
  'restart_web_panel',
  'upload_web_tls_file',
  'set_server_ini',
  'maintenance_run_now',
  'maintenance_set',
  'maintenance_clear_manual',
  'ban_player',
  'unban_player',
  'kick_player',
  'mute_player',
  'unmute_player',
  'purge_player',
  'whitelist_add',
  'whitelist_remove',
  'whitelist_clear',
  'sync_bans',
  'write_server_settings',
  'write_mod_list',
  'write_admin_list',
  'mod_settings_write_json',
  'mods_set_enabled',
  'mods_remove',
  'upload_mod_archive',
  'modpack_activate',
  'modpack_save_current',
  'modpack_import_upload',
  'rename_save',
  'delete_save',
  'duplicate_save',
  'set_launch_save',
  'upload_save_archive',
  'create_save',
  'factorio_update',
  'announcements_write',
  'write_commands_catalog',
  'mods_job_start',
]);

const SETTINGS_REDACT = new Set([
  'global_token',
  'tls_key_password',
  'api_token',
]);

@Injectable()
export class WebPanelEventLogService {
  constructor(
    private readonly webLog: WebPanelLogService,
    private readonly instances: InstancesService,
  ) {}

  logAuth(
    kind:
      | 'login'
      | 'login_failed'
      | 'logout'
      | 'user_create'
      | 'user_update'
      | 'user_delete',
    username: string,
    detail?: string,
  ): void {
    const user = String(username || '').trim() || '?';
    switch (kind) {
      case 'login':
        this.webLog.logEvent(
          'auth',
          `Login: ${user}${detail ? ` (${detail})` : ''}`,
        );
        break;
      case 'login_failed':
        this.webLog.logEvent('auth', `Login failed: ${user}`);
        break;
      case 'logout':
        this.webLog.logEvent('auth', `Logout: ${user}`);
        break;
      case 'user_create':
        this.webLog.logEvent(
          'users',
          `${user} created account ${detail || '?'}`,
        );
        break;
      case 'user_update':
        this.webLog.logEvent(
          'users',
          `${user} updated account ${detail || '?'}`,
        );
        break;
      case 'user_delete':
        this.webLog.logEvent(
          'users',
          `${user} deleted account ${detail || '?'}`,
        );
        break;
    }
  }

  logDispatchOp(
    op: string,
    kwargs: Record<string, unknown>,
    result: Record<string, unknown>,
  ): void {
    if (!LOGGED_OPS.has(op)) return;

    const actor = this.actorLabel(kwargs);
    const ok = result.ok !== false;
    const err = ok ? '' : String(result.error || 'error');
    const suffix = ok ? '' : ` — failed: ${err}`;
    const inst = this.instanceLabel();

    let message = '';
    switch (op) {
      case 'instances_add':
        message = `${actor}: added instance ${String(result.id || kwargs.name || '')}${suffix}`;
        break;
      case 'instances_remove':
        message = `${actor}: removed instance ${String(kwargs.id || '')}${suffix}`;
        break;
      case 'instances_select':
        message = `${actor}: selected instance ${String(kwargs.id || '')}${suffix}`;
        break;
      case 'instances_update':
        message = `${actor}: updated instance ${String(kwargs.id || '')}${suffix}`;
        break;
      case 'instances_clone':
        message = `${actor}: cloned instance ${String(kwargs.id || '')} → ${String(result.id || kwargs.name || '')}${suffix}`;
        break;
      case 'instance_bootstrap_start':
        message = `${actor}: instance bootstrap started${suffix}`;
        break;
      case 'start_server':
        message = `${actor}: start server [${inst}]${suffix}`;
        break;
      case 'stop_server':
        message = `${actor}: stop server [${inst}]${suffix}`;
        break;
      case 'restart_server':
        message = `${actor}: restart server [${inst}]${suffix}`;
        break;
      case 'kill_server':
        message = `${actor}: kill server [${inst}]${suffix}`;
        break;
      case 'save_game':
        message = `${actor}: save game [${inst}]${suffix}`;
        break;
      case 'backup':
        message = `${actor}: backup [${inst}]${suffix}`;
        break;
      case 'rcon_exec':
        message = `${actor}: RCON ${truncate(String(kwargs.command || ''), 160)} [${inst}]${suffix}`;
        break;
      case 'chat_send_text':
        message = `${actor}: chat announcement ${truncate(String(kwargs.message || ''), 120)} [${inst}]${suffix}`;
        break;
      case 'set_program_settings': {
        const keys = Object.keys(kwargs).filter(
          (k) => !SETTINGS_REDACT.has(k) && k !== 'actor' && !k.startsWith('_'),
        );
        message = `${actor}: program settings changed (${keys.join(', ') || 'no fields'})${suffix}`;
        break;
      }
      case 'restart_web_panel':
        message = `${actor}: web panel restart requested${suffix}`;
        break;
      case 'upload_web_tls_file':
        message = `${actor}: TLS ${String(kwargs.kind || 'file')} uploaded${suffix}`;
        break;
      case 'set_server_ini':
        message = `${actor}: server.ini updated [${inst}]${suffix}`;
        break;
      case 'maintenance_run_now':
        message = `${actor}: maintenance run now [${inst}]${suffix}`;
        break;
      case 'maintenance_set':
        message = `${actor}: maintenance tasks updated${suffix}`;
        break;
      case 'maintenance_clear_manual':
        message = `${actor}: maintenance manual session cleared [${inst}]${suffix}`;
        break;
      case 'ban_player':
        message = `${actor}: ban ${String(kwargs.player || '')} [${inst}]${suffix}`;
        break;
      case 'unban_player':
        message = `${actor}: unban ${String(kwargs.player || '')} [${inst}]${suffix}`;
        break;
      case 'kick_player':
        message = `${actor}: kick ${String(kwargs.player || '')} [${inst}]${suffix}`;
        break;
      case 'mute_player':
        message = `${actor}: mute ${String(kwargs.player || '')} [${inst}]${suffix}`;
        break;
      case 'unmute_player':
        message = `${actor}: unmute ${String(kwargs.player || '')} [${inst}]${suffix}`;
        break;
      case 'purge_player':
        message = `${actor}: purge ${String(kwargs.player || '')} [${inst}]${suffix}`;
        break;
      case 'whitelist_add':
        message = `${actor}: whitelist add ${String(kwargs.player || '')} [${inst}]${suffix}`;
        break;
      case 'whitelist_remove':
        message = `${actor}: whitelist remove ${String(kwargs.player || '')} [${inst}]${suffix}`;
        break;
      case 'whitelist_clear':
        message = `${actor}: whitelist cleared [${inst}]${suffix}`;
        break;
      case 'sync_bans':
        message = `${actor}: sync bans [${inst}]${suffix}`;
        break;
      case 'write_server_settings':
        message = `${actor}: server-settings.json updated [${inst}]${suffix}`;
        break;
      case 'write_mod_list':
        message = `${actor}: mod-list updated [${inst}]${suffix}`;
        break;
      case 'write_admin_list':
        message = `${actor}: admin list updated [${inst}]${suffix}`;
        break;
      case 'mod_settings_write_json':
        message = `${actor}: mod settings updated [${inst}]${suffix}`;
        break;
      case 'mods_set_enabled': {
        const en = kwargs.enabled;
        const on = en !== false && en !== 'false' && en !== 0 && en !== '0';
        message = `${actor}: mod ${String(kwargs.name || '')} ${on ? 'enabled' : 'disabled'} [${inst}]${suffix}`;
        break;
      }
      case 'mods_remove':
        message = `${actor}: mod removed ${String(kwargs.name || '')} [${inst}]${suffix}`;
        break;
      case 'upload_mod_archive':
        message = `${actor}: mod uploaded ${String(kwargs.name || result.name || '')} [${inst}]${suffix}`;
        break;
      case 'modpack_activate':
        message = `${actor}: modpack activated ${String(kwargs.name || result.name || '')} [${inst}]${suffix}`;
        break;
      case 'modpack_save_current':
        message = `${actor}: modpack saved ${String(kwargs.name || result.name || '')} [${inst}]${suffix}`;
        break;
      case 'modpack_import_upload':
        message = `${actor}: modpack imported ${String(kwargs.name || result.name || '')} [${inst}]${suffix}`;
        break;
      case 'rename_save':
        message = `${actor}: save renamed ${String(kwargs.name || '')} → ${String(kwargs.new_name || result.new_name || '')} [${inst}]${suffix}`;
        break;
      case 'delete_save':
        message = `${actor}: save deleted ${String(kwargs.name || '')} [${inst}]${suffix}`;
        break;
      case 'duplicate_save':
        message = `${actor}: save duplicated ${String(kwargs.name || '')} [${inst}]${suffix}`;
        break;
      case 'set_launch_save':
        message = `${actor}: launch save set ${String(kwargs.name || '')} [${inst}]${suffix}`;
        break;
      case 'upload_save_archive':
        message = `${actor}: save uploaded ${String(kwargs.name || result.name || '')} [${inst}]${suffix}`;
        break;
      case 'create_save':
        message = `${actor}: save created ${String(kwargs.name || result.name || '')} [${inst}]${suffix}`;
        break;
      case 'factorio_update':
        message = `${actor}: Factorio update started [${inst}]${suffix}`;
        break;
      case 'announcements_write':
        message = `${actor}: announcements updated [${inst}]${suffix}`;
        break;
      case 'write_commands_catalog':
        message = `${actor}: commands catalog updated [${inst}]${suffix}`;
        break;
      case 'mods_job_start':
        message = `${actor}: mods job started (${String(kwargs.mode || '')}) [${inst}]${suffix}`;
        break;
      default:
        message = `${actor}: ${op} [${inst}]${suffix}`;
        break;
    }

    this.webLog.logEvent('panel', message);
  }

  private actorLabel(kwargs: Record<string, unknown>): string {
    return panelActorLogLabel(String(kwargs.actor || kwargs.web_actor || ''));
  }

  private instanceLabel(): string {
    const inst = this.instances.getSelected();
    if (!inst) return 'no instance';
    const name = String(inst.name || inst.id || '').trim();
    return name ? `${name} (${inst.id})` : String(inst.id || '?');
  }
}

function truncate(text: string, max: number): string {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}
