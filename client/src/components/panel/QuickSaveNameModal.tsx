import { useEffect, useRef } from 'react';
import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { SavesApi } from '../../hooks/useSaves';

interface QuickSaveNameModalProps {
  saves: SavesApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function QuickSaveNameModal({ saves, t }: QuickSaveNameModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!saves.quickSaveDialogOpen || saves.quickCreating) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [saves.quickSaveDialogOpen, saves.quickCreating]);

  if (!saves.quickSaveDialogOpen) return null;

  const canClose = !saves.quickCreating;

  return (
    <ModalBackdrop
      open
      id="quickSaveNameBackdrop"
      onClose={saves.closeQuickSaveDialog}
      closeOnBackdropClick={canClose}
    >
      <div
        className="fu-modal create-save-name-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quickSaveNameHeading"
        aria-busy={saves.quickCreating}
      >
        <div className="fu-modal__header" id="quickSaveNameHeading">
          {saves.quickCreating ? t('create_save_creating_title') : t('create_save_quick_dialog_title')}
        </div>
        <div className="fu-modal__body">
          {saves.quickCreating ? (
            <div className="create-save-name-dialog__progress">
              <div className="fu-progress" role="progressbar" aria-valuetext={t('create_save_creating')}>
                <div className="fu-progress__bar fu-progress__bar--indeterminate" />
                <div className="fu-progress__text">{t('create_save_creating')}</div>
              </div>
            </div>
          ) : (
            <>
              <label className="modpack-import-dialog__field" htmlFor="quickSaveFileName">
                <span>{t('create_save_quick_prompt')}</span>
                <input
                  ref={inputRef}
                  type="text"
                  id="quickSaveFileName"
                  className="input"
                  maxLength={80}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={saves.quickSaveAutoHint}
                  value={saves.quickSaveFileName}
                  onChange={(e) => saves.setQuickSaveFileName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void saves.submitQuickSave();
                    }
                  }}
                />
              </label>
            </>
          )}
          <p className="modpack-import-dialog__error" aria-live="polite">
            {saves.quickSaveNameError}
          </p>
        </div>
        <div className="fu-modal__footer">
          <CancelButton disabled={!canClose} onClick={saves.closeQuickSaveDialog} t={t} />
          {!saves.quickCreating && (
            <button
              type="button"
              className="btn btn--primary btn--with-icon"
              onClick={() => void saves.submitQuickSave()}
            >
              <AppIcon name="add" size={16} />
              {t('create_save_quick_btn')}
            </button>
          )}
        </div>
      </div>
    </ModalBackdrop>
  );
}
