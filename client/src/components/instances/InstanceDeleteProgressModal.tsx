import { AppIcon } from '../AppIcon';
import { ModalBackdrop } from '../modals/ModalBackdrop';

interface InstanceDeleteProgressModalProps {
  open: boolean;
  serverName: string;
  serverPath?: string;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function InstanceDeleteProgressModal({
  open,
  serverName,
  serverPath,
  t,
}: InstanceDeleteProgressModalProps) {
  if (!open) return null;

  const label = t('instances_delete_disk_progress');
  const trimmedName = serverName.trim();
  const trimmedPath = (serverPath || '').trim();

  return (
    <ModalBackdrop
      open
      id="instanceDeleteDiskProgressBackdrop"
      onClose={() => {}}
      closeOnBackdropClick={false}
      closeOnEscape={false}
    >
      <div
        className="fu-modal server-update-dialog server-update-dialog--progress instance-operation-dialog instance-operation-dialog--delete mod-job-modal instance-delete-modal instance-delete-modal--progress"
        role="dialog"
        aria-modal="true"
        aria-labelledby="instanceDeleteDiskProgressHeading"
        aria-busy="true"
      >
        <div
          className="mod-job-modal__header"
          id="instanceDeleteDiskProgressHeading"
        >
          <div className="mod-job-modal__header-main">
            <span
              className="mod-job-modal__title-icon-wrap is-running"
              aria-hidden="true"
            >
              <AppIcon name="delete" size={19} />
            </span>
            <span className="mod-job-modal__header-title">
              {t('instances_delete_disk_progress_title')}
            </span>
            <span className="mod-job-modal__badge mod-job-modal__badge--running">
              <span className="mod-job-modal__badge-dot" aria-hidden="true" />
              {t('audit_report_open')}
            </span>
          </div>
        </div>

        <div className="mod-job-modal__body instance-delete-modal__body">
          {trimmedName || trimmedPath ? (
            <section className="mod-job-modal__section instance-bootstrap-modal__target">
              <div className="instance-bootstrap-modal__target-main">
                <span
                  className="instance-bootstrap-modal__target-icon"
                  aria-hidden="true"
                >
                  <AppIcon name="folder_open" size={16} />
                </span>
                <div className="instance-bootstrap-modal__target-meta">
                  {trimmedName ? (
                    <span className="instance-bootstrap-modal__target-name">
                      {trimmedName}
                    </span>
                  ) : null}
                  {trimmedPath ? (
                    <span
                      className="instance-bootstrap-modal__target-path"
                      title={trimmedPath}
                    >
                      {trimmedPath}
                    </span>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}

          <section className="mod-job-modal__section mod-job-modal__section--status instance-delete-modal__status-card">
            <div className="mod-job-modal__section-head">
              <div className="mod-job-modal__status-main">
                <span
                  className="mod-job-modal__phase-icon mod-job-modal__phase-icon--pulse"
                  aria-hidden="true"
                >
                  <AppIcon name="delete" size={17} />
                </span>
                <span className="mod-job-modal__status-title">{label}</span>
              </div>
            </div>

            <div className="mod-job-modal__progress-body">
              <div
                className="server-update-dialog__progress-track fu-progress mod-job-modal__track"
                role="progressbar"
                aria-valuetext={label}
                aria-busy="true"
              >
                <div className="server-update-dialog__bar instance-delete-modal__bar--indeterminate" />
              </div>

              <div className="instance-delete-modal__progress-hint">
                <AppIcon
                  name="warning"
                  size={15}
                  className="instance-delete-modal__progress-hint-icon"
                />
                <span>{t('instances_delete_disk_progress_hint')}</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </ModalBackdrop>
  );
}
