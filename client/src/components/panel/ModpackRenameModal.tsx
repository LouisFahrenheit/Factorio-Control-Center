import { useEffect, useRef } from 'react';
import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { ModpacksApi } from '../../hooks/useModpacks';

interface ModpackRenameModalProps {
  modpacks: ModpacksApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function ModpackRenameModal({ modpacks, t }: ModpackRenameModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!modpacks.renameOpen || modpacks.renameSubmitting) return;
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [modpacks.renameOpen, modpacks.renameSubmitting]);

  if (!modpacks.renameOpen) return null;

  const currentName = String(modpacks.renameOldName || '').trim() || '—';

  return (
    <ModalBackdrop open id="modpackRenameBackdrop" onClose={modpacks.closeRenameDialog}>
      <div
        className="fu-modal modpack-import-dialog modpack-form-dialog modpack-rename-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modpackRenameDlgHeading"
        aria-busy={modpacks.renameSubmitting}
      >
        <div className="fu-modal__header modpack-form-dialog__header" id="modpackRenameDlgHeading">
          <AppIcon name="edit" size={18} className="modpack-form-dialog__header-icon" />
          <span>{t('modpack_rename_dialog_title')}</span>
        </div>
        <div className="fu-modal__body modpack-form-dialog__body">
          <p className="modpack-form-dialog__hint">{t('modpack_rename_dialog_hint')}</p>
          <div className="modpack-form-dialog__pack">
            <span className="modpack-form-dialog__pack-label">
              {t('modpack_import_dialog_pack_label')}
            </span>
            <span className="modpack-form-dialog__pack-name" id="modpackRenameDlgCurrentName">
              {currentName}
            </span>
          </div>
          <label className="modpack-form-dialog__field-card" htmlFor="modpackRenameDlgName">
            <span className="modpack-form-dialog__field-label">{t('modpack_rename_dialog_label')}</span>
            <input
              ref={inputRef}
              type="text"
              id="modpackRenameDlgName"
              className="input"
              maxLength={80}
              autoComplete="off"
              spellCheck={false}
              value={modpacks.renameNewName}
              disabled={modpacks.renameSubmitting}
              onChange={(e) => modpacks.setRenameNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void modpacks.submitRename();
                }
              }}
            />
          </label>
          <p id="modpackRenameDlgError" className="modpack-import-dialog__error" aria-live="polite">
            {modpacks.renameError}
          </p>
        </div>
        <div className="fu-modal__footer modpack-form-dialog__footer">
          <CancelButton
            id="modpackRenameDlgCancel"
            disabled={modpacks.renameSubmitting}
            onClick={modpacks.closeRenameDialog}
            t={t}
          />
          <button
            type="button"
            className="btn btn--primary btn--with-icon"
            id="modpackRenameDlgOk"
            disabled={modpacks.renameSubmitting}
            onClick={() => void modpacks.submitRename()}
          >
            <AppIcon name="edit" size={16} />
            {t('modpack_rename_btn')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
