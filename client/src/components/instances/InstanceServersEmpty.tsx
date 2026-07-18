import { AppIcon } from '../AppIcon';

interface InstanceServersEmptyProps {
  onAdd: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function InstanceServersEmpty({ onAdd, t }: InstanceServersEmptyProps) {
  const steps = [
    { num: 1, title: t('instances_empty_step1_title'), text: t('instances_empty_step1_text') },
    { num: 2, title: t('instances_empty_step2_title'), text: t('instances_empty_step2_text') },
  ];

  return (
    <div className="instance-servers-empty" role="status">
      <div className="instance-servers-empty__glow" aria-hidden="true" />
      <div className="instance-servers-empty__card">
        <div className="instance-servers-empty__icon-wrap" aria-hidden="true">
          <AppIcon name="list" size={40} className="instance-servers-empty__icon" />
        </div>
        <h2 className="instance-servers-empty__title">{t('instances_empty_title')}</h2>
        <p className="instance-servers-empty__intro">{t('instances_empty_intro')}</p>
        <ol className="instance-servers-empty__steps">
          {steps.map((step) => (
            <li key={step.num} className="instance-servers-empty__step">
              <span className="instance-servers-empty__step-num">{step.num}</span>
              <div className="instance-servers-empty__step-body">
                <span className="instance-servers-empty__step-title">{step.title}</span>
                <span className="instance-servers-empty__step-text">{step.text}</span>
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          className="btn btn--primary btn--with-icon instance-servers-empty__cta"
          id="btnInstanceEmptyAdd"
          onClick={onAdd}
        >
          <AppIcon name="add" size={18} />
          {t('instances_add_btn')}
        </button>
      </div>
    </div>
  );
}

interface InstanceServersNoResultsProps {
  query: string;
  onClear: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function InstanceServersNoResults({ query, onClear, t }: InstanceServersNoResultsProps) {
  return (
    <div className="instance-servers-no-results" role="status">
      <AppIcon name="search" size={32} className="instance-servers-no-results__icon" />
      <p className="instance-servers-no-results__title">{t('instances_search_no_results')}</p>
      <p className="instance-servers-no-results__query">{query}</p>
      <button type="button" className="btn btn--with-icon" onClick={onClear}>
        <AppIcon name="close" size={16} />
        {t('instances_search_clear')}
      </button>
    </div>
  );
}
