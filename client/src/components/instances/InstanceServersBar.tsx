import { IconLayoutGrid, IconList } from '@tabler/icons-react';
import { SearchField } from '../SearchField';
import { AppIcon } from '../AppIcon';
import type { ServerListViewMode } from '../../lib/userPrefs';

interface InstanceServersBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  shownCount: number;
  totalCount: number;
  viewMode: ServerListViewMode;
  onViewModeChange: (mode: ServerListViewMode) => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function InstanceServersBar({
  search,
  onSearchChange,
  onRefresh,
  shownCount,
  totalCount,
  viewMode,
  onViewModeChange,
  t,
}: InstanceServersBarProps) {
  const filtered = search.trim().length > 0 && shownCount !== totalCount;

  return (
    <div
      className="instance-servers-bar"
      role="toolbar"
      aria-label={t('instances_search_label')}
    >
      <SearchField
        type="search"
        id="instancesSearchInput"
        className="instance-servers-bar__search"
        placeholder={t('instances_search_placeholder')}
        autoComplete="off"
        spellCheck={false}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <button
        type="button"
        className="btn btn--toolbar-icon instance-servers-bar__refresh"
        id="btnInstancesRefresh"
        title={t('update_list_btn')}
        aria-label={t('update_list_btn')}
        onClick={() => {
          onSearchChange('');
          onRefresh();
        }}
      >
        <AppIcon name="refresh" size={16} />
      </button>
      <div
        className="instance-servers-bar__view-toggle"
        role="group"
        aria-label={t('instances_view_toggle')}
      >
        <button
          type="button"
          className={
            'btn btn--toolbar-icon instance-servers-bar__view-btn' +
            (viewMode === 'list'
              ? ' instance-servers-bar__view-btn--active'
              : '')
          }
          id="btnInstanceViewList"
          title={t('instances_view_list')}
          aria-label={t('instances_view_list')}
          aria-pressed={viewMode === 'list'}
          onClick={() => onViewModeChange('list')}
        >
          <IconList size={18} />
        </button>
        <button
          type="button"
          className={
            'btn btn--toolbar-icon instance-servers-bar__view-btn' +
            (viewMode === 'cards'
              ? ' instance-servers-bar__view-btn--active'
              : '')
          }
          id="btnInstanceViewCards"
          title={t('instances_view_cards')}
          aria-label={t('instances_view_cards')}
          aria-pressed={viewMode === 'cards'}
          onClick={() => onViewModeChange('cards')}
        >
          <IconLayoutGrid size={18} />
        </button>
      </div>
      {filtered ? (
        <span className="instance-servers-bar__count">
          {t('instances_search_count', shownCount, totalCount)}
        </span>
      ) : null}
    </div>
  );
}
