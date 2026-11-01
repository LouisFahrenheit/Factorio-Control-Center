import { useRef, useState, type ReactNode } from 'react';
import {
  IconAdjustments,
  IconArrowsExchange,
  IconFileText,
  IconRotateClockwise,
  IconPalette,
  IconKey,
  IconShieldLock,
  IconDeviceFloppy,
  IconRefresh,
  IconUpload,
  IconEye,
  IconEyeOff,
  IconAlertTriangle,
  IconWorld,
  IconTool,
  IconHistory,
  IconShieldCheck,
  IconBan,
  IconListCheck,
  IconWebhook,
  IconNetwork,
} from '@tabler/icons-react';
import { FactorioPortalUsername } from '../FactorioPortalUsername';
import { FccSwitch } from '../FccSwitch';
import { FCC_THEMES } from '../../theme/themes';
import type { ProgramSettingsApi } from '../../hooks/useProgramSettings';
import {
  TabLoadingPlaceholder,
  tabInitialLoad,
} from '../TabLoadingPlaceholder';
import { useProgramLogHistory } from '../../hooks/useProgramLogHistory';
import { ServerLogHistoryModal } from '../panel/ServerLogHistoryModal';
import { TabPanelsTransition } from '../TabPanelsTransition';
import { IntegrationsTab } from './IntegrationsTab';
import type { InstanceItem } from '../../types/instance';
import { SlidingTabIndicator } from '../SlidingTabHighlight';
import {
  useSlidingTabIndicator,
  TAB_INDICATOR_ID_ATTR,
} from '../../hooks/useSlidingTabIndicator';

export type SettingsSubTab = 'general' | 'network' | 'logs' | 'integrations';

interface InstanceSettingsTabProps {
  settings: ProgramSettingsApi;
  instances?: InstanceItem[];
  defaultSubTab?: SettingsSubTab;
  t: (key: string, ...args: (string | number)[]) => string;
}

interface SettingsCardProps {
  title: string;
  titleId?: string;
  icon?: ReactNode;
  meta?: ReactNode;
  id?: string;
  className?: string;
  children: ReactNode;
}

function SettingsCard({
  title,
  titleId,
  icon,
  meta,
  id,
  className,
  children,
}: SettingsCardProps) {
  return (
    <div
      className={'settings-card' + (className ? ' ' + className : '')}
      id={id}
      aria-labelledby={titleId}
    >
      <div className="settings-card__header">
        <span className="settings-card__title" id={titleId}>
          {icon}
          <span>{title}</span>
        </span>
        {meta ? <div className="settings-card__meta">{meta}</div> : null}
      </div>
      <div className="settings-card__body">{children}</div>
    </div>
  );
}

