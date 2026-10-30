import {
  IconPlus,
  IconClock,
  IconUpload,
  IconRefresh,
} from '@tabler/icons-react';
import { SearchField } from '../SearchField';

interface BackupBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  typeFilter: string;
  onTypeFilterChange: (type: string) => void;
  onRefresh: () => void;
  onOpenCreate: () => void;
  onOpenAutoSettings: () => void;
  onTriggerUpload: () => void;
  autoEnabled: boolean;
  creating: boolean;
  uploading: boolean;
  totalCount: number;
  filteredCount: number;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function BackupBar({
  search,
  onSearchChange,
  typeFilter,
  onTypeFilterChange,
  onRefresh,
  onOpenCreate,
  onOpenAutoSettings,
  onTriggerUpload,
  autoEnabled,
  creating,
  uploading,
  totalCount,
  filteredCount,
  t,
}: BackupBarProps) {
  const isFiltered = (search.trim().length > 0 || typeFilter !== 'all') && filteredCount !== totalCount;

  return (
    <div className="access-users-bar backup-bar" role="toolbar" aria-label={t('backup_list_title')}>
      {/* 1. Поиск */}
      <SearchField
        type="search"
        id="backupSearchInput"
        className="access-users-bar__search"
        placeholder={t('search') || 'Поиск по имени, дате или тегу...'}
        autoComplete="off"
        spellCheck={false}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />

      {/* 2. Фильтр по типу */}
      <div className="access-users-bar__filters">
        <select
          id="backupTypeFilter"
          className="access-users-bar__select"
          value={typeFilter}
          onChange={(e) => onTypeFilterChange(e.target.value)}
          aria-label={t('backup_col_type')}
        >
          <option value="all">{t('backup_filter_all_types')}</option>
          <option value="auto">{t('backup_type_auto')}</option>
          <option value="manual">{t('backup_type_manual')}</option>
          <option value="uploaded">{t('backup_type_uploaded')}</option>
        </select>
      </div>

      {/* 3. Кнопка обновления */}
      <button
        type="button"
        className="btn btn--toolbar-icon"
        id="btnBackupRefresh"
        title={t('web_refresh')}
        aria-label={t('web_refresh')}
        onClick={onRefresh}
      >
        <IconRefresh size={16} />
      </button>

      {/* 4. Счетчик если фильтр активен */}
      {isFiltered ? (
        <span className="access-users-bar__count">
          {t('instances_search_count', filteredCount, totalCount) || `${filteredCount} / ${totalCount}`}
        </span>
      ) : null}

      {/* 5. Кнопки действий */}
      <div className="access-users-bar__actions">
        <button
          type="button"
          id="btnBackupCreateOpen"
          className="btn btn--secondary btn--with-icon"
          disabled={creating}
          onClick={onOpenCreate}
        >
          {creating ? (
            <>
              <div className="spinner spinner--sm" />
              <span>{t('backup_creating_label')}</span>
            </>
          ) : (
            <>
              <IconPlus size={16} />
              <span>{t('backup_create_title')}</span>
            </>
          )}
        </button>

        <button
          type="button"
          id="btnBackupAutoSettings"
          className="btn btn--secondary btn--with-icon"
          onClick={onOpenAutoSettings}
          title={t('backup_auto_title')}
        >
          <IconClock size={16} />
          <span>{t('backup_auto_title')}</span>
          {autoEnabled && (
            <span
              className="instance-run-dot instance-run-dot--on"
              style={{ width: 6, height: 6, marginLeft: 4 }}
              title={t('backup_auto_enabled_label')}
            />
          )}
        </button>

        <button
          type="button"
          id="btnBackupUpload"
          className="btn btn--secondary btn--with-icon"
          disabled={uploading}
          onClick={onTriggerUpload}
          title={t('backup_upload_btn')}
        >
          {uploading ? (
            <>
              <div className="spinner spinner--sm" />
              <span>{t('backup_uploading_label')}</span>
            </>
          ) : (
            <>
              <IconUpload size={16} />
              <span>{t('backup_upload_btn')}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
