import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { FccSwitch } from '../FccSwitch';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { ModpacksApi } from '../../hooks/useModpacks';

interface ModpackActivateModalProps {
  modpacks: ModpacksApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function ModpackActivateModal({ modpacks, t }: ModpackActivateModalProps) {
  if (!modpacks.activateOpen) return null;

  const packName = String(modpacks.activateName || '').trim() || '—';
  const modCount = String(modpacks.activateModCount || '?').trim() || '?';

  return (
    <ModalBackdrop open id="modpackActivateBackdrop" onClose={modpacks.closeActivateDialog}>
      <div
        className="fu-modal modpack-import-dialog modpack-form-dialog modpack-activate-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modpackActivateDlgHeading"
        aria-busy={modpacks.activateSubmitting}
      >
        <div className="fu-modal__header modpack-form-dialog__header" id="modpackActivateDlgHeading">
          <AppIcon name="folder_check" size={18} className="modpack-form-dialog__header-icon modpack-activate-dialog__header-icon" />
          <span>{t('modpack_activate_confirm_title')}</span>
        </div>
        <div className="fu-modal__body modpack-form-dialog__body">
          <p className="modpack-form-dialog__hint">{t('modpack_activate_dialog_lead')}</p>
          <div className="modpack-form-dialog__pack">
            <span className="modpack-form-dialog__pack-label">
              {t('modpack_import_dialog_pack_label')}
            </span>
            <span className="modpack-form-dialog__pack-name" id="modpackActivateDlgName">
              {packName}
            </span>
            <span className="modpack-activate-dialog__pack-meta" id="modpackActivateDlgModCount">
              {t('modpack_activate_dialog_mod_count', modCount)}
            </span>
          </div>
          <div className="fcc-confirm-modal__callout fcc-confirm-modal__callout--danger modpack-activate-dialog__callout">
            <ul className="fcc-confirm-modal__callout-list">
              <li>{t('modpack_activate_dialog_warn_1')}</li>
              <li>{t('modpack_activate_dialog_warn_2')}</li>
            </ul>
          </div>
          <p className="fcc-confirm-modal__question" id="modpackActivateDlgText">
            {t('modpack_activate_dialog_question')}
          </p>
          {modpacks.installedUserModsCount > 0 ? (
            <div className="modpack-form-dialog__option-card modpack-activate-dialog__backup">
              <FccSwitch
                id="modpackActivateDlgBackup"
                className="modpack-activate-dialog__switch"
                labelClassName="modpack-activate-dialog__switch-label"
                checked={modpacks.activateBackup}
                disabled={modpacks.activateSubmitting}
                onChange={modpacks.setActivateBackup}
                label={t('modpack_activate_backup_cb')}
              />
            </div>
          ) : null}
        </div>
        <div className="fu-modal__footer modpack-form-dialog__footer">
          <CancelButton
            id="modpackActivateDlgCancel"
            disabled={modpacks.activateSubmitting}
            onClick={modpacks.closeActivateDialog}
            t={t}
          />
          <button
            type="button"
            className="btn btn--primary btn--with-icon"
            id="modpackActivateDlgOk"
            disabled={modpacks.activateSubmitting}
            onClick={() => void modpacks.submitActivate()}
          >
            <AppIcon name="folder_check" size={16} />
            {t('modpack_activate_btn')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
