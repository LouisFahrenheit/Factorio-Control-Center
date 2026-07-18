import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { InstancesService } from '../instances/instances.service';
import { InstanceSummaryService } from '../instances/instance-summary.service';
import { InstanceBootstrapService } from '../instances/instance-bootstrap.service';
import { MaintenanceService } from '../maintenance/maintenance.service';
import { LocaleService } from '../locale/locale.service';
import { ServerOpsService } from './server/server-ops.service';
import type { CreateSaveOptions } from './map-gen/map-gen-ops.service';
import { SavesOpsService } from './saves/saves-ops.service';
import { FilesOpsService } from './files/files-ops.service';
import { ModSettingsSchemaService } from './files/mod-settings-schema.service';
import { PlayersOpsService } from './players/players-ops.service';
import { ModsOpsService } from './mods/mods-ops.service';
import { ModpacksOpsService } from './modpacks/modpacks-ops.service';
import { MapPresetsOpsService } from './map-presets/map-presets-ops.service';
import { FactorioUpdateService } from './factorio-update/factorio-update.service';
import { AnnouncementsOpsService } from './announcements/announcements-ops.service';
import { CommandsCatalogService } from './commands-catalog.service';
import { diffCommandsCatalog } from './commands-catalog-history.util';
import { ProgramOpsService } from './program/program-ops.service';
import { AuditLogService } from '../maintenance/audit-log.service';
import { WebPanelEventLogService } from '../logging/web-panel-event-log.service';
import { InstanceHistoryService } from './instance-history.service';
import { LOG_HISTORY_DEFAULT_TAIL } from './ops-utils';

function parseModEnabledFlag(value: unknown): boolean {
  if (value === false || value === 'false' || value === 0 || value === '0')
    return false;
  if (value === true || value === 'true' || value === 1 || value === '1')
    return true;
  return !!value;
}

const AUDIT_OP_KIND: Record<string, string> = {
  write_server_settings: 'server_settings',
  mod_settings_write_json: 'mod_settings',
  write_mod_list: 'mod_list',
  mods_remove: 'mod_remove',
  upload_mod_archive: 'mod_install',
  upload_mod_settings_dat: 'mod_settings',
  mods_set_enabled: 'mod_toggle',
  mods_set_all_enabled: 'mod_toggle',
  mods_disable_conflicts: 'mod_toggle',
  modpack_activate: 'modpack_activate',
  modpack_save_current: 'modpack_save',
  modpack_import_upload: 'modpack_import',
  rename_save: 'save_rename',
  delete_save: 'save_delete',
  duplicate_save: 'save_duplicate',
  set_launch_save: 'save_launch',
  upload_save_archive: 'save_upload',
  create_save: 'save_create',
  set_server_ini: 'server_config',
};

@Injectable()
export class DispatchService {
  constructor(
    private readonly instances: InstancesService,
    private readonly instanceSummary: InstanceSummaryService,
    private readonly instanceBootstrap: InstanceBootstrapService,
    private readonly server: ServerOpsService,
    private readonly saves: SavesOpsService,
    private readonly files: FilesOpsService,
    private readonly modSettingsSchema: ModSettingsSchemaService,
    private readonly players: PlayersOpsService,
    private readonly mods: ModsOpsService,
    private readonly modpacks: ModpacksOpsService,
    private readonly mapPresets: MapPresetsOpsService,
    private readonly factorioUpdate: FactorioUpdateService,
    private readonly announcements: AnnouncementsOpsService,
    private readonly program: ProgramOpsService,
    private readonly commands: CommandsCatalogService,
    private readonly locale: LocaleService,
    @Inject(forwardRef(() => MaintenanceService))
    private readonly maintenance: MaintenanceService,
    private readonly auditLog: AuditLogService,
    private readonly webEventLog: WebPanelEventLogService,
    private readonly instanceHistory: InstanceHistoryService,
  ) {}

