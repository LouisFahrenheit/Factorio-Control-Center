import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { panelTimestamp } from '../common/datetime.util';
import { writeJsonFile } from '../common/json-store';
import { InstancesService } from '../instances/instances.service';
import type { CommandsCatalogHistoryChange } from './commands-catalog-history.util';

export interface HistoryChange {
  key: string;
  from: string;
  to: string;
}

export interface InstanceHistoryEvent {
  action: string;
  date: string;
  actor?: string;
  success?: boolean;
  error?: string;
  target?: string;
  changes?: HistoryChange[];
  detail?: Record<string, unknown>;
}

const HISTORY_TAIL = 2000;
const HISTORY_READ = 200;

const SERVER_OPS = new Set([
  'start_server',
  'stop_server',
  'kill_server',
  'restart_server',
  'save_game',
  'backup',
  'set_server_ini',
  'set_launch_save',
  'create_save',
  'delete_save',
  'duplicate_save',
  'rename_save',
  'upload_save_archive',
  'write_server_settings',
  'create_server_settings_from_example',
]);

const MODS_OPS = new Set([
  'upload_mod_archive',
  'mods_remove',
  'mods_set_enabled',
  'mods_set_all_enabled',
  'mods_set_version',
  'modpack_activate',
  'modpack_save_current',
  'modpack_delete',
  'modpack_reset',
  'modpack_import_upload',
  'modpack_rename',
  'mods_set_prefs',
  'set_program_settings',
]);

const COMMANDS_OPS = new Set(['rcon_exec', 'write_commands_catalog']);

function historyActor(kwargs: Record<string, unknown>): string {
  return String(kwargs.actor || kwargs.web_actor || '').trim() || 'system';
}

@Injectable()
export class InstanceHistoryService {
  constructor(private readonly instances: InstancesService) {}

  tailServer(serverPath: string): InstanceHistoryEvent[] {
    return this.readTail(serverPath, 'server_history');
  }

  tailMods(serverPath: string): InstanceHistoryEvent[] {
    return this.readTail(serverPath, 'mods_history');
  }

  tailCommands(serverPath: string): InstanceHistoryEvent[] {
    return this.readTail(serverPath, 'commands_history');
  }

  recordStartupError(
    serverPath: string,
    detail: { exit_code?: number; missing_deps?: string[] },
  ): void {
    this.append(serverPath, 'server_history', {
      action: 'startup_error',
      date: panelTimestamp(),
      actor: 'system',
      success: false,
      detail,
    });
  }

  recordFromDispatch(
    op: string,
    kwargs: Record<string, unknown>,
    result: Record<string, unknown>,
  ): void {
    const inst = this.instances.getSelected();
    if (!inst?.serverPath) return;
    const actor = historyActor(kwargs);
    const success = result.ok !== false;
    const error = success ? undefined : String(result.error || '');
    const base = {
      date: panelTimestamp(),
      actor,
      success,
      error: error || undefined,
    };

    if (SERVER_OPS.has(op)) {
      const event = this.buildServerEvent(op, kwargs, result, base);
      if (event) this.append(inst.serverPath, 'server_history', event);
      return;
    }

    if (MODS_OPS.has(op)) {
      const event = this.buildModsEvent(op, kwargs, result, base);
      if (event) this.append(inst.serverPath, 'mods_history', event);
      return;
    }

    if (COMMANDS_OPS.has(op)) {
      if (op === 'write_commands_catalog') {
        this.recordCommandsCatalogChanges(inst.serverPath, result, base);
        return;
      }
      const event = this.buildCommandsEvent(op, kwargs, result, base);
      if (event) this.append(inst.serverPath, 'commands_history', event);
    }
  }

  recordModsJob(
    mode: string,
    params: Record<string, unknown>,
    summary: {
      installed: string[];
      updated: string[];
      failed: string[];
      phase: string;
      error?: string;
    },
  ): void {
    const inst = this.instances.getSelected();
    if (!inst?.serverPath) return;
    const phase = String(summary.phase || '');
    if (phase === 'preparing' || phase === 'idle') return;

    const actor = historyActor(params);
    const success = phase === 'done' && !summary.error;
    const isUpdate = mode === 'update_one' || mode === 'update_all';
    let action = 'install';
    if (mode === 'import_modpack') action = 'modpack_import';
    else if (isUpdate) action = 'update';

    this.append(inst.serverPath, 'mods_history', {
      action,
      date: panelTimestamp(),
      actor,
      success,
      error: success ? undefined : String(summary.error || phase),
      target: params.modpack_name ? String(params.modpack_name) : undefined,
      detail: {
        mode,
        installed: summary.installed,
        updated: summary.updated,
        failed: summary.failed,
      },
    });
  }

