import { AppIcon } from '../AppIcon';

interface MaintenanceTasksEmptyProps {
  onOpenAdd: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function MaintenanceTasksEmpty({
  onOpenAdd,
  t,
}: MaintenanceTasksEmptyProps) {
  return (
    <div
      className="instance-servers-empty maintenance-tasks-empty-box"
      role="status"
    >
      <div className="instance-servers-empty__glow" aria-hidden="true" />
      <div className="instance-servers-empty__card">
        <div className="instance-servers-empty__icon-wrap" aria-hidden="true">
          <AppIcon
            name="maintenance"
            size={40}
            className="instance-servers-empty__icon"
          />
        </div>
        <h2 className="instance-servers-empty__title">
          {t('maintenance_tasks_empty_title')}
        </h2>
        <p className="instance-servers-empty__intro">
          {t('maintenance_tasks_empty_intro')}
        </p>
        <button
          type="button"
          className="btn btn--primary btn--with-icon instance-servers-empty__cta"
          id="btnMaintEmptyAdd"
          onClick={onOpenAdd}
        >
          <AppIcon name="add" size={18} />
          {t('maintenance_add_btn')}
        </button>
      </div>
    </div>
  );
}

interface MaintenanceTasksNoResultsProps {
  query: string;
  onClear: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function MaintenanceTasksNoResults({
  query,
  onClear,
  t,
}: MaintenanceTasksNoResultsProps) {
  return (
    <div className="instance-servers-no-results" role="status">
      <AppIcon
        name="search"
        size={32}
        className="instance-servers-no-results__icon"
      />
      <p className="instance-servers-no-results__title">
        {t('maintenance_tasks_search_no_results')}
      </p>
      {query ? (
        <p className="instance-servers-no-results__query">{query}</p>
      ) : null}
      <button type="button" className="btn btn--with-icon" onClick={onClear}>
        <AppIcon name="close" size={16} />
        {t('instances_search_clear')}
      </button>
    </div>
  );
}
