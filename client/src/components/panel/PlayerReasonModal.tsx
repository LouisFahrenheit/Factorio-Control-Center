import { useEffect, useState, type FormEvent } from 'react';
import { IconAlertTriangle, IconBan, IconUserX } from '@tabler/icons-react';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import { CancelButton } from '../CancelButton';

export interface PlayerReasonModalProps {
  open: boolean;
  player: string;
  action: 'kick' | 'ban';
  onClose: () => void;
  onSubmit: (reason: string) => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function PlayerReasonModal({
  open,
  player,
  action,
  onClose,
  onSubmit,
  t,
}: PlayerReasonModalProps) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) {
      setReason('');
    }
  }, [open, player, action]);

  if (!open) return null;

  const actionTitle = action === 'ban' ? t('ban_player') : t('kick_player');
  const isDanger = action === 'ban';

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    onSubmit(reason.trim());
    onClose();
  }

  return (
    <ModalBackdrop open id="playerReasonModalBackdrop" onClose={onClose}>
      <div
        className="fu-modal player-reason-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="playerReasonHeading"
      >
        <div className="fu-modal__header player-reason-modal__header" id="playerReasonHeading">
          <div className="player-reason-modal__header-icon">
            <IconAlertTriangle size={18} />
          </div>
          <span className="player-reason-modal__title">{actionTitle}</span>
        </div>

        <form onSubmit={handleSubmit} className="player-reason-modal__form">
          <div className="fu-modal__body player-reason-modal__body">
            <p className="player-reason-modal__target">
              <span className="player-reason-modal__label">{t('player')}:</span>{' '}
              <strong className="player-reason-modal__name">{player}</strong>
            </p>

            <label className="player-reason-modal__field" htmlFor="playerReasonInput">
              <span className="player-reason-modal__field-label">
                {t('player_action_reason_label')}
              </span>
              <input
                id="playerReasonInput"
                type="text"
                className="input"
                autoComplete="off"
                placeholder={t('player_action_reason_placeholder')}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                autoFocus
              />
            </label>
          </div>

          <div className="fu-modal__footer player-reason-modal__footer">
            <CancelButton t={t} onClick={onClose} />
            <button
              type="submit"
              className={'btn btn--with-icon ' + (isDanger ? 'btn--danger' : 'btn--primary')}
              id="btnPlayerReasonConfirm"
            >
              {isDanger ? <IconBan size={16} /> : <IconUserX size={16} />}
              {actionTitle}
            </button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}

