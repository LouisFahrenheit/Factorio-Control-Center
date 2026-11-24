import { AppIcon } from '../AppIcon';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { InstanceEditorApi } from '../../hooks/useInstanceEditor';
import { localizeInstanceError } from '../../lib/instanceUtils';
import type { AppIconName } from '../../lib/appIcons';

interface InstanceBootstrapProgressModalProps {
  editor: InstanceEditorApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

type BootstrapPhase =
  | 'preparing'
  | 'download'
  | 'extract'
  | 'done'
  | 'cancelled'
  | 'error';

interface BootstrapStageDef {
  key: 'preparing' | 'download' | 'extract';
  icon: AppIconName;
  labelKey: string;
}

const BOOTSTRAP_STAGES: readonly BootstrapStageDef[] = [
  {
    key: 'preparing',
    icon: 'packages',
    labelKey: 'instances_download_stage_prepare',
  },
  {
    key: 'download',
    icon: 'download',
    labelKey: 'instances_download_stage_download',
  },
  {
    key: 'extract',
    icon: 'folder_zip',
    labelKey: 'instances_download_stage_extract',
  },
];

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

function bootstrapPhase(
  status: InstanceEditorApi['bootstrapStatus'],
): BootstrapPhase {
  if (!status) return 'preparing';
  const phase = String(status.phase || 'idle');
  if (phase === 'download') return 'download';
  if (phase === 'extract') return 'extract';
  if (phase === 'done') return 'done';
  if (phase === 'cancelled') return 'cancelled';
  if (phase === 'error') return 'error';
  return 'preparing';
}

function headerIconName(phase: BootstrapPhase): AppIconName {
  if (phase === 'error' || phase === 'cancelled') return 'warning';
  return 'server';
}

function phaseIcon(phase: BootstrapPhase): AppIconName {
  switch (phase) {
    case 'download':
      return 'download';
    case 'extract':
      return 'folder_zip';
    case 'done':
      return 'check';
    case 'error':
      return 'warning';
    case 'cancelled':
      return 'close';
    default:
      return 'packages';
  }
}

function statusSectionVariant(phase: BootstrapPhase): string {
  if (phase === 'done' || phase === 'error' || phase === 'cancelled') {
    return phase;
  }
  return 'download';
}

function stageOrderIndex(phase: BootstrapPhase): number {
  switch (phase) {
    case 'preparing':
      return 0;
    case 'download':
      return 1;
    case 'extract':
      return 2;
    case 'done':
      return 3;
    default:
      return -1;
  }
}

function bootstrapBarClass(
  status: InstanceEditorApi['bootstrapStatus'],
  running: boolean,
): string {
  const base = 'server-update-dialog__bar mod-job-modal__bar';
  if (!status) return base + ' server-update-dialog__bar--indeterminate';
  const phase = String(status.phase || 'idle');
  if (phase === 'download') {
    const tot = Number(status.download_tot || 0);
    if (tot > 0) {
      return base + (running ? ' mod-job-modal__bar--streaming' : '');
    }
    return base + ' server-update-dialog__bar--indeterminate';
  }
  if (phase === 'error') return base + ' server-update-dialog__bar--error';
  if (phase === 'cancelled')
    return base + ' server-update-dialog__bar--cancelled';
  if (phase === 'done') return base + ' server-update-dialog__bar--done';
  return base + ' server-update-dialog__bar--indeterminate';
}

function bootstrapBarWidth(
  status: InstanceEditorApi['bootstrapStatus'],
): string {
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
  if (phase === 'done' || phase === 'error' || phase === 'cancelled')
    return '100%';
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
      return mb(cur) + ' / ' + mb(tot) + ' MB';
    }
    return cur > 0 ? mb(cur) + ' MB' : '';
  }
  if (phase === 'done') return t('web_update_phase_done');
  if (phase === 'error') return t('web_update_phase_error');
  if (phase === 'cancelled') return t('web_update_phase_cancelled');
  return '';
}

function bootstrapRunning(
  status: InstanceEditorApi['bootstrapStatus'],
): boolean {
  if (!status) return true;
  const phase = String(status.phase || 'idle');
  return phase !== 'done' && phase !== 'error' && phase !== 'cancelled';
}

