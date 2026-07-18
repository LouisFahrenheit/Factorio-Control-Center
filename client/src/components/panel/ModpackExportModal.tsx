import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { ModpacksApi } from '../../hooks/useModpacks';

interface ModpackExportModalProps {
  modpacks: ModpacksApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function ModpackExportModal({ modpacks, t }: ModpackExportModalProps) {
  if (!modpacks.exportOpen) return null;

  const packName = String(modpacks.exportName || '').trim() || '—';

  return (
    <ModalBackdrop open id="modpackExportBackdrop" onClose={modpacks.closeExportDialog}>
      <div
        className="fu-modal modpack-import-dialog modpack-export-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modpackExportDlgHeading"
      >
        <div className="fu-modal__header modpack-export-dialog__header" id="modpackExportDlgHeading">
          <AppIcon name="download" size={18} className="modpack-export-dialog__header-icon" />
          <span>{t('modpack_export_dialog_title')}</span>
        </div>
        <div className="fu-modal__body modpack-export-dialog__body">
          <p className="modpack-export-dialog__hint">{t('modpack_export_dialog_hint')}</p>
          <div className="modpack-export-dialog__pack">
            <span className="modpack-export-dialog__pack-label">
              {t('modpack_import_dialog_pack_label')}
            </span>
            <span className="modpack-export-dialog__pack-name" id="modpackExportDlgName">
              {packName}
            </span>
          </div>
          {modpacks.exportHasSettings ? (
            <label id="modpackExportDlgSettingsRow" className="modpack-export-dialog__option-card">
              <input
                type="checkbox"
                id="modpackExportDlgIncludeSettings"
                checked={modpacks.exportIncludeSettings}
                onChange={(e) => modpacks.setExportIncludeSettings(e.target.checked)}
              />
              <span>{t('modpack_export_dialog_include_settings_cb')}</span>
            </label>
          ) : (
            <p className="modpack-export-dialog__note">{t('modpack_export_dialog_no_settings')}</p>
          )}
        </div>
        <div className="fu-modal__footer modpack-export-dialog__footer">
          <CancelButton id="modpackExportDlgCancel" onClick={modpacks.closeExportDialog} t={t} />
          <button
            type="button"
            className="btn btn--primary btn--with-icon"
            id="modpackExportDlgOk"
            onClick={() => void modpacks.submitExport()}
          >
            <AppIcon name="download" size={16} />
            {t('modpack_export_btn')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
