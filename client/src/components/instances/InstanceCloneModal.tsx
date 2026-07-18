import { useEffect, useRef } from 'react';
import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { InstanceItem } from '../../types/instance';
import { InstanceOperationDialogHeader } from './InstanceOperationDialogHeader';
import { InstanceOperationProgress } from './InstanceOperationProgress';

interface InstanceCloneModalProps {
  open: boolean;
  item: InstanceItem | null;
  busy: boolean;
  cloneName: string;
  onCloneNameChange: (value: string) => void;
  onConfirm: () => void;
  onClose: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function InstanceCloneModal({
  open,
  item,
  busy,
  cloneName,
  onCloneNameChange,
  onConfirm,
  onClose,
  t,
}: InstanceCloneModalProps) {
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open || busy || !item) return;
    const id = window.requestAnimationFrame(() => {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open, busy, item]);

  if (!open || !item) return null;

  const sourceName = String(item.name || item.id || '');
  const progressLabel = t('instances_clone_progress_label', sourceName);

  const submitForm = () => {
    if (busy || !cloneName.trim()) return;
    onConfirm();
  };

  return (
    <ModalBackdrop
      open
      id="instanceCloneBackdrop"
      onClose={busy ? () => {} : onClose}
      closeOnBackdropClick={!busy}
    >
      <div
        className="fu-modal server-update-dialog server-update-dialog--progress instance-operation-dialog instance-operation-dialog--clone"
        role="dialog"
        aria-modal="true"
        aria-labelledby="instanceCloneHeading"
        aria-busy={busy || undefined}
      >
        <InstanceOperationDialogHeader
          id="instanceCloneHeading"
          icon="folder_copy"
          title={busy ? t('instances_clone_progress_title') : t('instances_clone_dialog_title')}
          running={busy}
          runningLabel={t('audit_report_open')}
        />

        <div className="fu-modal__body server-update-dialog__body instance-operation-dialog__body">
          {busy ? (
            <InstanceOperationProgress
              icon="folder_copy"
              statusText={progressLabel}
              serverName={sourceName}
              serverHint={t('instances_clone_progress_hint')}
            />
          ) : (
            <>
              <div className="instance-operation-dialog__target instance-operation-dialog__target--accent">
                <AppIcon name="list" size={22} className="instance-operation-dialog__target-icon" />
                <div className="instance-operation-dialog__target-text">
                  <span className="instance-operation-dialog__target-name">{sourceName}</span>
                  <span className="instance-operation-dialog__target-hint">{t('instances_clone_name_prompt', sourceName)}</span>
                </div>
              </div>

              <section className="instance-operation-dialog__form-card">
                <div className="instance-operation-dialog__form-head">
                  <AppIcon name="badge" size={16} className="instance-operation-dialog__form-head-icon" />
                  <span>{t('instances_editor_section_general')}</span>
                </div>
                <label className="instance-operation-dialog__field" htmlFor="instanceCloneName">
                  <span className="instance-operation-dialog__field-label">{t('instances_col_name')}</span>
                  <input
                    ref={nameInputRef}
                    type="text"
                    id="instanceCloneName"
                    className="input instance-operation-dialog__field-input"
                    autoComplete="off"
                    spellCheck={false}
                    value={cloneName}
                    disabled={busy}
                    onChange={(e) => onCloneNameChange(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        submitForm();
                      }
                    }}
                  />
                </label>
              </section>
            </>
          )}
        </div>

        {!busy ? (
          <div className="fu-modal__footer server-update-dialog__footer instance-operation-dialog__footer">
            <CancelButton id="btnInstanceCloneCancel" onClick={onClose} t={t} />
            <button
              type="button"
              className="btn btn--primary btn--with-icon"
              id="btnInstanceCloneConfirm"
              disabled={!cloneName.trim()}
              onClick={submitForm}
            >
              <AppIcon name="folder_copy" size={16} />
              {t('instances_clone_btn')}
            </button>
          </div>
        ) : null}
      </div>
    </ModalBackdrop>
  );
}
