import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { FccSwitch } from '../FccSwitch';
import { ModalBackdrop } from '../modals/ModalBackdrop';

interface ModsDownloadAllModalProps {
  open: boolean;
  archiveName: string;
  localModsCount: number;
  includeDisabled: boolean;
  includeSettings: boolean;
  onIncludeDisabledChange: (checked: boolean) => void;
  onIncludeSettingsChange: (checked: boolean) => void;
  onClose: () => void;
  onConfirm: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function ModsDownloadAllModal({
  open,
  archiveName,
  localModsCount,
  includeDisabled,
  includeSettings,
  onIncludeDisabledChange,
  onIncludeSettingsChange,
  onClose,
  onConfirm,
  t,
}: ModsDownloadAllModalProps) {
  if (!open) return null;

  const nothingSelected = localModsCount === 0 && !includeSettings;

  return (
    <ModalBackdrop open id="modsDownloadAllBackdrop" onClose={onClose}>
      <div
        className="fu-modal modpack-import-dialog modpack-form-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modsDownloadAllHeading"
      >
        <div
          className="fu-modal__header modpack-form-dialog__header"
          id="modsDownloadAllHeading"
        >
          <AppIcon
            name="download"
            size={18}
            className="modpack-form-dialog__header-icon"
          />
          <span>{t('mod_list_download_all_dialog_title')}</span>
        </div>
        <div className="fu-modal__body modpack-form-dialog__body">
          <p className="modpack-form-dialog__hint">
            {t('mod_list_download_all_dialog_lead')}
          </p>
          <div className="modpack-form-dialog__stats">
            <div className="modpack-form-dialog__stat">
              <span className="modpack-form-dialog__stat-label">
                {t('mod_list_download_all_dialog_archive_label')}
              </span>
              <span
                className="modpack-form-dialog__stat-value"
                id="modsDownloadAllArchiveName"
              >
                {archiveName}
              </span>
            </div>
            <div className="modpack-form-dialog__stat">
              <span className="modpack-form-dialog__stat-label">
                {t('mod_list_download_all_dialog_count_label')}
              </span>
              <span
                className="modpack-form-dialog__stat-value"
                id="modsDownloadAllModsCount"
              >
                {localModsCount}
              </span>
            </div>
          </div>
          <div className="modpack-form-dialog__options">
            <FccSwitch
              id="modsDownloadAllIncludeDisabled"
              className="modpack-form-dialog__option-card"
              labelClassName="mods-download-all-dialog__option-label"
              checked={includeDisabled}
              onChange={onIncludeDisabledChange}
              label={t('modpack_save_dialog_include_disabled_cb')}
            />
            <FccSwitch
              id="modsDownloadAllIncludeSettings"
              className="modpack-form-dialog__option-card"
              labelClassName="mods-download-all-dialog__option-label"
              checked={includeSettings}
              onChange={onIncludeSettingsChange}
              label={t('modpack_save_dialog_include_settings_cb')}
            />
          </div>
          <div className="fcc-confirm-modal__callout">
            <ul className="fcc-confirm-modal__callout-list">
              <li>{t('mod_list_download_all_dialog_note')}</li>
            </ul>
          </div>
        </div>
        <div className="fu-modal__footer modpack-form-dialog__footer">
          <CancelButton onClick={onClose} t={t} />
          <button
            type="button"
            className="btn btn--primary btn--with-icon"
            id="btnModDownloadAllConfirm"
            disabled={nothingSelected}
            onClick={onConfirm}
          >
            <AppIcon name="download" size={16} />
            {t('mod_list_download_all_dialog_confirm')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
