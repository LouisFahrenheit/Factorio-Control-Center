import { useState } from 'react';
import { api } from '../../api/client';
import { AppIcon } from '../AppIcon';
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

  if (!open) return null;

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
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <ModalBackdrop open={open} onClose={onClose} id="twoFactorDisableBackdrop">
      <div
        className="fu-modal two-factor-disable-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="twoFactorDisableTitle"
        style={{ maxWidth: 440 }}
      >
        <div className="fu-modal__header fu-modal__header--with-icon" id="twoFactorDisableTitle">
          <AppIcon name="person_shield" size={20} />
          {t('web_2fa_disable_title')}
        </div>

        <div className="fu-modal__body" style={{ padding: '20px 24px' }}>
          <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.5, color: 'var(--text-muted)' }}>
            {t('web_2fa_disable_confirm')}
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <label>
              <span style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-muted)' }}>
                {t('web_2fa_disable_password_placeholder')}
              </span>
              <input
                type="password"
                className="input"
                placeholder={t('web_2fa_disable_password_placeholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
              />
            </label>

            <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-dim, #777)' }}>— OR —</div>

            <label>
              <span style={{ display: 'block', fontSize: 12, marginBottom: 4, color: 'var(--text-muted)' }}>
                {t('web_2fa_disable_code_placeholder')}
              </span>
              <input
                type="text"
                className="input"
                inputMode="numeric"
                maxLength={6}
                placeholder="000 000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                style={{ textAlign: 'center', letterSpacing: '3px', fontWeight: 600 }}
              />
            </label>
          </div>

          {error && (
            <p style={{ color: 'var(--color-danger, #e53935)', fontSize: 13, margin: '12px 0 0' }}>
              {error}
            </p>
          )}
        </div>

        <div className="fu-modal__footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
          <button type="button" className="btn btn--subtle" onClick={onClose} disabled={loading}>
            {t('cancel')}
          </button>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => void handleDisable()}
            disabled={loading || (!password.trim() && !code.trim())}
          >
            {loading ? <span className="spinner" /> : t('web_2fa_disable_btn')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
