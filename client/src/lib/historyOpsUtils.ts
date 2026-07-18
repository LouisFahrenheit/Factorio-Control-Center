import type { OpsHistoryEvent } from '../types/players';
import { formatPanelActorName } from './actorUtils';
import { formatPanelDateTime } from './datetimeUtils';

const SERVER_ACTION_KEYS: Record<string, string> = {
  start: 'history_action_start',
  stop: 'history_action_stop',
  restart: 'history_action_restart',
  kill: 'history_action_kill',
  save: 'history_action_save',
  backup: 'history_action_backup',
  startup_error: 'history_action_startup_error',
  update: 'history_action_update',
  config_change: 'history_action_config_change',
  save_launch: 'history_action_save_launch',
  save_create: 'history_action_save_create',
  save_delete: 'history_action_save_delete',
  save_duplicate: 'history_action_save_duplicate',
  save_rename: 'history_action_save_rename',
  save_upload: 'history_action_save_upload',
  settings_write: 'history_action_settings_write',
  settings_reset: 'history_action_settings_reset',
};

const MODS_ACTION_KEYS: Record<string, string> = {
  install: 'history_action_install',
  remove: 'history_action_remove',
  update: 'history_action_mod_update',
  enable: 'history_action_enable',
  disable: 'history_action_disable',
  enable_all: 'history_action_enable_all',
  disable_all: 'history_action_disable_all',
  modpack_activate: 'history_action_modpack_activate',
  modpack_create: 'history_action_modpack_create',
  modpack_delete: 'history_action_modpack_delete',
  modpack_reset: 'history_action_modpack_reset',
  modpack_add: 'history_action_modpack_add',
  modpack_rename: 'history_action_modpack_rename',
  modpack_import: 'history_action_modpack_import',
  symlink_pref: 'history_action_symlink_pref',
  remove_old_zips_pref: 'history_action_remove_old_zips_pref',
};

const COMMANDS_ACTION_KEYS: Record<string, string> = {
  execute: 'history_action_command_execute',
  category_create: 'history_action_category_create',
  category_delete: 'history_action_category_delete',
  command_create: 'history_action_command_create',
  command_delete: 'history_action_command_delete',
};

const CHANGE_KEY_LABELS: Record<string, string> = {
  ip: 'history_change_ip',
  port: 'history_change_port',
  save: 'history_change_save',
  version: 'history_change_version',
  name: 'history_change_name',
  modpack_activate_use_symlinks: 'history_change_symlinks',
  remove_old_zips: 'history_change_remove_old_zips',
};

function resolveActionLabel(action: string, map: Record<string, string>, t: (k: string) => string): string {
  const key = map[String(action || '').toLowerCase()];
  if (!key) return action || '—';
  const label = t(key);
  return label !== key ? label : action;
}

function formatChanges(
  changes: OpsHistoryEvent['changes'],
  t: (k: string, ...args: (string | number)[]) => string,
): string {
  if (!Array.isArray(changes) || !changes.length) return '';
  return changes
    .map((c) => {
      const fieldKey = CHANGE_KEY_LABELS[c.key] || `history_change_${c.key}`;
      const field = t(fieldKey);
      const fieldLabel = field !== fieldKey ? field : c.key;
      return `${fieldLabel}: ${c.from} → ${c.to}`;
    })
    .join('; ');
}

function formatModJobHistoryItem(x: unknown): string {
  if (x == null || x === '') return '';
  if (typeof x === 'string') {
    const s = x.trim();
    return s === '[object Object]' ? '' : s;
  }
  if (typeof x === 'object') {
    const row = x as Record<string, unknown>;
    const name = String(row.name || '').trim();
    const version = String(row.version || '').trim();
    const from = String(row.from_version || row.from || '').trim();
    if (name && from && version) return `${name} (${from} → ${version})`;
    if (name && version) return `${name} (${version})`;
    const error = String(row.error || '').trim();
    if (name && error) return `${name}: ${error}`;
    return name || version || error;
  }
  const s = String(x).trim();
  return s === '[object Object]' ? '' : s;
}

