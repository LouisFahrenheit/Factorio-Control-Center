import type { ServerSettingsApi } from '../../hooks/useServerSettings';
import { TabLoadingPlaceholder } from '../TabLoadingPlaceholder';
import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import { ServerSettingsForm } from './ServerSettingsForm';
import { ServerSettingsResetModal } from './ServerSettingsResetModal';

interface ServerSettingsTabProps {
  settings: ServerSettingsApi;
  canRevealSecrets?: boolean;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function ServerSettingsTab({ settings, canRevealSecrets = false, t }: ServerSettingsTabProps) {
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
            <div className="server-settings-tab__actions">
              <button
                type="button"
                className="btn btn--with-icon"
                id="btnServerSettingsReload"
                data-i18n="saves_manager_refresh"
                disabled={settings.locked || settings.loading}
                onClick={() => void settings.reload()}
              >
                <AppIcon name="refresh" size={16} />
                {t('saves_manager_refresh')}
              </button>
              <button
                type="button"
                className="btn btn--with-icon"
                id="btnServerSettingsDownload"
                data-i18n="server_settings_download_btn"
                disabled={settings.locked || settings.loading || settings.fileMissing}
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
                className="btn btn--with-icon"
                id="btnServerSettingsSave"
                data-i18n="save_btn"
                disabled={settings.locked || settings.loading || settings.fileMissing}
                onClick={() => void settings.save()}
              >
                <AppIcon name="save" size={16} />
                {t('save_btn')}
              </button>
              {!settings.fileMissing && (
                <button
                  type="button"
                  className="btn btn--with-icon"
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
          <div id="serverSettingsForm" className="server-settings-tab__body settings-form">
            {settings.loading ? (
              <TabLoadingPlaceholder variant="form" label={t('tab_data_loading')} />
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
              />
            )}
          </div>
        </div>
      </div>

      <ModalBackdrop open={settings.uploadOpen} onClose={settings.cancelUpload} id="serverSettingsUploadBackdrop">
        <div className="fu-modal" role="dialog" aria-modal="true" aria-labelledby="serverSettingsUploadHeading">
          <div className="fu-modal__header" id="serverSettingsUploadHeading" data-i18n="warning_title">
            {t('warning_title')}
          </div>
          <div className="fu-modal__body">
            <p id="serverSettingsUploadText" data-i18n="server_settings_upload_confirm">
              {t('server_settings_upload_confirm')}
            </p>
          </div>
          <div className="fu-modal__footer">
            <CancelButton onClick={settings.cancelUpload} t={t} />
            <button type="button" className="btn btn--primary" onClick={() => void settings.confirmUpload()} data-i18n="confirm">
              {t('confirm') !== 'confirm' ? t('confirm') : 'OK'}
            </button>
          </div>
        </div>
      </ModalBackdrop>

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
