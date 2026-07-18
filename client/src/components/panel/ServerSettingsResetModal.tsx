import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { ModalBackdrop } from '../modals/ModalBackdrop';

interface ServerSettingsResetModalProps {
  open: boolean;
  defaultPublicOff: boolean;
  applyGlobalCredentials: boolean;
  onClose: () => void;
  onConfirm: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function ServerSettingsResetModal({
  open,
  defaultPublicOff,
  applyGlobalCredentials,
  onClose,
  onConfirm,
  t,
}: ServerSettingsResetModalProps) {
  if (!open) return null;

  return (
    <ModalBackdrop open id="serverSettingsResetBackdrop" onClose={onClose}>
      <div
        className="fu-modal modpack-import-dialog modpack-form-dialog server-settings-reset-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="serverSettingsResetHeading"
      >
        <div className="fu-modal__header modpack-form-dialog__header" id="serverSettingsResetHeading">
          <AppIcon
            name="reset"
            size={18}
            className="modpack-form-dialog__header-icon server-settings-reset-dialog__header-icon"
          />
          <span>{t('reset_confirm_title')}</span>
        </div>
        <div className="fu-modal__body modpack-form-dialog__body">
          <p className="modpack-form-dialog__hint">{t('reset_confirm_lead')}</p>
          <div className="fcc-confirm-modal__callout fcc-confirm-modal__callout--danger server-settings-reset-dialog__callout">
            <ul className="fcc-confirm-modal__callout-list">
              <li>{t('reset_confirm_warn_1')}</li>
            </ul>
          </div>
          {defaultPublicOff ? (
            <div className="server-settings-reset-dialog__effect">
              <span className="server-settings-reset-dialog__effect-label">
                {t('web_panel_visibility_label')}
              </span>
              <div className="server-settings-reset-dialog__effect-row">
                <div className="panel-dashboard-flags" aria-hidden="true">
                  <span className="panel-dashboard-flag">{t('server_settings_visibility_public')}</span>
                </div>
                <span className="server-settings-reset-dialog__effect-text">
                  {t('reset_confirm_public_off_effect')}
                </span>
              </div>
            </div>
          ) : null}
          {applyGlobalCredentials ? (
            <div className="server-settings-reset-dialog__effect">
              <span className="server-settings-reset-dialog__effect-label">
                {t('program_settings_group_factorio_credentials')}
              </span>
              <div className="server-settings-reset-dialog__effect-row">
                <AppIcon
                  name="person_shield"
                  size={18}
                  className="server-settings-reset-dialog__effect-icon"
                />
                <span className="server-settings-reset-dialog__effect-text">
                  {t('reset_confirm_apply_credentials_effect')}
                </span>
              </div>
            </div>
          ) : null}
          <p className="fcc-confirm-modal__question" id="serverSettingsResetText">
            {t('reset_confirm_question')}
          </p>
        </div>
        <div className="fu-modal__footer modpack-form-dialog__footer">
          <CancelButton id="serverSettingsResetCancel" onClick={onClose} t={t} />
          <button
            type="button"
            className="btn btn--danger btn--with-icon"
            id="serverSettingsResetOk"
            onClick={onConfirm}
            data-i18n="reset_btn"
          >
            <AppIcon name="reset" size={16} />
            {t('reset_btn')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
