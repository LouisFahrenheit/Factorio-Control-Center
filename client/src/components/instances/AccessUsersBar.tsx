import {
  IconLayoutGrid,
  IconList,
  IconUserPlus,
  IconHelp,
} from '@tabler/icons-react';
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
  shownCount: number;
  totalCount: number;
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
  shownCount,
  totalCount,
  onCreate,
  onOpenHelp,
  t,
}: AccessUsersBarProps) {
  const isFiltered =
    (search.trim().length > 0 || roleFilter !== 'all' || statusFilter !== 'all') &&
    shownCount !== totalCount;

  return (
    <div className="access-users-bar" role="toolbar" aria-label={t('instances_tab_access')}>
      {/* 1. Поиск */}
      <SearchField
        id="accessUsersSearchInput"
        className="access-users-bar__search"
        placeholder={t('web_users_search_placeholder')}
        autoComplete="off"
        spellCheck={false}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />

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

      {/* 3. Счетчик отфильтрованных записей */}
      {isFiltered ? (
        <span className="access-users-bar__count">
          {t('instances_search_count', shownCount, totalCount)}
        </span>
      ) : null}

      {/* 4. Кнопки (Создать, Вид, Справка в конце) */}
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
