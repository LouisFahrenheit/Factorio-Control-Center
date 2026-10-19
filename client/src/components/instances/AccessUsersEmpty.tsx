import { AppIcon } from '../AppIcon';

interface AccessUsersEmptyProps {
  onCreate: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function AccessUsersEmpty({ onCreate, t }: AccessUsersEmptyProps) {
  return (
    <div className="instance-servers-empty access-users-empty-box" role="status">
      <div className="instance-servers-empty__glow" aria-hidden="true" />
      <div className="instance-servers-empty__card">
        <div className="instance-servers-empty__icon-wrap" aria-hidden="true">
          <AppIcon name="users" size={40} className="instance-servers-empty__icon" />
        </div>
        <h2 className="instance-servers-empty__title">{t('web_users_empty_title')}</h2>
        <p className="instance-servers-empty__intro">{t('web_users_empty_intro')}</p>
        <button
          type="button"
          className="btn btn--primary btn--with-icon instance-servers-empty__cta"
          id="btnAccessEmptyCreate"
          onClick={onCreate}
        >
          <AppIcon name="person_add" size={18} />
          {t('web_user_create_btn')}
        </button>
      </div>
    </div>
  );
}

interface AccessUsersNoResultsProps {
  query: string;
  onClear: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function AccessUsersNoResults({ query, onClear, t }: AccessUsersNoResultsProps) {
  return (
    <div className="instance-servers-no-results" role="status">
      <AppIcon name="search" size={32} className="instance-servers-no-results__icon" />
      <p className="instance-servers-no-results__title">{t('web_users_search_no_results')}</p>
      {query ? <p className="instance-servers-no-results__query">{query}</p> : null}
      <button type="button" className="btn btn--with-icon" onClick={onClear}>
        <AppIcon name="close" size={16} />
        {t('instances_search_clear')}
      </button>
    </div>
  );
}