function formatModsBulkDetail(
  action: string,
  detail: Record<string, unknown> | undefined,
  t: (k: string, ...args: (string | number)[]) => string,
): string {
  if (action !== 'enable_all' && action !== 'disable_all') return '';
  const changed = Number(detail?.changed || 0);
  if (changed > 0) return t('history_detail_mods_count', changed);
  return '';
}

function formatJobDetail(detail: Record<string, unknown> | undefined, t: (k: string) => string): string {
  if (!detail) return '';
  const parts: string[] = [];
  const installed = Array.isArray(detail.installed)
    ? detail.installed.map(formatModJobHistoryItem).filter(Boolean)
    : [];
  const updated = Array.isArray(detail.updated)
    ? detail.updated.map(formatModJobHistoryItem).filter(Boolean)
    : [];
  const failed = Array.isArray(detail.failed)
    ? detail.failed.map(formatModJobHistoryItem).filter(Boolean)
    : [];
  if (installed.length) parts.push(`${t('history_detail_installed')}: ${installed.join(', ')}`);
  if (updated.length) parts.push(`${t('history_detail_updated')}: ${updated.join(', ')}`);
  if (failed.length) parts.push(`${t('history_detail_failed')}: ${failed.join(', ')}`);
  return parts.join('; ');
}

function formatStartupDetail(detail: Record<string, unknown> | undefined, t: (k: string) => string): string {
  if (!detail) return '';
  const parts: string[] = [];
  if (detail.exit_code != null) {
    parts.push(`${t('history_detail_exit_code')}: ${String(detail.exit_code)}`);
  }
  const deps = Array.isArray(detail.missing_deps) ? detail.missing_deps.filter(Boolean) : [];
  if (deps.length) {
    parts.push(`${t('history_detail_missing_deps')}: ${deps.join(', ')}`);
  }
  return parts.join('; ');
}

function formatCommandsDetail(detail: Record<string, unknown> | undefined, t: (k: string) => string): string {
  if (!detail) return '';
  const parts: string[] = [];
  if (detail.command_name) {
    parts.push(`${t('history_detail_command_name')}: ${String(detail.command_name)}`);
  }
  if (detail.category) {
    parts.push(`${t('history_detail_category')}: ${String(detail.category)}`);
  }
  if (detail.command) {
    parts.push(`${t('history_detail_command_template')}: ${String(detail.command)}`);
  }
  if (detail.source) {
    const source =
      detail.source === 'commands_tab'
        ? t('history_detail_source_commands_tab')
        : t('history_detail_source_console');
    parts.push(`${t('history_detail_source')}: ${source}`);
  }
  const removed = Array.isArray(detail.commands) ? detail.commands.filter(Boolean) : [];
  if (removed.length) {
    parts.push(`${t('history_detail_removed_commands')}: ${removed.join(', ')}`);
  }
  if (detail.response) {
    parts.push(String(detail.response));
  }
  return parts.join('; ');
}

export function opsHistoryActionVariant(action: string): 'positive' | 'negative' | 'neutral' {
  const a = String(action || '').toLowerCase();
  if (
    [
      'start',
      'restart',
      'save',
      'backup',
      'enable',
      'enable_all',
      'install',
      'modpack_add',
      'modpack_create',
      'modpack_activate',
      'save_create',
      'save_upload',
      'save_duplicate',
      'category_create',
      'command_create',
    ].includes(a)
  ) {
    return 'positive';
  }
  if (
    [
      'stop',
      'kill',
      'startup_error',
      'remove',
      'disable',
      'disable_all',
      'modpack_delete',
      'modpack_reset',
      'settings_reset',
      'save_delete',
      'category_delete',
      'command_delete',
    ].includes(a)
  ) {
    return 'negative';
  }
  return 'neutral';
}

