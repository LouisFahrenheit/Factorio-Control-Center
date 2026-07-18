import { useRef, type ReactNode } from 'react';
import { AppIcon } from '../AppIcon';
import { FactorioPortalUsername } from '../FactorioPortalUsername';
import { FccSwitch } from '../FccSwitch';
import { FCC_THEMES } from '../../theme/themes';
import type { ProgramSettingsApi } from '../../hooks/useProgramSettings';
import { TabLoadingPlaceholder, tabInitialLoad } from '../TabLoadingPlaceholder';
import { useProgramLogHistory } from '../../hooks/useProgramLogHistory';
import { ServerLogHistoryModal } from '../panel/ServerLogHistoryModal';

interface InstanceSettingsTabProps {
  settings: ProgramSettingsApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

interface SettingsTableProps {
  title: string;
  titleId: string;
  titleMeta?: ReactNode;
  sectionId?: string;
  className?: string;
  children: ReactNode;
}

function SettingsTable({ title, titleId, titleMeta, sectionId, className, children }: SettingsTableProps) {
  const sectionClass =
    'settings-table-section' + (className ? ' ' + className : '');
  return (
    <section className={sectionClass} id={sectionId} aria-labelledby={titleId}>
      <h3 id={titleId} className="settings-table-section__title">
        <span className="settings-table-section__title-text">{title}</span>
        {titleMeta ? <span className="settings-table-section__title-meta">{titleMeta}</span> : null}
      </h3>
      <table className="settings-table">
        <tbody>{children}</tbody>
      </table>
    </section>
  );
}

interface SettingsCheckRowProps {
  label: string;
  hint?: string;
  htmlFor: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

/** Компактная строка: слайдер и подпись в одной ячейке (для узкой левой колонки). */
function SettingsCheckRow({ label, hint, htmlFor, checked, onChange }: SettingsCheckRowProps) {
  return (
    <tr className="settings-table__row settings-table__row--inline-check">
      <td colSpan={2} className="settings-table__inline-cell">
        <FccSwitch
          id={htmlFor}
          className="settings-table__inline-check"
          labelClassName="settings-table__inline-check-label"
          checked={checked}
          onChange={onChange}
          label={label}
        />
        {hint ? <span className="settings-table__hint">{hint}</span> : null}
      </td>
    </tr>
  );
}

export function InstanceSettingsTab({ settings, t }: InstanceSettingsTabProps) {
  const s = settings.settings;
  const langs = settings.languages;
  const programLogHistory = useProgramLogHistory(t);
  const langValue = String(s.language || '').trim().toLowerCase();
  const langFallback = langs.includes('en') ? 'en' : langs[0] || '';
  const themeValue = String(s.theme || '').trim() || 'fcc_classic';
  const certFileRef = useRef<HTMLInputElement>(null);
  const keyFileRef = useRef<HTMLInputElement>(null);

  const bindHost =
    s.effective_public_host ||
    s.effective_listen_host ||
    (String(s.listen_host || '0.0.0.0').trim() === '0.0.0.0' ? '127.0.0.1' : String(s.listen_host || '0.0.0.0').trim()) ||
    '127.0.0.1';
  const bindPortRaw = s.effective_public_port ?? s.effective_listen_port ?? s.listen_port;
  const bindPort =
    typeof bindPortRaw === 'number' && Number.isFinite(bindPortRaw)
      ? bindPortRaw
      : parseInt(String(bindPortRaw ?? '8080'), 10) || 8080;
  const bindLabel = `${bindHost}:${bindPort}`;
  const initialLoading = tabInitialLoad(settings.loading, langs.length > 0);

  return (
    <div
      id="instanceTabSettings"
      className="sub-tab-panel sub-tab-panel--active instance-settings-tables"
      role="tabpanel"
      aria-labelledby="instanceTabSettingsBtn"
    >
      {initialLoading ? (
        <TabLoadingPlaceholder variant="form" label={t('tab_data_loading')} />
      ) : (
      <div className="instance-settings-tables__layout">
        <div className="instance-settings-tables__minor">
      <SettingsTable
        title={t('instances_settings_title')}
        titleId="selectorSettingsPanel"
        sectionId="instanceSettingsPanel"
        className="settings-table-section--compact"
      >
        <SettingsCheckRow
          label={t('program_modpack_activate_use_symlinks_cb')}
          hint={t('program_modpack_activate_use_symlinks_tip')}
          htmlFor="cbSelectorModpackActivateUseSymlinks"
          checked={s.modpack_activate_use_symlinks !== false}
          onChange={(checked) => void settings.setModpackUseSymlinks(checked)}
        />
        <SettingsCheckRow
          label={t('program_require_unique_game_ports_cb')}
          hint={t('program_require_unique_game_ports_tip')}
          htmlFor="cbSelectorRequireUniqueGamePorts"
          checked={!!s.require_unique_instance_game_ports}
          onChange={(checked) => void settings.setRequireUniquePorts(checked)}
        />
        <SettingsCheckRow
          label={t('program_server_settings_default_public_off_cb')}
          hint={t('program_server_settings_default_public_off_tip')}
          htmlFor="cbSelectorServerSettingsDefaultPublicOff"
          checked={s.server_settings_default_public_off !== false}
          onChange={(checked) => void settings.setServerSettingsDefaultPublicOff(checked)}
        />
      </SettingsTable>

          <SettingsTable title={t('program_sync_group_title')} titleId="selectorSyncPanel" className="settings-table-section--compact">
            <tr className="settings-table__row settings-table__row--footnote settings-table__row--sync-desc">
              <td colSpan={2} className="settings-table__footnote">
                {t('program_sync_group_tip')}
              </td>
            </tr>
            <tr className="settings-table__row settings-table__row--sync-inline">
              <td colSpan={2} className="settings-table__sync-inline">
                <FccSwitch
                  id="cbSelectorSyncAdminsAcrossInstances"
                  className="settings-table__sync-item settings-table__sync-item--slider"
                  labelClassName="settings-table__sync-item-label"
                  checked={!!s.sync_admins_across_instances}
                  onChange={(checked) => void settings.setSyncAdmins(checked)}
                  label={t('program_sync_admins_cb')}
                />
                <FccSwitch
                  id="cbSelectorSyncBansAcrossInstances"
                  className="settings-table__sync-item settings-table__sync-item--slider"
                  labelClassName="settings-table__sync-item-label"
                  checked={!!s.sync_bans_across_instances}
                  onChange={(checked) => void settings.setSyncBans(checked)}
                  label={t('program_sync_bans_cb')}
                />
                <FccSwitch
                  id="cbSelectorSyncWhitelistAcrossInstances"
                  className="settings-table__sync-item settings-table__sync-item--slider"
                  labelClassName="settings-table__sync-item-label"
                  checked={!!s.sync_whitelist_across_instances}
                  onChange={(checked) => void settings.setSyncWhitelist(checked)}
                  label={t('program_sync_whitelist_cb')}
                />
              </td>
            </tr>
          </SettingsTable>

          <SettingsTable
            title={t('program_logs_group_title')}
            titleId="selectorProgramLogsTitle"
            sectionId="selectorProgramLogsSection"
            className="settings-table-section--compact"
          >
            <tr className="settings-table__row settings-table__row--sync-inline">
              <td colSpan={2} className="settings-table__sync-inline">
                <FccSwitch
                  id="cbSelectorLogWriteInstance"
                  className="settings-table__sync-item settings-table__sync-item--slider"
                  labelClassName="settings-table__sync-item-label"
                  checked={s.log_write_instance !== false}
                  onChange={(checked) => void settings.setLogWriteInstance(checked)}
                  label={t('program_log_write_instance_cb')}
                />
                <FccSwitch
                  id="cbSelectorLogReformatTimestamps"
                  className="settings-table__sync-item settings-table__sync-item--slider"
                  labelClassName="settings-table__sync-item-label"
                  checked={s.log_reformat_timestamps !== false}
                  onChange={(checked) => void settings.setLogReformatTimestamps(checked)}
                  label={t('program_log_reformat_timestamps_cb')}
                />
                <FccSwitch
                  id="cbSelectorLogWriteWeb"
                  className="settings-table__sync-item settings-table__sync-item--slider"
                  labelClassName="settings-table__sync-item-label"
                  checked={!!s.log_write_web}
                  onChange={(checked) => void settings.setLogWriteWeb(checked)}
                  label={t('program_log_write_web_cb')}
                />
                <FccSwitch
                  id="cbSelectorLogWriteMaintenance"
                  className="settings-table__sync-item settings-table__sync-item--slider"
                  labelClassName="settings-table__sync-item-label"
                  checked={!!s.log_write_maintenance}
                  onChange={(checked) => void settings.setLogWriteMaintenance(checked)}
                  label={t('program_log_write_maintenance_cb')}
                />
                <FccSwitch
                  id="cbSelectorLogWriteAudit"
                  className="settings-table__sync-item settings-table__sync-item--slider"
                  labelClassName="settings-table__sync-item-label"
                  checked={!!s.log_write_audit}
                  onChange={(checked) => void settings.setLogWriteAudit(checked)}
                  label={t('program_log_write_audit_cb')}
                />
              </td>
            </tr>
            <tr className="settings-table__row settings-table__row--log-view">
              <td colSpan={2} className="settings-table__log-view-actions">
                <button
                  type="button"
                  className="btn btn--compact btn--with-icon btn--log-view-icon"
                  id="btnProgramLogWebView"
                  onClick={() => void programLogHistory.openDialog('web')}
                >
                  <AppIcon name="changelog" size={16} />
                  {t('program_log_web_view_btn')}
                </button>
                <button
                  type="button"
                  className="btn btn--compact btn--with-icon btn--log-view-icon"
                  id="btnProgramLogMaintenanceView"
                  onClick={() => void programLogHistory.openDialog('maintenance')}
                >
                  <AppIcon name="changelog" size={16} />
                  {t('program_log_maintenance_view_btn')}
                </button>
                <button
                  type="button"
                  className="btn btn--compact btn--with-icon btn--log-view-icon"
                  id="btnProgramLogAuditView"
                  onClick={() => void programLogHistory.openDialog('audit')}
                >
                  <AppIcon name="changelog" size={16} />
                  {t('program_log_audit_view_btn')}
                </button>
              </td>
            </tr>
          </SettingsTable>
          <ServerLogHistoryModal logHistory={programLogHistory} t={t} />

          <SettingsTable
            title={t('program_log_rotation_group_title')}
            titleId="selectorLogRotationTitle"
            sectionId="selectorLogRotationSection"
            className="settings-table-section--compact settings-table-section--rotation"
          >
            <tr className="settings-table__row settings-table__row--footnote settings-table__row--sync-desc">
              <td colSpan={2} className="settings-table__footnote">
                {t('program_log_rotation_group_tip')}
              </td>
            </tr>
            <tr className="settings-table__row settings-table__row--rotation-grid">
              <td colSpan={2} className="settings-table__rotation-grid">
                <div className="settings-table__interface-field settings-table__interface-field--rotation-num">
                  <label htmlFor="inpSelectorLogRotationMaxMb" className="settings-table__interface-field-label">
                    {t('program_log_rotation_max_mb_label')}
                  </label>
                  <input
                    type="number"
                    id="inpSelectorLogRotationMaxMb"
                    className="input settings-table__input settings-table__input--number"
                    min={1}
                    max={2048}
                    value={s.log_rotation_max_mb ?? 50}
                    onChange={(e) => settings.patchDraft({ log_rotation_max_mb: parseInt(e.target.value, 10) || 50 })}
                  />
                </div>
                <div className="settings-table__interface-field settings-table__interface-field--rotation-num">
                  <label htmlFor="inpSelectorLogRotationIntervalHours" className="settings-table__interface-field-label">
                    {t('program_log_rotation_interval_hours_label')}
                  </label>
                  <input
                    type="number"
                    id="inpSelectorLogRotationIntervalHours"
                    className="input settings-table__input settings-table__input--number"
                    min={1}
                    max={8760}
                    value={s.log_rotation_interval_hours ?? 24}
                    onChange={(e) =>
                      settings.patchDraft({ log_rotation_interval_hours: parseInt(e.target.value, 10) || 24 })
                    }
                  />
                </div>
                <div className="settings-table__interface-field settings-table__interface-field--rotation-num">
                  <label htmlFor="inpSelectorLogRotationBackupCount" className="settings-table__interface-field-label">
                    {t('program_log_rotation_backup_count_label')}
                  </label>
                  <input
                    type="number"
                    id="inpSelectorLogRotationBackupCount"
                    className="input settings-table__input settings-table__input--number"
                    min={1}
                    max={20}
                    value={s.log_rotation_backup_count ?? 3}
                    onChange={(e) =>
                      settings.patchDraft({ log_rotation_backup_count: parseInt(e.target.value, 10) || 3 })
                    }
                  />
                </div>
                <div className="settings-table__rotation-save">
                  <button
                    type="button"
                    className="btn btn--compact btn--with-icon"
                    id="btnSaveLogRotationSettings"
                    onClick={() => void settings.saveLogRotationSettings()}
                  >
                    <AppIcon name="save" size={16} />
                    {t('program_log_rotation_save_btn')}
                  </button>
                </div>
              </td>
            </tr>
          </SettingsTable>
        </div>

        <div className="instance-settings-tables__major">
        <SettingsTable title={t('program_settings_group_interface')} titleId="selectorInterfacePanel">
          <tr className="settings-table__row settings-table__row--footnote settings-table__row--sync-desc">
            <td colSpan={2} className="settings-table__footnote">
              {t('program_settings_group_interface_tip')}
            </td>
          </tr>
          <tr className="settings-table__row settings-table__row--interface-pair">
            <td colSpan={2} className="settings-table__interface-pair">
              <div className="settings-table__interface-field">
                <label htmlFor="selSelectorLanguage" className="settings-table__interface-field-label">
                  {t('program_language_label')}
                </label>
                <select
                  id="selSelectorLanguage"
                  className="input input--narrow settings-table__input"
                  value={langs.includes(langValue) ? langValue : langFallback}
                  onChange={(e) => void settings.setLanguage(e.target.value)}
                >
                  {langs.map((code) => {
                    const labelKey = `lang_name_${code}`;
                    const label = t(labelKey);
                    return (
                      <option key={code} value={code}>
                        {label !== labelKey ? label : code.toUpperCase()}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div className="settings-table__interface-field">
                <label htmlFor="selSelectorTheme" className="settings-table__interface-field-label">
                  {t('program_theme_label')}
                </label>
                <select
                  id="selSelectorTheme"
                  className="input input--narrow settings-table__input"
                  value={FCC_THEMES.some((th) => th.id === themeValue) ? themeValue : 'fcc_classic'}
                  onChange={(e) => void settings.setTheme(e.target.value)}
                >
                  {FCC_THEMES.map((th) => (
                    <option key={th.id} value={th.id}>
                      {t('ui_theme_' + th.id) || th.label}
                    </option>
                  ))}
                </select>
              </div>
            </td>
          </tr>
        </SettingsTable>

        <SettingsTable
          title={t('program_settings_group_factorio_credentials')}
          titleId="selectorFactorioCredsPanel"
          titleMeta={
            <FactorioPortalUsername username={settings.verifiedGlobalPortalUsername} t={t} />
          }
          sectionId="selectorFactorioCredsSection"
        >
          <tr className="settings-table__row settings-table__row--footnote settings-table__row--sync-desc">
            <td colSpan={2} className="settings-table__footnote">
              {t('program_factorio_credentials_hint')}
            </td>
          </tr>
          <tr className="settings-table__row settings-table__row--interface-pair">
            <td colSpan={2} className="settings-table__interface-pair">
              <div className="settings-table__interface-field">
                <label htmlFor="inpFactorioServiceUsername" className="settings-table__interface-field-label">
                  {t('program_global_username_label')}
                </label>
                <input
                  type="text"
                  id="inpFactorioServiceUsername"
                  name="fcc_nosave_factorio_portal_account"
                  className="input settings-table__input"
                  autoComplete="organization"
                  spellCheck={false}
                  value={s.global_username || ''}
                  onChange={(e) => settings.patchDraft({ global_username: e.target.value })}
                />
              </div>
              <div className="settings-table__interface-field">
                <label htmlFor="inpFactorioServiceToken" className="settings-table__interface-field-label">
                  {t('program_global_token_label')}
                </label>
                <input
                  type="text"
                  id="inpFactorioServiceToken"
                  name="fcc_nosave_factorio_portal_secret"
                  className="input settings-table__input factorio-credentials-token-input"
                  autoComplete="one-time-code"
                  spellCheck={false}
                  value={s.global_token || ''}
                  onChange={(e) => settings.patchDraft({ global_token: e.target.value })}
                />
              </div>
            </td>
          </tr>
          <tr className="settings-table__row settings-table__row--factorio-footer">
            <td colSpan={2} className="settings-table__factorio-footer">
              <div className="settings-table__factorio-main">
                <FccSwitch
                  id="cbSelectorServerSettingsApplyGlobalCredentials"
                  className="settings-table__sync-item settings-table__sync-item--slider"
                  labelClassName="settings-table__sync-item-label"
                  checked={s.server_settings_apply_global_credentials !== false}
                  onChange={(checked) => void settings.setServerSettingsApplyGlobalCredentials(checked)}
                  label={t('program_server_settings_apply_global_credentials_cb')}
                />
                <div className="settings-table__rotation-save">
                  <button
                    type="button"
                    className="btn btn--compact btn--with-icon"
                    id="btnSaveFactorioCredentials"
                    onClick={() => void settings.saveFactorioCredentials()}
                  >
                    <AppIcon name="save" size={16} />
                    {t('program_factorio_credentials_save_btn')}
                  </button>
                </div>
              </div>
              <span className="settings-table__factorio-check-hint">
                {t('program_server_settings_apply_global_credentials_tip')}
              </span>
            </td>
          </tr>
        </SettingsTable>

        <SettingsTable
          title={t('program_settings_group_web_tls')}
          titleId="selectorWebTlsTitle"
          sectionId="selectorWebTlsSection"
        >
          <tr className="settings-table__row settings-table__row--footnote settings-table__row--sync-desc">
            <td colSpan={2} className="settings-table__footnote">
              {t('program_settings_group_web_tls_tip')}
            </td>
          </tr>
          <tr className="settings-table__row settings-table__row--interface-pair settings-table__row--web-bind">
            <td colSpan={2} className="settings-table__interface-pair">
              <FccSwitch
                id="cbSelectorWebTlsEnabled"
                className="settings-table__sync-item settings-table__sync-item--slider"
                labelClassName="settings-table__sync-item-label"
                checked={!!s.tls_enabled}
                onChange={(checked) => settings.setTlsEnabled(checked)}
                label={t('web_panel_tls_enable_cb')}
              />
              <div className="settings-table__interface-field settings-table__interface-field--host-narrow">
                <label htmlFor="inpSelectorWebListenHost" className="settings-table__interface-field-label">
                  {t('web_panel_listen_host_label')}
                </label>
                <input
                  type="text"
                  id="inpSelectorWebListenHost"
                  className="input settings-table__input"
                  spellCheck={false}
                  value={s.listen_host || '0.0.0.0'}
                  onChange={(e) => settings.patchDraft({ listen_host: e.target.value })}
                />
              </div>
              <div className="settings-table__interface-field settings-table__interface-field--port-narrow">
                <label htmlFor="inpSelectorWebListenPort" className="settings-table__interface-field-label">
                  {t('web_panel_listen_port_label')}
                </label>
                <input
                  type="number"
                  id="inpSelectorWebListenPort"
                  className="input settings-table__input settings-table__input--number"
                  min={1}
                  max={65535}
                  value={s.listen_port ?? 8080}
                  onChange={(e) => settings.patchDraft({ listen_port: parseInt(e.target.value, 10) || 8080 })}
                />
              </div>
              <div className="settings-table__web-bind-status" aria-live="polite">
                <span className="settings-table__web-bind-sep" aria-hidden="true">
                  |
                </span>
                <span className="settings-table__web-bind-status-label">
                  {t('web_panel_effective_bind_label')}
                </span>
                <code className="fcc-settings-bind-code">{bindLabel}</code>
              </div>
            </td>
          </tr>
          <tr className="settings-table__row settings-table__row--interface-pair settings-table__row--web-public">
            <td colSpan={2} className="settings-table__interface-pair">
              <div className="settings-table__interface-field settings-table__interface-field--host-narrow">
                <label htmlFor="inpSelectorWebPublicHost" className="settings-table__interface-field-label">
                  {t('web_panel_public_host_label')}
                </label>
                <input
                  type="text"
                  id="inpSelectorWebPublicHost"
                  className="input settings-table__input"
                  spellCheck={false}
                  placeholder={t('web_panel_public_host_placeholder')}
                  value={s.public_host || ''}
                  onChange={(e) => settings.patchDraft({ public_host: e.target.value })}
                />
              </div>
              <div className="settings-table__interface-field settings-table__interface-field--port-narrow">
                <label htmlFor="inpSelectorWebPublicPort" className="settings-table__interface-field-label">
                  {t('web_panel_public_port_label')}
                </label>
                <input
                  type="number"
                  id="inpSelectorWebPublicPort"
                  className="input settings-table__input settings-table__input--number"
                  min={1}
                  max={65535}
                  placeholder={t('web_panel_public_port_placeholder')}
                  value={s.public_port ?? ''}
                  onChange={(e) => settings.patchDraft({ public_port: e.target.value })}
                />
              </div>
            </td>
          </tr>
          <tr
            className={
              'settings-table__row settings-table__row--interface-pair settings-table__row--tls-creds' +
              (!s.tls_enabled ? ' settings-table__row--disabled' : '')
            }
          >
            <td colSpan={2} className="settings-table__interface-pair">
              <div className="settings-table__interface-field">
                <label htmlFor="inpSelectorWebTlsCert" className="settings-table__interface-field-label">
                  {t('web_panel_tls_cert_label')}
                </label>
                <div className="settings-table__control-stack">
                  <input
                    type="text"
                    id="inpSelectorWebTlsCert"
                    className="input settings-table__input"
                    spellCheck={false}
                    disabled={!s.tls_enabled}
                    value={s.tls_certfile || ''}
                    onChange={(e) => settings.patchDraft({ tls_certfile: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn btn--compact btn--with-icon"
                    id="btnSelectorWebTlsCertUpload"
                    disabled={!s.tls_enabled}
                    onClick={() => certFileRef.current?.click()}
                  >
                    <AppIcon name="upload" size={16} />
                    {t('web_panel_tls_upload_cert_btn')}
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
              <div className="settings-table__interface-field">
                <label htmlFor="inpSelectorWebTlsKey" className="settings-table__interface-field-label">
                  {t('web_panel_tls_key_label')}
                </label>
                <div className="settings-table__control-stack">
                  <input
                    type="text"
                    id="inpSelectorWebTlsKey"
                    className="input settings-table__input"
                    spellCheck={false}
                    disabled={!s.tls_enabled}
                    value={s.tls_keyfile || ''}
                    onChange={(e) => settings.patchDraft({ tls_keyfile: e.target.value })}
                  />
                  <button
                    type="button"
                    className="btn btn--compact btn--with-icon"
                    id="btnSelectorWebTlsKeyUpload"
                    disabled={!s.tls_enabled}
                    onClick={() => keyFileRef.current?.click()}
                  >
                    <AppIcon name="upload" size={16} />
                    {t('web_panel_tls_upload_key_btn')}
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
            </td>
          </tr>
          <tr className="settings-table__row settings-table__row--interface-pair settings-table__row--web-actions">
            <td colSpan={2} className="settings-table__interface-pair">
              <div
                className={
                  'settings-table__interface-field' + (!s.tls_enabled ? ' settings-table__interface-field--disabled' : '')
                }
              >
                <label htmlFor="inpSelectorWebTlsKeyPassword" className="settings-table__interface-field-label">
                  {t('web_panel_tls_key_password_label')}
                </label>
                <input
                  type="password"
                  id="inpSelectorWebTlsKeyPassword"
                  name="fcc_tls_key_passphrase"
                  className="input settings-table__input"
                  autoComplete="new-password"
                  disabled={!s.tls_enabled}
                  value={s.tls_key_password || ''}
                  onChange={(e) => settings.patchDraft({ tls_key_password: e.target.value })}
                />
              </div>
              <div className="settings-table__rotation-save">
                <button
                  type="button"
                  className="btn btn--compact btn--with-icon"
                  id="btnSaveWebTlsSettings"
                  onClick={() => void settings.saveTlsSettings()}
                >
                  <AppIcon name="save" size={16} />
                  {t('web_panel_tls_save_btn')}
                </button>
                <button
                  type="button"
                  className="btn btn--compact btn--with-icon"
                  id="btnRestartWebPanel"
                  onClick={() => settings.restartWebPanel()}
                >
                  <AppIcon name="restart" size={16} />
                  {t('web_panel_restart_btn')}
                </button>
              </div>
            </td>
          </tr>
        </SettingsTable>
        </div>
      </div>
      )}
    </div>
  );
}
