import {
  IconLayoutGrid,
  IconList,
  IconPlus,
  IconPlayerStop,
  IconHelp,
  IconRefresh,
} from '@tabler/icons-react';
import { SearchField } from '../SearchField';
import type { MaintenanceViewMode } from '../../lib/userPrefs';

export interface MaintenanceServerOption {
  id: string;
  name: string;
}

interface MaintenanceTasksBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  serverFilter: string;
  onServerFilterChange: (value: string) => void;
  serverOptions: MaintenanceServerOption[];
  viewMode: MaintenanceViewMode;
  onViewModeChange: (mode: MaintenanceViewMode) => void;
  shownCount?: number;
  totalCount?: number;
  activeCount: number;
  onRefresh?: () => void;
  onOpenAdd: () => void;
  onDeactivateAll: () => void;
  onOpenHelp?: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function MaintenanceTasksBar({
  search,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  serverFilter,
  onServerFilterChange,
  serverOptions,
  viewMode,
  onViewModeChange,
  activeCount,
  onRefresh,
  onOpenAdd,
  onDeactivateAll,
  onOpenHelp,
  t,
}: MaintenanceTasksBarProps) {
  return (
    <div
      className="access-users-bar maintenance-tasks-bar"
      role="toolbar"
      aria-label={t('instances_tab_maintenance')}
    >
      {/* 1. Поиск */}
      <SearchField
        id="maintenanceTasksSearchInput"
        className="access-users-bar__search"
        placeholder={t('search_placeholder')}
        autoComplete="off"
        spellCheck={false}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      {/* 2. Фильтры */}
      <div className="access-users-bar__filters">
        <select
          id="maintenanceTasksStatusFilter"
          className="input access-users-bar__select"
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          aria-label={t('maintenance_col_status')}
        >
          <option value="all">{t('maintenance_filter_all_status')}</option>
          <option value="active">{t('maintenance_filter_active_only')}</option>
          <option value="inactive">
            {t('maintenance_filter_inactive_only')}
          </option>
        </select>

        {serverOptions.length > 0 && (
          <select
            id="maintenanceTasksServerFilter"
            className="input access-users-bar__select"
            value={serverFilter}
            onChange={(e) => onServerFilterChange(e.target.value)}
            aria-label={t('maintenance_col_servers')}
          >
            <option value="all">{t('maintenance_filter_all_servers')}</option>
            {serverOptions.map((opt) => (
              <option key={opt.id} value={opt.id}>
                {opt.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* 3. Кнопка обновления */}
      {onRefresh && (
        <button
          type="button"
          className="btn access-users-bar__refresh-btn"
          id="btnMaintRefresh"
          title={t('update_list_btn') || 'Обновить'}
          aria-label={t('update_list_btn') || 'Обновить'}
          onClick={onRefresh}
        >
          <IconRefresh size={18} />
        </button>
      )}

      {/* 4. Кнопки действий */}
      <div className="access-users-bar__actions">
        <button
          type="button"
          className="btn access-users-bar__create-btn"
          id="btnMaintAdd"
          data-i18n-title="maintenance_add_btn"
          title={t('maintenance_add_btn')}
          aria-label={t('maintenance_add_btn')}
          onClick={onOpenAdd}
        >
          <IconPlus size={17} />
          <span>{t('maintenance_add_btn')}</span>
        </button>

        <button
          type="button"
          className="btn btn--secondary btn--with-icon maintenance-tasks-bar__deactivate-btn"
          id="btnMaintDeactivateAll"
          data-i18n-title="maintenance_deactivate_all_btn"
          title={t('maintenance_deactivate_all_btn')}
          aria-label={t('maintenance_deactivate_all_btn')}
          disabled={activeCount === 0}
          onClick={onDeactivateAll}
        >
          <IconPlayerStop size={16} />
          <span>{t('maintenance_deactivate_all_btn')}</span>
        </button>

        <button
          type="button"
          className="btn btn--toolbar-icon access-users-bar__view-toggle-btn"
          id="btnMaintViewToggle"
          title={
            viewMode === 'table'
              ? t('instances_view_cards')
              : t('instances_view_list')
          }
          aria-label={
            viewMode === 'table'
              ? t('instances_view_cards')
              : t('instances_view_list')
          }
          onClick={() =>
            onViewModeChange(viewMode === 'table' ? 'cards' : 'table')
          }
        >
          {viewMode === 'table' ? (
            <IconLayoutGrid size={18} />
          ) : (
            <IconList size={18} />
          )}
        </button>

        {onOpenHelp && (
          <button
            type="button"
            className="btn btn--toolbar-icon access-users-bar__help-btn"
            id="btnMaintenanceHelp"
            data-i18n-title="maintenance_help_btn"
            title={t('maintenance_help_btn')}
            aria-label={t('maintenance_help_btn')}
            onClick={onOpenHelp}
          >
            <IconHelp size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
