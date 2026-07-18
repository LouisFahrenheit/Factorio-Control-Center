import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { FccSwitch } from '../FccSwitch';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { InstanceItem } from '../../types/instance';
import { InstanceOperationDialogHeader } from './InstanceOperationDialogHeader';

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

  return (
    <ModalBackdrop open id="instanceDeleteBackdrop" onClose={onClose}>
      <div
        className="fu-modal server-update-dialog instance-operation-dialog instance-operation-dialog--delete instance-delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="instanceDeleteHeading"
      >
        <InstanceOperationDialogHeader
          id="instanceDeleteHeading"
          icon="delete"
          title={t('instances_delete_dialog_title')}
          tone="danger"
        />
        <div className="fu-modal__body server-update-dialog__body instance-delete-dialog__body">
          <div className="instance-operation-dialog__target instance-operation-dialog__target--danger">
            <AppIcon name="list" size={22} className="instance-operation-dialog__target-icon" />
            <div className="instance-operation-dialog__target-text">
              <span className="instance-operation-dialog__target-name">{name}</span>
              <span className="instance-operation-dialog__target-hint" id="instanceDeleteText">
                {t('instances_delete_confirm', name)}
              </span>
              <span className="instance-operation-dialog__target-path">{serverPath}</span>
            </div>
          </div>

          <p className="instance-delete-dialog__hint">{t('instances_delete_detach_hint')}</p>

          <section className="instance-operation-dialog__form-card instance-delete-dialog__options">
            <div className="instance-operation-dialog__form-head instance-delete-dialog__options-head">
              <AppIcon name="settings" size={16} className="instance-operation-dialog__form-head-icon" />
              <span>{t('instances_delete_section_options')}</span>
            </div>
            <div className="instance-delete-dialog__option">
              <FccSwitch
                id="instanceDeleteData"
                className="instance-delete-dialog__switch"
                checked={options.deleteData}
                onChange={(checked) => onOptionsChange({ deleteData: checked })}
                label={t('instances_delete_data_cb')}
              />
            </div>
            <div className="instance-delete-dialog__option">
              <FccSwitch
                id="instanceDeleteDisk"
                className="instance-delete-dialog__switch"
                checked={options.deleteFromDisk}
                onChange={(checked) => onOptionsChange({ deleteFromDisk: checked })}
                label={t('instances_delete_disk_cb')}
              />
            </div>
            {options.deleteFromDisk ? (
              <div className="instance-delete-dialog__warn" id="instanceDeleteDiskWarn" role="alert">
                <AppIcon name="info" size={18} className="instance-delete-dialog__warn-icon" />
                <span>{t('instances_delete_disk_warn', serverPath)}</span>
              </div>
            ) : null}
          </section>
        </div>
        <div className="fu-modal__footer server-update-dialog__footer instance-delete-dialog__footer">
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
