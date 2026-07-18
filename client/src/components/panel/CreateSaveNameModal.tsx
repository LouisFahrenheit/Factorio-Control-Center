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
      closeOnBackdropClick={canClose}
    >
      <div
        className="fu-modal create-save-name-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="createSaveNameHeading"
        aria-busy={cs.submitting}
      >
        <div className="fu-modal__header" id="createSaveNameHeading">
          {cs.submitting ? t('create_save_creating_title') : t('create_save_name_dialog_title')}
        </div>
        <div className="fu-modal__body">
          {cs.submitting ? (
            <div className="create-save-name-dialog__progress">
              <div className="fu-progress" role="progressbar" aria-valuetext={t('create_save_creating')}>
                <div className="fu-progress__bar fu-progress__bar--indeterminate" />
                <div className="fu-progress__text">{t('create_save_creating')}</div>
              </div>
            </div>
          ) : (
            <>
              <label className="modpack-import-dialog__field" htmlFor="createSaveFileName">
                <span>{t('create_save_prompt')}</span>
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
            </>
          )}
          <p className="modpack-import-dialog__error" aria-live="polite">
            {cs.saveNameError}
          </p>
        </div>
        <div className="fu-modal__footer">
          <CancelButton disabled={!canClose} onClick={cs.closeSaveNameDialog} t={t} />
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
