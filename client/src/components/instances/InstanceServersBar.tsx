import { IconLayoutGrid, IconList } from '@tabler/icons-react';
import { SearchField } from '../SearchField';
import { RefreshButton } from '../RefreshButton';
import { AppIcon } from '../AppIcon';
import type { ServerListViewMode } from '../../lib/userPrefs';
import type { StatusMode } from '../../lib/statusModePrefs';
import type {
  ServerListColumnKey,
  ServerListColumnVisibility,
} from '../../lib/serverListColumnPrefs';
import {
  InstanceColumnsDropdown,
  type ColumnConfigItem,
} from './InstanceColumnsDropdown';

const SERVER_COLUMN_CONFIG: readonly ColumnConfigItem<ServerListColumnKey>[] = [
  { key: 'save', labelKey: 'instances_col_save' },
  { key: 'access', labelKey: 'instances_col_access' },
  { key: 'port', labelKey: 'instances_col_server_port' },
  { key: 'rconPort', labelKey: 'instances_col_rcon_port' },
  { key: 'version', labelKey: 'instances_col_version' },
  { key: 'mods', labelKey: 'mods_btn' },
  { key: 'online', labelKey: 'instances_col_online' },
  { key: 'uptime', labelKey: 'server_uptime' },
  {
    key: 'status',
    labelKey: 'instances_col_status',
    modes: [
      { value: 'column', labelKey: 'web_status_mode_on' },
      { value: 'dot', labelKey: 'web_status_mode_dot' },
      { value: 'off', labelKey: 'web_status_mode_off' },
    ],
  },
];

