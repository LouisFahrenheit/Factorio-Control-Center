import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { IconEye, IconEyeOff, IconLock, IconShieldLock, IconUser } from '@tabler/icons-react';
import { api, isLoginDeniedError, localizeAuthError, setToken } from '../api/client';
import { clearLoginBlockers, clearShellAnimations } from '../lib/authUi';
import { syncThemeBackdrop } from '../theme/themeBackdrop';
import { markFreshLogin } from '../lib/navFlags';
import { fetchAppHealth, formatLoginHudVersion, useLoginClock } from '../hooks/useLoginScreen';
import { useLocale, useT } from '../i18n/LocaleProvider';

const MOBILE_GRANT_MS = 720;

export default function MobileLoginPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const t = useT();
  const { ready, needsSetup } = useLocale();
  const clockRef = useLoginClock(true);
  const screenRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const passRef = useRef<HTMLInputElement>(null);
  const twoFactorRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passVisible, setPassVisible] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [authMsg, setAuthMsg] = useState('');
  const [authErr, setAuthErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hudStat, setHudStat] = useState<'awaiting' | 'denied' | 'granted'>('awaiting');
  const [hudVersion, setHudVersion] = useState('—');

  const [step, setStep] = useState<'credentials' | '2fa' | 'setup'>('credentials');
  const [challengeToken, setChallengeToken] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    if (needsSetup) {
      setStep('setup');
      setUsername('admin');
    }
  }, [needsSetup]);

  const hudStatText =
    hudStat === 'denied'
      ? t('web_login_access_denied')
      : hudStat === 'granted'
        ? t('web_login_access_granted')
        : t('web_login_hud_awaiting');

  useEffect(() => {
    document.body.classList.add('mobile-mode');
    clearShellAnimations();
    clearLoginBlockers();
    syncThemeBackdrop({
      loggedIn: false,
      instancesDashboard: false,
      panelMode: false,
      statusKind: 'stopped',
      serverRunning: false,
      instanceStatuses: [],
    });
    return () => document.body.classList.remove('mobile-mode');
  }, []);

  useEffect(() => {
    void fetchAppHealth().then((h) => setHudVersion(formatLoginHudVersion(h)));
  }, [ready]);

  function showAuthMsg(text: string, isErr: boolean) {
    setAuthMsg(text);
    setAuthErr(isErr);
  }

  function updateCaps(ev: KeyboardEvent<HTMLInputElement>) {
    try {
      setCapsOn(!!ev.getModifierState('CapsLock'));
    } catch {
      setCapsOn(false);
    }
  }

  async function playMobileGrantHold() {
    screenRef.current?.classList.add('mobile-login--granted');
    cardRef.current?.classList.add('mobile-login__card--granted');
    await new Promise((r) => window.setTimeout(r, MOBILE_GRANT_MS));
  }

  async function finalizeLogin(token: string) {
    setToken(token);
    qc.removeQueries({ queryKey: ['auth'] });
    qc.removeQueries({ queryKey: ['instances'] });
    setPassword('');
    setTwoFactorCode('');
    setHudStat('granted');
    const authReady = qc.fetchQuery({
      queryKey: ['auth', 'me'],
      queryFn: async () => {
        const j = await api<{ user?: { id?: string } | null }>('/api/auth/me');
        if (!j.user) throw new Error('Invalid token');
        return j.user;
      },
    });
    await playMobileGrantHold();
    await authReady.catch(() => undefined);
    markFreshLogin();
    nav('/mobile', { replace: true });
  }

  async function doLogin() {
    const u = username.trim();
    const p = password;
    if (!u || !p) {
      showAuthMsg(t('web_auth_required'), true);
      return;
    }
    setBusy(true);
    try {
      const j = await api<{
        ok?: boolean;
        error?: string;
        token?: string;
        requires2fa?: boolean;
        challengeToken?: string;
      }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: u, password: p }),
        omitBearer: true,
      });

      if (j && j.ok === false && j.error) {
        throw new Error(j.error);
      }

      if (j && j.requires2fa && j.challengeToken) {
        setChallengeToken(j.challengeToken);
        setStep('2fa');
        setTwoFactorCode('');
        setIsRecovery(false);
        showAuthMsg('', false);
        setTimeout(() => twoFactorRef.current?.focus(), 80);
        return;
      }

      const token = (j && j.token) || '';
      if (!token) throw new Error('auth_failed');
      await finalizeLogin(token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setHudStat('denied');
      if (isLoginDeniedError(msg)) {
        showAuthMsg('', false);
      } else {
        showAuthMsg(localizeAuthError(msg, t), true);
      }
    } finally {
      setBusy(false);
    }
  }

  async function doVerify2fa(codeParam?: string) {
    const code = (codeParam !== undefined ? codeParam : twoFactorCode).trim();
    if (!code) {
      showAuthMsg(t('web_auth_required'), true);
      return;
    }
    setBusy(true);
    try {
      const j = await api<{ ok?: boolean; error?: string; token?: string }>(
        '/api/auth/2fa/verify',
        {
          method: 'POST',
          body: JSON.stringify({ challengeToken, code }),
          omitBearer: true,
        },
      );
      if (j && j.ok === false && j.error) {
        throw new Error(j.error);
      }
      const token = (j && j.token) || '';
      if (!token) throw new Error('auth_failed');
      await finalizeLogin(token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setHudStat('denied');
      if (isLoginDeniedError(msg)) {
        showAuthMsg('', false);
      } else {
        showAuthMsg(localizeAuthError(msg, t), true);
      }
    } finally {
      setBusy(false);
    }
  }

  async function doSetupAdmin() {
    const u = username.trim();
    const p = password;
    const cp = confirmPassword;
    if (!u || u.length < 2) {
      showAuthMsg(t('web_setup_username_too_short'), true);
      return;
    }
    if (!p || p.length < 4) {
      showAuthMsg(t('web_setup_password_too_short'), true);
      return;
    }
    if (p !== cp) {
      showAuthMsg(t('web_setup_passwords_mismatch'), true);
      return;
    }

    setBusy(true);
    try {
      const res = await api<{ token?: string; error?: string }>('/api/auth/setup-admin', {
        method: 'POST',
        body: JSON.stringify({ username: u, password: p }),
        omitBearer: true,
      });
      if (res && res.token) {
        await finalizeLogin(res.token);
      } else {
        throw new Error(res?.error || 'setup_failed');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      showAuthMsg(localizeAuthError(msg, t), true);
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    if (step === 'setup') {
      void doSetupAdmin();
    } else if (step === '2fa') {
      void doVerify2fa();
    } else {
      void doLogin();
    }
  }

  function togglePass() {
    setPassVisible((v) => !v);
    passRef.current?.focus();
  }

  if (!ready) return null;

  return (
    <div
      id="mobileLoginScreen"
      className={`mobile-login${hudStat === 'denied' ? ' mobile-login--denied' : ''}`}
      ref={screenRef}
    >
      <div className="mobile-login__bg" aria-hidden="true">
        <span className="mobile-login__bg-shimmer" />
        <span className="mobile-login__bg-glow" />
        <span className="mobile-login__bg-vignette" />
      </div>

      <main className="mobile-login__main">
        <div className="login-screen__brand login-portal__brand mobile-login__brand" aria-label="Factorio Control Center">
          <h1 className="login-portal__headline">
            <span className="login-screen__brand-text">
              <span className="login-screen__brand-primary">Factorio</span>
              <span className="login-screen__brand-secondary">Control Center</span>
            </span>
          </h1>
        </div>

        <article className="mobile-login__card" ref={cardRef}>
          <div className="mobile-login__card-fx" aria-hidden="true">
            <span className="mobile-login__card-aura" />
            <span className="mobile-login__card-grid" />
          </div>
          <span className="mobile-login__corner mobile-login__corner--tl" aria-hidden="true" />
          <span className="mobile-login__corner mobile-login__corner--tr" aria-hidden="true" />
          <span className="mobile-login__corner mobile-login__corner--bl" aria-hidden="true" />
          <span className="mobile-login__corner mobile-login__corner--br" aria-hidden="true" />
          <span className="mobile-login__card-accent" aria-hidden="true" />

          <h2 className="mobile-login__card-title">
            {step === 'setup'
              ? t('web_setup_title')
              : step === '2fa'
                ? t('web_2fa_title')
                : t('web_login_title')}
          </h2>

          {step === 'setup' ? (
            <form className="mobile-login__form" noValidate onSubmit={onSubmit}>
              <div style={{ textAlign: 'center', marginBottom: 12 }}>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: 'rgba(255, 170, 0, 0.12)',
                    border: '1px solid rgba(255, 170, 0, 0.3)',
                    color: 'var(--accent, #e5a00d)',
                    marginBottom: 6,
                  }}
                >
                  <IconShieldLock size={20} stroke={1.8} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-muted, #aaa)', lineHeight: 1.45, whiteSpace: 'pre-line' }}>
                  {t('web_setup_subtitle')}
                </div>
              </div>

              <label className="mobile-login__field" htmlFor="mobileSetupUser">
                <span className="mobile-login__field-icon" aria-hidden="true">
                  <IconUser size={18} stroke={1.75} />
                </span>
                <span className="mobile-login__field-body">
                  <input
                    type="text"
                    id="mobileSetupUser"
                    name="username"
                    className="mobile-login__field-input"
                    autoComplete="username"
                    placeholder={t('web_setup_username_placeholder')}
                    value={username}
                    disabled={busy}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </span>
              </label>

              <label className="mobile-login__field" htmlFor="mobileSetupPass">
                <span className="mobile-login__field-icon" aria-hidden="true">
                  <IconLock size={18} stroke={1.75} />
                </span>
                <span className="mobile-login__field-body mobile-login__field-body--pass">
                  <input
                    ref={passRef}
                    type={passVisible ? 'text' : 'password'}
                    id="mobileSetupPass"
                    name="password"
                    className="mobile-login__field-input"
                    autoComplete="new-password"
                    placeholder={t('web_setup_password_placeholder')}
                    value={password}
                    disabled={busy}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={updateCaps}
                    onKeyUp={updateCaps}
                    onBlur={() => setCapsOn(false)}
                  />
                  <button
                    type="button"
                    className={`mobile-login__pass-toggle${passVisible ? ' is-on' : ''}`}
                    aria-label={t('web_login_pass_toggle')}
                    title={t('web_login_pass_toggle')}
                    tabIndex={-1}
                    onClick={(e) => {
                      e.preventDefault();
                      togglePass();
                    }}
                  >
                    {passVisible ? (
                      <IconEyeOff size={18} stroke={1.75} aria-hidden="true" />
                    ) : (
                      <IconEye size={18} stroke={1.75} aria-hidden="true" />
                    )}
                  </button>
                </span>
              </label>

              <label className="mobile-login__field" htmlFor="mobileSetupConfirmPass">
                <span className="mobile-login__field-icon" aria-hidden="true">
                  <IconLock size={18} stroke={1.75} />
                </span>
                <span className="mobile-login__field-body">
                  <input
                    type={passVisible ? 'text' : 'password'}
                    id="mobileSetupConfirmPass"
                    name="confirmPassword"
                    className="mobile-login__field-input"
                    autoComplete="new-password"
                    placeholder={t('web_setup_confirm_placeholder')}
                    value={confirmPassword}
                    disabled={busy}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    onKeyDown={updateCaps}
                    onKeyUp={updateCaps}
                    onBlur={() => setCapsOn(false)}
                  />
                </span>
              </label>

              {capsOn ? (
                <div className="mobile-login__caps" role="status" aria-live="polite">
                  {t('web_login_caps_warning')}
                </div>
              ) : null}

              {authMsg ? (
                <div
                  className={`mobile-login__msg${authErr ? ' mobile-login__msg--err' : ''}`}
                  role="status"
                  aria-live="polite"
                >
                  {authMsg}
                </div>
              ) : null}

              <button
                type="submit"
                className="mobile-login__cta"
                id="btnMobileSetupAdmin"
                disabled={busy || !username.trim() || !password}
              >
                <span className="mobile-login__cta-aura" aria-hidden="true" />
                <span className="mobile-login__cta-text">{t('web_setup_submit_btn')}</span>
              </button>
            </form>
          ) : step === 'credentials' ? (
            <form className="mobile-login__form" method="get" action="#" autoComplete="on" noValidate onSubmit={onSubmit}>
              <label className="mobile-login__field" htmlFor="mobileWebUser">
                <span className="mobile-login__field-icon" aria-hidden="true">
                  <IconUser size={18} stroke={1.75} />
                </span>
                <span className="mobile-login__field-body">
                  <input
                    type="text"
                    id="mobileWebUser"
                    name="username"
                    className="mobile-login__field-input"
                    autoComplete="username"
                    placeholder={t('web_user_label')}
                    value={username}
                    disabled={busy}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      if (hudStat === 'denied') setHudStat('awaiting');
                    }}
                    onKeyDown={(e) => {
                      updateCaps(e);
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void doLogin();
                      }
                    }}
                    onKeyUp={updateCaps}
                    onBlur={() => setCapsOn(false)}
                  />
                </span>
              </label>

              <label className="mobile-login__field" htmlFor="mobileWebPass">
                <span className="mobile-login__field-icon" aria-hidden="true">
                  <IconLock size={18} stroke={1.75} />
                </span>
                <span className="mobile-login__field-body mobile-login__field-body--pass">
                  <input
                    ref={passRef}
                    type={passVisible ? 'text' : 'password'}
                    id="mobileWebPass"
                    name="password"
                    className="mobile-login__field-input"
                    autoComplete="current-password"
                    placeholder={t('web_password_label')}
                    value={password}
                    disabled={busy}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (hudStat === 'denied') setHudStat('awaiting');
                    }}
                    onKeyDown={(e) => {
                      updateCaps(e);
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void doLogin();
                      }
                    }}
                    onKeyUp={updateCaps}
                    onBlur={() => setCapsOn(false)}
                  />
                  <button
                    type="button"
                    className={`mobile-login__field-toggle${passVisible ? ' is-on' : ''}`}
                    aria-label={t('web_login_pass_toggle')}
                    onClick={(e) => {
                      e.preventDefault();
                      togglePass();
                    }}
                  >
                    {passVisible ? (
                      <IconEyeOff size={18} stroke={1.75} aria-hidden="true" />
                    ) : (
                      <IconEye size={18} stroke={1.75} aria-hidden="true" />
                    )}
                  </button>
                </span>
              </label>

              <button type="submit" className="mobile-login__submit" disabled={busy}>
                <span className="mobile-login__submit-mark" aria-hidden="true" />
                <span>{t('web_login_btn')}</span>
              </button>
            </form>
          ) : (
            <form className="mobile-login__form" noValidate onSubmit={onSubmit}>
              <div style={{ textAlign: 'center', marginBottom: 10, fontSize: 13, color: 'var(--text-muted)' }}>
                {isRecovery ? t('web_2fa_recovery_placeholder') : t('web_2fa_prompt')}
              </div>

              <label className="mobile-login__field" htmlFor="mobileWeb2faCode">
                <span className="mobile-login__field-icon" aria-hidden="true">
                  <IconShieldLock size={18} stroke={1.75} />
                </span>
                <span className="mobile-login__field-body">
                  <input
                    ref={twoFactorRef}
                    type="text"
                    id="mobileWeb2faCode"
                    name="twoFactorCode"
                    className="mobile-login__field-input"
                    autoComplete="one-time-code"
                    placeholder={isRecovery ? t('web_2fa_recovery_placeholder') : t('web_2fa_code_placeholder')}
                    value={twoFactorCode}
                    disabled={busy}
                    maxLength={isRecovery ? 12 : 6}
                    inputMode={isRecovery ? 'text' : 'numeric'}
                    style={{
                      textAlign: 'center',
                      letterSpacing: isRecovery ? '2px' : '5px',
                      fontSize: 18,
                      fontWeight: 600,
                    }}
                    onChange={(e) => {
                      const val = isRecovery ? e.target.value : e.target.value.replace(/\D/g, '');
                      setTwoFactorCode(val);
                      if (hudStat === 'denied') setHudStat('awaiting');
                      if (!isRecovery && val.length === 6) {
                        setTimeout(() => void doVerify2fa(val), 50);
                      }
                    }}
                  />
                </span>
              </label>

              <button
                type="submit"
                className="mobile-login__submit"
                disabled={busy || !twoFactorCode.trim()}
              >
                <span className="mobile-login__submit-mark" aria-hidden="true" />
                <span>{t('web_2fa_verify_btn')}</span>
              </button>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim, #888)',
                    cursor: 'pointer',
                    fontSize: 12,
                    padding: '4px 0',
                  }}
                  onClick={() => {
                    setIsRecovery(!isRecovery);
                    setTwoFactorCode('');
                    setTimeout(() => twoFactorRef.current?.focus(), 50);
                  }}
                >
                  {isRecovery ? t('web_2fa_use_totp') : t('web_2fa_use_recovery')}
                </button>

                <button
                  type="button"
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-dim, #888)',
                    cursor: 'pointer',
                    fontSize: 12,
                    padding: '4px 0',
                  }}
                  onClick={() => {
                    setStep('credentials');
                    setTwoFactorCode('');
                    setChallengeToken('');
                    showAuthMsg('', false);
                    setTimeout(() => passRef.current?.focus(), 50);
                  }}
                >
                  {t('web_2fa_back_to_login')}
                </button>
              </div>
            </form>
          )}

          <p className="mobile-login__caps" hidden={!capsOn || step === '2fa'}>
            {t('web_login_caps_warning')}
          </p>

          {authMsg ? (
            <p className={`mobile-login__msg${authErr ? ' mobile-login__msg--error' : ''}`} aria-live="polite">
              {authMsg}
            </p>
          ) : null}
        </article>
      </main>

      <footer className="mobile-login__dock" aria-hidden="true">
        <div className="mobile-login__dock-item">
          <span className="mobile-login__dock-label">{t('web_login_hud_clock')}</span>
          <span className="mobile-login__dock-value" ref={clockRef}>
            --:--:--
          </span>
        </div>
        <div className="mobile-login__dock-item">
          <span className="mobile-login__dock-label">VER</span>
          <span className="mobile-login__dock-value">{hudVersion}</span>
        </div>
        <div
          className={`mobile-login__dock-item mobile-login__dock-item--stat${hudStat === 'denied' ? ' is-denied' : ''}${hudStat === 'granted' ? ' is-granted' : ''}`}
        >
          <span className="mobile-login__dock-label">STAT</span>
          <span className="mobile-login__dock-status">
            <span className="mobile-login__dock-pulse" aria-hidden="true" />
            <span className="mobile-login__dock-value mobile-login__dock-value--accent">{hudStatText}</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