  recordFactorioUpdate(
    serverPath: string,
    actor: string | undefined,
    success: boolean,
    detail: { from?: string; to?: string; partial?: boolean; error?: string },
  ): void {
    const path = String(serverPath || '').trim();
    if (!path) return;
    this.append(path, 'server_history', {
      action: 'update',
      date: panelTimestamp(),
      actor: actor || 'system',
      success,
      error: success ? undefined : detail.error,
      changes:
        detail.from || detail.to
          ? [
              {
                key: 'version',
                from: String(detail.from || '—'),
                to: String(detail.to || '—'),
              },
            ]
          : undefined,
      detail: detail.partial ? { partial: true } : undefined,
    });
  }

  private buildServerEvent(
    op: string,
    kwargs: Record<string, unknown>,
    result: Record<string, unknown>,
    base: Omit<InstanceHistoryEvent, 'action'>,
  ): InstanceHistoryEvent | null {
    switch (op) {
      case 'start_server':
        return { ...base, action: 'start' };
      case 'stop_server':
        return { ...base, action: 'stop' };
      case 'restart_server':
        return { ...base, action: 'restart' };
      case 'kill_server':
        return { ...base, action: 'kill' };
      case 'save_game':
        return { ...base, action: 'save' };
      case 'backup':
        return { ...base, action: 'backup' };
      case 'set_server_ini':
        return this.settingsChangeEvent(base, 'config_change', result);
      case 'set_launch_save':
        return this.settingsChangeEvent(base, 'save_launch', result);
      case 'create_save':
        return this.saveFileEvent(
          base,
          'save_create',
          kwargs,
          result,
          'create',
        );
      case 'delete_save':
        return this.saveFileEvent(
          base,
          'save_delete',
          kwargs,
          result,
          'delete',
        );
      case 'duplicate_save':
        return this.saveFileEvent(
          base,
          'save_duplicate',
          kwargs,
          result,
          'duplicate',
        );
      case 'rename_save':
        return this.saveFileEvent(
          base,
          'save_rename',
          kwargs,
          result,
          'rename',
        );
      case 'upload_save_archive':
        return this.saveFileEvent(
          base,
          'save_upload',
          kwargs,
          result,
          'upload',
        );
      case 'write_server_settings':
        return this.settingsChangeEvent(base, 'settings_write', result);
      case 'create_server_settings_from_example':
        return { ...base, action: 'settings_reset' };
      default:
        return null;
    }
  }

  private recordCommandsCatalogChanges(
    serverPath: string,
    result: Record<string, unknown>,
    base: Omit<InstanceHistoryEvent, 'action'>,
  ): void {
    if (base.success === false) return;
    const raw = result.catalog_changes;
    if (!Array.isArray(raw) || !raw.length) return;
    for (const row of raw as CommandsCatalogHistoryChange[]) {
      const action = String(row?.action || '').trim();
      if (!action) continue;
      this.append(serverPath, 'commands_history', {
        ...base,
        action,
        target: String(row.target || '').trim() || undefined,
        detail:
          row.detail && typeof row.detail === 'object' ? row.detail : undefined,
      });
    }
  }

  private buildCommandsEvent(
    op: string,
    kwargs: Record<string, unknown>,
    result: Record<string, unknown>,
    base: Omit<InstanceHistoryEvent, 'action'>,
  ): InstanceHistoryEvent | null {
    if (op === 'rcon_exec') {
      const command = String(kwargs.command || '').trim();
      if (!command) return null;
      const source = String(kwargs.source || 'console').trim() || 'console';
      const response = String(result.output || result.response || '').trim();
      const commandName = String(kwargs.command_name || '').trim();
      const commandId = String(kwargs.command_id || '').trim();
      const detail: Record<string, unknown> = { source };
      if (commandId) detail.command_id = commandId;
      if (commandName) detail.command_name = commandName;
      if (response) detail.response = response;
      return { ...base, action: 'execute', target: command, detail };
    }
    return null;
  }