  async dispatch(
    op: string,
    kwargs: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const result = await this.runDispatch(op, kwargs);
    if (!kwargs._maintenance_internal) {
      try {
        this.auditAfterOp(op, kwargs, result);
      } catch {
        /* ignore audit failures */
      }
      try {
        this.webEventLog.logDispatchOp(op, kwargs, result);
      } catch {
        /* ignore web log failures */
      }
      try {
        this.instanceHistory.recordFromDispatch(op, kwargs, result);
      } catch {
        /* ignore history failures */
      }
    }
    return result;
  }

  private async runDispatch(
    op: string,
    kwargs: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    switch (op) {
      case 'instances_list':
        return { ...this.instanceSummary.list() };
      case 'instances_add':
        return this.instances.add(kwargs);
      case 'instances_update':
        return this.instances.update(String(kwargs.id || ''), kwargs);
      case 'instances_clone':
        return this.instances.clone(
          String(kwargs.id || ''),
          String(kwargs.name || ''),
        );
      case 'instances_remove': {
        const id = String(kwargs.id || '');
        const result = this.instances.remove(id, {
          deleteFromDisk: !!kwargs.deleteFromDisk,
          deleteData: !!kwargs.deleteData,
        });
        if (result.ok && id) this.modSettingsSchema.invalidateInstance(id);
        return result;
      }
      case 'instances_select':
        return this.instances.select(String(kwargs.id || ''));
      case 'instance_maintenance_lock':
        return this.instanceMaintenanceLock(kwargs);
      case 'instance_bootstrap_start':
        return this.instanceBootstrap.start(kwargs);
      case 'instance_bootstrap_status':
        return this.instanceBootstrap.status();
      case 'instance_bootstrap_stop':
        return this.instanceBootstrap.stop();
      case 'status':
        return this.server.status();
      case 'start_server': {
        const startId = String(this.instances.getSelectedId() || '').trim();
        const pendingManualStart = startId
          ? this.maintenance.hasPendingManual(startId)
          : false;
        const startResult = await this.server.start();
        if (
          pendingManualStart &&
          startResult.ok !== false &&
          startId &&
          !kwargs._maintenance_internal
        ) {
          this.maintenance.resumeManualWhenRunning(
            startId,
            String(kwargs.web_actor || kwargs.actor || '').trim() || undefined,
          );
        }
        return startResult;
      }
      case 'stop_server':
        return this.server.stop();
      case 'restart_server': {
        const restartId = String(this.instances.getSelectedId() || '').trim();
        const pendingManualRestart = restartId
          ? this.maintenance.hasPendingManual(restartId)
          : false;
        const restartResult = await this.server.restart();
        if (
          pendingManualRestart &&
          restartResult.ok !== false &&
          restartId &&
          !kwargs._maintenance_internal
        ) {
          this.maintenance.resumeManualWhenRunning(
            restartId,
            String(kwargs.web_actor || kwargs.actor || '').trim() || undefined,
          );
        }
        return restartResult;
      }
      case 'kill_server':
        return this.server.kill();
      case 'save_game':
        return this.server.saveGame();
      case 'backup':
        return this.server.backup();
      case 'create_save':
        return this.server.createSave({
          name: String(kwargs.name || ''),
          mode: kwargs.mode as CreateSaveOptions['mode'],
          preset: kwargs.preset != null ? String(kwargs.preset) : undefined,
          seed: kwargs.seed != null ? Number(kwargs.seed) : undefined,
          map_gen_settings:
            kwargs.map_gen_settings as CreateSaveOptions['map_gen_settings'],
          map_settings:
            kwargs.map_settings as CreateSaveOptions['map_settings'],
          map_exchange_string:
            kwargs.map_exchange_string != null
              ? String(kwargs.map_exchange_string)
              : undefined,
        });
      case 'rcon_exec':
        return this.server.rconExec(String(kwargs.command || ''));
      case 'chat_send_text':
        return this.server.chatSendText(String(kwargs.message || ''));
      case 'log_tail':
        return this.server.logTail(
          Number(kwargs.tail || 500),
          String(kwargs.instance_id || ''),
        );
      case 'log_file_history':
        return this.server.logFileHistory(
          Number(kwargs.tail || LOG_HISTORY_DEFAULT_TAIL),
          String(kwargs.instance_id || ''),
          kwargs.full === true ||
            kwargs.full === 'true' ||
            kwargs.full === 1 ||
            kwargs.full === '1',
        );
      case 'program_log_history':
        return this.program.programLogHistory(
          String(kwargs.kind || ''),
          Number(kwargs.tail || LOG_HISTORY_DEFAULT_TAIL),
          kwargs.full === true ||
            kwargs.full === 'true' ||
            kwargs.full === 1 ||
            kwargs.full === '1',
        );
      case 'chat_log_tail':
        return this.server.chatLogTail(Number(kwargs.tail || 500));
      case 'list_saves':
        return this.saves.list();
      case 'get_save_download_path':
        return this.saves.downloadPath(String(kwargs.name || ''));
      case 'inspect_save':
        return this.saves.inspectSave(
          String(kwargs.name || ''),
          String(kwargs.ui_lang || ''),
        );
      case 'inspect_uploaded_save_mods':
        return this.saves.inspectUploadedSaveMods(
          String(kwargs.tmp_path || ''),
          String(kwargs.ui_lang || ''),
        );
      case 'rename_save':
        return this.saves.rename(
          String(kwargs.name || ''),
          String(kwargs.new_name || ''),
        );
      case 'delete_save':
        return this.saves.delete(String(kwargs.name || ''));
      case 'duplicate_save':
        return this.saves.duplicate(String(kwargs.name || ''));
      case 'set_launch_save':
        return this.saves.setLaunchSave(String(kwargs.name || ''));
      case 'upload_save_archive':
        return this.saves.uploadArchive(
          String(kwargs.tmp_path || ''),
          String(kwargs.name || ''),
        );
      case 'read_server_settings':
        return this.files.readServerSettings();
      case 'create_server_settings_from_example':
        return this.files.createServerSettingsFromExample();
      case 'write_server_settings':
        return this.files.writeServerSettings(kwargs.data);
      case 'read_mod_list':
        return this.files.readModList();
      case 'write_mod_list':
        return this.files.writeModList(kwargs.data);
      case 'read_admin_list':
        return this.files.readAdminList();
      case 'write_admin_list':
        return this.files.writeAdminList(kwargs.data);
      case 'read_ban_list':
        return this.files.readBanList();
      case 'read_commands_catalog':
        return this.commands.read(String(kwargs.ui_lang || kwargs.lang || ''));
      case 'write_commands_catalog': {
        const lang = String(kwargs.ui_lang || kwargs.lang || '');
        const before = this.commands.read(lang);
        const result = this.commands.write(kwargs.data, lang);
        if (result.ok !== false && before.ok !== false && before.data) {
          const catalogChanges = diffCommandsCatalog(before.data, kwargs.data);
          if (catalogChanges.length) {
            return { ...result, catalog_changes: catalogChanges };
          }
        }
        return result;
      }
      case 'mod_settings_read_json':
        return this.files.modSettingsReadJson();
      case 'mod_settings_write_json':
        return this.files.modSettingsWriteJson(kwargs.data);
      case 'mod_settings_schema':
        return this.modSettingsSchema.get(
          String(kwargs.ui_lang || ''),
          !!kwargs.refresh,
        );
      case 'mod_settings_schema_status':
        return this.modSettingsSchema.status();
      case 'players_summary':
        return this.players.summary();
      case 'sync_bans':
        return this.players.syncBans();
      case 'ban_player':
        return this.players.ban(
          String(kwargs.player || ''),
          String(kwargs.reason || ''),
          String(kwargs.actor || 'Web'),
        );
      case 'unban_player':
        return this.players.unban(
          String(kwargs.player || ''),
          String(kwargs.actor || 'Web'),
        );
      case 'mute_player':
        return this.players.mute(
          String(kwargs.player || ''),
          String(kwargs.actor || 'Web'),
        );
      case 'unmute_player':
        return this.players.unmute(
          String(kwargs.player || ''),
          String(kwargs.actor || 'Web'),
        );
      case 'kick_player':
        return this.players.kick(
          String(kwargs.player || ''),
          String(kwargs.reason || ''),
          String(kwargs.actor || 'Web'),
        );
      case 'purge_player':
        return this.players.purge(
          String(kwargs.player || ''),
          String(kwargs.actor || 'Web'),
        );
      case 'whitelist_add':
        return this.players.whitelistAdd(
          String(kwargs.player || ''),
          String(kwargs.actor || 'Web'),
        );
      case 'whitelist_remove':
        return this.players.whitelistRemove(
          String(kwargs.player || ''),
          String(kwargs.actor || 'Web'),
        );
      case 'whitelist_clear':
        return this.players.whitelistClear(String(kwargs.actor || 'Web'));
      case 'mods_list':
        return this.mods.list(String(kwargs.ui_lang || ''));
      case 'mods_set_prefs':
        return this.mods.setPrefs(kwargs.remove_old_zips);
      case 'mods_check_updates_start':
        return this.mods.checkUpdatesStart(kwargs);
      case 'mods_check_updates_status':
        return this.mods.checkUpdatesStatus();
      case 'mods_set_enabled':
        return this.mods.setEnabled(
          String(kwargs.name || ''),
          parseModEnabledFlag(kwargs.enabled),
        );
      case 'mods_set_all_enabled':
        return this.mods.setAllNonBuiltinEnabled(
          parseModEnabledFlag(kwargs.enabled),
        );
      case 'mods_disable_conflicts':
        return this.mods.disableConflicts(kwargs.names);
      case 'mods_get_changelog':
        return this.mods.getChangelog(String(kwargs.name || ''));
      case 'mods_set_version':
        return this.mods.setVersion(
          String(kwargs.name || ''),
          String(kwargs.version || ''),
        );
      case 'mods_remove':
        return this.mods.remove(
          String(kwargs.name || ''),
          String(kwargs.scope || 'all'),
          String(kwargs.version || ''),
        );
      case 'upload_mod_archive':
        return this.mods.uploadArchive(
          String(kwargs.tmp_path || ''),
          String(kwargs.name || ''),
          String(kwargs.actor || 'Web'),
        );
      case 'upload_mod_settings_dat':
        return this.files.uploadModSettingsDat(
          String(kwargs.tmp_path || ''),
          !!kwargs.confirm_replace,
        );
      case 'get_mod_download_path':
        return this.mods.downloadPath(String(kwargs.name || ''));
      case 'build_mods_archive':
        return this.mods.buildArchive();
      case 'mods_install_plan':
        return this.mods.installPlan(String(kwargs.mod || ''));
      case 'mods_install_plan_batch':
        return this.mods.installPlanBatch(kwargs.mods);
      case 'mods_update_all_plan':
        return this.mods.updateAllPlan();
      case 'mods_job_start':
        return this.mods.jobStart(String(kwargs.mode || ''), kwargs);
      case 'mods_job_status':
        return this.mods.jobStatus();
      case 'mods_job_stop':
        return this.mods.jobStop();
      case 'factorio_update_check':
        return this.factorioUpdate.check();
      case 'factorio_update_check_all':
        return this.factorioUpdate.checkAll();
      case 'factorio_releases':
        return this.factorioUpdate.releases();
      case 'factorio_update':
        return this.factorioUpdate.start(kwargs.target_version, kwargs);
      case 'factorio_update_status':
        return this.factorioUpdate.status();
      case 'factorio_update_stop':
        return this.factorioUpdate.stop();
      case 'modpack_list':
        return this.modpacks.list();
      case 'modpack_get':
        return this.modpacks.get(
          String(kwargs.name || ''),
          String(kwargs.ui_lang || ''),
        );
      case 'modpack_save_current':
        return this.modpacks.saveCurrent(
          String(kwargs.name || ''),
          String(kwargs.description || ''),
          !!kwargs.include_settings,
          !!kwargs.include_disabled,
        );
      case 'modpack_activate':
        return this.modpacks.activate(
          String(kwargs.name || ''),
          !!kwargs.create_backup,
          String(kwargs.actor || 'Web'),
        );
      case 'modpack_rename':
        return this.modpacks.rename(
          String(kwargs.old || ''),
          String(kwargs.new || ''),
        );
      case 'modpack_delete':
        return this.modpacks.delete(String(kwargs.name || ''));
      case 'modpack_reset':
        return this.modpacks.reset();
      case 'modpack_export_prepare':
        return this.modpacks.exportPrepare(
          String(kwargs.name || ''),
          !!kwargs.include_settings,
          String(kwargs.description || ''),
        );
      case 'modpack_import_upload':
        return this.modpacks.importUpload(
          String(kwargs.tmp_path || ''),
          String(kwargs.name || ''),
          !!kwargs.apply_settings,
        );
      case 'modpack_import_start_download':
        return this.modpacks.importStartDownload(
          String(kwargs.name || ''),
          kwargs,
        );
      case 'modpack_import_download_plan':
        return this.modpacks.importDownloadPlan(String(kwargs.name || ''));
      case 'modpack_import_append_dependencies':
        return this.modpacks.importAppendDependencies(
          String(kwargs.name || ''),
        );
      case 'map_preset_list':
        return this.mapPresets.list();
      case 'map_preset_save':
        return this.mapPresets.save(String(kwargs.name || ''), kwargs.state);
      case 'map_preset_delete':
        return this.mapPresets.delete(String(kwargs.id || ''));
      case 'map_preset_export_prepare':
        return this.mapPresets.exportPrepare(String(kwargs.id || ''));
      case 'map_preset_import_upload':
        return this.mapPresets.importUpload(
          String(kwargs.tmp_path || ''),
          String(kwargs.name || ''),
        );
      case 'map_preset_import_batch':
        return this.mapPresets.importBatch(
          Array.isArray(kwargs.presets) ? kwargs.presets : [],
        );
      case 'announcements_read':
        return this.announcements.read();
      case 'announcements_write':
        return this.announcements.write(kwargs.data);
      case 'get_program_settings':
        return this.program.get();
      case 'verify_factorio_credentials':
        return this.program.verifyGlobalFactorioCredentials();
      case 'set_program_settings':
        return this.program.set(kwargs);
      case 'restart_web_panel':
        return this.program.restartWebPanel();
      case 'upload_web_tls_file':
        return this.program.uploadWebTlsFile(
          String(kwargs.tmp_path || ''),
          String(kwargs.kind || ''),
        );
      case 'get_server_ini':
        return this.program.getServerIni();
      case 'set_server_ini':
        return this.program.setServerIni(kwargs);
      case 'maintenance_get':
        return this.maintenance.get();
      case 'maintenance_set':
        return this.maintenance.set(kwargs);
      case 'maintenance_reports':
        return this.maintenance.reports();
      case 'maintenance_run_now':
        return this.maintenance.runNow(kwargs);
      case 'maintenance_clear_manual':
        return this.maintenance.clearManual(kwargs);
      case 'get_locale':
        return this.locale.getLocale(
          String(kwargs.lang || kwargs.language || ''),
        );
      default:
        return { ok: false, error: `unknown web op: ${op}` };
    }
  }