export function formatServerHistoryRow(ev: OpsHistoryEvent, t: (k: string, ...args: (string | number)[]) => string) {
  const action = String(ev.action || '');
  const actionLabel = resolveActionLabel(action, SERVER_ACTION_KEYS, t);
  const actionDate = formatPanelDateTime(String(ev.date || '').replace(/^\[(.+)\]$/, '$1'), '');
  let detailVal = formatChanges(ev.changes, t);
  if (!detailVal && action === 'startup_error') detailVal = formatStartupDetail(ev.detail, t);
  if (!detailVal && ev.error) detailVal = String(ev.error);
  if (!detailVal && ev.detail?.partial) detailVal = t('history_detail_partial_update');
  return {
    actionLabel,
    actionVariant: opsHistoryActionVariant(action),
    actorVal: formatPanelActorName(ev.actor, t),
    detailVal,
    actionDate,
    failed: ev.success === false,
  };
}

export function formatModsHistoryRow(ev: OpsHistoryEvent, t: (k: string, ...args: (string | number)[]) => string) {
  const action = String(ev.action || '');
  const actionLabel = resolveActionLabel(action, MODS_ACTION_KEYS, t);
  const actionDate = formatPanelDateTime(String(ev.date || '').replace(/^\[(.+)\]$/, '$1'), '');
  let detailVal = formatChanges(ev.changes, t);
  if (!detailVal) detailVal = formatModsBulkDetail(action, ev.detail, t);
  if (!detailVal) detailVal = formatJobDetail(ev.detail, t);
  if (!detailVal && ev.error) detailVal = String(ev.error);
  return {
    actionLabel,
    actionVariant: opsHistoryActionVariant(action),
    targetVal: String(ev.target || ''),
    actorVal: formatPanelActorName(ev.actor, t),
    detailVal,
    actionDate,
    failed: ev.success === false,
  };
}

export function formatCommandsHistoryRow(
  ev: OpsHistoryEvent,
  t: (k: string, ...args: (string | number)[]) => string,
) {
  const action = String(ev.action || '');
  const actionLabel = resolveActionLabel(action, COMMANDS_ACTION_KEYS, t);
  const actionDate = formatPanelDateTime(String(ev.date || '').replace(/^\[(.+)\]$/, '$1'), '');
  let detailVal = formatCommandsDetail(ev.detail, t);
  if (!detailVal && ev.error) detailVal = String(ev.error);
  return {
    actionLabel,
    actionVariant: opsHistoryActionVariant(action),
    targetVal: String(ev.target || ''),
    actorVal: formatPanelActorName(ev.actor, t),
    detailVal,
    actionDate,
    failed: ev.success === false,
  };
}

export type OpsHistoryActionFilter = 'all' | string;

export interface UnifiedOpsHistoryRow {
  id: string;
  action: string;
  actionLabel: string;
  actionVariant: ReturnType<typeof opsHistoryActionVariant>;
  targetVal: string;
  detailVal: string;
  actorVal: string;
  actionDate: string;
  failed: boolean;
  searchText: string;
}

export const SERVER_HISTORY_FILTER_ACTIONS = [
  'start',
  'stop',
  'restart',
  'kill',
  'save',
  'backup',
  'startup_error',
  'update',
  'config_change',
  'save_launch',
  'save_create',
  'save_delete',
  'save_duplicate',
  'save_rename',
  'save_upload',
  'settings_write',
  'settings_reset',
] as const;

export const MODS_HISTORY_FILTER_ACTIONS = [
  'install',
  'remove',
  'update',
  'enable',
  'disable',
  'enable_all',
  'disable_all',
  'modpack_activate',
  'modpack_create',
  'modpack_delete',
  'modpack_reset',
  'modpack_add',
  'modpack_rename',
  'modpack_import',
  'symlink_pref',
  'remove_old_zips_pref',
] as const;

export const COMMANDS_HISTORY_FILTER_ACTIONS = [
  'execute',
  'category_create',
  'category_delete',
  'command_create',
  'command_delete',
] as const;

