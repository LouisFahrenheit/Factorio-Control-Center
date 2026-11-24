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
  const hasRecommended = recommended.length > 0;

  const isSplit =
    (hasDeps && (hasRecommended || hasConflicts)) ||
    (!hasDeps && hasConflicts && hasRecommended);
  const useTwoColGrid = !isSplit && hasDeps && deps.length >= 6;
  const rightStacked = hasDeps && hasRecommended && hasConflicts;

  const resolveTitle = (name: string) => {
    return titles[name] || titles[name.toLowerCase()] || name;
  };

  const requiredCard = hasDeps ? (
    <section className="mod-deps-confirm__section">
      <div className="mod-deps-confirm__section-head">
        <div className="mod-deps-confirm__section-title-wrap">
          <AppIcon
            name="packages"
            size={16}
            className="mod-deps-confirm__section-icon"
          />
          <p className="mod-deps-confirm__intro">{intro}</p>
        </div>
        <span className="mod-deps-confirm__count">{countLabel}</span>
      </div>
      <div className="mod-deps-confirm__list-wrap">
        <ul
          className={
            'mod-deps-confirm__list' +
            (useTwoColGrid ? ' mod-deps-confirm__list--grid' : '')
          }
          role="list"
        >
          {deps.map((name) => {
            const displayTitle = resolveTitle(name);
            const showTech = displayTitle.toLowerCase() !== name.toLowerCase();
            return (
              <li key={name} className="mod-deps-confirm__item">
                <span
                  className="mod-deps-confirm__item-icon"
                  aria-hidden="true"
                >
                  <AppIcon name="package" size={16} />
                </span>
                <div className="mod-deps-confirm__name-wrap">
                  <span className="mod-deps-confirm__name">{displayTitle}</span>
                  {showTech ? (
                    <span className="mod-deps-confirm__technical-name">
                      {name}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  ) : null;

  const recommendedCard = hasRecommended ? (
    <section
      className={
        'mod-deps-confirm__section' +
        (rightStacked ? ' mod-deps-confirm__section--compact' : '')
      }
    >
      <div className="mod-deps-confirm__section-head">
        <div className="mod-deps-confirm__section-title-wrap">
          <AppIcon
            name="star"
            size={16}
            className="mod-deps-confirm__section-icon"
          />
          {recommendedIntro ? (
            <p className="mod-deps-confirm__intro">{recommendedIntro}</p>
          ) : null}
        </div>
        {recommendedCountLabel ? (
          <span className="mod-deps-confirm__count mod-deps-confirm__count--neutral">
            {recommendedCountLabel}
          </span>
        ) : null}
      </div>
      <div
        className={
          'mod-deps-confirm__list-wrap' +
          (rightStacked ? ' mod-deps-confirm__list-wrap--compact' : '')
        }
      >
        <ul className="mod-deps-confirm__list" role="list">
          {recommended.map((name) => {
            const displayTitle = resolveTitle(name);
            const showTech = displayTitle.toLowerCase() !== name.toLowerCase();
            const isChecked = Boolean(recommendedSelection?.has(name));
            return (
              <li key={name}>
                <label
                  className={
                    'mod-deps-confirm__item mod-deps-confirm__item--checkbox' +
                    (isChecked ? ' is-checked' : '')
                  }
                >
                  <input
                    type="checkbox"
                    className="mod-deps-confirm__check-input"
                    checked={isChecked}
                    onChange={() => onToggleRecommended?.(name)}
                  />
                  <span
                    className="mod-deps-confirm__check-box"
                    aria-hidden="true"
                  >
                    {isChecked ? <AppIcon name="check" size={12} /> : null}
                  </span>
                  <div className="mod-deps-confirm__name-wrap">
                    <span className="mod-deps-confirm__name">
                      {displayTitle}
                    </span>
                    {showTech ? (
                      <span className="mod-deps-confirm__technical-name">
                        {name}
                      </span>
                    ) : null}
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  ) : null;

  const conflictsCard = hasConflicts ? (
    <section
      className={
        'mod-deps-confirm__section mod-deps-confirm__section--conflict' +
        (rightStacked ? ' mod-deps-confirm__section--compact' : '')
      }
    >
      <div className="mod-deps-confirm__section-head mod-deps-confirm__section-head--conflict">
        <div className="mod-deps-confirm__section-title-wrap">
          <AppIcon
            name="warning"
            size={16}
            className="mod-deps-confirm__section-icon mod-deps-confirm__section-icon--conflict"
          />
          {conflictsIntro ? (
            <p className="mod-deps-confirm__conflicts-intro">
              {conflictsIntro}
            </p>
          ) : null}
        </div>
        {conflictsCountLabel ? (
          <span className="mod-deps-confirm__count mod-deps-confirm__count--conflict">
            {conflictsCountLabel}
          </span>
        ) : null}
      </div>
      <div
        className={
          'mod-deps-confirm__list-wrap mod-deps-confirm__list-wrap--conflict' +
          (rightStacked ? ' mod-deps-confirm__list-wrap--compact' : '')
        }
      >
        <ul
          className="mod-deps-confirm__list mod-deps-confirm__list--conflicts"
          role="list"
        >
          {conflicts.map((item) => {
            const displayTitle = resolveTitle(item.name);
            const showTech =
              !item.is_builtin &&
              displayTitle.toLowerCase() !== item.name.toLowerCase();
            return (
              <li
                key={item.name}
                className={
                  'mod-deps-confirm__item mod-deps-confirm__item--conflict' +
                  (item.is_builtin
                    ? ' mod-deps-confirm__item--conflict-builtin'
                    : '')
                }
              >
                <span
                  className="mod-deps-confirm__conflict-mark"
                  aria-hidden="true"
                  title={conflictTagLabel}
                >
                  <AppIcon
                    name="warning"
                    size={16}
                    className="mod-deps-confirm__conflict-mark-icon"
                  />
                </span>
                <div className="mod-deps-confirm__name-wrap">
                  <span className="mod-deps-confirm__conflict-line">
                    <span className="mod-deps-confirm__name mod-deps-confirm__name--conflict">
                      {displayTitle}
                    </span>
                    {item.is_builtin ? (
                      <span className="mod-deps-confirm__conflict-builtin">
                        {conflictBuiltinLabel}
                      </span>
                    ) : null}
                  </span>
                  {showTech ? (
                    <span className="mod-deps-confirm__technical-name">
                      {item.name}
                    </span>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  ) : null;

  return (
    <div className="mod-deps-confirm">
      {isSplit ? (
        <div className="mod-deps-confirm__columns">
          <div className="mod-deps-confirm__col mod-deps-confirm__col--primary">
            {hasDeps ? requiredCard : conflictsCard}
          </div>
          <div className="mod-deps-confirm__col mod-deps-confirm__col--secondary">
            {recommendedCard}
            {hasDeps ? conflictsCard : null}
          </div>
        </div>
      ) : (
        <div className="mod-deps-confirm__columns mod-deps-confirm__columns--single">
          <div className="mod-deps-confirm__col">
            {requiredCard}
            {recommendedCard}
            {conflictsCard}
          </div>
        </div>
      )}

      {outro ? <p className="mod-deps-confirm__outro">{outro}</p> : null}
    </div>
  );
}
