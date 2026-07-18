import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { IconEye, IconEyeOff, IconLock, IconUser } from '@tabler/icons-react';
import { api, isLoginDeniedError, localizeAuthError, setToken } from '../api/client';
// Theme picker on login — temporarily hidden (restore import + block below when ready)
// import { LoginThemePicker } from '../components/LoginThemePicker';
import { clearLoginBlockers, clearShellAnimations } from '../lib/authUi';
import { syncThemeBackdrop } from '../theme/themeBackdrop';
import { markFreshLogin } from '../lib/navFlags';
import {
  fetchAppHealth,
  formatLoginHudVersion,
  playAccessGrantedAnimation,
  useLoginClock,
} from '../hooks/useLoginScreen';
import { CryoLoginSnow } from '../theme/CryoLoginSnow';
import { useEffectiveTheme } from '../theme/useEffectiveTheme';
import { useLocale, useT } from '../i18n/LocaleProvider';

export default function LoginPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const t = useT();
  const { ready } = useLocale();
  const clockRef = useLoginClock(true);
  const panelRef = useRef<HTMLElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const brandRef = useRef<HTMLDivElement>(null);
  const passRef = useRef<HTMLInputElement>(null);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passVisible, setPassVisible] = useState(false);
  const [capsOn, setCapsOn] = useState(false);
  const [authMsg, setAuthMsg] = useState('');
  const [authErr, setAuthErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loginSuccess, setLoginSuccess] = useState(false);
  const [hudStat, setHudStat] = useState<'awaiting' | 'denied' | 'granted'>('awaiting');
  const [hudVersion, setHudVersion] = useState('—');

  const hudStatText =
    hudStat === 'denied'
      ? t('web_login_access_denied')
      : hudStat === 'granted'
        ? t('web_login_access_granted')
        : t('web_login_hud_awaiting');
  const theme = useEffectiveTheme();
  const isCryo = theme === 'cryogenics';

  useEffect(() => {
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
      try {
        sessionStorage.setItem('fcc_app_reveal', '1');
      } catch {
        /* ignore */
      }
      setLoginSuccess(true);
      setHudStat('granted');
      const authReady = qc.fetchQuery({
        queryKey: ['auth', 'me'],
        queryFn: async () => {
          const j = await api<{ user?: { id?: string } | null }>('/api/auth/me');
          if (!j.user) throw new Error('Invalid token');
          return j.user;
        },
      });
      await playAccessGrantedAnimation(panelRef.current, screenRef.current, t);
      await authReady.catch(() => undefined);
      showAuthMsg(t('web_login_ok'), false);
      markFreshLogin();
      nav('/', { replace: true });
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
    <div id="loginScreen" className="login-screen" ref={screenRef}>
      <div className="login-screen__bg" aria-hidden="true">
        <span className="login-screen__bg-layer login-screen__bg-layer--shimmer" />
        <span className="login-screen__bg-layer login-screen__bg-layer--glow" />
        <span className="login-screen__bg-layer login-screen__bg-layer--drift" />
        <span className="login-screen__bg-layer login-screen__bg-layer--stars login-screen__bg-layer--stars-a" />
        <span className="login-screen__bg-layer login-screen__bg-layer--stars login-screen__bg-layer--stars-b" />
        <span className="login-screen__bg-layer login-screen__bg-layer--vignette" />
      </div>

      {/* Theme picker temporarily hidden 
      <div className="login-screen__theme-slot">
        <LoginThemePicker />
      </div>
      */}

      <article className="login-portal">
        <div className="login-portal__fx" aria-hidden="true">
          <span className="login-portal__aura" />
          <span className="login-portal__grid" />
          <span className="login-portal__scan" />
          <span className="login-portal__rim" />
        </div>

        <span className="login-screen__corner login-screen__corner--tl" aria-hidden="true" />
        <span className="login-screen__corner login-screen__corner--tr" aria-hidden="true" />
        <span className="login-screen__corner login-screen__corner--bl" aria-hidden="true" />
        <span className="login-screen__corner login-screen__corner--br" aria-hidden="true" />

        <div
          ref={brandRef}
          className={`login-screen__brand login-portal__brand${loginSuccess ? ' login-screen__brand--melting cryo-brand-heating' : ''}`}
          aria-label="Factorio Control Center"
        >
          <h1 className="login-portal__headline">
            <span className="login-screen__brand-text">
              <span className="login-screen__brand-primary">Factorio</span>
              <span className="login-screen__brand-secondary">Control Center</span>
            </span>
          </h1>
        </div>

        <section className="panel login-screen__panel login-portal__gate" ref={panelRef}>
          <h2 className="panel__title" data-i18n="web_login_title">
            {t('web_login_title')}
          </h2>
          <div className="panel__body">
            <form
              id="fccWebLoginForm"
              className="login-screen__form"
              method="get"
              action="#"
              autoComplete="on"
              noValidate
              onSubmit={onSubmit}
            >
              <div className="login-screen__fields">
                <label className="login-portal__input" htmlFor="webUser">
                  <span className="login-portal__input-icon" aria-hidden="true">
                    <IconUser size={17} stroke={1.75} />
                  </span>
                  <span className="login-portal__input-body">
                    <span className="login-portal__input-control">
                      <input
                        type="text"
                        id="webUser"
                        name="username"
                        className="login-portal__input-field"
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
                  </span>
                </label>

                <label className="login-portal__input" htmlFor="webPass">
                  <span className="login-portal__input-icon" aria-hidden="true">
                    <IconLock size={17} stroke={1.75} />
                  </span>
                  <span className="login-portal__input-body">
                    <span className="login-portal__input-control login-portal__input-control--pass">
                      <input
                        ref={passRef}
                        type={passVisible ? 'text' : 'password'}
                        id="webPass"
                        name="password"
                        className="login-portal__input-field"
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
                        className={`login-portal__input-toggle${passVisible ? ' is-on' : ''}`}
                        id="btnPassToggle"
                        aria-label={t('web_login_pass_toggle')}
                        title={t('web_login_pass_toggle')}
                        tabIndex={-1}
                        onClick={(e) => {
                          e.preventDefault();
                          togglePass();
                        }}
                      >
                        {passVisible ? (
                          <IconEyeOff size={17} stroke={1.75} aria-hidden="true" />
                        ) : (
                          <IconEye size={17} stroke={1.75} aria-hidden="true" />
                        )}
                      </button>
                    </span>
                  </span>
                </label>

                <button
                  type="submit"
                  className="login-portal__cta"
                  id="btnLogin"
                  data-i18n="web_login_btn"
                  disabled={busy}
                >
                  <span className="login-portal__cta-mark" aria-hidden="true" />
                  <span className="login-portal__cta-text">{t('web_login_btn')}</span>
                </button>
              </div>
            </form>

            <p id="capsWarn" className="login-screen__caps" hidden={!capsOn} data-i18n="web_login_caps_warning">
              {t('web_login_caps_warning')}
            </p>
          </div>
        </section>

        <p
          id="authMsg"
          className={`hint login-screen__auth-msg login-portal__msg${authErr ? ' error' : ''}`}
          aria-live="polite"
        >
          {authMsg}
        </p>

        <footer className="login-screen__hud login-portal__foot login-portal__telemetry" aria-hidden="true">
          <div className="login-portal__telemetry-head">
            <span className="login-portal__telemetry-head-tag">SYS/DIAG</span>
            <span className="login-portal__telemetry-head-line" aria-hidden="true" />
          </div>
          <div className="login-portal__telemetry-rail">
            <div className="login-portal__telemetry-slot">
              <span className="login-portal__telemetry-label" data-i18n="web_login_hud_clock">
                {t('web_login_hud_clock')}
              </span>
              <span
                className="login-portal__telemetry-value login-screen__hud-value"
                id="loginClock"
                ref={clockRef}
              >
                --:--:--
              </span>
            </div>
            <div className="login-portal__telemetry-slot">
              <span className="login-portal__telemetry-label">SYS</span>
              <span className="login-portal__telemetry-value login-screen__hud-value">FCC</span>
            </div>
            <div className="login-portal__telemetry-slot">
              <span className="login-portal__telemetry-label">VER</span>
              <span className="login-portal__telemetry-value login-screen__hud-value" id="loginHudVersion">
                {hudVersion}
              </span>
            </div>
            <div
              className={`login-portal__telemetry-slot login-portal__telemetry-slot--status login-screen__hud-cell login-screen__hud-cell--status${hudStat === 'denied' ? ' login-portal__telemetry-slot--denied' : ''}${hudStat === 'granted' ? ' login-portal__telemetry-slot--granted' : ''}`}
            >
              <span className="login-portal__telemetry-label">STAT</span>
              <span className="login-portal__telemetry-status">
                <span className="login-screen__hud-pulse" aria-hidden="true" />
                <span className="login-screen__hud-value login-screen__hud-value--accent">
                  {hudStatText}
                </span>
              </span>
            </div>
          </div>
        </footer>
      </article>

      {isCryo && (
        <CryoLoginSnow active={isCryo} screenRef={screenRef} brandRef={brandRef} melting={loginSuccess} />
      )}
    </div>
  );
}