export function InstanceBootstrapProgressModal({
  editor,
  t,
}: InstanceBootstrapProgressModalProps) {
  if (!editor.bootstrapOpen) return null;
  const st = editor.bootstrapStatus;
  const phase = bootstrapPhase(st);
  const running = bootstrapRunning(st);
  const stageIdx = stageOrderIndex(phase);
  const currentStep =
    stageIdx >= 0 ? Math.min(BOOTSTRAP_STAGES.length, stageIdx + 1) : 0;
  const stepLabel =
    currentStep > 0
      ? t('web_update_step_label', currentStep, BOOTSTRAP_STAGES.length)
      : '';

  const actionText = bootstrapActionLabel(st, editor.bootstrapStopRequested, t);
  const progressMetaText = bootstrapBarText(st, t);

  const serverName = editor.form.name.trim();
  const targetPath = String(
    st?.server_path || editor.form.serverPath || '',
  ).trim();
  const rawVer = (
    editor.form.packageVersion === '__custom__'
      ? editor.form.packageVersionCustom
      : editor.form.packageVersion
  ).trim();
  const versionChip =
    !rawVer || rawVer === 'latest'
      ? t('latest_version')
      : 'v' + rawVer.replace(/^v/i, '');
  const buildChip = editor.showPackageBuild
    ? editor.form.packageBuild === 'expansion'
      ? t('instances_download_build_expansion')
      : t('instances_download_build_alpha')
    : '';

  const headerBadge = running ? (
    <span className="mod-job-modal__badge mod-job-modal__badge--running">
      <span className="mod-job-modal__badge-dot" aria-hidden="true" />
      {t('audit_report_open')}
    </span>
  ) : phase === 'done' ? (
    <span className="mod-job-modal__badge mod-job-modal__badge--done">
      {t('web_update_phase_done')}
    </span>
  ) : phase === 'error' ? (
    <span className="mod-job-modal__badge mod-job-modal__badge--error">
      {t('web_update_phase_error')}
    </span>
  ) : phase === 'cancelled' ? (
    <span className="mod-job-modal__badge mod-job-modal__badge--warn">
      {t('web_update_phase_cancelled')}
    </span>
  ) : null;

  return (
    <ModalBackdrop
      open
      id="ibModal"
      onClose={editor.bootstrapCanClose ? editor.closeBootstrap : () => {}}
      closeOnBackdropClick={editor.bootstrapCanClose}
      closeOnEscape={editor.bootstrapCanClose}
    >
      <div
        className="fu-modal server-update-dialog server-update-dialog--progress instance-bootstrap-dialog instance-operation-dialog instance-operation-dialog--create mod-job-modal instance-bootstrap-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ibTitle"
        aria-busy={running}
      >
        <div className="mod-job-modal__header" id="ibTitle">
          <div className="mod-job-modal__header-main">
            <span
              className={
                'mod-job-modal__title-icon-wrap' +
                (running ? ' is-running' : '') +
                (phase === 'error' || phase === 'cancelled' ? ' is-warn' : '')
              }
              aria-hidden="true"
            >
              <AppIcon name={headerIconName(phase)} size={19} />
            </span>
            <span className="mod-job-modal__header-title">
              {t('instances_download_modal_title')}
            </span>
            {headerBadge}
          </div>

          <div className="mod-job-modal__header-right">
            {stepLabel ? (
              <span className="mod-job-modal__step-pill" id="ibStepLabel">
                {stepLabel}
              </span>
            ) : null}
            {!running && editor.bootstrapCanClose ? (
              <button
                type="button"
                className="mod-job-modal__close"
                aria-label={t('close')}
                onClick={editor.closeBootstrap}
              >
                <AppIcon name="close" size={18} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="mod-job-modal__body instance-bootstrap-modal__body">
          {serverName || targetPath ? (
            <section className="mod-job-modal__section instance-bootstrap-modal__target">
              <div className="instance-bootstrap-modal__target-main">
                <span
                  className="instance-bootstrap-modal__target-icon"
                  aria-hidden="true"
                >
                  <AppIcon name="folder_open" size={16} />
                </span>
                <div className="instance-bootstrap-modal__target-meta">
                  {serverName ? (
                    <span className="instance-bootstrap-modal__target-name">
                      {serverName}
                    </span>
                  ) : null}
                  {targetPath ? (
                    <span
                      className="instance-bootstrap-modal__target-path"
                      title={targetPath}
                    >
                      {targetPath}
                    </span>
                  ) : null}
                </div>
              </div>

              <div className="instance-bootstrap-modal__target-tags">
                {buildChip ? (
                  <span className="instance-bootstrap-modal__tag instance-bootstrap-modal__tag--accent">
                    {buildChip}
                  </span>
                ) : null}
                <span className="instance-bootstrap-modal__tag">
                  {versionChip}
                </span>
              </div>
            </section>
          ) : null}

          <section
            className={
              'mod-job-modal__section mod-job-modal__section--status mod-job-modal__section--' +
              statusSectionVariant(phase)
            }
            id="ibActionLabel"
          >
            <div className="mod-job-modal__section-head">
              <div className="mod-job-modal__status-main">
                <span
                  className={
                    'mod-job-modal__phase-icon' +
                    (running && phase === 'download'
                      ? ' mod-job-modal__phase-icon--downloading'
                      : '') +
                    (running && phase !== 'download'
                      ? ' mod-job-modal__phase-icon--pulse'
                      : '')
                  }
                  aria-hidden="true"
                >
                  <AppIcon name={phaseIcon(phase)} size={17} />
                </span>
                <span className="mod-job-modal__status-title">
                  {actionText}
                </span>
              </div>
              <span className="mod-job-modal__progress-stats" id="ibBarText">
                {progressMetaText}
              </span>
            </div>

            <div className="mod-job-modal__progress-body">
              <div
                className="server-update-dialog__progress-track fu-progress mod-job-modal__track"
                role="progressbar"
                aria-valuetext={actionText}
                aria-busy={running}
              >
                <div
                  className={bootstrapBarClass(st, running)}
                  id="ibBar"
                  style={{ width: bootstrapBarWidth(st) }}
                />
              </div>

              <div
                className="instance-bootstrap-modal__stages"
                aria-hidden="true"
              >
                {BOOTSTRAP_STAGES.map((stage, idx) => {
                  const isActive = running && stageIdx === idx;
                  const isPassed = stageIdx > idx;
                  return (
                    <div
                      key={stage.key}
                      className={
                        'instance-bootstrap-modal__stage' +
                        (isActive ? ' is-active' : '') +
                        (isPassed ? ' is-passed' : '')
                      }
                    >
                      <span className="instance-bootstrap-modal__stage-icon">
                        <AppIcon name={stage.icon} size={14} />
                      </span>
                      <span className="instance-bootstrap-modal__stage-label">
                        {t(stage.labelKey)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
        </div>

        <div className="fu-modal__footer mod-job-modal__footer" id="ibFooter">
          {running ? (
            <button
              type="button"
              className="btn btn--danger btn--with-icon"
              disabled={editor.bootstrapStopRequested}
              onClick={() => void editor.stopBootstrap()}
            >
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