  dispatchWithInstance(
    instanceId: string | undefined,
    op: string,
    kwargs: Record<string, unknown> = {},
  ): Promise<Record<string, unknown>> {
    const iid = String(instanceId || '').trim();
    if (!iid) return this.dispatch(op, kwargs);
    return this.instances.withInstance(iid, () => this.dispatch(op, kwargs));
  }

  private auditAfterOp(
    op: string,
    kwargs: Record<string, unknown>,
    result: Record<string, unknown>,
  ): void {
    const eventKind = AUDIT_OP_KIND[op];
    if (!eventKind) return;
    const inst = this.instances.getSelected();
    const actor = String(kwargs.actor || '').trim() || undefined;
    const triggerRaw = String(kwargs._audit_trigger || '').trim();
    const trigger =
      triggerRaw === 'scheduled'
        ? 'scheduled'
        : actor
          ? 'manual'
          : ('system' as const);
    const detail = this.auditDetail(op, kwargs, result);
    if (
      (eventKind === 'server_settings' || eventKind === 'server_config') &&
      Array.isArray(detail.changes) &&
      !(detail.changes as unknown[]).length
    ) {
      return;
    }
    this.auditLog.record({
      event_kind: eventKind,
      instance_id: inst?.id,
      instance_name: inst?.name,
      actor,
      trigger,
      success: result.ok !== false,
      error: result.ok === false ? String(result.error || '') : undefined,
      message_key: `audit_event_${eventKind}`,
      detail,
    });
  }

