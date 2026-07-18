import { AppIcon } from '../AppIcon';

type TFunc = (key: string, ...args: (string | number)[]) => string;

export type ModGameVersionConfirmResult =
  | { ok: false }
  | { ok: true; allow_requires_game_update: boolean };

interface ModGameVersionConfirmBodyProps {
  t: TFunc;
  title: string;
  gameVersion: string;
  modLines: string[];
  onDone: (result: ModGameVersionConfirmResult) => void;
}

export function ModGameVersionConfirmFooter({
  t,
  onCancel,
  onSkip,
  onUpdate,
  showSkip = false,
}: {
  t: TFunc;
  onCancel: () => void;
  onSkip?: () => void;
  onUpdate: () => void;
  showSkip?: boolean;
}) {
  return (
    <div className="mod-update-all-flow__footer-stack">
      <div className={'mod-update-all-flow__footer-row' + (showSkip ? '' : ' mod-update-all-flow__footer-row--dual')}>
        <button type="button" className="btn mod-update-all-flow__btn-secondary" onClick={onCancel}>
          {t('mod_game_version_btn_cancel')}
        </button>
        {showSkip && onSkip ? (
          <button type="button" className="btn mod-update-all-flow__btn-secondary" onClick={onSkip}>
            {t('mod_game_version_btn_skip')}
          </button>
        ) : null}
        <button type="button" className="btn btn--primary mod-update-all-flow__btn-primary" onClick={onUpdate}>
          {t('mod_game_version_btn_update')}
        </button>
      </div>
    </div>
  );
}

export function ModGameVersionConfirmBody({
  t,
  title,
  gameVersion,
  modLines,
  onDone,
}: ModGameVersionConfirmBodyProps) {
  const cancel = () => onDone({ ok: false });

  return (
    <div className="mod-update-all-flow mod-game-version-confirm">
      <div className="mod-update-all-flow__header">
        <AppIcon name="info" size={20} className="mod-update-all-flow__header-icon" />
        <div className="mod-update-all-flow__header-text">
          <span className="mod-update-all-flow__header-title">{title}</span>
        </div>
        <button type="button" className="mod-update-all-flow__close" aria-label={t('close')} onClick={cancel}>
          <AppIcon name="close" size={16} />
        </button>
      </div>

      <div className="mod-update-all-flow__body">
        <div className="fcc-confirm-modal__content mod-update-all-flow__panel">
          <p className="fcc-confirm-modal__lead">{t('mod_update_all_requires_newer_game_lead', gameVersion)}</p>
          <div className="mod-update-all-flow__mod-list-wrap">
            <ul className="mod-update-all-flow__mod-list" role="list">
              {modLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
          <p className="fcc-confirm-modal__question">{t('mod_game_version_single_question')}</p>
        </div>
      </div>

      <div className="mod-update-all-flow__footer">
        <ModGameVersionConfirmFooter
          t={t}
          onCancel={cancel}
          onUpdate={() => onDone({ ok: true, allow_requires_game_update: true })}
        />
      </div>
    </div>
  );
}
