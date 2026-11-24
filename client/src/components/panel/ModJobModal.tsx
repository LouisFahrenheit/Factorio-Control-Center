import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AppIcon } from '../AppIcon';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { ModJobApi } from '../../hooks/useModJob';
import { formatModJobLogLine, mjLocalizeError } from '../../lib/modErrorUtils';
import { FCC_EASE_OUT } from '../../lib/motionPresets';
import { webEffectsReduced } from '../../theme/webEffects';
import type { ModJobLogEntry, ModJobStatus } from '../../types/modJob';
import type { AppIconName } from '../../lib/appIcons';

interface ModJobModalProps {
  modJob: ModJobApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

function actionLabel(
  status: ModJobStatus | null,
  stopRequested: boolean,
  t: ModJobModalProps['t'],
): string {
  if (stopRequested) return t('about_factorio_update_log_stop_requested');
  if (!status) return t('mod_job_phase_preparing');
  const phase = status.phase || 'idle';
  if (phase === 'download') return t('mod_job_phase_downloading');
  if (phase === 'install') return t('mod_job_phase_install');
  if (phase === 'preparing')
    return status.current_name || t('mod_job_phase_preparing');
  if (phase === 'done') return t('mod_job_phase_done');
  if (phase === 'cancelled') return t('mod_job_phase_cancelled');
  if (phase === 'error')
    return mjLocalizeError(
      status.error_key,
      status.error_args,
      status.error,
      t,
    );
  return t('mod_job_phase_preparing');
}

function phaseKind(status: ModJobStatus | null): string {
  if (!status) return 'preparing';
  const phase = status.phase || 'idle';
  if (phase === 'download' || phase === 'install' || phase === 'preparing')
    return phase;
  if (phase === 'done') return 'done';
  if (phase === 'cancelled') return 'cancelled';
  if (phase === 'error') return 'error';
  return 'preparing';
}

function headerIconName(kind: string): AppIconName {
  if (kind === 'error' || kind === 'cancelled') return 'warning';
  return 'packages';
}

function phaseIcon(kind: string): AppIconName {
  switch (kind) {
    case 'download':
      return 'download';
    case 'install':
      return 'folder_check';
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

function barClass(status: ModJobStatus | null, running: boolean): string {
  const base = 'server-update-dialog__bar mod-job-modal__bar';
  if (!status) return base + ' server-update-dialog__bar--indeterminate';
  const phase = status.phase || 'idle';
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
  if (phase === 'done' || phase === 'error' || phase === 'cancelled')
    return '100%';
  return '0%';
}

function barText(
  status: ModJobStatus | null,
  t: ModJobModalProps['t'],
): string {
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

function formatLogLine(
  entry: ModJobLogEntry,
  t: ModJobModalProps['t'],
): string {
  return formatModJobLogLine(entry, t);
}

function activeDownloadRows(
  status: ModJobStatus | null,
): { name: string; version?: string }[] {
  if (status?.phase !== 'download') return [];
  const rows = Array.isArray(status?.active_downloads)
    ? status.active_downloads
    : [];
  const clean = rows
    .map((row) => ({
      name: String(row?.name || '').trim(),
      version: String(row?.version || '').trim(),
    }))
    .filter((row) => row.name);
  if (clean.length) return clean;
  const name = String(status.current_name || '').trim();
  if (name) {
    const version = String(status.current_version || '').trim();
    return [{ name, version: version || undefined }];
  }
  return [];
}

export function ModJobModal({ modJob, t }: ModJobModalProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [copied, setCopied] = useState(false);

  const status = modJob.status;
  const running = !!status?.running;
  const logs = useMemo(
    () => (Array.isArray(status?.log) ? status.log : []),
    [status?.log],
  );
  const kind = phaseKind(status);
  const downloadRows = activeDownloadRows(status);
  const reduced = webEffectsReduced();

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs.length, status?.phase]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

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
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
        copyTimerRef.current = setTimeout(() => setCopied(false), 1400);
      },
      () => {},
    );
  }, [logs, t]);

  if (!modJob.open) return null;

  const stepLabel =
    status?.total_steps && status.total_steps > 0
      ? t('web_update_step_label', status.current_step || 0, status.total_steps)
      : '';

  const stepPct =
    status?.total_steps && status.total_steps > 0
      ? Math.min(
          100,
          Math.round(((status.current_step || 0) / status.total_steps) * 100),
        )
      : 0;

  const currentActionText = actionLabel(status, modJob.stopRequested, t);
  const progressMetaText = barText(status, t);

  const headerBadge = running ? (
    <span className="mod-job-modal__badge mod-job-modal__badge--running">
      <span className="mod-job-modal__badge-dot" aria-hidden="true" />
      {t('mod_job_modal_running_badge')}
    </span>
  ) : kind === 'done' ? (
    <span className="mod-job-modal__badge mod-job-modal__badge--done">
      {t('web_update_phase_done')}
    </span>
  ) : kind === 'error' ? (
    <span className="mod-job-modal__badge mod-job-modal__badge--error">
      {t('mod_job_phase_error')}
    </span>
  ) : kind === 'cancelled' ? (
    <span className="mod-job-modal__badge mod-job-modal__badge--warn">
      {t('mod_job_phase_cancelled')}
    </span>
  ) : null;

  return (
    <ModalBackdrop
      open
      id="mjModal"
      onClose={modJob.close}
      closeOnBackdropClick={!running}
      closeOnEscape={!running}
      backdropClassName="mod-job-backdrop--top"
    >
      <div
        className="fu-modal server-update-dialog server-update-dialog--progress server-update-dialog--mod-job mod-job-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="mjTitle"
      >
        <div className="mod-job-modal__header" id="mjTitle">
          <div className="mod-job-modal__header-main">
            <span
              className={
                'mod-job-modal__title-icon-wrap' +
                (running ? ' is-running' : '') +
                (kind === 'error' || kind === 'cancelled' ? ' is-warn' : '')
              }
              aria-hidden="true"
            >
              <AppIcon name={headerIconName(kind)} size={19} />
            </span>
            <span className="mod-job-modal__header-title">
              {t('mod_job_modal_title')}
            </span>
            {headerBadge}
          </div>

          <div className="mod-job-modal__header-right">
            {stepLabel ? (
              <span className="mod-job-modal__step-pill" id="mjStepLabel">
                {stepLabel}
              </span>
            ) : null}
            {!running ? (
              <button
                type="button"
                className="mod-job-modal__close"
                aria-label={t('close')}
                onClick={modJob.close}
              >
                <AppIcon name="close" size={18} />
              </button>
            ) : null}
          </div>
        </div>

        <div className="mod-job-modal__body">
          <section
            className={
              'mod-job-modal__section mod-job-modal__section--status mod-job-modal__section--' +
              kind
            }
            id="mjActionLabel"
          >
            <div className="mod-job-modal__section-head">
              <div className="mod-job-modal__status-main">
                <span
                  className={
                    'mod-job-modal__phase-icon' +
                    (running && kind === 'download'
                      ? ' mod-job-modal__phase-icon--downloading'
                      : '') +
                    (running && kind !== 'download'
                      ? ' mod-job-modal__phase-icon--pulse'
                      : '')
                  }
                  aria-hidden="true"
                >
                  <AppIcon name={phaseIcon(kind)} size={17} />
                </span>
                <span className="mod-job-modal__status-title">
                  {currentActionText}
                </span>
              </div>
              <span className="mod-job-modal__progress-stats" id="mjBarText">
                {progressMetaText}
              </span>
            </div>

            <div className="mod-job-modal__progress-body">
              <div className="mod-job-modal__bars">
                <div
                  className="server-update-dialog__progress-track fu-progress mod-job-modal__track"
                  aria-hidden="true"
                >
                  <div
                    className={barClass(status, running)}
                    id="mjBar"
                    style={{ width: barWidth(status) }}
                  />
                </div>
                {stepLabel ? (
                  <div className="mod-job-modal__step-track" aria-hidden="true">
                    <div
                      className="mod-job-modal__step-fill"
                      style={{ width: stepPct + '%' }}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <div className="mod-job-modal__workspace">
            <section className="mod-job-modal__section mod-job-modal__section--log">
              <div className="mod-job-modal__section-head">
                <div className="mod-job-modal__log-title-wrap">
                  <AppIcon
                    name="terminal"
                    size={15}
                    className="mod-job-modal__log-icon"
                  />
                  <span className="mod-job-modal__log-title">
                    {t('about_factorio_update_dialog_log_label')}
                  </span>
                  {logs.length > 0 ? (
                    <span className="mod-job-modal__log-count">
                      {logs.length}
                    </span>
                  ) : null}
                </div>

                <button
                  type="button"
                  className={
                    'btn btn--compact btn--with-icon mod-job-modal__copy-btn' +
                    (copied ? ' is-copied' : '')
                  }
                  disabled={!logs.length}
                  onClick={copyLog}
                >
                  <AppIcon name={copied ? 'check' : 'file_copy'} size={14} />
                  {t('about_factorio_update_dialog_copy_log')}
                </button>
              </div>

              <div
                className="fu-log server-update-dialog__log mod-job-modal__log"
                id="mjLog"
                ref={logRef}
              >
                {logs.length ? (
                  logs.map((entry, i) => {
                    const d = new Date((entry.ts || 0) * 1000);
                    const hh = String(d.getHours()).padStart(2, '0');
                    const mm = String(d.getMinutes()).padStart(2, '0');
                    const ss = String(d.getSeconds()).padStart(2, '0');
                    return (
                      <div
                        key={`${entry.ts || 0}-${i}`}
                        className={
                          'fu-log__line mod-job-modal__log-line fu-log__line--' +
                          (entry.level || 'info')
                        }
                      >
                        <span className="fu-log__ts">
                          [{hh}:{mm}:{ss}]
                        </span>
                        <span className="mod-job-modal__log-msg">
                          {formatLogLine(entry, t)}
                        </span>
                      </div>
                    );
                  })
                ) : (
                  <div className="server-update-dialog__log-empty muted">
                    {t('mod_job_phase_preparing')}
                  </div>
                )}
              </div>
            </section>

            <aside className="mod-job-modal__section mod-job-modal__section--downloads">
              <div className="mod-job-modal__section-head">
                <div className="mod-job-modal__log-title-wrap">
                  <AppIcon
                    name="download"
                    size={15}
                    className="mod-job-modal__log-icon"
                  />
                  <span className="mod-job-modal__log-title">
                    {t('mod_job_active_downloads_title')}
                  </span>
                </div>
                <span
                  className={
                    'mod-job-modal__log-count' +
                    (downloadRows.length > 0 ? ' is-active' : '')
                  }
                >
                  {downloadRows.length}
                </span>
              </div>

              <div className="mod-job-modal__downloads-body">
                {downloadRows.length > 0 ? (
                  <ul
                    className="mod-job-download-grid"
                    role="list"
                    aria-label={t('mod_job_active_downloads_title')}
                  >
                    <AnimatePresence initial={false} mode="popLayout">
                      {downloadRows.map((row) =>
                        reduced ? (
                          <li key={row.name} className="mod-job-download-card">
                            <span
                              className="mod-job-download-card__icon"
                              aria-hidden="true"
                            >
                              <AppIcon name="download" size={14} />
                            </span>
                            <div className="mod-job-download-card__meta">
                              <span className="mod-job-download-card__name">
                                {row.name}
                              </span>
                              {row.version ? (
                                <span className="mod-job-download-card__ver">
                                  v{row.version}
                                </span>
                              ) : null}
                            </div>
                          </li>
                        ) : (
                          <motion.li
                            key={row.name}
                            layout
                            initial={{ opacity: 0, y: 6, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.97 }}
                            transition={{ duration: 0.18, ease: FCC_EASE_OUT }}
                            className="mod-job-download-card"
                          >
                            <span
                              className="mod-job-download-card__icon"
                              aria-hidden="true"
                            >
                              <AppIcon name="download" size={14} />
                            </span>
                            <div className="mod-job-download-card__meta">
                              <span className="mod-job-download-card__name">
                                {row.name}
                              </span>
                              {row.version ? (
                                <span className="mod-job-download-card__ver">
                                  v{row.version}
                                </span>
                              ) : null}
                            </div>
                          </motion.li>
                        ),
                      )}
                    </AnimatePresence>
                  </ul>
                ) : running ? (
                  <div className="mod-job-modal__downloads-empty">
                    <span
                      className="mod-job-modal__downloads-empty-icon"
                      aria-hidden="true"
                    >
                      <AppIcon name="packages" size={18} />
                    </span>
                    <span className="mod-job-modal__downloads-empty-text">
                      {currentActionText}
                    </span>
                  </div>
                ) : null}
              </div>
            </aside>
          </div>
        </div>

        <div className="fu-modal__footer mod-job-modal__footer" id="mjFooter">
          {running ? (
            <button
              type="button"
              className="btn btn--danger btn--with-icon"
              disabled={modJob.stopRequested}
              onClick={() => void modJob.stop()}
            >
              <AppIcon name="stop" size={16} />
              {t('about_factorio_update_dialog_stop')}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--with-icon"
              onClick={modJob.close}
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