  private auditDetail(
    op: string,
    kwargs: Record<string, unknown>,
    result: Record<string, unknown>,
  ): Record<string, unknown> {
    switch (op) {
      case 'mods_remove':
        return {
          name: String(kwargs.name || ''),
          scope: String(kwargs.scope || 'all'),
          version: String(kwargs.version || ''),
        };
      case 'upload_mod_archive':
        return { name: String(kwargs.name || result.name || '') };
      case 'mods_set_enabled':
        return {
          name: String(kwargs.name || ''),
          enabled: parseModEnabledFlag(kwargs.enabled),
        };
      case 'mods_set_all_enabled':
        return {
          enabled: parseModEnabledFlag(kwargs.enabled),
          changed: Number(result.changed || 0),
        };
      case 'modpack_activate':
      case 'modpack_save_current':
      case 'modpack_import_upload':
        return {
          name: String(kwargs.name || result.name || ''),
          create_backup: kwargs.create_backup,
          include_settings: kwargs.include_settings,
          include_disabled: kwargs.include_disabled,
          apply_settings: kwargs.apply_settings,
        };
      case 'rename_save':
        return {
          name: String(kwargs.name || ''),
          new_name: String(kwargs.new_name || result.new_name || ''),
        };
      case 'delete_save':
      case 'duplicate_save':
      case 'set_launch_save':
      case 'create_save':
        return { name: String(kwargs.name || result.name || '') };
      case 'upload_save_archive':
        return { name: String(kwargs.name || result.name || '') };
      case 'write_server_settings':
      case 'set_server_ini':
      case 'mod_settings_write_json':
        return {
          changes: Array.isArray(result.settings_changes)
            ? result.settings_changes
            : [],
        };
      default:
        return {};
    }
  }

  private instanceMaintenanceLock(
    kwargs: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!kwargs._maintenance_internal) return { ok: false, error: 'forbidden' };
    const id = String(
      kwargs.instance_id || kwargs.id || this.instances.getSelectedId() || '',
    ).trim();
    const item = id ? this.instances.getById(id) : undefined;
    if (!item) return { ok: false, error: 'instance_not_found' };
    const locked = !!kwargs.locked;
    const patch = { ...item, maintenanceLock: locked };
    if (locked) patch.autoEnterPanel = false;
    else delete (patch as { maintenanceLock?: boolean }).maintenanceLock;
    this.instances.update(id, patch);
    return { ok: true };
  }
}
