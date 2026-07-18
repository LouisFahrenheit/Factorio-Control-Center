import { useCallback, useEffect, useRef } from 'react';
import { AppIcon } from '../AppIcon';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { ModJobApi } from '../../hooks/useModJob';
import { formatModJobLogLine, mjLocalizeError } from '../../lib/modErrorUtils';
import type { ModJobLogEntry, ModJobStatus } from '../../types/modJob';
import type { AppIconName } from '../../lib/appIcons';

interface ModJobModalProps {
  modJob: ModJobApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

function actionLabel(status: ModJobStatus | null, stopRequested: boolean, t: ModJobModalProps['t']): string {
  if (stopRequested) return t('about_factorio_update_log_stop_requested');
  if (!status) return t('mod_job_phase_preparing');
  const phase = status.phase || 'idle';
  if (phase === 'download') return t('mod_job_phase_downloading');
  if (phase === 'install') return t('mod_job_phase_install');
  if (phase === 'preparing') return t('mod_job_phase_preparing');
  if (phase === 'done') return t('mod_job_phase_done');
  if (phase === 'cancelled') return t('mod_job_phase_cancelled');
  if (phase === 'error') return mjLocalizeError(status.error_key, status.error_args, status.error, t);
  return t('mod_job_phase_preparing');
}

function phaseKind(status: ModJobStatus | null): string {
  if (!status) return 'preparing';
  const phase = status.phase || 'idle';
  if (phase === 'download' || phase === 'install' || phase === 'preparing') return phase;
  if (phase === 'done') return 'done';
  if (phase === 'cancelled') return 'cancelled';
  if (phase === 'error') return 'error';
  return 'preparing';
}

function statusCardKind(kind: string): string {
  return kind === 'install' ? 'apply' : kind;
}

function phaseIcon(kind: string): AppIconName {
  switch (kind) {
    case 'download':
      return 'download';
    case 'install':
      return 'folder_check';
    case 'done':
      return 'folder_check';
    case 'error':
      return 'info';
    case 'cancelled':
      return 'close';
    default:
      return 'mod_update_';
  }
}

function barClass(status: ModJobStatus | null): string {
  const base = 'server-update-dialog__bar';
  if (!status) return base + ' server-update-dialog__bar--indeterminate';
  const phase = status.phase || 'idle';
  if (phase === 'download') {
    const tot = Number(status.download_tot || 0);
    return tot > 0 ? base : base + ' server-update-dialog__bar--indeterminate';
  }
  if (phase === 'error') return base + ' server-update-dialog__bar--error';
  if (phase === 'cancelled') return base + ' server-update-dialog__bar--cancelled';
  if (phase === 'done') return base + ' server-update-dialog__bar--done';
  return base + ' server-update-dialog__bar--indeterminate';
}

function barWidth(status: ModJobStatus | null): string {
  if (!status) return '0%';
  const phase = status.phase || 'idle';
  if (phase === 'download') {
    const cur = Number(status.download_cur || 0);
    const tot = Number(status.download_tot || 0);
    if (tot > 0) {
      const pct = Math.min(100, Math.floor((cur / tot) * 100));
      return pct + '%';
    }
    return '0%';
  }
  if (phase === 'done' || phase === 'error' || phase === 'cancelled') return '100%';
  return '0%';
}

function barText(status: ModJobStatus | null, t: ModJobModalProps['t']): string {
  if (!status) return '';
  const phase = status.phase || 'idle';
  if (phase === 'download') {
    const cur = Number(status.download_cur || 0);
    const tot = Number(status.download_tot || 0);
    const mb = (n: number) => (n / (1024 * 1024)).toFixed(1);
    if (tot > 0) {
      const pct = Math.min(100, Math.floor((cur / tot) * 100));
      return pct + '% · ' + mb(cur) + ' / ' + mb(tot) + ' MB';
    }
    return '';
  }
  if (phase === 'done') return t('web_update_phase_done');
  if (phase === 'error') return t('mod_job_phase_error');
  if (phase === 'cancelled') return t('mod_job_phase_cancelled');
  return '';
}

function formatLogLine(entry: ModJobLogEntry, t: ModJobModalProps['t']): string {
  return formatModJobLogLine(entry, t);
}

function activeDownloadRows(status: ModJobStatus | null): { name: string; version?: string }[] {
  const rows = Array.isArray(status?.active_downloads) ? status.active_downloads : [];
  const clean = rows
    .map((row) => ({
      name: String(row?.name || '').trim(),
      version: String(row?.version || '').trim(),
    }))
    .filter((row) => row.name);
  if (clean.length) return clean;
  if (status?.phase === 'download') {
    const name = String(status.current_name || '').trim();
    if (name) {
      const version = String(status.current_version || '').trim();
      return [{ name, version: version || undefined }];
    }
  }
  return [];
}

export function ModJobModal({ modJob, t }: ModJobModalProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const status = modJob.status;
  const running = !!status?.running;
  const lockClose = running;
  const logs = Array.isArray(status?.log) ? status.log : [];
  const kind = phaseKind(status);
  const downloadRows = activeDownloadRows(status);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length, status?.phase]);

  const copyLog = useCallback(() => {
    const text = logs
      .map((entry) => {
        const d = new Date((entry.ts || 0) * 1000);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        const ss = String(d.getSeconds()).padStart(2, '0');
        return `[${hh}:${mm}:${ss}] ${formatLogLine(entry, t)}`;
      })
      .join('\n');
    void navigator.clipboard?.writeText(text).catch(() => {});
  }, [logs, t]);

  if (!modJob.open) return null;

  const stepLabel =
    status?.total_steps && status.total_steps > 0
      ? t('web_update_step_label', status.current_step || 0, status.total_steps)
      : '';

  const stepPct =
    status?.total_steps && status.total_steps > 0
      ? Math.min(100, Math.round(((status.current_step || 0) / status.total_steps) * 100))
      : 0;

  return (
    <ModalBackdrop
      open
      id="mjModal"
      onClose={modJob.close}
      closeOnBackdropClick={!lockClose}
      closeOnEscape={!lockClose}
    >
      <div
        className="fu-modal server-update-dialog server-update-dialog--progress server-update-dialog--mod-job"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mjTitle"
      >
        <div className="fu-modal__header server-update-dialog__header" id="mjTitle">
          <AppIcon name="mod_update_" size={22} className="server-update-dialog__header-icon" />
          <div className="server-update-dialog__header-text">
            <span className="server-update-dialog__header-title">{t('mod_job_modal_title')}</span>
            {running ? (
              <span className="server-update-dialog__header-badge server-update-dialog__header-badge--active">
                {t('mod_job_modal_running_badge')}
              </span>
            ) : null}
          </div>
        </div>

        <div className="fu-modal__body server-update-dialog__body">
          <div className="server-update-dialog__progress">
            {stepLabel ? (
              <div className="server-update-dialog__step-row" id="mjStepLabel">
                <span className="server-update-dialog__step-badge">{stepLabel}</span>
                <div className="server-update-dialog__step-track" aria-hidden="true">
                  <div className="server-update-dialog__step-fill" style={{ width: stepPct + '%' }} />
                </div>
              </div>
            ) : null}

            <div
              className={
                'server-update-dialog__status-card server-update-dialog__status-card--' + statusCardKind(kind)
              }
              id="mjActionLabel"
            >
              <span className="server-update-dialog__status-icon-wrap" aria-hidden="true">
                <AppIcon name={phaseIcon(kind)} size={18} className="server-update-dialog__status-icon" />
              </span>
              <div className="mod-job-status-body">
                <span className="server-update-dialog__status-text">{actionLabel(status, modJob.stopRequested, t)}</span>
                {kind === 'download' && downloadRows.length ? (
                  <ul className="mod-job-download-list" role="list" aria-label={t('mod_job_phase_downloading')}>
                    {downloadRows.map((row) => (
                      <li key={row.name} className="mod-job-download-list__item">
                        <span className="mod-job-download-list__name">{row.name}</span>
                        {row.version ? (
                          <span className="mod-job-download-list__ver">v{row.version}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>

            <div className="server-update-dialog__progress-block">
              <div className="server-update-dialog__progress-track fu-progress" aria-hidden="true">
                <div className={barClass(status)} id="mjBar" style={{ width: barWidth(status) }} />
              </div>
              <div className="server-update-dialog__progress-meta">
                <span className="server-update-dialog__progress-text" id="mjBarText">
                  {barText(status, t)}
                </span>
              </div>
            </div>

            <div className="server-update-dialog__log-card">
              <div className="server-update-dialog__log-head">
                <span className="server-update-dialog__log-title">{t('about_factorio_update_dialog_log_label')}</span>
                <button
                  type="button"
                  className="btn btn--compact btn--with-icon server-update-dialog__log-copy"
                  disabled={!logs.length}
                  onClick={copyLog}
                >
                  <AppIcon name="file_copy" size={14} />
                  {t('about_factorio_update_dialog_copy_log')}
                </button>
              </div>
              <div className="fu-log server-update-dialog__log" id="mjLog" ref={logRef}>
                {logs.length ? (
                  logs.map((entry, i) => {
                    const d = new Date((entry.ts || 0) * 1000);
                    const hh = String(d.getHours()).padStart(2, '0');
                    const mm = String(d.getMinutes()).padStart(2, '0');
                    const ss = String(d.getSeconds()).padStart(2, '0');
                    return (
                      <div key={i} className={'fu-log__line fu-log__line--' + (entry.level || 'info')}>
                        <span className="fu-log__ts">
                          [{hh}:{mm}:{ss}]
                        </span>
                        {formatLogLine(entry, t)}
                      </div>
                    );
                  })
                ) : (
                  <div className="server-update-dialog__log-empty muted">{t('mod_job_phase_preparing')}</div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="fu-modal__footer server-update-dialog__footer" id="mjFooter">
          {running ? (
            <button type="button" className="btn btn--danger btn--with-icon" onClick={() => void modJob.stop()}>
              <AppIcon name="stop" size={16} />
              {t('about_factorio_update_dialog_stop')}
            </button>
          ) : (
            <button type="button" className="btn btn--with-icon" onClick={modJob.close}>
              <AppIcon name="close" size={16} />
              {t('close')}
            </button>
          )}
        </div>
      </div>
    </ModalBackdrop>
  );
}
