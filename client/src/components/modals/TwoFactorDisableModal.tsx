import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { ModalBackdrop } from './ModalBackdrop';

interface TwoFactorDisableModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function TwoFactorDisableModal({
  open,
  onClose,
  onSuccess,
  t,
}: TwoFactorDisableModalProps) {
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setPassword('');
      setCode('');
      setError('');
    }
  }, [open]);

  async function handleDisable() {
    if (!password.trim() && !code.trim()) {
      setError(t('confirmation_failed'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      await api('/api/auth/2fa/disable', {
        method: 'POST',
        body: JSON.stringify({
          password: password.trim() || undefined,
          code: code.trim() || undefined,
        }),
      });

      setPassword('');
      setCode('');
      onSuccess();
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalBackdrop
      open={open}
      onClose={onClose}
      id="twoFactorDisableBackdrop"
      backdropClassName="fu-modal-backdrop--stacked"
      closeOnBackdropClick={false}
    >
      <div
        className="fu-modal two-factor-disable-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="twoFactorDisableTitle"
      >
        <div className="mod-install-dialog__header">
          <div className="mod-install-dialog__header-main">
            <div className="mod-install-dialog__header-icon-wrap mod-install-dialog__header-icon-wrap--danger">
              <AppIcon name="person_shield" size={20} />
            </div>
            <div className="mod-install-dialog__header-titles">
              <h2
                className="mod-install-dialog__title"
                id="twoFactorDisableTitle"
              >
                {t('web_2fa_disable_title')}
              </h2>
            </div>
          </div>
        </div>

        <div className="two-factor-modal__body">
          <p className="two-factor-modal__lead two-factor-modal__lead--danger">
            {t('web_2fa_disable_confirm')}
          </p>

          <div className="two-factor-modal__field-group">
            <div className="two-factor-modal__field">
              <label
                className="two-factor-modal__field-label"
                htmlFor="twoFactorDisablePassword"
              >
                {t('web_2fa_disable_password_placeholder')}
              </label>
              <input
                id="twoFactorDisablePassword"
                type="password"
                className="input"
                placeholder={t('web_2fa_disable_password_placeholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    (password.trim() || code.trim()) &&
                    !loading
                  ) {
                    e.preventDefault();
                    void handleDisable();
                  }
                }}
                autoComplete="current-password"
                autoFocus
              />
            </div>

            <div className="two-factor-modal__or-divider" aria-hidden="true" />

            <div className="two-factor-modal__field">
              <label
                className="two-factor-modal__field-label"
                htmlFor="twoFactorDisableCode"
              >
                {t('web_2fa_disable_code_placeholder')}
              </label>
              <input
                id="twoFactorDisableCode"
                type="text"
                className="input two-factor-modal__code-input"
                inputMode="numeric"
                maxLength={6}
                placeholder="000 000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => {
                  if (
                    e.key === 'Enter' &&
                    (password.trim() || code.trim()) &&
                    !loading
                  ) {
                    e.preventDefault();
                    void handleDisable();
                  }
                }}
              />
            </div>
          </div>

          {error && (
            <div className="two-factor-modal__error" role="alert">
              <AppIcon name="info" size={16} />
              <span>{error}</span>
            </div>
          )}
        </div>

        <div className="two-factor-modal__footer">
          <CancelButton
            id="btnTwoFactorDisableCancel"
            onClick={onClose}
            disabled={loading}
            t={t}
          />
          <button
            type="button"
            id="btnTwoFactorDisableSubmit"
            className="btn btn--danger btn--with-icon"
            onClick={() => void handleDisable()}
            disabled={loading || (!password.trim() && !code.trim())}
          >
            {loading ? (
              <span className="spinner" />
            ) : (
              <AppIcon name="person_off" size={16} />
            )}
            {t('web_2fa_disable_btn')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
