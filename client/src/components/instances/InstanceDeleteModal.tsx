import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { FccSwitch } from '../FccSwitch';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { InstanceItem } from '../../types/instance';

export interface InstanceDeleteOptions {
  deleteData: boolean;
  deleteFromDisk: boolean;
}

interface InstanceDeleteModalProps {
  open: boolean;
  item: InstanceItem | null;
  options: InstanceDeleteOptions;
  onOptionsChange: (patch: Partial<InstanceDeleteOptions>) => void;
  onConfirm: () => void;
  onClose: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function InstanceDeleteModal({
  open,
  item,
  options,
  onOptionsChange,
  onConfirm,
  onClose,
  t,
}: InstanceDeleteModalProps) {
  if (!open || !item) return null;

  const name = String(item.name || '').trim() || '—';
  const serverPath = String(item.serverPath || '').trim() || '—';
  const warnText = t('instances_delete_disk_warn', serverPath)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');

  return (
    <ModalBackdrop
      open
      id="instanceDeleteBackdrop"
      onClose={onClose}
      closeOnBackdropClick={false}
    >
      <div
        className="fu-modal server-update-dialog instance-operation-dialog instance-operation-dialog--delete instance-delete-dialog mod-job-modal instance-delete-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="instanceDeleteHeading"
      >
        <div className="mod-job-modal__header" id="instanceDeleteHeading">
          <div className="mod-job-modal__header-main">
            <span className="mod-job-modal__title-icon-wrap" aria-hidden="true">
              <AppIcon name="delete" size={19} />
            </span>
            <span className="mod-job-modal__header-title">
              {t('instances_delete_dialog_title')}
            </span>
          </div>
        </div>

        <div className="mod-job-modal__body instance-delete-modal__body">
          <section className="mod-job-modal__section mod-job-modal__section--error instance-delete-modal__target-card">
            <div className="mod-job-modal__section-head instance-delete-modal__target-head">
              <div className="instance-bootstrap-modal__target-main">
                <span
                  className="instance-delete-modal__server-icon"
                  aria-hidden="true"
                >
                  <AppIcon name="server" size={17} />
                </span>
                <div className="instance-bootstrap-modal__target-meta">
                  <span className="instance-bootstrap-modal__target-name">
                    {name}
                  </span>
                  <span
                    className="instance-bootstrap-modal__target-path"
                    title={serverPath}
                  >
                    {serverPath}
                  </span>
                </div>
              </div>
            </div>

            <div className="instance-delete-modal__target-body">
              <span
                className="instance-delete-modal__warn-icon"
                aria-hidden="true"
              >
                <AppIcon name="warning" size={16} />
              </span>
              <div className="instance-delete-modal__target-copy">
                <span
                  className="instance-delete-modal__confirm-text"
                  id="instanceDeleteText"
                >
                  {t('instances_delete_confirm', name)}
                </span>
                <span className="instance-delete-modal__detach-hint">
                  {t('instances_delete_detach_hint')}
                </span>
              </div>
            </div>
          </section>

          <section className="mod-job-modal__section instance-delete-modal__options-card">
            <div className="mod-job-modal__section-head">
              <div className="mod-job-modal__log-title-wrap">
                <AppIcon
                  name="settings"
                  size={15}
                  className="mod-job-modal__log-icon"
                />
                <span className="mod-job-modal__log-title">
                  {t('instances_delete_section_options')}
                </span>
              </div>
            </div>

            <div className="instance-delete-modal__options-body">
              <div className="instance-delete-modal__option-row">
                <FccSwitch
                  id="instanceDeleteData"
                  className="instance-delete-modal__switch"
                  labelClassName="instance-delete-modal__switch-copy"
                  checked={options.deleteData}
                  onChange={(checked) =>
                    onOptionsChange({ deleteData: checked })
                  }
                  label={
                    <>
                      <span className="instance-delete-modal__switch-label">
                        {t('instances_delete_data_cb')}
                      </span>
                      <span className="instance-delete-modal__switch-desc">
                        {t('instances_delete_data_hint')}
                      </span>
                    </>
                  }
                />
                <span
                  className="instance-delete-modal__option-icon"
                  aria-hidden="true"
                >
                  <AppIcon name="history" size={15} />
                </span>
              </div>

              <div className="instance-delete-modal__option-row">
                <FccSwitch
                  id="instanceDeleteDisk"
                  className="instance-delete-modal__switch"
                  labelClassName="instance-delete-modal__switch-label"
                  checked={options.deleteFromDisk}
                  onChange={(checked) =>
                    onOptionsChange({ deleteFromDisk: checked })
                  }
                  label={t('instances_delete_disk_cb')}
                />
                <span
                  className="instance-delete-modal__option-icon"
                  aria-hidden="true"
                >
                  <AppIcon name="folder_open" size={15} />
                </span>
              </div>

              {options.deleteFromDisk ? (
                <div
                  className="instance-delete-modal__warn"
                  id="instanceDeleteDiskWarn"
                  role="alert"
                >
                  <span
                    className="instance-delete-modal__warn-icon"
                    aria-hidden="true"
                  >
                    <AppIcon name="warning" size={16} />
                  </span>
                  <span className="instance-delete-modal__warn-text">
                    {warnText}
                  </span>
                </div>
              ) : null}
            </div>
          </section>
        </div>

        <div className="fu-modal__footer mod-job-modal__footer">
          <CancelButton id="btnInstanceDeleteCancel" onClick={onClose} t={t} />
          <button
            type="button"
            className="btn btn--danger btn--with-icon"
            id="btnInstanceDeleteConfirm"
            onClick={onConfirm}
          >
            <AppIcon name="delete" size={16} />
            {t('instances_delete_btn')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
