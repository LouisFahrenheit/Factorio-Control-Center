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
  titles?: Record<string, string>;
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
  recommended = [],
  recommendedSelection,
  onToggleRecommended,
  recommendedIntro,
  recommendedCountLabel,
  titles = {},
}: ModDependenciesConfirmBodyProps) {
  const hasDeps = deps.length > 0;
  const hasConflicts = conflicts.length > 0;
  const hasRecommended = recommended && recommended.length > 0;
  const hasLeft = hasDeps || hasConflicts;
  const isSplit = hasLeft && hasRecommended;

  const resolveTitle = (name: string) => {
    return titles[name] || titles[name.toLowerCase()] || name;
  };

  return (
    <div className="mod-deps-confirm">
      <div className={'mod-deps-confirm__columns' + (!isSplit ? ' mod-deps-confirm__columns--single' : '')}>
        {hasLeft ? (
          <div className="mod-deps-confirm__col mod-deps-confirm__col--required">
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
                    {deps.map((name) => {
                      const displayTitle = resolveTitle(name);
                      return (
                        <li key={name} className="mod-deps-confirm__item">
                          <span className="mod-deps-confirm__item-icon" aria-hidden="true">
                            <AppIcon name="mod_update_" size={16} />
                          </span>
                          <span className="mod-deps-confirm__name">{displayTitle}</span>
                        </li>
                      );
                    })}
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
                    {conflicts.map((item) => {
                      const displayTitle = resolveTitle(item.name);
                      return (
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
                            <span className="mod-deps-confirm__name mod-deps-confirm__name--conflict">
                              {displayTitle}
                            </span>
                            {item.is_builtin ? (
                              <span className="mod-deps-confirm__conflict-builtin">({conflictBuiltinLabel})</span>
                            ) : null}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {hasRecommended ? (
          <div className="mod-deps-confirm__col mod-deps-confirm__col--recommended">
            {recommendedIntro ? <p className="mod-deps-confirm__intro">{recommendedIntro}</p> : null}
            {recommendedCountLabel ? (
              <div className="mod-deps-confirm__meta">
                <span className="mod-deps-confirm__count">
                  <AppIcon name="add_link" size={15} className="mod-deps-confirm__count-icon" />
                  {recommendedCountLabel}
                </span>
              </div>
            ) : null}
            <div className="mod-deps-confirm__list-wrap">
              <ul className="mod-deps-confirm__list" role="list">
                {recommended.map((name) => {
                  const displayTitle = resolveTitle(name);
                  return (
                    <li key={name}>
                      <label className="mod-deps-confirm__item mod-deps-confirm__item--checkbox">
                        <input
                          type="checkbox"
                          checked={recommendedSelection?.has(name)}
                          onChange={() => onToggleRecommended?.(name)}
                        />
                        <span className="mod-deps-confirm__name">{displayTitle}</span>
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        ) : null}
      </div>

      {outro ? <p className="mod-deps-confirm__outro">{outro}</p> : null}
    </div>
  );
}
