import { ModalBackdrop } from '../modals/ModalBackdrop';
import { InstanceOperationDialogHeader } from './InstanceOperationDialogHeader';
import { InstanceOperationProgress } from './InstanceOperationProgress';

interface InstanceDeleteProgressModalProps {
  open: boolean;
  serverName: string;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function InstanceDeleteProgressModal({ open, serverName, t }: InstanceDeleteProgressModalProps) {
  if (!open) return null;

  const label = t('instances_delete_disk_progress');

  return (
    <ModalBackdrop
      open
      id="instanceDeleteDiskProgressBackdrop"
      onClose={() => {}}
      closeOnBackdropClick={false}
    >
      <div
        className="fu-modal server-update-dialog server-update-dialog--progress instance-operation-dialog instance-operation-dialog--delete"
        role="dialog"
        aria-modal="true"
        aria-labelledby="instanceDeleteDiskProgressHeading"
        aria-busy="true"
      >
        <InstanceOperationDialogHeader
          id="instanceDeleteDiskProgressHeading"
          icon="delete"
          title={t('instances_delete_disk_progress_title')}
          tone="danger"
          running
          runningLabel={t('audit_report_open')}
        />

        <div className="fu-modal__body server-update-dialog__body instance-operation-dialog__body">
          <InstanceOperationProgress
            tone="danger"
            icon="delete"
            statusText={label}
            serverName={serverName || undefined}
            serverHint={t('instances_delete_disk_progress_hint')}
          />
        </div>
      </div>
    </ModalBackdrop>
  );
}
