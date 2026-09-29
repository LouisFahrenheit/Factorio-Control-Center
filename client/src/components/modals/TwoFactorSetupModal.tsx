import { useEffect, useState } from 'react';
import { api } from '../../api/client';
import { AppIcon } from '../AppIcon';
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
      .catch((err) => {
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
      const res = await api<{ recoveryCodes?: string[] }>('/api/auth/2fa/enable', {
        method: 'POST',
        body: JSON.stringify({ code: c }),
      });

      if (res.recoveryCodes && res.recoveryCodes.length > 0) {
        setRecoveryCodes(res.recoveryCodes);
        setStep('codes');
        onSuccess();
      } else {
        setError(t('invalid_code'));
      }
    } catch (err) {
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
      onClose={step === 'codes' ? onClose : onClose}
      id="twoFactorSetupBackdrop"
    >
      <div
        className="fu-modal two-factor-setup-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="twoFactorSetupTitle"
        style={{ maxWidth: 520 }}
      >
        <div className="fu-modal__header fu-modal__header--with-icon" id="twoFactorSetupTitle">
          <AppIcon name="person_shield" size={20} />
          {step === 'setup' ? t('web_2fa_setup_title') : t('web_2fa_setup_success_title')}
        </div>

        <div className="fu-modal__body" style={{ padding: '20px 24px' }}>
          {step === 'setup' ? (
            <div>
              <p style={{ margin: '0 0 16px', fontSize: 13, lineHeight: 1.5, color: 'var(--text-muted)' }}>
                {t('web_2fa_setup_step1')}
              </p>

              {loading && !qrDataUrl ? (
                <div style={{ textAlign: 'center', padding: '32px 0' }}>
                  <span className="spinner" />
                </div>
              ) : qrDataUrl ? (
                <div style={{ textAlign: 'center', marginBottom: 16 }}>
                  <div
                    style={{
                      display: 'inline-block',
                      background: '#ffffff',
                      padding: 10,
                      borderRadius: 8,
                      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                    }}
                  >
                    <img
                      src={qrDataUrl}
                      alt="2FA QR Code"
                      style={{ width: 180, height: 180, display: 'block' }}
                    />
                  </div>
                </div>
              ) : null}

              {secret && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    marginBottom: 20,
                  }}
                >
                  <code
                    style={{
                      fontSize: 13,
                      letterSpacing: '1.5px',
                      background: 'rgba(255,255,255,0.06)',
                      padding: '6px 12px',
                      borderRadius: 4,
                      userSelect: 'all',
                      border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
                    }}
                  >
                    {secret}
                  </code>
                  <button
                    type="button"
                    className="btn btn--subtle btn--with-icon"
                    onClick={copySecret}
                    title={secretCopied ? t('copied_to_clipboard') : t('copy_to_clipboard')}
                    style={{ padding: '6px 10px', fontSize: 12 }}
                  >
                    <AppIcon name="file_copy" size={14} />
                    {secretCopied ? t('copied') : t('copy')}
                  </button>
                </div>
              )}

              <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 500, color: 'var(--text-main)' }}>
                {t('web_2fa_setup_step2')}
              </p>

              <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
                <input
                  type="text"
                  className="input"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder={t('web_2fa_code_placeholder')}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void handleActivate();
                    }
                  }}
                  style={{
                    textAlign: 'center',
                    fontSize: 18,
                    fontWeight: 600,
                    letterSpacing: '4px',
                    flex: 1,
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={() => void handleActivate()}
                  disabled={loading || code.trim().length !== 6}
                >
                  {loading ? <span className="spinner" /> : t('web_2fa_setup_activate_btn')}
                </button>
              </div>

              {error && (
                <p style={{ color: 'var(--color-danger, #e53935)', fontSize: 13, margin: '8px 0 0' }}>
                  {error}
                </p>
              )}
            </div>
          ) : (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: 14,
                  padding: '10px 14px',
                  borderRadius: 6,
                  background: 'rgba(76, 175, 80, 0.12)',
                  border: '1px solid rgba(76, 175, 80, 0.3)',
                  color: 'var(--color-success, #4caf50)',
                }}
              >
                <AppIcon name="check" size={20} />
                <span style={{ fontSize: 14, fontWeight: 600 }}>{t('web_2fa_setup_success_title')}</span>
              </div>

              <p style={{ margin: '0 0 14px', fontSize: 13, lineHeight: 1.5, color: 'var(--text-muted)' }}>
                {t('web_2fa_recovery_codes_desc')}
              </p>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: 8,
                  background: 'rgba(0,0,0,0.25)',
                  padding: 14,
                  borderRadius: 6,
                  border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))',
                  marginBottom: 16,
                }}
              >
                {recoveryCodes.map((rc, idx) => (
                  <div
                    key={idx}
                    style={{
                      fontFamily: 'monospace',
                      fontSize: 14,
                      fontWeight: 600,
                      letterSpacing: '1px',
                      color: 'var(--text-main)',
                      textAlign: 'center',
                      padding: '4px 8px',
                      background: 'rgba(255,255,255,0.04)',
                      borderRadius: 4,
                    }}
                  >
                    {rc}
                  </div>
                ))}
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between' }}>
                <button
                  type="button"
                  className="btn btn--subtle btn--with-icon"
                  onClick={copyRecoveryCodes}
                >
                  <AppIcon name="file_copy" size={16} />
                  {copied ? t('web_2fa_recovery_codes_copied') : t('web_2fa_copy_recovery_codes')}
                </button>

                <button type="button" className="btn btn--primary" onClick={onClose}>
                  {t('close')}
                </button>
              </div>
            </div>
          )}
        </div>

        {step === 'setup' && (
          <div className="fu-modal__footer" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn--subtle" onClick={onClose}>
              {t('cancel')}
            </button>
          </div>
        )}
      </div>
    </ModalBackdrop>
  );
}
