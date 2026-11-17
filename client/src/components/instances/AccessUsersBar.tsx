import {
  IconLayoutGrid,
  IconList,
  IconUserPlus,
  IconHelp,
} from '@tabler/icons-react';
import { SearchField } from '../SearchField';
import { RefreshButton } from '../RefreshButton';
import type {
  UserAccessColumnKey,
  UserAccessColumnVisibility,
} from '../../lib/userAccessColumnPrefs';
import type { UserAccessViewMode } from '../../lib/userPrefs';
import type { StatusMode } from '../../lib/statusModePrefs';
import {
  InstanceColumnsDropdown,
  type ColumnConfigItem,
} from './InstanceColumnsDropdown';

const USER_COLUMN_CONFIG: readonly ColumnConfigItem<UserAccessColumnKey>[] = [
  { key: 'role', labelKey: 'web_role_label' },
  {
    key: 'status',
    labelKey: 'web_user_status_label',
    modes: [
      { value: 'column', labelKey: 'web_status_mode_on' },
      { value: 'dot', labelKey: 'web_status_mode_dot' },
      { value: 'off', labelKey: 'web_status_mode_off' },
    ],
  },
  { key: 'twofa', labelKey: 'web_2fa_column_label' },
  { key: 'servers', labelKey: 'instances_tab_servers' },
  { key: 'perms', labelKey: 'web_access_perms_label' },
  { key: 'created', labelKey: 'web_user_created_at_label' },
];

interface AccessUsersBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  roleFilter: string;
  onRoleFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  viewMode: UserAccessViewMode;
  onViewModeChange: (mode: UserAccessViewMode) => void;
  columns: UserAccessColumnVisibility;
  columnOrder: readonly UserAccessColumnKey[];
  statusMode: StatusMode;
  onStatusModeChange: (mode: StatusMode) => void;
  onToggleColumn: (key: UserAccessColumnKey, visible: boolean) => void;
  onMoveColumn: (key: UserAccessColumnKey, direction: 'up' | 'down') => void;
  onResetColumns: () => void;
  shownCount?: number;
  totalCount?: number;
  onRefresh?: () => void;
  onCreate?: () => void;
  onOpenHelp?: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function AccessUsersBar({
  search,
  onSearchChange,
  roleFilter,
  onRoleFilterChange,
  statusFilter,
  onStatusFilterChange,
  viewMode,
  onViewModeChange,
  columns,
  columnOrder,
  statusMode,
  onStatusModeChange,
  onToggleColumn,
  onMoveColumn,
  onResetColumns,
  onRefresh,
  onCreate,
  onOpenHelp,
  t,
}: AccessUsersBarProps) {
  return (
    <div
      className="access-users-bar"
      role="toolbar"
      aria-label={t('instances_tab_access')}
    >
      {/* 1. Поиск */}
      <SearchField
        id="accessUsersSearchInput"
        className="access-users-bar__search"
        placeholder={t('search_placeholder')}
        autoComplete="off"
        spellCheck={false}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      {/* 2. Обновление */}
      {onRefresh && (
        <RefreshButton
          id="btnAccessUsersRefresh"
          title={t('update_list_btn')}
          aria-label={t('update_list_btn')}
          onClick={() => {
            onSearchChange('');
            onRefresh();
          }}
        />
      )}

      {/* 2. Фильтры */}
      <div className="access-users-bar__filters">
        <select
          id="accessUsersRoleFilter"
          className="input access-users-bar__select"
          value={roleFilter}
          onChange={(e) => onRoleFilterChange(e.target.value)}
          aria-label={t('web_role_label')}
        >
          <option value="all">{t('web_users_filter_all_roles')}</option>
          <option value="administrator">{t('web_role_administrator')}</option>
          <option value="server_engineer">
            {t('web_role_server_engineer')}
          </option>
          <option value="moderator">{t('web_role_moderator')}</option>
        </select>

        <select
          id="accessUsersStatusFilter"
          className="input access-users-bar__select"
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          aria-label={t('web_user_status_label')}
        >
          <option value="all">{t('web_users_filter_all_status')}</option>
          <option value="enabled">{t('web_users_filter_active_only')}</option>
          <option value="disabled">
            {t('web_users_filter_disabled_only')}
          </option>
          <option value="2fa">{t('web_users_filter_2fa_only')}</option>
        </select>
      </div>

      {/* 3. Кнопки (Создать, Вид, Справка в конце) */}
      <div className="access-users-bar__actions">
        {onCreate && (
          <button
            type="button"
            className="btn access-users-bar__create-btn"
            id="btnAccessUserCreate"
            onClick={onCreate}
          >
            <IconUserPlus size={17} />
            <span>{t('web_user_create_btn') || 'Создать пользователя'}</span>
          </button>
        )}

        {viewMode === 'table' && (
          <InstanceColumnsDropdown
            idPrefix="Access"
            config={USER_COLUMN_CONFIG}
            columns={columns}
            order={columnOrder}
            modeValues={{ status: statusMode }}
            onChangeMode={(_key, value) =>
              onStatusModeChange(value as StatusMode)
            }
            onToggleColumn={onToggleColumn}
            onMoveColumn={onMoveColumn}
            onReset={onResetColumns}
            t={t}
          />
        )}

        <button
          type="button"
          className="btn btn--toolbar-icon access-users-bar__view-toggle-btn"
          id="btnAccessViewToggle"
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
            id="btnWebAccessHelp"
            title={t('web_access_help_btn')}
            aria-label={t('web_access_help_btn')}
            onClick={onOpenHelp}
          >
            <IconHelp size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
