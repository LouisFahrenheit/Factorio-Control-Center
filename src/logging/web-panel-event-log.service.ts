import { Injectable } from '@nestjs/common';
import { InstancesService } from '../instances/instances.service';
import { AuditLogService } from '../maintenance/audit-log.service';
import { LogRotationService } from './log-rotation.service';
import { PathsService } from '../config/paths.service';

const LOGGED_OPS = new Set([
  'instances_add',
  'instances_remove',
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
    private readonly audit: AuditLogService,
    private readonly instances: InstancesService,
    private readonly logRotation: LogRotationService,
    private readonly paths: PathsService,
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
    let message = '';
    
    switch(kind) {
      case 'login': message = `Logged in`; break;
      case 'login_failed': message = `Login failed`; break;
      case 'logout': message = `Logged out`; break;
      case 'user_create': message = `Created user account for ${detail || '?'}`; break;
      case 'user_update': message = `Updated user account ${detail || '?'}`; break;
      case 'user_delete': message = `Deleted user account ${detail || '?'}`; break;
    }

    this.audit.record({
      event_kind: 'auth',
      actor: user,
      trigger: 'manual',
      success: kind !== 'login_failed',
      detail: { message },
    });
  }

  logDispatchOp(
    op: string,
    kwargs: Record<string, unknown>,
    result: Record<string, unknown>,
  ): void {
    if (!LOGGED_OPS.has(op)) return;

    const actor = String(kwargs.actor || kwargs.web_actor || '').trim() || '?';
    const ok = result.ok !== false;
    const error = ok ? undefined : String(result.error || 'error');
    const instId = String(kwargs.id || result.id || '');
    let instName = instId;
    if (instId) {
      const inst = this.instances.getById(instId);
      if (inst && inst.name) instName = inst.name;
    }

    let message = '';
    switch (op) {
      case 'instances_add':
        message = `Added new server`;
        break;
      case 'instances_remove':
        message = `Removed server`;
        break;
      case 'instances_update': {
        const changesList = Array.isArray(result.changes) ? result.changes : [];
        const changes = changesList.join(', ');
        message = `Updated server configuration (${changes || 'no fields'})`;
        break;
      }
      case 'instances_clone':
        message = `Cloned server to ${String(result.id || kwargs.name || '?')}`;
        break;
      case 'instance_bootstrap_start':
        message = `Started automatic server setup`;
        break;
      case 'start_server':
        message = `Started server`;
        break;
      case 'stop_server':
        message = `Stopped server`;
        break;
      case 'restart_server':
        message = `Restarted server`;
        break;
      case 'kill_server':
        message = `Force killed server`;
        break;
      case 'save_game':
        message = `Saved game`;
        break;
      case 'backup':
        message = `Created backup`;
        break;
      case 'rcon_exec':
        message = `Executed RCON command`;
        break;
      case 'set_program_settings': {
        const changes = Object.keys(kwargs)
          .filter(
            (k) =>
              !SETTINGS_REDACT.has(k) &&
              k !== 'actor' &&
              k !== 'web_actor' &&
              !k.startsWith('_'),
          )
          .map((k) => `${k}=${String(kwargs[k])}`)
          .join(', ');
        message = `Changed global panel settings (${changes || 'no fields'})`;
        break;
      }
      case 'public_page_settings_update':
        message = `Updated public page settings`;
        break;
      case 'maintenance_run_now':
        this.writeToMaintenanceLog(`${actor}: manually triggered maintenance run [${instId || 'global'}]`);
        return;
      case 'maintenance_set':
        this.writeToMaintenanceLog(`${actor}: updated maintenance tasks [${instId || 'global'}]`);
        return;
      case 'maintenance_clear_manual':
        this.writeToMaintenanceLog(`${actor}: cleared manual maintenance session [${instId || 'global'}]`);
        return;
      case 'restart_web_panel':
        message = `Restarted web panel`;
        break;
      case 'upload_web_tls_file':
        message = `Uploaded new TLS ${String(kwargs.kind || 'certificate')}`;
        break;
      case 'set_server_ini':
        message = `Updated server.ini`;
        break;
      case 'ban_player':
        message = `Banned player ${String(kwargs.player || '?')}`;
        break;
      case 'unban_player':
        message = `Unbanned player ${String(kwargs.player || '?')}`;
        break;
      case 'kick_player':
        message = `Kicked player ${String(kwargs.player || '?')}`;
        break;
      case 'mute_player':
        message = `Muted player ${String(kwargs.player || '?')}`;
        break;
      case 'unmute_player':
        message = `Unmuted player ${String(kwargs.player || '?')}`;
        break;
      case 'purge_player':
        message = `Purged player ${String(kwargs.player || '?')}`;
        break;
      case 'whitelist_add':
        message = `Added ${String(kwargs.player || '?')} to whitelist`;
        break;
      case 'whitelist_remove':
        message = `Removed ${String(kwargs.player || '?')} from whitelist`;
        break;
      case 'whitelist_clear':
        message = `Cleared whitelist`;
        break;
      case 'sync_bans':
        message = `Synchronized bans across servers`;
        break;
      case 'write_server_settings':
        message = `Updated server-settings.json`;
        break;
      case 'write_mod_list':
        message = `Updated mod list`;
        break;
      case 'write_admin_list':
        message = `Updated admin list`;
        break;
      case 'mod_settings_write_json':
        message = `Updated mod settings`;
        break;
      case 'mods_set_enabled':
        message = `Toggled mod state`;
        break;
      case 'mods_remove':
        message = `Removed mod`;
        break;
      case 'upload_mod_archive':
        message = `Uploaded mod archive`;
        break;
      case 'modpack_activate':
        message = `Activated modpack`;
        break;
      case 'modpack_save_current':
        message = `Saved current mods as modpack`;
        break;
      case 'modpack_import_upload':
        message = `Imported modpack from archive`;
        break;
      case 'rename_save':
        message = `Renamed save file`;
        break;
      case 'delete_save':
        message = `Deleted save file`;
        break;
      case 'duplicate_save':
        message = `Duplicated save file`;
        break;
      case 'set_launch_save':
        message = `Changed default launch save`;
        break;
      case 'upload_save_archive':
        message = `Uploaded save file`;
        break;
      case 'create_save':
        message = `Created new save file`;
        break;
      case 'factorio_update':
        message = `Updated Factorio server version`;
        break;
      case 'announcements_write':
        message = `Updated server announcements`;
        break;
      case 'write_commands_catalog':
        message = `Updated RCON commands catalog`;
        break;
      case 'mods_job_start':
        message = `Started background mods job`;
        break;
    }

    if (!message) return;

    this.audit.record({
      event_kind: 'web_panel',
      actor,
      instance_id: instId || undefined,
      instance_name: instName || undefined,
      trigger: 'manual',
      success: ok,
      error,
      detail: { message },
    });
  }
  private writeToMaintenanceLog(msg: string): void {
    if (!this.logRotation.logWriteMaintenanceEnabled()) return;
    const line = `${new Date().toISOString()} [Maintenance] ${msg}`;
    this.logRotation.appendLine(this.paths.maintenanceSchedulerLogPath(), line);
  }
}

function truncate(text: string, max: number): string {
  const s = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.length <= max) return s;
  return `${s.slice(0, max - 1)}…`;
}

