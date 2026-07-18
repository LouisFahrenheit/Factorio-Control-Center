import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { AppIcon } from '../components/AppIcon';
import { MobileBottomNav, type MobileNavItem } from '../components/mobile/MobileBottomNav';
import { MobileModerationPanel } from '../components/mobile/MobileModerationPanel';
import { MobileServerCard } from '../components/mobile/MobileServerCard';
import { MobileShell } from '../components/mobile/MobileShell';
import { useAuth } from '../hooks/useAuth';
import { useInstances } from '../hooks/useInstances';
import { getLocalLanguageOverride, setLocalLanguageOverride } from '../i18n/locale';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { applyTheme, FCC_THEMES, resolveEffectiveTheme, type FccThemeId } from '../theme/themes';
import { syncThemeBackdrop } from '../theme/themeBackdrop';
import type { ProgramSettings } from '../types/programSettings';

type MobileTab = 'servers' | 'moderation' | 'settings';

export default function MobilePage() {
  const t = useT();
  const { ready, availableLanguages, panelDefaultLanguage, reload: reloadLocale } = useLocale();
  const { user, logout } = useAuth();
  const instances = useInstances(ready, t);
  const programQuery = useQuery({
    queryKey: ['program', 'settings'],
    queryFn: () => api<ProgramSettings>('/api/config/program'),
    enabled: ready,
  });
  const globalBans = programQuery.data?.sync_bans_across_instances !== false;
  const [tab, setTab] = useState<MobileTab>('servers');
  const [actionBusy, setActionBusy] = useState(false);
  const [modServerId, setModServerId] = useState('');
  const [theme, setThemeState] = useState<FccThemeId>(resolveEffectiveTheme);
  const [lang, setLang] = useState(getLocalLanguageOverride);

  useEffect(() => {
    document.body.classList.add('mobile-mode');
    return () => document.body.classList.remove('mobile-mode');
  }, []);

  useEffect(() => {
    const statuses = instances.rows.map((row) => instances.getEffectiveStatus(row) || String(row.status || 'stopped'));
    syncThemeBackdrop({
      loggedIn: true,
      instancesDashboard: true,
      panelMode: false,
      statusKind: statuses.some((s) => s === 'running')
        ? 'running'
        : statuses.some((s) => s === 'starting')
          ? 'starting'
          : 'stopped',
      serverRunning: statuses.some((s) => s === 'running'),
      instanceStatuses: statuses,
    });
  }, [instances.rows, instances.getEffectiveStatus]);

  useEffect(() => {
    if (globalBans) return;
    if (!instances.selectedId && instances.rows.length) {
      setModServerId(String(instances.rows[0]?.id || ''));
      return;
    }
    if (instances.selectedId) setModServerId(instances.selectedId);
  }, [globalBans, instances.selectedId, instances.rows]);

  const firstServerId = useMemo(
    () => String(instances.rows[0]?.id || ''),
    [instances.rows],
  );

  const banServerId = useMemo(
    () => (globalBans ? firstServerId : modServerId.trim() || firstServerId),
    [globalBans, firstServerId, modServerId],
  );

  const summary = useMemo(() => {
    const total = instances.rows.length;
    const running = instances.rows.filter((it) =>
      ['running', 'starting', 'stopping'].includes(instances.getEffectiveStatus(it)),
    ).length;
    const online = instances.rows.reduce((sum, it) => sum + (Number(it.onlineCount) || 0), 0);
    return { total, running, online };
  }, [instances.rows, instances.getEffectiveStatus]);

  function changeTheme(id: FccThemeId) {
    setThemeState(id);
    applyTheme(id, { persist: 'user' });
  }

  function languageLabel(code: string): string {
    const key = `lang_name_${code}`;
    const label = t(key);
    return label !== key ? label : code.toUpperCase();
  }

  function changeLanguage(code: string) {
    const next = String(code || '').trim().toLowerCase();
    const prev = getLocalLanguageOverride();
    setLocalLanguageOverride(next);
    setLang(next);
    if (prev !== next) void reloadLocale();
  }

  async function runAction(instanceId: string, action: 'start' | 'stop' | 'kill') {
    if (actionBusy) return;
    setActionBusy(true);
    try {
      await instances.quickAction(instanceId, action);
    } catch (e) {
      instances.handleError(e);
    } finally {
      setActionBusy(false);
    }
  }

  async function handleLogout() {
    await logout('/mobile/login');
  }

  const modEnabled = ready && tab === 'moderation' && !!banServerId && !!user;

  if (!ready || !user) return null;

  const navItems: MobileNavItem<MobileTab>[] = [
    { key: 'servers', label: t('mobile_nav_servers'), icon: 'list', badge: summary.running },
    { key: 'moderation', label: t('mobile_nav_moderation'), icon: 'users' },
    { key: 'settings', label: t('mobile_nav_settings'), icon: 'settings' },
  ];

  return (
    <>
      <MobileShell withNav>
        <div key={tab} className="mobile-view">
        {tab === 'servers' && (
          <>
            <section className="mobile-section">
              <div className="mobile-section__head mobile-section__head--overview">
                <h2 className="mobile-section__title">{t('mobile_servers_overview')}</h2>
                <div className="mobile-summary mobile-summary--compact" aria-label={t('mobile_summary_aria')}>
                  <span className="mobile-summary-chip">
                    <strong>{summary.total}</strong>
                    <span>{t('mobile_stat_total')}</span>
                  </span>
                  <span className="mobile-summary-chip mobile-summary-chip--running">
                    <strong>{summary.running}</strong>
                    <span>{t('mobile_stat_running')}</span>
                  </span>
                  <span className="mobile-summary-chip">
                    <strong>{summary.online}</strong>
                    <span>{t('mobile_stat_online')}</span>
                  </span>
                </div>
              </div>
            </section>

            <section className="mobile-section">
              <div className="mobile-section__head mobile-section__head--servers">
                <h2 className="mobile-section__title">{t('mobile_servers_title')}</h2>
                <div className="mobile-section-tools">
                  <div
                    className="instance-servers-toolbar mobile-toolbar"
                    role="toolbar"
                    aria-label={t('mobile_bulk_actions')}
                  >
                    <div className="instance-servers-toolbar__segment">
                      <button
                        type="button"
                        className="instance-servers-toolbar__btn"
                        disabled={actionBusy || !instances.rows.length}
                        title={t('mobile_start_all_btn')}
                        aria-label={t('mobile_start_all_btn')}
                        onClick={() => void instances.startAll().catch(() => {})}
                      >
                        <AppIcon name="start" size={20} />
                      </button>
                      <button
                        type="button"
                        className="instance-servers-toolbar__btn instance-servers-toolbar__btn--danger"
                        disabled={actionBusy || !instances.rows.length}
                        title={t('instances_stop_all_btn')}
                        aria-label={t('instances_stop_all_btn')}
                        onClick={() => void instances.stopAll().catch(() => {})}
                      >
                        <AppIcon name="stop" size={20} />
                      </button>
                      <button
                        type="button"
                        className="instance-servers-toolbar__btn instance-servers-toolbar__btn--danger"
                        disabled={actionBusy || !instances.rows.length}
                        title={t('instances_kill_all_btn')}
                        aria-label={t('instances_kill_all_btn')}
                        onClick={() => void instances.killAll().catch(() => {})}
                      >
                        <AppIcon name="kill" size={20} />
                      </button>
                      <button
                        type="button"
                        className="instance-servers-toolbar__btn"
                        title={t('mobile_refresh_btn')}
                        aria-label={t('mobile_refresh_btn')}
                        onClick={() => void instances.reload().catch(() => {})}
                      >
                        <AppIcon name="refresh" size={20} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="mobile-section__body">
                <div className="mobile-server-list">
                  {!instances.rows.length ? (
                    <p className="mobile-empty">{t('mobile_no_servers')}</p>
                  ) : (
                    instances.rows.map((item) => {
                      const id = String(item.id || '');
                      const status = instances.getEffectiveStatus(item);
                      return (
                        <MobileServerCard
                          key={id}
                          item={item}
                          status={status}
                          busy={actionBusy}
                          t={t}
                          onStart={() => void runAction(id, 'start')}
                          onStop={() => void runAction(id, 'stop')}
                          onKill={() => void runAction(id, 'kill')}
                        />
                      );
                    })
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {tab === 'moderation' && user && (
          <MobileModerationPanel
            enabled={modEnabled}
            user={user}
            globalBans={globalBans}
            banServerId={banServerId}
            modServerId={modServerId}
            onModServerIdChange={setModServerId}
            instances={instances}
            t={t}
          />
        )}

        {tab === 'settings' && (
          <>
            <section className="mobile-section">
              <div className="mobile-section__head">
                <h2 className="mobile-section__title">{t('mobile_account_title')}</h2>
                <span className="mobile-section__icon" aria-hidden="true">
                  <AppIcon name="settings_account" size={18} />
                </span>
              </div>
              <div className="mobile-section__body">
                <div className="mobile-account">
                  <span className="mobile-account__avatar" aria-hidden="true">
                    {String(user.username || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <div className="mobile-account__info">
                    <span className="mobile-account__name">{user.username || '—'}</span>
                    {user.role && <span className="mobile-account__role">{user.role}</span>}
                  </div>
                </div>
              </div>
            </section>

            <section className="mobile-section">
              <div className="mobile-section__head">
                <h2 className="mobile-section__title">{t('mobile_appearance_title')}</h2>
              </div>
              <div className="mobile-section__body">
                {availableLanguages.length > 0 ? (
                  <>
                    <span className="mobile-field-label">{t('program_language_label')}</span>
                    <div
                      className="mobile-lang-grid"
                      role="radiogroup"
                      aria-label={t('program_language_label')}
                    >
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!lang}
                        className={`mobile-lang-chip${!lang ? ' is-active' : ''}`}
                        onClick={() => changeLanguage('')}
                      >
                        {t('program_language_default_user')}
                        {!lang ? (
                          <span className="mobile-lang-chip__hint">
                            {languageLabel(panelDefaultLanguage)}
                          </span>
                        ) : null}
                      </button>
                      {availableLanguages.map((code) => (
                        <button
                          key={code}
                          type="button"
                          role="radio"
                          aria-checked={lang === code}
                          className={`mobile-lang-chip${lang === code ? ' is-active' : ''}`}
                          onClick={() => changeLanguage(code)}
                        >
                          {languageLabel(code)}
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
                <span className="mobile-field-label">{t('mobile_theme_label')}</span>
                <div className="mobile-theme-grid" role="radiogroup" aria-label={t('mobile_theme_label')}>
                  {FCC_THEMES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="radio"
                      aria-checked={item.id === theme}
                      className={`mobile-theme-chip${item.id === theme ? ' is-active' : ''}`}
                      data-theme={item.id}
                      onClick={() => changeTheme(item.id)}
                    >
                      <span className="mobile-theme-chip__swatch" aria-hidden="true" />
                      <span className="mobile-theme-chip__label">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </section>

            <section className="mobile-section">
              <div className="mobile-section__body mobile-section__body--list">
                <a className="mobile-list-link" href="/?desktop=1">
                  <span className="mobile-list-link__icon" aria-hidden="true">
                    <AppIcon name="open_panel" size={18} />
                  </span>
                  <span className="mobile-list-link__text">{t('mobile_open_desktop')}</span>
                  <span className="mobile-list-link__chevron" aria-hidden="true">›</span>
                </a>
                <button
                  type="button"
                  className="mobile-list-link mobile-list-link--danger"
                  onClick={() => void handleLogout()}
                >
                  <span className="mobile-list-link__icon" aria-hidden="true">
                    <AppIcon name="logout" size={18} />
                  </span>
                  <span className="mobile-list-link__text">{t('web_logout_btn')}</span>
                  <span className="mobile-list-link__chevron" aria-hidden="true">›</span>
                </button>
              </div>
            </section>
          </>
        )}
        </div>
      </MobileShell>
      <MobileBottomNav items={navItems} active={tab} onChange={setTab} />
    </>
  );
}
