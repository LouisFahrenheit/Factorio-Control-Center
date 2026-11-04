import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { modals } from '@mantine/modals';
import { Navigate } from 'react-router';
import { AppLoadingShell } from '../components/AppLoadingShell';
import { AppStatusBar } from '../components/AppStatusBar';
import { AboutModal } from '../components/modals/AboutModal';
import { AppIcon } from '../components/AppIcon';
import { SearchField } from '../components/SearchField';
import { UserSettingsModal } from '../components/modals/UserSettingsModal';
import { CircuitWireConnection } from '../components/instances/CircuitWireConnection';
import { ModSettingsSectionPanel } from '../components/modsettings/ModSettingsSectionPanel';
import { useAuth, userHasTab } from '../hooks/useAuth';
import { useInstances } from '../hooks/useInstances';
import { useModSettings } from '../hooks/useModSettings';
import { usePanelStatus } from '../hooks/usePanelStatus';
import { useLocale, useT } from '../i18n/LocaleProvider';
import type { AppIconName } from '../lib/appIcons';
import { goToServers } from '../lib/goToServers';
import { hardNavigate } from '../lib/hardNavigate';
import {
  localizeModSettingsError,
  schemaProgressMessage,
  schemaProgressPercent,
  sectionLabelKey,
} from '../lib/modSettingsUtils';
import {
  MOD_SETTINGS_UI_SECTIONS,
  type ModSettingsUiSection,
} from '../types/modSettings';
import { resolveStatusKind } from '../types/panel';

const SECTION_ICONS: Record<ModSettingsUiSection, AppIconName> = {
  startup: 'autostart',
  'runtime-global': 'engineering',
};

