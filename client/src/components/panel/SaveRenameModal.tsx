import { useEffect, useRef } from 'react';
import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { SavesApi } from '../../hooks/useSaves';
import { saveDisplayLabel } from '../../lib/saveUtils';

interface SaveRenameModalProps {
  saves: SavesApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function SaveRenameModal({ saves, t }: SaveRenameModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!saves.renameOpen || saves.renameSubmitting) return;
    const id = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(id);
  }, [saves.renameOpen, saves.renameSubmitting]);

  if (!saves.renameOpen) return null;

  const currentName = saveDisplayLabel(saves.renameOldName) || '—';

  return (
    <ModalBackdrop open id="saveRenameBackdrop" onClose={saves.closeRenameDialog}>
      <div
        className="fu-modal modpack-import-dialog modpack-form-dialog modpack-rename-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="saveRenameDlgHeading"
        aria-busy={saves.renameSubmitting}
      >
        <div className="fu-modal__header modpack-form-dialog__header" id="saveRenameDlgHeading">
          <AppIcon name="edit" size={18} className="modpack-form-dialog__header-icon" />
          <span>{t('saves_manager_rename_title')}</span>
        </div>
        <div className="fu-modal__body modpack-form-dialog__body">
          <p className="modpack-form-dialog__hint">{t('saves_manager_rename_hint')}</p>
          <div className="modpack-form-dialog__pack">
            <span className="modpack-form-dialog__pack-label">
              {t('saves_manager_rename_current_label')}
            </span>
            <span className="modpack-form-dialog__pack-name" id="saveRenameDlgCurrentName">
              {currentName}
            </span>
          </div>
          <label className="modpack-form-dialog__field-card" htmlFor="saveRenameDlgName">
            <span className="modpack-form-dialog__field-label">{t('saves_manager_rename_label')}</span>
            <input
              ref={inputRef}
              type="text"
              id="saveRenameDlgName"
              className="input"
              maxLength={120}
              autoComplete="off"
              spellCheck={false}
              value={saves.renameNewName}
              disabled={saves.renameSubmitting}
              onChange={(e) => saves.setRenameNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void saves.submitRename();
                }
              }}
            />
          </label>
          <p id="saveRenameDlgError" className="modpack-import-dialog__error" aria-live="polite">
            {saves.renameError}
          </p>
        </div>
        <div className="fu-modal__footer modpack-form-dialog__footer">
          <CancelButton
            id="saveRenameDlgCancel"
            disabled={saves.renameSubmitting}
            onClick={saves.closeRenameDialog}
            t={t}
          />
          <button
            type="button"
            className="btn btn--primary btn--with-icon"
            id="saveRenameDlgOk"
            disabled={saves.renameSubmitting}
            onClick={() => void saves.submitRename()}
          >
            <AppIcon name="edit" size={16} />
            {t('saves_manager_rename')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
