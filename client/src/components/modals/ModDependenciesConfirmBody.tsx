import { AppIcon } from '../AppIcon';
import type { ModInstallConflictInfo } from '../../types/modConflict';

export interface ModDependenciesConfirmBodyProps {
  intro: string;
  outro?: string;
  deps: string[];
  countLabel: string;
  conflicts?: ModInstallConflictInfo[];
  conflictsIntro?: string;
  conflictsCountLabel?: string;
  conflictTagLabel?: string;
  conflictBuiltinLabel?: string;
  recommended?: string[];
  recommendedSelection?: Set<string>;
  onToggleRecommended?: (name: string) => void;
  recommendedIntro?: string;
  recommendedCountLabel?: string;
}

export function ModDependenciesConfirmBody({
  intro,
  outro,
  deps,
  countLabel,
  conflicts = [],
  conflictsIntro,
  conflictsCountLabel,
  conflictTagLabel = 'Conflict',
  conflictBuiltinLabel = 'Built-in',
  recommended,
  recommendedSelection,
  onToggleRecommended,
  recommendedIntro,
  recommendedCountLabel,
}: ModDependenciesConfirmBodyProps) {
  const hasDeps = deps.length > 0;
  const hasConflicts = conflicts.length > 0;

  return (
    <div className="mod-deps-confirm">
      {hasDeps ? (
        <>
          <p className="mod-deps-confirm__intro">{intro}</p>
          <div className="mod-deps-confirm__meta">
            <span className="mod-deps-confirm__count">
              <AppIcon name="add_link" size={15} className="mod-deps-confirm__count-icon" />
              {countLabel}
            </span>
          </div>
          <div className="mod-deps-confirm__list-wrap">
            <ul className="mod-deps-confirm__list" role="list">
              {deps.map((name) => (
                <li key={name} className="mod-deps-confirm__item">
                  <span className="mod-deps-confirm__item-icon" aria-hidden="true">
                    <AppIcon name="mod_update_" size={16} />
                  </span>
                  <span className="mod-deps-confirm__name">{name}</span>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}

      {hasConflicts ? (
        <div className={'mod-deps-confirm__conflicts' + (hasDeps ? ' mod-deps-confirm__conflicts--split' : '')}>
          {conflictsIntro ? <p className="mod-deps-confirm__conflicts-intro">{conflictsIntro}</p> : null}
          {conflictsCountLabel ? (
            <div className="mod-deps-confirm__meta">
              <span className="mod-deps-confirm__count mod-deps-confirm__count--conflict">
                <AppIcon name="mode_off_on" size={15} className="mod-deps-confirm__count-icon" />
                {conflictsCountLabel}
              </span>
            </div>
          ) : null}
          <div className="mod-deps-confirm__list-wrap mod-deps-confirm__list-wrap--conflict">
            <ul className="mod-deps-confirm__list mod-deps-confirm__list--conflicts" role="list">
              {conflicts.map((item) => (
                <li
                  key={item.name}
                  className={
                    'mod-deps-confirm__item mod-deps-confirm__item--conflict' +
                    (item.is_builtin ? ' mod-deps-confirm__item--conflict-builtin' : '')
                  }
                >
                  <span
                    className="mod-deps-confirm__conflict-mark"
                    aria-hidden="true"
                    title={conflictTagLabel}
                  >
                    <AppIcon name="engineering" size={16} className="mod-deps-confirm__conflict-mark-icon" />
                    <span className="mod-deps-confirm__conflict-bang">!</span>
                  </span>
                  <span className="mod-deps-confirm__conflict-line">
                    <span className="mod-deps-confirm__name mod-deps-confirm__name--conflict">{item.name}</span>
                    {item.is_builtin ? (
                      <span className="mod-deps-confirm__conflict-builtin">({conflictBuiltinLabel})</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {recommended && recommended.length > 0 ? (
        <div className={'mod-deps-confirm__recommended' + (hasDeps || hasConflicts ? ' mod-deps-confirm__conflicts--split' : '')}>
          {recommendedIntro ? <p className="mod-deps-confirm__conflicts-intro">{recommendedIntro}</p> : null}
          {recommendedCountLabel ? (
            <div className="mod-deps-confirm__meta">
              <span className="mod-deps-confirm__count">
                <AppIcon name="add_link" size={15} className="mod-deps-confirm__count-icon" />
                {recommendedCountLabel}
              </span>
            </div>
          ) : null}
          <div className="mod-deps-confirm__list-wrap">
            <ul className="mod-deps-confirm__list" role="list" style={{ padding: 0, listStyle: 'none' }}>
              {recommended.map((name) => (
                <li key={name} className="mod-deps-confirm__item" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={recommendedSelection?.has(name)}
                    onChange={() => onToggleRecommended?.(name)}
                    style={{ margin: 0, cursor: 'pointer' }}
                  />
                  <span className="mod-deps-confirm__name" style={{ cursor: 'default' }}>{name}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      {outro ? <p className="mod-deps-confirm__outro">{outro}</p> : null}
    </div>
  );
}