export default function ModSettingsPage() {
  const t = useT();
  const { ready } = useLocale();
  const { user, logout } = useAuth();
  const shellRef = useRef<HTMLDivElement>(null);
  const instances = useInstances(true, t);
  const selectedId = String(instances.selectedId || '');
  const selectedInstance = useMemo(
    () => instances.rows.find((x) => String(x.id) === selectedId),
    [instances.rows, selectedId],
  );
  const [aboutOpen, setAboutOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [hintDismissed, setHintDismissed] = useState(() => {
    try {
      return localStorage.getItem('fcc_mod_settings_hint_dismissed') === '1';
    } catch {
      return false;
    }
  });

  const statusQuery = usePanelStatus(ready && !!selectedId, 'mods', selectedId);
  const status = statusQuery.data;
  const panelKind = resolveStatusKind(status);
  const serverBusy =
    panelKind === 'running' ||
    panelKind === 'starting' ||
    panelKind === 'stopping' ||
    panelKind === 'maintenance';

  const modSettings = useModSettings(
    ready && !!selectedId && userHasTab(user, 'mods'),
    serverBusy,
    t,
  );

  const goBack = useCallback(() => {
    sessionStorage.setItem('fcc_open_panel_tab', 'mods');
    hardNavigate('/panel');
  }, []);

  useEffect(() => {
    document.body.classList.remove('instance-mode');
  }, []);

  useEffect(() => {
    if (!modSettings.dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [modSettings.dirty]);

  const handleBack = useCallback(() => {
    if (!modSettings.dirty) {
      goBack();
      return;
    }
    modals.openConfirmModal({
      title: t('mod_settings_unsaved_title'),
      children: t('mod_settings_unsaved_msg'),
      labels: {
        confirm: t('mod_settings_unsaved_leave_btn'),
        cancel: t('cancel'),
      },
      confirmProps: { className: 'btn btn--danger' },
      onConfirm: () => goBack(),
    });
  }, [goBack, modSettings.dirty, t]);

  const sectionTabs = useMemo(
    () =>
      MOD_SETTINGS_UI_SECTIONS.map((section) => ({
        section,
        labelKey: sectionLabelKey(section),
        icon: SECTION_ICONS[section],
        count: modSettings.doc
          ? Object.keys(modSettings.doc.data[section] || {}).length
          : 0,
      })),
    [modSettings.doc],
  );

  const progressPct = schemaProgressPercent(modSettings.schemaProgress);
  const progressLabel = schemaProgressMessage(modSettings.schemaProgress, t);

  if (!userHasTab(user, 'mods')) {
    return <Navigate to="/panel" replace />;
  }

  if (!selectedId) {
    if (instances.loading) return <AppLoadingShell />;
    return <Navigate to="/" replace />;
  }

  return (
    <div className="app app--mod-settings" id="appShell">
      <div className="workspace">
        <AppStatusBar
          mode="panel"
          user={user}
          status={statusQuery.data}
          serverName={String(selectedInstance?.name || selectedId || '')}
          onLogout={() => void logout()}
          onServers={() => goToServers()}
          onAbout={() => setAboutOpen(true)}
          onUserSettings={() => setSettingsOpen(true)}
          t={t}
        />
        <main className="workspace__main workspace__main--panel mod-settings-page">
          <div className="mod-settings-page__shell" ref={shellRef}>
            <CircuitWireConnection
              activeTab={modSettings.activeSection}
              containerRef={shellRef}
              mainSelector="#tabModSettings"
              subSelector=".sub-tabs .sub-tabs__tab--active"
            />
            <section className="mod-settings-page__card">
              <header className="mod-settings-page__topbar">
                <button
                  type="button"
                  className="status-bar__back instance-dashboard-stat status-bar__back--nav mod-settings-page__back-btn"
                  id="btnModSettingsBack"
                  title={t('mods_btn')}
                  onClick={handleBack}
                >
                  <span className="instance-dashboard-stat__icon" aria-hidden="true">
                    <AppIcon name="arrow_back" size={16} title={t('mods_btn')} />
                  </span>
                  <div className="instance-dashboard-stat__body">
                    <span className="instance-dashboard-stat__label">
                      {t('mods_btn')}
                    </span>
                    <span className="instance-dashboard-stat__value">
                      {t('web_back')}
                    </span>
                  </div>
                </button>
                <div className="tabs mod-settings-page__header-tabs" role="tablist">
                  <button
                    type="button"
                    className="tabs__tab btn--with-icon tabs__tab--active"
                    id="tabModSettings"
                    role="tab"
                    aria-selected="true"
                  >
                    <span className="tabs__tab-inner">
                      <AppIcon name="package_settings" size={20} />
                      {t('mod_settings_editor_title')}
                    </span>
                  </button>
                </div>
              </header>

              {serverBusy || !hintDismissed ? (
                <div className="mod-settings-page__banners">
                  {serverBusy ? (
                    <p className="mod-settings-page__banner mod-settings-page__banner--warn">
                      <AppIcon name="info" size={16} />
                      <span>{t('server_running_mutate_blocked')}</span>
                    </p>
                  ) : null}
                  {!hintDismissed ? (
                    <div className="mod-settings-page__banner mod-settings-page__banner--info">
                      <AppIcon name="info" size={16} />
                      <span>{t('mod_settings_startup_required_hint')}</span>
                      <button
                        type="button"
                        className="mod-settings-page__banner-close"
                        aria-label={t('close')}
                        onClick={() => {
                          setHintDismissed(true);
                          try {
                            localStorage.setItem(
                              'fcc_mod_settings_hint_dismissed',
                              '1',
                            );
                          } catch {
                            /* ignore */
                          }
                        }}
                      >
                        <AppIcon name="close" size={14} />
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {modSettings.schemaLoading || (modSettings.loading && !modSettings.doc) ? (
                <div className="mod-settings-page__loading-state" aria-live="polite">
                  <div className="mod-settings-progress">
                    <div className="mod-settings-progress__track">
                      <div
                        className="mod-settings-progress__bar"
                        style={{
                          width:
                            progressPct == null
                              ? '100%'
                              : `${Math.max(4, progressPct)}%`,
                        }}
                      />
                    </div>
                    <p className="mod-settings-progress__label">
                      {progressLabel}
                    </p>
                  </div>
                </div>
              ) : modSettings.error ? (
                <div className="mod-settings-page__banners">
                  <p className="mod-settings-page__banner mod-settings-page__banner--error">
                    <AppIcon name="info" size={16} />
                    <span>
                      {t(
                        'mod_settings_load_error',
                        localizeModSettingsError(modSettings.error, t),
                      )}
                    </span>
                  </p>
                </div>
              ) : modSettings.doc ? (
                <div className="mod-settings-page__content">
                  <div className="mod-settings-page__toolbar">
                    <div className="mod-settings-page__filter">
                      <SearchField
                        id="inpModSettingsFilter"
                        placeholder={t('search_placeholder')}
                        autoComplete="off"
                        value={modSettings.filter}
                        onChange={(e) => modSettings.setFilter(e.target.value)}
                      />
                    </div>
                    <div className="mod-settings-page__toolbar-actions">
                      <button
                        type="button"
                        className="btn btn--with-icon"
                        id="btnModSettingsRefresh"
                        title={t('saves_manager_refresh')}
                        disabled={modSettings.loading}
                        onClick={() => void modSettings.reload(true)}
                      >
                        <AppIcon name="refresh" size={16} />
                        {t('saves_manager_refresh')}
                      </button>
                      <button
                        type="button"
                        className={
                          'btn btn--with-icon' +
                          (modSettings.dirty ? ' btn--update-available' : '')
                        }
                        id="btnModSettingsSave"
                        disabled={
                          modSettings.readOnly ||
                          modSettings.loading ||
                          modSettings.saving ||
                          !modSettings.dirty
                        }
                        onClick={() => void modSettings.save()}
                      >
                        <AppIcon name="save" size={16} />
                        {t('save_btn')}
                      </button>
                    </div>
                    <span className="mod-settings-page__toolbar-sep" aria-hidden="true" />
                    <div
                      className="sub-tabs mod-settings-page__tabs"
                      role="tablist"
                    >
                      {sectionTabs.map(({ section, labelKey, icon, count }) => (
                        <button
                          key={section}
                          type="button"
                          className={
                            'sub-tabs__tab btn--with-icon' +
                            (modSettings.activeSection === section
                              ? ' sub-tabs__tab--active'
                              : '')
                          }
                          role="tab"
                          aria-selected={modSettings.activeSection === section}
                          onClick={() => modSettings.setActiveSection(section)}
                        >
                          <AppIcon name={icon} size={16} />
                          {t(labelKey)}
                          {count > 0 ? (
                            <span className="mod-settings-page__tab-badge">
                              {count}
                            </span>
                          ) : null}
                        </button>
                      ))}
                    </div>
                    {modSettings.dirty ? (
                      <div
                        className="mod-settings-page__unsaved-widget"
                        role="status"
                        aria-live="polite"
                        title={t('mod_settings_unsaved_title')}
                      >
                        <span className="mod-settings-page__unsaved-widget-dot" aria-hidden="true" />
                        <AppIcon name="edit" size={14} />
                        <span>{t('mod_settings_unsaved_title')}</span>
                      </div>
                    ) : null}
                    {!modSettings.schemaLoading && modSettings.schemaCached ? (
                      <span
                        className="mod-settings-page__cached-badge"
                        title={t('mod_settings_schema_cached_hint')}
                      >
                        <AppIcon name="info" size={13} />
                        {t('mod_settings_schema_cached_hint')}
                      </span>
                    ) : null}
                  </div>
                  <div className="mod-settings-page__body">
                    <ModSettingsSectionPanel
                      section={modSettings.activeSection}
                      doc={modSettings.doc}
                      settingsMeta={modSettings.settingsMeta}
                      groupTitles={modSettings.groupTitles}
                      filter={modSettings.filter}
                      readOnly={modSettings.readOnly}
                      instanceId={selectedId}
                      t={t}
                      onChange={modSettings.updateEntry}
                    />
                  </div>
                </div>
              ) : null}
            </section>
          </div>
        </main>
      </div>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} t={t} />
      <UserSettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        t={t}
      />
    </div>
  );
}
