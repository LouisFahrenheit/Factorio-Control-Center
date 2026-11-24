import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { ModalBackdrop } from './ModalBackdrop';

interface TwoFactorSetupModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function TwoFactorSetupModal({
  open,
  onClose,
  onSuccess,
  t,
}: TwoFactorSetupModalProps) {
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'setup' | 'codes'>('setup');
  const [secret, setSecret] = useState('');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [code, setCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);
  const [secretCopied, setSecretCopied] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setStep('setup');
      setSecret('');
      setQrDataUrl('');
      setCode('');
      setRecoveryCodes([]);
      setCopied(false);
      setSecretCopied(false);
      setError('');
      return;
    }

    let active = true;
    setLoading(true);
    setError('');

    void api<{ secret?: string; qrDataUrl?: string }>('/api/auth/2fa/setup', {
      method: 'POST',
    })
      .then((res) => {
        if (!active) return;
        if (res.secret && res.qrDataUrl) {
          setSecret(res.secret);
          setQrDataUrl(res.qrDataUrl);
        } else {
          setError(t('web_error_failed_fetch'));
        }
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [open, t]);

  async function handleActivate() {
    const c = code.trim();
    if (!c) return;
    setLoading(true);
    setError('');

    try {
      const res = await api<{ recoveryCodes?: string[] }>(
        '/api/auth/2fa/enable',
        {
          method: 'POST',
          body: JSON.stringify({ code: c }),
        },
      );

      if (res.recoveryCodes && res.recoveryCodes.length > 0) {
        setRecoveryCodes(res.recoveryCodes);
        setStep('codes');
        onSuccess();
      } else {
        setError(t('invalid_code'));
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function copySecret() {
    if (!secret) return;
    void navigator.clipboard.writeText(secret);
    setSecretCopied(true);
    setTimeout(() => setSecretCopied(false), 2000);
  }

  function copyRecoveryCodes() {
    if (recoveryCodes.length === 0) return;
    const text =
      `Factorio Control Center - 2FA Recovery Codes\n` +
      `==========================================\n` +
      recoveryCodes.join('\n') +
      `\n\nKeep these codes safe. Each code can be used once.`;
    void navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <ModalBackdrop
      open={open}
      onClose={onClose}
      id="twoFactorSetupBackdrop"
      backdropClassName="fu-modal-backdrop--stacked"
      closeOnBackdropClick={false}
    >
      <div
        className="fu-modal two-factor-setup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="twoFactorSetupTitle"
      >
        <div className="mod-install-dialog__header">
          <div className="mod-install-dialog__header-main">
            <div className="mod-install-dialog__header-icon-wrap">
              <AppIcon name="person_shield" size={20} />
            </div>
            <div className="mod-install-dialog__header-titles">
              <h2
                className="mod-install-dialog__title"
                id="twoFactorSetupTitle"
              >
                {step === 'setup'
                  ? t('web_2fa_setup_title')
                  : t('web_2fa_setup_success_title')}
              </h2>
            </div>
          </div>
        </div>

        <div className="two-factor-modal__body">
          {step === 'setup' ? (
            <>
              <p className="two-factor-modal__lead">
                {t('web_2fa_setup_step1')}
              </p>

              <div className="two-factor-modal__card">
                <div className="two-factor-modal__card-body two-factor-modal__card-body--center">
                  {loading && !qrDataUrl ? (
                    <div className="two-factor-modal__loading">
                      <span className="spinner" />
                    </div>
                  ) : qrDataUrl ? (
                    <div className="two-factor-modal__qr-box">
                      <img
                        src={qrDataUrl}
                        alt="2FA QR Code"
                        className="two-factor-modal__qr-img"
                      />
                    </div>
                  ) : null}

                  {secret && (
                    <div className="two-factor-modal__secret-row">
                      <code className="two-factor-modal__secret-code">
                        {secret}
                      </code>
                      <button
                        type="button"
                        className="btn btn--subtle btn--with-icon two-factor-modal__copy-btn"
                        onClick={copySecret}
                        title={
                          secretCopied
                            ? t('copied_to_clipboard')
                            : t('copy_to_clipboard')
                        }
                      >
                        <AppIcon
                          name={secretCopied ? 'check' : 'file_copy'}
                          size={14}
                        />
                        <span>{secretCopied ? t('copied') : t('copy')}</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <div className="two-factor-modal__card">
                <div className="two-factor-modal__card-head">
                  <AppIcon
                    name="asterisk"
                    size={14}
                    className="two-factor-modal__card-head-icon"
                  />
                  <h3 className="two-factor-modal__card-title">
                    {t('web_2fa_setup_step2')}
                  </h3>
                </div>
                <div className="two-factor-modal__card-body">
                  <input
                    type="text"
                    id="twoFactorSetupCodeInput"
                    className="input two-factor-modal__code-input"
                    inputMode="numeric"
                    maxLength={6}
                    placeholder={t('web_2fa_code_placeholder')}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={(e) => {
                      if (
                        e.key === 'Enter' &&
                        code.trim().length === 6 &&
                        !loading
                      ) {
                        e.preventDefault();
                        void handleActivate();
                      }
                    }}
                    autoFocus
                  />
                </div>
              </div>

              {error && (
                <div className="two-factor-modal__error" role="alert">
                  <AppIcon name="info" size={16} />
                  <span>{error}</span>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="two-factor-modal__success-banner">
                <AppIcon
                  name="check"
                  size={20}
                  className="two-factor-modal__success-icon"
                />
                <span className="two-factor-modal__success-title">
                  {t('web_2fa_setup_success_title')}
                </span>
              </div>

              <p className="two-factor-modal__lead">
                {t('web_2fa_recovery_codes_desc')}
              </p>

              <div className="two-factor-modal__recovery-grid">
                {recoveryCodes.map((rc, idx) => (
                  <div key={idx} className="two-factor-modal__recovery-code">
                    {rc}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {step === 'setup' ? (
          <div className="two-factor-modal__footer">
            <CancelButton
              id="btnTwoFactorSetupCancel"
              onClick={onClose}
              disabled={loading}
              t={t}
            />
            <button
              type="button"
              id="btnTwoFactorSetupActivate"
              className="btn btn--primary btn--with-icon"
              onClick={() => void handleActivate()}
              disabled={loading || code.trim().length !== 6}
            >
              {loading ? (
                <span className="spinner" />
              ) : (
                <AppIcon name="check" size={16} />
              )}
              {t('web_2fa_setup_activate_btn')}
            </button>
          </div>
        ) : (
          <div className="two-factor-modal__footer two-factor-modal__footer--between">
            <button
              type="button"
              id="btnTwoFactorCopyRecovery"
              className="btn btn--subtle btn--with-icon"
              onClick={copyRecoveryCodes}
            >
              <AppIcon name={copied ? 'check' : 'file_copy'} size={16} />
              {copied
                ? t('web_2fa_recovery_codes_copied')
                : t('web_2fa_copy_recovery_codes')}
            </button>

            <button
              type="button"
              id="btnTwoFactorSetupDone"
              className="btn btn--primary btn--with-icon"
              onClick={onClose}
            >
              <AppIcon name="check" size={16} />
              {t('close')}
            </button>
          </div>
        )}
      </div>
    </ModalBackdrop>
  );
}