interface InstanceServersBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  onRefresh: () => void;
  shownCount?: number;
  totalCount?: number;
  viewMode: ServerListViewMode;
  onViewModeChange: (mode: ServerListViewMode) => void;
  columns?: ServerListColumnVisibility;
  columnOrder?: readonly ServerListColumnKey[];
  statusMode?: StatusMode;
  onStatusModeChange?: (mode: StatusMode) => void;
  onToggleColumn?: (key: ServerListColumnKey, visible: boolean) => void;
  onMoveColumn?: (key: ServerListColumnKey, direction: 'up' | 'down') => void;
  onResetColumns?: () => void;
  hasServers: boolean;
  onAdd: () => void;
  onOpenHelp: () => void;
  onStartAll: () => void;
  onStopAll: () => void;
  onKillAll: () => void;
  showEndMaintenanceAll?: boolean;
  onEndMaintenanceAll?: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function InstanceServersBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onRefresh,
  viewMode,
  onViewModeChange,
  columns,
  columnOrder,
  statusMode,
  onStatusModeChange,
  onToggleColumn,
  onMoveColumn,
  onResetColumns,
  hasServers,
  onAdd,
  onOpenHelp,
  onStartAll,
  onStopAll,
  onKillAll,
  showEndMaintenanceAll,
  onEndMaintenanceAll,
  t,
}: InstanceServersBarProps) {
  return (
    <div
      className="access-users-bar instance-servers-bar"
      role="toolbar"
      aria-label={t('instances_search_label')}
    >
      {/* 1. Поиск */}
      <SearchField
        type="search"
        id="instancesSearchInput"
        className="access-users-bar__search instance-servers-bar__search"
        placeholder={t('search_placeholder')}
        autoComplete="off"
        spellCheck={false}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      {/* 2. Фильтр по статусу */}
      <div className="access-users-bar__filters">
        <select
          id="instancesStatusFilter"
          className="input access-users-bar__select"
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          aria-label={t('instances_filter_status_label') || 'Фильтр по статусу'}
        >
          <option value="all">{t('instances_filter_all_status')}</option>
          <option value="running">{t('instances_status_running')}</option>
          <option value="ready">{t('instances_status_ready')}</option>
          <option value="starting">{t('instances_status_starting')}</option>
          <option value="stopping">{t('instances_status_stopping')}</option>
          <option value="maintenance">
            {t('instances_status_maintenance')}
          </option>
        </select>
      </div>

      {/* 3. Обновление */}
      <RefreshButton
        id="btnInstancesRefresh"
        title={t('update_list_btn')}
        aria-label={t('update_list_btn')}
        onClick={() => {
          onSearchChange('');
          onRefresh();
        }}
      />

      {/* 4. Кнопки действий (Добавить сервер, Массовые действия, Переключение вида, Справка) */}
      <div className="access-users-bar__actions">
        <button
          type="button"
          className={
            'btn access-users-bar__create-btn' +
            (!hasServers ? ' btn--update-available' : '')
          }
          id="btnInstanceAdd"
          data-i18n-title="instances_add_btn"
          title={t('instances_add_btn')}
          aria-label={t('instances_add_btn')}
          onClick={onAdd}
        >
          <AppIcon name="add" size={17} />
          <span>{t('instances_add_btn')}</span>
        </button>

        {hasServers && (
          <div className="instance-servers-toolbar__segment">
            <button
              type="button"
              className="instance-servers-toolbar__btn"
              id="btnInstanceStartAll"
              data-i18n-title="instances_start_all_btn"
              title={t('instances_start_all_btn')}
              aria-label={t('instances_start_all_btn')}
              onClick={onStartAll}
            >
              <AppIcon name="start" size={18} />
            </button>
            <button
              type="button"
              className="instance-servers-toolbar__btn instance-servers-toolbar__btn--danger"
              id="btnInstanceStopAll"
              data-i18n-title="instances_stop_all_btn"
              title={t('instances_stop_all_btn')}
              aria-label={t('instances_stop_all_btn')}
              onClick={onStopAll}
            >
              <AppIcon name="stop" size={18} />
            </button>
            <button
              type="button"
              className="instance-servers-toolbar__btn instance-servers-toolbar__btn--danger"
              id="btnInstanceKillAll"
              data-i18n-title="instances_kill_all_btn"
              title={t('instances_kill_all_btn')}
              aria-label={t('instances_kill_all_btn')}
              onClick={onKillAll}
            >
              <AppIcon name="kill" size={18} />
            </button>
          </div>
        )}

        {showEndMaintenanceAll && onEndMaintenanceAll && (
          <div className="instance-servers-toolbar__segment">
            <button
              type="button"
              className="instance-servers-toolbar__btn"
              id="btnInstanceEndMaintenanceAll"
              data-i18n-title="instances_end_maintenance_all_btn"
              title={t('instances_end_maintenance_all_btn')}
              aria-label={t('instances_end_maintenance_all_btn')}
              onClick={onEndMaintenanceAll}
            >
              <AppIcon name="maintenance" size={18} />
            </button>
          </div>
        )}

        {viewMode === 'list' &&
          columns &&
          columnOrder &&
          onToggleColumn &&
          onMoveColumn &&
          onResetColumns && (
            <InstanceColumnsDropdown
              config={SERVER_COLUMN_CONFIG}
              columns={columns}
              order={columnOrder}
              modeValues={statusMode ? { status: statusMode } : undefined}
              onChangeMode={
                onStatusModeChange
                  ? (_key, value) => onStatusModeChange(value as StatusMode)
                  : undefined
              }
              onToggleColumn={onToggleColumn}
              onMoveColumn={onMoveColumn}
              onReset={onResetColumns}
              t={t}
            />
          )}

        <button
          type="button"
          className="btn btn--toolbar-icon access-users-bar__view-toggle-btn instance-servers-bar__view-toggle-btn"
          id="btnInstanceViewToggle"
          title={
            viewMode === 'list'
              ? t('instances_view_cards')
              : t('instances_view_list')
          }
          aria-label={
            viewMode === 'list'
              ? t('instances_view_cards')
              : t('instances_view_list')
          }
          onClick={() =>
            onViewModeChange(viewMode === 'list' ? 'cards' : 'list')
          }
        >
          {viewMode === 'list' ? (
            <IconLayoutGrid size={18} />
          ) : (
            <IconList size={18} />
          )}
        </button>

        <button
          type="button"
          className="btn btn--toolbar-icon access-users-bar__help-btn"
          id="btnInstancesHelp"
          data-i18n-title="instances_help_btn"
          title={t('instances_help_btn')}
          aria-label={t('instances_help_btn')}
          onClick={onOpenHelp}
        >
          <AppIcon name="help" size={18} />
        </button>
      </div>
    </div>
  );
}
