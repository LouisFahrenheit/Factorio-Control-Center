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
      closeOnBackdropClick={false}
      closeOnEscape={canClose}
    >
      <div
        className="fu-modal modpack-form-dialog create-save-name-dialog save-map-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quickSaveNameHeading"
        aria-busy={saves.quickCreating}
      >
        <div className="mod-install-dialog__header">
          <div className="mod-install-dialog__header-main">
            <div
              className="mod-install-dialog__header-icon-wrap"
              aria-hidden="true"
            >
              <AppIcon name="save" size={18} />
            </div>
            <div className="mod-install-dialog__header-titles">
              <h2
                className="mod-install-dialog__title"
                id="quickSaveNameHeading"
              >
                {saves.quickCreating
                  ? t('create_save_creating_title')
                  : t('create_save_quick_dialog_title')}
              </h2>
            </div>
          </div>
        </div>

        <div className="fu-modal__body">
          {saves.quickCreating ? (
            <div
              className="save-map-modal__busy-card"
              role="progressbar"
              aria-busy="true"
              aria-valuetext={t('create_save_creating')}
            >
              <span
                className="save-map-modal__busy-icon-wrap"
                aria-hidden="true"
              >
                <AppIcon name="disk" size={18} />
              </span>
              <span className="save-map-modal__busy-text">
                {t('create_save_creating')}
              </span>
              <div className="save-map-modal__busy-track" aria-hidden="true">
                <div className="save-map-modal__busy-bar" />
              </div>
            </div>
          ) : (
            <label
              className="modpack-form-dialog__field-card"
              htmlFor="quickSaveFileName"
            >
              <span className="save-map-modal__field-head">
                <span className="modpack-form-dialog__field-label">
                  {t('create_save_quick_prompt')}
                </span>
                <span className="save-map-modal__badge">.zip</span>
              </span>
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
          )}
          <p className="save-map-modal__error" aria-live="polite">
            {saves.quickSaveNameError}
          </p>
        </div>

        <div className="fu-modal__footer modpack-form-dialog__footer">
          <CancelButton
            disabled={!canClose}
            onClick={saves.closeQuickSaveDialog}
            t={t}
          />
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