  private buildModsEvent(
    op: string,
    kwargs: Record<string, unknown>,
    result: Record<string, unknown>,
    base: Omit<InstanceHistoryEvent, 'action'>,
  ): InstanceHistoryEvent | null {
    switch (op) {
      case 'upload_mod_archive':
        return {
          ...base,
          action: 'install',
          target: String(kwargs.name || result.name || ''),
        };
      case 'mods_remove':
        return {
          ...base,
          action: 'remove',
          target: String(kwargs.name || ''),
          detail: {
            scope: String(kwargs.scope || 'all'),
            version: String(kwargs.version || ''),
          },
        };
      case 'mods_set_enabled': {
        const enabled =
          kwargs.enabled !== false &&
          kwargs.enabled !== 'false' &&
          kwargs.enabled !== 0;
        return {
          ...base,
          action: enabled ? 'enable' : 'disable',
          target: String(kwargs.name || ''),
        };
      }
      case 'mods_set_all_enabled': {
        const enabled =
          kwargs.enabled !== false &&
          kwargs.enabled !== 'false' &&
          kwargs.enabled !== 0;
        const changed = Number(result.changed || 0);
        if (base.success !== false && changed <= 0) return null;
        return {
          ...base,
          action: enabled ? 'enable_all' : 'disable_all',
          detail: { changed },
        };
      }
      case 'mods_set_version':
        return {
          ...base,
          action: 'update',
          target: String(kwargs.name || ''),
          changes: [
            { key: 'version', from: '—', to: String(kwargs.version || '') },
          ],
        };
      case 'modpack_activate':
        return {
          ...base,
          action: 'modpack_activate',
          target: String(kwargs.name || result.name || ''),
        };
      case 'modpack_save_current':
        return {
          ...base,
          action: 'modpack_create',
          target: String(kwargs.name || result.name || ''),
        };
      case 'modpack_delete':
        return {
          ...base,
          action: 'modpack_delete',
          target: String(kwargs.name || ''),
        };
      case 'modpack_reset':
        return { ...base, action: 'modpack_reset' };
      case 'modpack_import_upload':
        return {
          ...base,
          action: 'modpack_add',
          target: String(kwargs.name || result.name || ''),
        };
      case 'modpack_rename':
        return {
          ...base,
          action: 'modpack_rename',
          target: String(kwargs.new || ''),
          changes: [
            {
              key: 'name',
              from: String(kwargs.old || ''),
              to: String(kwargs.new || ''),
            },
          ],
        };
      case 'mods_set_prefs':
        if (!('remove_old_zips' in kwargs)) return null;
        return this.settingsChangeEvent(base, 'remove_old_zips_pref', result);
      case 'set_program_settings':
        if (
          'modpack_activate_use_symlinks' in kwargs ||
          Array.isArray(result.settings_changes)
        ) {
          const fromResult = this.settingsChangeEvent(
            base,
            'symlink_pref',
            result,
          );
          if (fromResult) return fromResult;
          if (!('modpack_activate_use_symlinks' in kwargs)) return null;
          return {
            ...base,
            action: 'symlink_pref',
            changes: [
              {
                key: 'modpack_activate_use_symlinks',
                from: '—',
                to: kwargs.modpack_activate_use_symlinks ? 'true' : 'false',
              },
            ],
          };
        }
        return null;
      default:
        return null;
    }
  }

  private saveFileEvent(
    base: Omit<InstanceHistoryEvent, 'action'>,
    action: string,
    kwargs: Record<string, unknown>,
    result: Record<string, unknown>,
    mode: 'create' | 'delete' | 'duplicate' | 'rename' | 'upload',
  ): InstanceHistoryEvent {
    const name = String(kwargs.name || '').trim();
    const resultName = String(result.name || '').trim();
    let changes: HistoryChange[] | undefined;
    switch (mode) {
      case 'create':
      case 'upload': {
        const to = resultName || name;
        if (to) changes = [{ key: 'save', from: '—', to }];
        break;
      }
      case 'delete':
        if (name) changes = [{ key: 'save', from: name, to: '—' }];
        break;
      case 'duplicate':
        if (name && resultName)
          changes = [{ key: 'save', from: name, to: resultName }];
        break;
      case 'rename': {
        const newName = String(kwargs.new_name || resultName || '').trim();
        if (name && newName)
          changes = [{ key: 'name', from: name, to: newName }];
        break;
      }
    }
    return changes?.length ? { ...base, action, changes } : { ...base, action };
  }

  private settingsChangeEvent(
    base: Omit<InstanceHistoryEvent, 'action'>,
    action: string,
    result: Record<string, unknown>,
  ): InstanceHistoryEvent | null {
    const raw = Array.isArray(result.settings_changes)
      ? result.settings_changes
      : [];
    const changes = raw
      .map((c) => {
        if (!c || typeof c !== 'object') return null;
        const row = c as Record<string, unknown>;
        return {
          key: String(row.key || ''),
          from: String(row.from ?? '—'),
          to: String(row.to ?? '—'),
        };
      })
      .filter((c): c is HistoryChange => !!c && !!c.key);
    if (!changes.length) return null;
    return { ...base, action, changes };
  }

  private readTail(serverPath: string, key: string): InstanceHistoryEvent[] {
    const path = join(serverPath, 'server-history.json');
    if (!existsSync(path)) return [];
    try {
      const doc = JSON.parse(readFileSync(path, 'utf-8')) as Record<
        string,
        unknown
      >;
      const arr = Array.isArray(doc[key])
        ? (doc[key] as InstanceHistoryEvent[])
        : [];
      return arr.slice(-HISTORY_READ).reverse();
    } catch {
      return [];
    }
  }

  private append(
    serverPath: string,
    key: string,
    event: InstanceHistoryEvent,
  ): void {
    const path = join(serverPath, 'server-history.json');
    let doc: Record<string, unknown> = {};
    if (existsSync(path)) {
      try {
        doc = JSON.parse(readFileSync(path, 'utf-8')) as Record<
          string,
          unknown
        >;
      } catch {
        doc = {};
      }
    }
    const arr = Array.isArray(doc[key])
      ? (doc[key] as InstanceHistoryEvent[])
      : [];
    arr.push(event);
    doc[key] = arr.slice(-HISTORY_TAIL);
    writeJsonFile(path, doc);
  }
}
