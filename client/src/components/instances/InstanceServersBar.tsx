import { SearchField } from '../SearchField';
import { AppIcon } from '../AppIcon';

interface InstanceServersBarProps {
  search: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  shownCount: number;
  totalCount: number;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function InstanceServersBar({
  search,
  onSearchChange,
  onRefresh,
  shownCount,
  totalCount,
  t,
}: InstanceServersBarProps) {
  const filtered = search.trim().length > 0 && shownCount !== totalCount;

  return (
    <div className="instance-servers-bar" role="toolbar" aria-label={t('instances_search_label')}>
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
      </button>      {filtered ? (
        <span className="instance-servers-bar__count">
          {t('instances_search_count', shownCount, totalCount)}
        </span>
      ) : null}
    </div>
  );
}
