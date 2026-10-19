import { IconLayoutGrid, IconList } from '@tabler/icons-react';
import { AppIcon } from '../AppIcon';
import { SearchField } from '../SearchField';
import type { UserAccessViewMode } from '../../lib/userPrefs';

interface AccessUsersBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  roleFilter: string;
  onRoleFilterChange: (value: string) => void;
  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  viewMode: UserAccessViewMode;
  onViewModeChange: (mode: UserAccessViewMode) => void;
  onRefresh: () => void;
  shownCount: number;
  totalCount: number;
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
  onRefresh,
  shownCount,
  totalCount,
  t,
}: AccessUsersBarProps) {
  const isFiltered =
    (search.trim().length > 0 || roleFilter !== 'all' || statusFilter !== 'all') &&
    shownCount !== totalCount;

  return (
    <div className="access-users-bar" role="toolbar" aria-label={t('instances_tab_access')}>
      <SearchField
        id="accessUsersSearchInput"
        className="access-users-bar__search"
        placeholder={t('web_users_search_placeholder')}
        autoComplete="off"
        spellCheck={false}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />

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
          <option value="server_engineer">{t('web_role_server_engineer')}</option>
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
          <option value="disabled">{t('web_users_filter_disabled_only')}</option>
          <option value="2fa">{t('web_users_filter_2fa_only')}</option>
        </select>
      </div>

      <div className="access-users-bar__actions">
        <button
          type="button"
          className="btn btn--toolbar-icon access-users-bar__refresh"
          id="btnAccessUsersRefresh"
          title={t('update_list_btn')}
          aria-label={t('update_list_btn')}
          onClick={() => {
            onSearchChange('');
            onRoleFilterChange('all');
            onStatusFilterChange('all');
            onRefresh();
          }}
        >
          <AppIcon name="refresh" size={16} />
        </button>

        <button
          type="button"
          className="btn btn--toolbar-icon access-users-bar__view-toggle-btn"
          id="btnAccessViewToggle"
          title={viewMode === 'table' ? t('instances_view_cards') : t('instances_view_list')}
          aria-label={viewMode === 'table' ? t('instances_view_cards') : t('instances_view_list')}
          onClick={() => onViewModeChange(viewMode === 'table' ? 'cards' : 'table')}
        >
          {viewMode === 'table' ? <IconLayoutGrid size={18} /> : <IconList size={18} />}
        </button>
      </div>

      {isFiltered ? (
        <span className="access-users-bar__count">
          {t('instances_search_count', shownCount, totalCount)}
        </span>
      ) : null}
    </div>
  );
}