function buildOpsHistorySearchText(parts: (string | undefined)[]): string {
  return parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

export function opsHistoryActionFilterLabel(
  action: OpsHistoryActionFilter,
  actionKeys: Record<string, string>,
  t: (key: string) => string,
): string {
  if (action === 'all') return t('history_player_category_all');
  return resolveActionLabel(action, actionKeys, t);
}

export function serverHistoryActionFilterLabel(
  action: OpsHistoryActionFilter,
  t: (key: string) => string,
): string {
  return opsHistoryActionFilterLabel(action, SERVER_ACTION_KEYS, t);
}

export function modsHistoryActionFilterLabel(
  action: OpsHistoryActionFilter,
  t: (key: string) => string,
): string {
  return opsHistoryActionFilterLabel(action, MODS_ACTION_KEYS, t);
}

export function commandsHistoryActionFilterLabel(
  action: OpsHistoryActionFilter,
  t: (key: string) => string,
): string {
  return opsHistoryActionFilterLabel(action, COMMANDS_ACTION_KEYS, t);
}

export function buildServerHistoryRows(
  events: OpsHistoryEvent[],
  t: (key: string, ...args: (string | number)[]) => string,
): UnifiedOpsHistoryRow[] {
  return events.map((ev, index) => {
    const row = formatServerHistoryRow(ev, t);
    const action = String(ev.action || '').toLowerCase();
    return {
      id: `server-${action}-${index}-${row.actionDate}`,
      action,
      actionLabel: row.actionLabel,
      actionVariant: row.actionVariant,
      targetVal: '',
      detailVal: row.detailVal,
      actorVal: row.actorVal,
      actionDate: row.actionDate,
      failed: row.failed,
      searchText: buildOpsHistorySearchText([action, row.actionLabel, row.detailVal, row.actorVal]),
    };
  });
}

export function buildModsHistoryRows(
  events: OpsHistoryEvent[],
  t: (key: string, ...args: (string | number)[]) => string,
): UnifiedOpsHistoryRow[] {
  return events.map((ev, index) => {
    const row = formatModsHistoryRow(ev, t);
    const action = String(ev.action || '').toLowerCase();
    return {
      id: `mods-${action}-${index}-${row.actionDate}`,
      action,
      actionLabel: row.actionLabel,
      actionVariant: row.actionVariant,
      targetVal: row.targetVal,
      detailVal: row.detailVal,
      actorVal: row.actorVal,
      actionDate: row.actionDate,
      failed: row.failed,
      searchText: buildOpsHistorySearchText([
        action,
        row.targetVal,
        row.actionLabel,
        row.detailVal,
        row.actorVal,
      ]),
    };
  });
}

export function buildCommandsHistoryRows(
  events: OpsHistoryEvent[],
  t: (key: string, ...args: (string | number)[]) => string,
): UnifiedOpsHistoryRow[] {
  return events.map((ev, index) => {
    const row = formatCommandsHistoryRow(ev, t);
    const action = String(ev.action || '').toLowerCase();
    return {
      id: `commands-${action}-${index}-${row.actionDate}`,
      action,
      actionLabel: row.actionLabel,
      actionVariant: row.actionVariant,
      targetVal: row.targetVal,
      detailVal: row.detailVal,
      actorVal: row.actorVal,
      actionDate: row.actionDate,
      failed: row.failed,
      searchText: buildOpsHistorySearchText([
        action,
        row.targetVal,
        row.actionLabel,
        row.detailVal,
        row.actorVal,
      ]),
    };
  });
}

export function filterOpsHistoryRows(
  rows: UnifiedOpsHistoryRow[],
  actionFilter: OpsHistoryActionFilter,
  search: string,
): UnifiedOpsHistoryRow[] {
  const q = search.trim().toLowerCase();
  const filterAction = String(actionFilter || 'all').toLowerCase();
  return rows.filter((row) => {
    if (filterAction !== 'all' && row.action !== filterAction) return false;
    if (!q) return true;
    return row.searchText.includes(q);
  });
}