interface SettingsToggleRowProps {
  label: string;
  hint?: string;
  htmlFor: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

function SettingsToggleRow({
  label,
  hint,
  htmlFor,
  checked,
  disabled,
  onChange,
}: SettingsToggleRowProps) {
  return (
    <div className="settings-toggle-row">
      <label htmlFor={htmlFor} className="settings-toggle-row__content">
        <span className="settings-toggle-row__label">{label}</span>
        {hint ? (
          <span className="settings-toggle-row__hint">{hint}</span>
        ) : null}
      </label>
      <FccSwitch
        id={htmlFor}
        checked={checked}
        disabled={disabled}
        onChange={onChange}
      />
    </div>
  );
}

export function InstanceSettingsTab({
  settings,
  instances = [],
  defaultSubTab = 'general',
  t,
}: InstanceSettingsTabProps) {
  const [subTab, setSubTab] = useState<SettingsSubTab>(defaultSubTab);
  const [showGlobalToken, setShowGlobalToken] = useState(false);
  const [showTlsKeyPassword, setShowTlsKeyPassword] = useState(false);

  const s = settings.settings;
  const langs = settings.languages;
  const programLogHistory = useProgramLogHistory(t);
  const langValue = String(s.language || '')
    .trim()
    .toLowerCase();
  const langFallback = langs.includes('en') ? 'en' : langs[0] || '';
  const themeValue = String(s.theme || '').trim() || 'fcc_classic';
  const certFileRef = useRef<HTMLInputElement>(null);
  const keyFileRef = useRef<HTMLInputElement>(null);

  const subTabsNavRef = useRef<HTMLDivElement>(null);
  const subTabsIndicatorRect = useSlidingTabIndicator(subTabsNavRef, subTab);

  const bindHost =
    s.effective_public_host ||
    s.effective_listen_host ||
    (String(s.listen_host || '0.0.0.0').trim() === '0.0.0.0'
      ? '127.0.0.1'
      : String(s.listen_host || '0.0.0.0').trim()) ||
    '127.0.0.1';
  const bindPortRaw =
    s.effective_public_port ?? s.effective_listen_port ?? s.listen_port;
  const bindPort =
    typeof bindPortRaw === 'number' && Number.isFinite(bindPortRaw)
      ? bindPortRaw
      : parseInt(String(bindPortRaw ?? '8080'), 10) || 8080;
  const bindLabel = `${bindHost}:${bindPort}`;
  const isListening = Boolean(bindPort > 0 && bindHost);
  const initialLoading = tabInitialLoad(settings.loading, langs.length > 0);

  return (
    <div
      id="instanceTabSettings"
      className="sub-tab-panel sub-tab-panel--active"
      role="tabpanel"
      aria-labelledby="instanceTabSettingsBtn"
    >
      <div className="settings-tab__header">
        <div
          ref={subTabsNavRef}
          className="sub-tabs settings-tab__sub-tabs"
          role="tablist"
          aria-label={t('instances_tab_settings')}
        >
          <SlidingTabIndicator rect={subTabsIndicatorRect} variant="sub-tabs" />
          <button
            type="button"
            id="settingsSubTabGeneralBtn"
            className={
              'sub-tabs__tab btn--with-icon' +
              (subTab === 'general' ? ' sub-tabs__tab--active' : '')
            }
            role="tab"
            aria-selected={subTab === 'general'}
            {...{ [TAB_INDICATOR_ID_ATTR]: 'general' }}
            onClick={() => setSubTab('general')}
          >
            <span className="sub-tabs__tab-inner">
              <IconAdjustments size={16} />
              {t('settings_subtab_general')}
            </span>
          </button>
          <button
            type="button"
            id="settingsSubTabNetworkBtn"
            className={
              'sub-tabs__tab btn--with-icon' +
              (subTab === 'network' ? ' sub-tabs__tab--active' : '')
            }
            role="tab"
            aria-selected={subTab === 'network'}
            {...{ [TAB_INDICATOR_ID_ATTR]: 'network' }}
            onClick={() => setSubTab('network')}
          >
            <span className="sub-tabs__tab-inner">
              <IconNetwork size={16} />
              {t('settings_subtab_network')}
            </span>
          </button>
          <button
            type="button"
            id="settingsSubTabLogsBtn"
            className={
              'sub-tabs__tab btn--with-icon' +
              (subTab === 'logs' ? ' sub-tabs__tab--active' : '')
            }
            role="tab"
            aria-selected={subTab === 'logs'}
            {...{ [TAB_INDICATOR_ID_ATTR]: 'logs' }}
            onClick={() => setSubTab('logs')}
          >
            <span className="sub-tabs__tab-inner">
              <IconFileText size={16} />
              {t('settings_subtab_logs')}
            </span>
          </button>
          <button
            type="button"
            id="settingsSubTabIntegrationsBtn"
            className={
              'sub-tabs__tab btn--with-icon' +
              (subTab === 'integrations' ? ' sub-tabs__tab--active' : '')
            }
            role="tab"
            aria-selected={subTab === 'integrations'}
            {...{ [TAB_INDICATOR_ID_ATTR]: 'integrations' }}
            onClick={() => setSubTab('integrations')}
          >
            <span className="sub-tabs__tab-inner">
              <IconWebhook size={16} />
              {t('settings_subtab_integrations')}
            </span>
          </button>
        </div>
      </div>

      <TabPanelsTransition
        activeKey={subTab}
        stageClassName="tab-panels__stage"
      >
        {/* ── Tab 1: General (Основные настройки) ── */}
        {subTab === 'general' &&
          (initialLoading ? (
            <TabLoadingPlaceholder
              variant="form"
              label={t('tab_data_loading')}
            />
          ) : (
            <div
              id="settingsGeneralPanel"
              className="settings-sub-panel"
              role="tabpanel"
              aria-labelledby="settingsSubTabGeneralBtn"
            >
              <div className="settings-grid">
                {/* Left Column: Interface & Factorio Credentials */}
                <div className="settings-col">
                  {/* Card 1: Интерфейс */}
                  <SettingsCard
                    title={t('program_settings_group_interface')}
                    titleId="selectorInterfacePanel"
                    id="selectorInterfacePanelSection"
                    icon={<IconPalette size={16} />}
                  >
                    <p className="settings-card__hint">
                      {t('program_settings_group_interface_tip')}
                    </p>
                    <div className="settings-row-2col">
                      <div className="settings-field">
                        <label
                          htmlFor="selSelectorLanguage"
                          className="settings-field__label"
                        >
                          {t('program_language_label')}
                        </label>
                        <select
                          id="selSelectorLanguage"
                          className="input"
                          value={
                            langs.includes(langValue) ? langValue : langFallback
                          }
                          onChange={(e) =>
                            void settings.setLanguage(e.target.value)
                          }
                        >
                          {langs.map((code) => {
                            const labelKey = `lang_name_${code}`;
                            const label = t(labelKey);
                            return (
                              <option key={code} value={code}>
                                {label !== labelKey
                                  ? label
                                  : code.toUpperCase()}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                      <div className="settings-field">
                        <label
                          htmlFor="selSelectorTheme"
                          className="settings-field__label"
                        >
                          {t('program_theme_label')}
                        </label>
                        <select
                          id="selSelectorTheme"
                          className="input"
                          value={
                            FCC_THEMES.some((th) => th.id === themeValue)
                              ? themeValue
                              : 'fcc_classic'
                          }
                          onChange={(e) =>
                            void settings.setTheme(e.target.value)
                          }
                        >
                          {FCC_THEMES.map((th) => (
                            <option key={th.id} value={th.id}>
                              {t('ui_theme_' + th.id) || th.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </SettingsCard>

                  {/* Card 2: Данные Factorio */}
                  <SettingsCard
                    title={t('program_settings_group_factorio_credentials')}
                    titleId="selectorFactorioCredsPanel"
                    id="selectorFactorioCredsSection"
                    icon={<IconKey size={16} />}
                    meta={
                      <FactorioPortalUsername
                        username={settings.verifiedGlobalPortalUsername}
                        t={t}
                      />
                    }
                  >
                    <p className="settings-card__hint">
                      {t('program_factorio_credentials_hint')}
                    </p>
                    <div className="settings-row-2col">
                      <div className="settings-field">
                        <label
                          htmlFor="inpFactorioServiceUsername"
                          className="settings-field__label"
                        >
                          {t('program_global_username_label')}
                        </label>
                        <input
                          type="text"
                          id="inpFactorioServiceUsername"
                          name="fcc_nosave_factorio_portal_account"
                          className="input"
                          autoComplete="organization"
                          spellCheck={false}
                          value={s.global_username || ''}
                          onChange={(e) =>
                            settings.patchDraft({
                              global_username: e.target.value,
                            })
                          }
                        />
                      </div>
                      <div className="settings-field">
                        <label
                          htmlFor="inpFactorioServiceToken"
                          className="settings-field__label"
                        >
                          {t('program_global_token_label')}
                        </label>
                        <div className="settings-input-eye-wrap">
                          <input
                            type={showGlobalToken ? 'text' : 'password'}
                            id="inpFactorioServiceToken"
                            name="fcc_nosave_factorio_portal_secret"
                            className="input"
                            autoComplete="one-time-code"
                            spellCheck={false}
                            value={s.global_token || ''}
                            onChange={(e) =>
                              settings.patchDraft({
                                global_token: e.target.value,
                              })
                            }
                          />
                          <button
                            type="button"
                            className="settings-input-eye-btn"
                            onClick={() => setShowGlobalToken(!showGlobalToken)}
                            title={
                              showGlobalToken
                                ? t('web_password_reveal_hide')
                                : t('web_password_reveal_show')
                            }
                            aria-label={
                              showGlobalToken
                                ? t('web_password_reveal_hide')
                                : t('web_password_reveal_show')
                            }
                          >
                            {showGlobalToken ? (
                              <IconEyeOff size={16} />
                            ) : (
                              <IconEye size={16} />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                    <div className="settings-card__footer">
                      <FccSwitch
                        id="cbSelectorServerSettingsApplyGlobalCredentials"
                        checked={
                          s.server_settings_apply_global_credentials !== false
                        }
                        onChange={(checked) =>
                          void settings.setServerSettingsApplyGlobalCredentials(
                            checked,
                          )
                        }
                        label={t(
                          'program_server_settings_apply_global_credentials_cb',
                        )}
                      />
                      <button
                        type="button"
                        className="btn btn--with-icon"
                        id="btnSaveFactorioCredentials"
                        onClick={() => void settings.saveFactorioCredentials()}
                      >
                        <IconDeviceFloppy size={16} />
                        <span>
                          {t('program_factorio_credentials_save_btn')}
                        </span>
                      </button>
                    </div>
                    <p className="settings-card__footnote">
                      {t(
                        'program_server_settings_apply_global_credentials_tip',
                      )}
                    </p>
                  </SettingsCard>
                </div>

                {/* Right Column: Panel Rules & Server Sync */}
                <div className="settings-col">
                  {/* Card 3: Настройки панели */}
                  <SettingsCard
                    title={t('instances_settings_title')}
                    titleId="selectorSettingsPanel"
                    id="instanceSettingsPanel"
                    icon={<IconAdjustments size={16} />}
                  >
                    <SettingsToggleRow
                      label={t('program_modpack_activate_use_symlinks_cb')}
                      hint={t('program_modpack_activate_use_symlinks_tip')}
                      htmlFor="cbSelectorModpackActivateUseSymlinks"
                      checked={s.modpack_activate_use_symlinks !== false}
                      onChange={(checked) =>
                        void settings.setModpackUseSymlinks(checked)
                      }
                    />
                    <SettingsToggleRow
                      label={t('program_require_unique_game_ports_cb')}
                      hint={t('program_require_unique_game_ports_tip')}
                      htmlFor="cbSelectorRequireUniqueGamePorts"
                      checked={!!s.require_unique_instance_game_ports}
                      onChange={(checked) =>
                        void settings.setRequireUniquePorts(checked)
                      }
                    />
                    <SettingsToggleRow
                      label={t('program_server_settings_default_public_off_cb')}
                      hint={t('program_server_settings_default_public_off_tip')}
                      htmlFor="cbSelectorServerSettingsDefaultPublicOff"
                      checked={s.server_settings_default_public_off !== false}
                      onChange={(checked) =>
                        void settings.setServerSettingsDefaultPublicOff(checked)
                      }
                    />
                  </SettingsCard>

                  {/* Card 4: Синхронизация */}
                  <SettingsCard
                    title={t('program_sync_group_title')}
                    titleId="selectorSyncPanel"
                    id="selectorSyncPanelSection"
                    icon={<IconArrowsExchange size={16} />}
                  >
                    <p className="settings-card__hint">
                      {t('program_sync_group_tip')}
                    </p>
                    <div className="settings-sync-grid">
                      <div className="settings-sync-tile">
                        <label
                          htmlFor="cbSelectorSyncAdminsAcrossInstances"
                          className="settings-sync-tile__label"
                        >
                          <IconShieldCheck size={18} />
                          <span>{t('program_sync_admins_cb')}</span>
                        </label>
                        <FccSwitch
                          id="cbSelectorSyncAdminsAcrossInstances"
                          checked={!!s.sync_admins_across_instances}
                          onChange={(checked) =>
                            void settings.setSyncAdmins(checked)
                          }
                        />
                      </div>
                      <div className="settings-sync-tile">
                        <label
                          htmlFor="cbSelectorSyncBansAcrossInstances"
                          className="settings-sync-tile__label"
                        >
                          <IconBan size={18} />
                          <span>{t('program_sync_bans_cb')}</span>
                        </label>
                        <FccSwitch
                          id="cbSelectorSyncBansAcrossInstances"
                          checked={!!s.sync_bans_across_instances}
                          onChange={(checked) =>
                            void settings.setSyncBans(checked)
                          }
                        />
                      </div>
                      <div className="settings-sync-tile">
                        <label
                          htmlFor="cbSelectorSyncWhitelistAcrossInstances"
                          className="settings-sync-tile__label"
                        >
                          <IconListCheck size={18} />
                          <span>{t('program_sync_whitelist_cb')}</span>
                        </label>
                        <FccSwitch
                          id="cbSelectorSyncWhitelistAcrossInstances"
                          checked={!!s.sync_whitelist_across_instances}
                          onChange={(checked) =>
                            void settings.setSyncWhitelist(checked)
                          }
                        />
                      </div>
                    </div>
                  </SettingsCard>
                </div>
              </div>
            </div>
          ))}

        {/* ── Tab 2: Network & HTTPS (Сеть и HTTPS) ── */}
        {subTab === 'network' &&
          (initialLoading ? (
            <TabLoadingPlaceholder
              variant="form"
              label={t('tab_data_loading')}
            />
          ) : (
            <div
              id="settingsNetworkPanel"
              className="settings-sub-panel"
              role="tabpanel"
              aria-labelledby="settingsSubTabNetworkBtn"
            >
              <div className="settings-grid">
                {/* Card 1: Веб-панель и сетевые адреса */}
                <SettingsCard
                  title={t('program_settings_group_web_tls')}
                  titleId="selectorWebTlsTitle"
                  id="selectorWebTlsSection"
                  icon={<IconWorld size={16} />}
                  meta={
                    <div
                      className={`settings-bind-pill ${
                        isListening
                          ? 'settings-bind-pill--listening'
                          : 'settings-bind-pill--stopped'
                      }`}
                      aria-live="polite"
                    >
                      <span
                        className={`settings-bind-pill__dot ${
                          isListening
                            ? 'settings-bind-pill__dot--listening'
                            : 'settings-bind-pill__dot--stopped'
                        }`}
                        aria-hidden="true"
                      />
                      <span>{t('web_panel_effective_bind_label')}</span>
                      <code>{bindLabel}</code>
                    </div>
                  }
                >
                  <p className="settings-card__hint">
                    {t('program_settings_group_web_tls_tip')}
                  </p>
                  {s.is_docker && (
                    <div className="settings-docker-alert">
                      <IconAlertTriangle size={18} />
                      <span>
                        {t('program_settings_group_web_tls_docker_tip')}
                      </span>
                    </div>
                  )}

                  <SettingsToggleRow
                    label={t('web_panel_tls_enable_cb')}
                    hint={t('web_panel_tls_enable_hint')}
                    htmlFor="cbSelectorWebTlsEnabled"
                    checked={!!s.tls_enabled}
                    onChange={(checked) => settings.setTlsEnabled(checked)}
                  />

                  <div className="settings-card__section">
                    <h4 className="settings-card__section-title">
                      {t('web_panel_listen_address_section')}
                    </h4>
                    <div className="settings-row-2col">
                      <div className="settings-field">
                        <label
                          htmlFor="inpSelectorWebListenHost"
                          className="settings-field__label"
                        >
                          {t('web_panel_listen_host_label')}
                        </label>
                        <input
                          type="text"
                          id="inpSelectorWebListenHost"
                          className="input"
                          spellCheck={false}
                          value={s.listen_host || '0.0.0.0'}
                          onChange={(e) =>
                            settings.patchDraft({ listen_host: e.target.value })
                          }
                          disabled={s.is_docker}
                          title={
                            s.is_docker
                              ? t('program_settings_docker_bind_disabled')
                              : undefined
                          }
                        />
                      </div>
                      <div className="settings-field">
                        <label
                          htmlFor="inpSelectorWebListenPort"
                          className="settings-field__label"
                        >
                          {t('web_panel_listen_port_label')}
                        </label>
                        <input
                          type="number"
                          id="inpSelectorWebListenPort"
                          className="input"
                          min={1}
                          max={65535}
                          value={s.listen_port ?? 8080}
                          onChange={(e) =>
                            settings.patchDraft({
                              listen_port: parseInt(e.target.value, 10) || 8080,
                            })
                          }
                          disabled={s.is_docker}
                          title={
                            s.is_docker
                              ? t('program_settings_docker_bind_disabled')
                              : undefined
                          }
                        />
                      </div>
                    </div>
                  </div>

                  <div className="settings-card__section">
                    <h4 className="settings-card__section-title">
                      {t('web_panel_public_address_section')}
                    </h4>
                    <div className="settings-row-2col">
                      <div className="settings-field">
                        <label
                          htmlFor="inpSelectorWebPublicHost"
                          className="settings-field__label"
                        >
                          {t('web_panel_public_host_label')}
                        </label>
                        <input
                          type="text"
                          id="inpSelectorWebPublicHost"
                          className="input"
                          spellCheck={false}
                          placeholder={t('web_panel_public_host_placeholder')}
                          value={s.public_host || ''}
                          onChange={(e) =>
                            settings.patchDraft({ public_host: e.target.value })
                          }
                        />
                      </div>
                      <div className="settings-field">
                        <label
                          htmlFor="inpSelectorWebPublicPort"
                          className="settings-field__label"
                        >
                          {t('web_panel_public_port_label')}
                        </label>
                        <input
                          type="number"
                          id="inpSelectorWebPublicPort"
                          className="input"
                          min={1}
                          max={65535}
                          placeholder={t('web_panel_public_port_placeholder')}
                          value={s.public_port ?? ''}
                          onChange={(e) =>
                            settings.patchDraft({ public_port: e.target.value })
                          }
                        />
                      </div>
                    </div>
                  </div>
                </SettingsCard>

                {/* Card 2: Сертификаты TLS */}
                <SettingsCard
                  title={t('web_panel_tls_certificates_card_title')}
                  titleId="selectorWebTlsCertsTitle"
                  id="selectorWebTlsCertsSection"
                  icon={<IconShieldLock size={16} />}
                >
                  <div
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 16,
                      opacity: !s.tls_enabled ? 0.45 : 1,
                      pointerEvents: !s.tls_enabled ? 'none' : 'auto',
                      transition: 'opacity 0.2s ease',
                    }}
                  >
                    <div className="settings-row-2col">
                      <div className="settings-field">
                        <label
                          htmlFor="inpSelectorWebTlsCert"
                          className="settings-field__label"
                        >
                          {t('web_panel_tls_cert_label')}
                        </label>
                        <div className="settings-input-group">
                          <input
                            type="text"
                            id="inpSelectorWebTlsCert"
                            className="input"
                            spellCheck={false}
                            disabled={!s.tls_enabled}
                            value={s.tls_certfile || ''}
                            onChange={(e) =>
                              settings.patchDraft({
                                tls_certfile: e.target.value,
                              })
                            }
                          />
                          <button
                            type="button"
                            className="btn btn--with-icon"
                            id="btnSelectorWebTlsCertUpload"
                            disabled={!s.tls_enabled}
                            onClick={() => certFileRef.current?.click()}
                          >
                            <IconUpload size={15} />
                            <span>{t('web_panel_tls_upload_cert_btn')}</span>
                          </button>
                        </div>
                        <input
                          ref={certFileRef}
                          type="file"
                          id="inpSelectorWebTlsCertFile"
                          accept=".pem,.crt,.cer,.key,.chain,text/plain,application/x-pem-file"
                          hidden
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void settings.uploadTlsFile('cert', f);
                            e.target.value = '';
                          }}
                        />
                      </div>

                      <div className="settings-field">
                        <label
                          htmlFor="inpSelectorWebTlsKey"
                          className="settings-field__label"
                        >
                          {t('web_panel_tls_key_label')}
                        </label>
                        <div className="settings-input-group">
                          <input
                            type="text"
                            id="inpSelectorWebTlsKey"
                            className="input"
                            spellCheck={false}
                            disabled={!s.tls_enabled}
                            value={s.tls_keyfile || ''}
                            onChange={(e) =>
                              settings.patchDraft({
                                tls_keyfile: e.target.value,
                              })
                            }
                          />
                          <button
                            type="button"
                            className="btn btn--with-icon"
                            id="btnSelectorWebTlsKeyUpload"
                            disabled={!s.tls_enabled}
                            onClick={() => keyFileRef.current?.click()}
                          >
                            <IconUpload size={15} />
                            <span>{t('web_panel_tls_upload_key_btn')}</span>
                          </button>
                        </div>
                        <input
                          ref={keyFileRef}
                          type="file"
                          id="inpSelectorWebTlsKeyFile"
                          accept=".pem,.crt,.cer,.key,text/plain,application/x-pem-file"
                          hidden
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) void settings.uploadTlsFile('key', f);
                            e.target.value = '';
                          }}
                        />
                      </div>
                    </div>

                    <div className="settings-field">
                      <label
                        htmlFor="inpSelectorWebTlsKeyPassword"
                        className="settings-field__label"
                      >
                        {t('web_panel_tls_key_password_label')}
                      </label>
                      <div className="settings-input-eye-wrap">
                        <input
                          type={showTlsKeyPassword ? 'text' : 'password'}
                          id="inpSelectorWebTlsKeyPassword"
                          name="fcc_tls_key_passphrase"
                          className="input"
                          autoComplete="new-password"
                          disabled={!s.tls_enabled}
                          value={s.tls_key_password || ''}
                          onChange={(e) =>
                            settings.patchDraft({
                              tls_key_password: e.target.value,
                            })
                          }
                        />
                        <button
                          type="button"
                          className="settings-input-eye-btn"
                          disabled={!s.tls_enabled}
                          onClick={() =>
                            setShowTlsKeyPassword(!showTlsKeyPassword)
                          }
                          title={
                            showTlsKeyPassword
                              ? t('web_password_reveal_hide')
                              : t('web_password_reveal_show')
                          }
                          aria-label={
                            showTlsKeyPassword
                              ? t('web_password_reveal_hide')
                              : t('web_password_reveal_show')
                          }
                        >
                          {showTlsKeyPassword ? (
                            <IconEyeOff size={16} />
                          ) : (
                            <IconEye size={16} />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="settings-card__footer">
                    <div className="settings-card__footer-btns">
                      <button
                        type="button"
                        className="btn btn--with-icon"
                        id="btnSaveWebTlsSettings"
                        onClick={() => void settings.saveTlsSettings()}
                      >
                        <IconDeviceFloppy size={16} />
                        <span>{t('web_panel_tls_save_btn')}</span>
                      </button>
                      <button
                        type="button"
                        className="btn btn--with-icon"
                        id="btnRestartWebPanel"
                        onClick={() => settings.restartWebPanel()}
                      >
                        <IconRefresh size={16} />
                        <span>{t('web_panel_restart_btn')}</span>
                      </button>
                    </div>
                  </div>
                </SettingsCard>
              </div>
            </div>
          ))}

        {/* ── Tab 3: Logs & Rotation (Логирование) ── */}
        {subTab === 'logs' &&
          (initialLoading ? (
            <TabLoadingPlaceholder
              variant="form"
              label={t('tab_data_loading')}
            />
          ) : (
            <div
              id="settingsLogsPanel"
              className="settings-sub-panel"
              role="tabpanel"
              aria-labelledby="settingsSubTabLogsBtn"
            >
              <div className="settings-grid">
                {/* Card 1: Запись логов */}
                <SettingsCard
                  title={t('program_logs_group_title')}
                  titleId="selectorProgramLogsTitle"
                  id="selectorProgramLogsSection"
                  icon={<IconFileText size={16} />}
                >
                  <div className="settings-logs-list">
                    <SettingsToggleRow
                      label={t('program_log_write_instance_cb')}
                      hint={t('program_log_write_instance_hint')}
                      htmlFor="cbSelectorLogWriteInstance"
                      checked={s.log_write_instance !== false}
                      onChange={(checked) =>
                        void settings.setLogWriteInstance(checked)
                      }
                    />
                    <SettingsToggleRow
                      label={t('program_log_reformat_timestamps_cb')}
                      hint={t('program_log_reformat_timestamps_hint')}
                      htmlFor="cbSelectorLogReformatTimestamps"
                      checked={s.log_reformat_timestamps !== false}
                      onChange={(checked) =>
                        void settings.setLogReformatTimestamps(checked)
                      }
                    />
                    <SettingsToggleRow
                      label={t('program_log_write_web_cb')}
                      hint={t('program_log_write_web_hint')}
                      htmlFor="cbSelectorLogWriteWeb"
                      checked={!!s.log_write_web}
                      onChange={(checked) =>
                        void settings.setLogWriteWeb(checked)
                      }
                    />
                    <SettingsToggleRow
                      label={t('program_log_write_maintenance_cb')}
                      hint={t('program_log_write_maintenance_hint')}
                      htmlFor="cbSelectorLogWriteMaintenance"
                      checked={!!s.log_write_maintenance}
                      onChange={(checked) =>
                        void settings.setLogWriteMaintenance(checked)
                      }
                    />
                    <SettingsToggleRow
                      label={t('program_log_write_audit_cb')}
                      hint={t('program_log_write_audit_hint')}
                      htmlFor="cbSelectorLogWriteAudit"
                      checked={!!s.log_write_audit}
                      onChange={(checked) =>
                        void settings.setLogWriteAudit(checked)
                      }
                    />
                  </div>

                  <div className="settings-card__actions-strip">
                    <button
                      type="button"
                      className="btn btn--with-icon"
                      id="btnProgramLogWebView"
                      onClick={() => void programLogHistory.openDialog('web')}
                    >
                      <IconWorld size={15} />
                      <span>{t('program_log_web_view_btn')}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn--with-icon"
                      id="btnProgramLogMaintenanceView"
                      onClick={() =>
                        void programLogHistory.openDialog('maintenance')
                      }
                    >
                      <IconTool size={15} />
                      <span>{t('program_log_maintenance_view_btn')}</span>
                    </button>
                    <button
                      type="button"
                      className="btn btn--with-icon"
                      id="btnProgramLogAuditView"
                      onClick={() => void programLogHistory.openDialog('audit')}
                    >
                      <IconHistory size={15} />
                      <span>{t('program_log_audit_view_btn')}</span>
                    </button>
                  </div>
                </SettingsCard>
                <ServerLogHistoryModal logHistory={programLogHistory} t={t} />

                {/* Card 2: Ротация логов */}
                <SettingsCard
                  title={t('program_log_rotation_group_title')}
                  titleId="selectorLogRotationTitle"
                  id="selectorLogRotationSection"
                  icon={<IconRotateClockwise size={16} />}
                >
                  <p className="settings-card__hint">
                    {t('program_log_rotation_group_tip')}
                  </p>
                  <div className="settings-fields-row">
                    <div className="settings-field">
                      <label
                        htmlFor="inpSelectorLogRotationMaxMb"
                        className="settings-field__label"
                      >
                        {t('program_log_rotation_max_mb_label')}
                      </label>
                      <input
                        type="number"
                        id="inpSelectorLogRotationMaxMb"
                        className="input"
                        min={1}
                        max={2048}
                        value={s.log_rotation_max_mb ?? 50}
                        onChange={(e) =>
                          settings.patchDraft({
                            log_rotation_max_mb:
                              parseInt(e.target.value, 10) || 50,
                          })
                        }
                      />
                    </div>
                    <div className="settings-field">
                      <label
                        htmlFor="inpSelectorLogRotationIntervalHours"
                        className="settings-field__label"
                      >
                        {t('program_log_rotation_interval_hours_label')}
                      </label>
                      <input
                        type="number"
                        id="inpSelectorLogRotationIntervalHours"
                        className="input"
                        min={1}
                        max={8760}
                        value={s.log_rotation_interval_hours ?? 24}
                        onChange={(e) =>
                          settings.patchDraft({
                            log_rotation_interval_hours:
                              parseInt(e.target.value, 10) || 24,
                          })
                        }
                      />
                    </div>
                    <div className="settings-field">
                      <label
                        htmlFor="inpSelectorLogRotationBackupCount"
                        className="settings-field__label"
                      >
                        {t('program_log_rotation_backup_count_label')}
                      </label>
                      <input
                        type="number"
                        id="inpSelectorLogRotationBackupCount"
                        className="input"
                        min={1}
                        max={20}
                        value={s.log_rotation_backup_count ?? 3}
                        onChange={(e) =>
                          settings.patchDraft({
                            log_rotation_backup_count:
                              parseInt(e.target.value, 10) || 3,
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="settings-card__footer">
                    <div className="settings-card__footer-btns">
                      <button
                        type="button"
                        className="btn btn--with-icon"
                        id="btnSaveLogRotationSettings"
                        onClick={() => void settings.saveLogRotationSettings()}
                      >
                        <IconDeviceFloppy size={16} />
                        <span>{t('program_log_rotation_save_btn')}</span>
                      </button>
                    </div>
                  </div>
                </SettingsCard>
              </div>
            </div>
          ))}

        {/* ── Tab 4: Integrations (Интеграции) ── */}
        {subTab === 'integrations' && (
          <IntegrationsTab instances={instances} t={t} />
        )}
      </TabPanelsTransition>
    </div>
  );
}
