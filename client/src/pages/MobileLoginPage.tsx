import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { IconEye, IconEyeOff, IconLock, IconUser } from '@tabler/icons-react';
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
  const { ready } = useLocale();
  const clockRef = useLoginClock(true);
  const screenRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const passRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passVisible, setPassVisible] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [authMsg, setAuthMsg] = useState('');
  const [authErr, setAuthErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [hudStat, setHudStat] = useState<'awaiting' | 'denied' | 'granted'>('awaiting');
  const [hudVersion, setHudVersion] = useState('—');

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

  async function doLogin() {
    const u = username.trim();
    const p = password;
    if (!u || !p) {
      showAuthMsg(t('web_auth_required'), true);
      return;
    }
    setBusy(true);
    try {
      const j = await api<{ token?: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: u, password: p }),
        omitBearer: true,
      });
      const token = (j && j.token) || '';
      if (!token) throw new Error('auth_failed');
      setToken(token);
      qc.removeQueries({ queryKey: ['auth'] });
      qc.removeQueries({ queryKey: ['instances'] });
      setPassword('');
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
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (isLoginDeniedError(msg)) {
        setHudStat('denied');
        showAuthMsg('', false);
      } else {
        showAuthMsg(localizeAuthError(msg, t), true);
      }
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(ev: FormEvent) {
    ev.preventDefault();
    void doLogin();
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

          <h2 className="mobile-login__card-title">{t('web_login_title')}</h2>

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

          <p className="mobile-login__caps" hidden={!capsOn}>
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
