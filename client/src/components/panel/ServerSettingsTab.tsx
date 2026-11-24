import { useState } from 'react';
import type { ServerSettingsApi } from '../../hooks/useServerSettings';
import { useUserInterfaceHintsEnabled } from '../../hooks/useUserInterfaceHintsEnabled';
import { setUserInterfaceHintsEnabled } from '../../lib/userPrefs';
import { TabLoadingPlaceholder } from '../TabLoadingPlaceholder';
import { AppIcon } from '../AppIcon';
import { RefreshButton } from '../RefreshButton';
import { SearchField } from '../SearchField';
import { ServerSettingsForm } from './ServerSettingsForm';
import { ServerSettingsResetModal } from './ServerSettingsResetModal';

interface ServerSettingsTabProps {
  settings: ServerSettingsApi;
  canRevealSecrets?: boolean;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function ServerSettingsTab({
  settings,
  canRevealSecrets = false,
  t,
}: ServerSettingsTabProps) {
  const [search, setSearch] = useState('');
  const hintsEnabled = useUserInterfaceHintsEnabled();

  return (
    <>
      <div
        id="tabPanelServerSettings"
        className="tab-panel tab-panel--active server-settings-tab"
        role="tabpanel"
        aria-labelledby="tabBtnServerSettings"
      >
        <div className="server-settings-tab__layout">
          <header className="server-settings-tab__toolbar">
            <SearchField
              type="search"
              id="serverSettingsSearch"
              className="server-settings-tab__search"
              placeholder={t('search_placeholder')}
              autoComplete="off"
              spellCheck={false}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div
              className={`server-settings-tab__hint-banner${hintsEnabled ? '' : ' server-settings-tab__hint-banner--hidden'}`}
              role="note"
              title={
                hintsEnabled
                  ? t('server_settings_hover_hint_banner')
                  : undefined
              }
              aria-hidden={!hintsEnabled}
            >
              <AppIcon name="info" size={15} />
              <span className="server-settings-tab__hint-banner-text">
                {t('server_settings_hover_hint_banner')}
              </span>
              <button
                type="button"
                className="server-settings-tab__hint-banner-close"
                title={t('close')}
                aria-label={t('close')}
                onClick={() => setUserInterfaceHintsEnabled(false)}
              >
                <AppIcon name="close" size={14} />
              </button>
            </div>
            <div className="server-settings-tab__actions">
              <RefreshButton
                className="btn btn--toolbar-icon"
                id="btnServerSettingsReload"
                title={t('saves_manager_refresh')}
                aria-label={t('saves_manager_refresh')}
                disabled={settings.locked || settings.loading}
                loading={settings.loading}
                onClick={() => void settings.reload()}
              />
              <button
                type="button"
                className="btn btn--with-icon"
                id="btnServerSettingsDownload"
                data-i18n="server_settings_download_btn"
                disabled={
                  settings.locked || settings.loading || settings.fileMissing
                }
                onClick={() => void settings.download()}
              >
                <AppIcon name="download" size={16} />
                {t('server_settings_download_btn')}
              </button>
              <input
                ref={settings.uploadRef}
                type="file"
                id="inpServerSettingsUpload"
                className="input input--file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  e.target.value = '';
                  void settings.onUploadPicked(file);
                }}
              />
              <button
                type="button"
                className="btn btn--with-icon"
                id="btnServerSettingsUpload"
                data-i18n="server_settings_upload_btn"
                disabled={settings.locked || settings.loading}
                onClick={settings.pickUpload}
              >
                <AppIcon name="upload" size={16} />
                {t('server_settings_upload_btn')}
              </button>
              {settings.fileMissing && (
                <button
                  type="button"
                  className="btn"
                  id="btnServerSettingsCreate"
                  disabled={settings.locked || settings.loading}
                  onClick={() => void settings.createFromExample()}
                >
                  Create from example
                </button>
              )}
              <button
                type="button"
                className={`btn btn--with-icon${settings.isDirty ? ' btn--update-available' : ''}`}
                id="btnServerSettingsSave"
                data-i18n="save_btn"
                disabled={
                  settings.locked || settings.loading || settings.fileMissing
                }
                onClick={() => void settings.save()}
              >
                <AppIcon name="save" size={16} />
                {t('save_btn')}
              </button>
              {!settings.fileMissing && (
                <button
                  type="button"
                  className="btn btn--danger btn--with-icon"
                  id="btnServerSettingsReset"
                  data-i18n="reset_btn"
                  disabled={settings.locked || settings.loading}
                  onClick={() => settings.setResetOpen(true)}
                >
                  <AppIcon name="reset" size={16} />
                  {t('reset_btn')}
                </button>
              )}
            </div>
          </header>
          <div
            id="serverSettingsForm"
            className="server-settings-tab__body settings-form"
          >
            {settings.loading ? (
              <TabLoadingPlaceholder
                variant="form"
                label={t('tab_data_loading')}
              />
            ) : (
              <ServerSettingsForm
                data={settings.formData}
                values={settings.values}
                disabled={settings.locked}
                canRevealSecrets={canRevealSecrets}
                strings={settings.strings}
                t={t}
                onChange={settings.setField}
                onVisibilityPublicAttempt={settings.checkVisibilityPublic}
                search={search}
              />
            )}
          </div>
        </div>
      </div>

      <ServerSettingsResetModal
        open={settings.resetOpen}
        defaultPublicOff={settings.resetDefaultPublicOff}
        applyGlobalCredentials={settings.resetApplyGlobalCredentials}
        onClose={() => settings.setResetOpen(false)}
        onConfirm={() => void settings.confirmReset()}
        t={t}
      />
    </>
  );
}
