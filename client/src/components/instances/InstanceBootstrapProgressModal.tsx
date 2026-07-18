import { AppIcon } from '../AppIcon';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { InstanceEditorApi } from '../../hooks/useInstanceEditor';
import { localizeInstanceError } from '../../lib/instanceUtils';
import type { AppIconName } from '../../lib/appIcons';
import { InstanceOperationDialogHeader } from './InstanceOperationDialogHeader';

interface InstanceBootstrapProgressModalProps {
  editor: InstanceEditorApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

function bootstrapActionLabel(
  status: InstanceEditorApi['bootstrapStatus'],
  stopRequested: boolean,
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  if (stopRequested) return t('about_factorio_update_log_stop_requested');
  if (!status) return t('instances_download_progress_prepare');
  const phase = String(status.phase || 'idle');
  if (phase === 'download') {
    const cur = Number(status.download_cur || 0);
    const tot = Number(status.download_tot || 0);
    if (tot > 0) {
      const pct = Math.max(0, Math.min(100, Math.floor((cur / tot) * 100)));
      return t('instances_download_progress_download', String(pct));
    }
    return t('instances_download_progress_download_unknown');
  }
  if (phase === 'extract') return t('instances_download_progress_extract');
  if (phase === 'verify') return t('instances_download_progress_verify');
  if (phase === 'done') return t('instances_download_progress_done');
  if (phase === 'cancelled') return t('mod_job_phase_cancelled');
  if (phase === 'error') {
    return localizeInstanceError(
      String(status.error || 'instance_template_download_failed'),
      t,
      status.error_args,
    );
  }
  return t('instances_download_progress_prepare');
}

function bootstrapPhaseKind(status: InstanceEditorApi['bootstrapStatus']): string {
  if (!status) return 'preparing';
  const phase = String(status.phase || 'idle');
  if (phase === 'download') return 'download';
  if (phase === 'extract' || phase === 'verify') return 'apply';
  if (phase === 'done') return 'done';
  if (phase === 'cancelled') return 'cancelled';
  if (phase === 'error') return 'error';
  return 'preparing';
}

function bootstrapPhaseIcon(kind: string): AppIconName {
  switch (kind) {
    case 'download':
      return 'download';
    case 'apply':
      return 'engineering';
    case 'done':
      return 'folder_check';
    case 'error':
      return 'info';
    case 'cancelled':
      return 'close';
    default:
      return 'download';
  }
}

function bootstrapBarClass(status: InstanceEditorApi['bootstrapStatus']): string {
  const base = 'server-update-dialog__bar';
  if (!status) return base + ' server-update-dialog__bar--indeterminate';
  const phase = String(status.phase || 'idle');
  if (phase === 'download') {
    const tot = Number(status.download_tot || 0);
    return tot > 0 ? base : base + ' server-update-dialog__bar--indeterminate';
  }
  if (phase === 'error') return base + ' server-update-dialog__bar--error';
  if (phase === 'cancelled') return base + ' server-update-dialog__bar--cancelled';
  if (phase === 'done') return base + ' server-update-dialog__bar--done';
  return base + ' server-update-dialog__bar--indeterminate';
}

function bootstrapBarWidth(status: InstanceEditorApi['bootstrapStatus']): string {
  if (!status) return '0%';
  const phase = String(status.phase || 'idle');
  if (phase === 'download') {
    const cur = Number(status.download_cur || 0);
    const tot = Number(status.download_tot || 0);
    if (tot > 0) {
      const pct = Math.max(0, Math.min(100, Math.floor((cur / tot) * 100)));
      return pct + '%';
    }
    return '0%';
  }
  if (phase === 'done' || phase === 'error' || phase === 'cancelled') return '100%';
  return '0%';
}

function bootstrapBarText(
  status: InstanceEditorApi['bootstrapStatus'],
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  if (!status) return '';
  const phase = String(status.phase || 'idle');
  if (phase === 'download') {
    const cur = Number(status.download_cur || 0);
    const tot = Number(status.download_tot || 0);
    const mb = (n: number) => (Number(n || 0) / (1024 * 1024)).toFixed(1);
    if (tot > 0) {
      const pct = Math.max(0, Math.min(100, Math.floor((cur / tot) * 100)));
      return pct + '% · ' + mb(cur) + ' / ' + mb(tot) + ' MB';
    }
    return cur > 0 ? mb(cur) + ' MB' : '';
  }
  if (phase === 'done') return t('web_update_phase_done');
  if (phase === 'error') return t('web_update_phase_error');
  if (phase === 'cancelled') return t('web_update_phase_cancelled');
  return '';
}

function bootstrapRunning(status: InstanceEditorApi['bootstrapStatus']): boolean {
  if (!status) return true;
  const phase = String(status.phase || 'idle');
  return phase !== 'done' && phase !== 'error' && phase !== 'cancelled';
}

export function InstanceBootstrapProgressModal({ editor, t }: InstanceBootstrapProgressModalProps) {
  if (!editor.bootstrapOpen) return null;
  const st = editor.bootstrapStatus;
  const kind = bootstrapPhaseKind(st);
  const running = bootstrapRunning(st);

  return (
    <ModalBackdrop
      open
      id="ibModal"
      onClose={editor.bootstrapCanClose ? editor.closeBootstrap : () => {}}
      closeOnBackdropClick={editor.bootstrapCanClose}
    >
      <div
        className="fu-modal server-update-dialog server-update-dialog--progress instance-bootstrap-dialog instance-operation-dialog instance-operation-dialog--create"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ibTitle"
        aria-busy={running}
      >
        <InstanceOperationDialogHeader
          id="ibTitle"
          icon="download"
          title={t('instances_download_modal_title')}
          running={running}
          runningLabel={t('audit_report_open')}
        />

        <div className="fu-modal__body server-update-dialog__body">
          <div className="server-update-dialog__progress">
            <div
              className={'server-update-dialog__status-card server-update-dialog__status-card--' + kind}
              id="ibActionLabel"
            >
              <span className="server-update-dialog__status-icon-wrap" aria-hidden="true">
                <AppIcon name={bootstrapPhaseIcon(kind)} size={18} className="server-update-dialog__status-icon" />
              </span>
              <span className="server-update-dialog__status-text">{bootstrapActionLabel(st, editor.bootstrapStopRequested, t)}</span>
            </div>

            <div className="server-update-dialog__progress-block">
              <div
                className="server-update-dialog__progress-track fu-progress"
                role="progressbar"
                aria-valuetext={bootstrapActionLabel(st, editor.bootstrapStopRequested, t)}
                aria-busy={running}
              >
                <div className={bootstrapBarClass(st)} id="ibBar" style={{ width: bootstrapBarWidth(st) }} />
              </div>
              <div className="server-update-dialog__progress-meta">
                <span className="server-update-dialog__progress-text" id="ibBarText">
                  {bootstrapBarText(st, t)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div className="fu-modal__footer server-update-dialog__footer" id="ibFooter">
          {running ? (
            <button type="button" className="btn btn--danger btn--with-icon" onClick={() => void editor.stopBootstrap()}>
              <AppIcon name="stop" size={16} />
              {t('about_factorio_update_dialog_stop')}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--with-icon"
              disabled={!editor.bootstrapCanClose}
              onClick={editor.closeBootstrap}
            >
              <AppIcon name="close" size={16} />
              {t('close')}
            </button>
          )}
        </div>
      </div>
    </ModalBackdrop>
  );
}
