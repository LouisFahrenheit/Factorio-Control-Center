import { useEffect, useRef } from 'react';
import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { CreateSaveApi } from '../../hooks/useCreateSave';

interface CreateSaveNameModalProps {
  cs: CreateSaveApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function CreateSaveNameModal({ cs, t }: CreateSaveNameModalProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!cs.saveNameDialogOpen || cs.submitting) return;
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [cs.saveNameDialogOpen, cs.submitting]);

  if (!cs.saveNameDialogOpen) return null;

  const canClose = !cs.submitting;

  return (
    <ModalBackdrop
      open
      id="createSaveNameBackdrop"
      backdropClassName="fu-modal-backdrop--stacked"
      onClose={cs.closeSaveNameDialog}
      closeOnBackdropClick={false}
      closeOnEscape={canClose}
    >
      <div
        className="fu-modal modpack-form-dialog create-save-name-dialog save-map-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="createSaveNameHeading"
        aria-busy={cs.submitting}
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
                id="createSaveNameHeading"
              >
                {cs.submitting
                  ? t('create_save_creating_title')
                  : t('create_save_name_dialog_title')}
              </h2>
            </div>
          </div>
        </div>

        <div className="fu-modal__body">
          {cs.submitting ? (
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
              htmlFor="createSaveFileName"
            >
              <span className="save-map-modal__field-head">
                <span className="modpack-form-dialog__field-label">
                  {t('create_save_prompt')}
                </span>
                <span className="save-map-modal__badge">.zip</span>
              </span>
              <input
                ref={inputRef}
                type="text"
                id="createSaveFileName"
                className="input"
                maxLength={80}
                autoComplete="off"
                spellCheck={false}
                value={cs.saveFileName}
                onChange={(e) => cs.setSaveFileName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    void cs.confirmCreateSave();
                  }
                }}
              />
            </label>
          )}
          <p className="save-map-modal__error" aria-live="polite">
            {cs.saveNameError}
          </p>
        </div>

        <div className="fu-modal__footer modpack-form-dialog__footer">
          <CancelButton
            disabled={!canClose}
            onClick={cs.closeSaveNameDialog}
            t={t}
          />
          {!cs.submitting && (
            <button
              type="button"
              className="btn btn--primary btn--with-icon"
              onClick={() => void cs.confirmCreateSave()}
            >
              <AppIcon name="add" size={16} />
              {t('create_save_btn')}
            </button>
          )}
        </div>
      </div>
    </ModalBackdrop>
  );
}
