import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, type Transition, type Variants } from 'motion/react';
import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { FccSwitch } from '../FccSwitch';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import type { FactorioUpdateApi } from '../../hooks/useFactorioUpdate';
import { fuLocalizeError } from '../../lib/factorioUpdateUtils';
import { FCC_EASE_OUT } from '../../lib/motionPresets';
import { webEffectsReduced } from '../../theme/webEffects';
import type { ModJobLogEntry } from '../../types/modJob';
import type { FactorioUpdateStatus } from '../../types/factorioUpdate';
import type { AppIconName } from '../../lib/appIcons';

const VERSION_MENU_SCROLL_THRESHOLD = 10;
const VERSION_MENU_ENTER: Transition = { duration: 0.2, ease: FCC_EASE_OUT };
const VERSION_MENU_EXIT: Transition = { duration: 0.14, ease: [0.4, 0, 0.7, 0.2] };

const VERSION_MENU_LIST: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.04, delayChildren: 0.02 },
  },
  exit: {
    transition: { staggerChildren: 0.025, staggerDirection: -1 },
  },
};

const VERSION_MENU_ITEM: Variants = {
  hidden: { opacity: 0, scale: 0.96, y: -6 },
  show: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: VERSION_MENU_ENTER,
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: -3,
    transition: VERSION_MENU_EXIT,
  },
};

interface FactorioUpdateModalProps {
  factorioUpdate: FactorioUpdateApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

function formatVersionLabel(
  version: string,
  showExperimental: boolean,
  expSet: Set<string>,
  t: FactorioUpdateModalProps['t'],
): string {
  return showExperimental && expSet.has(version)
    ? t('instances_download_version_experimental', version)
    : version;
}

interface VersionSelectDropdownProps {
  id: string;
  versions: string[];
  expSet: Set<string>;
  showExperimental: boolean;
  value: string;
  onChange: (version: string) => void;
  t: FactorioUpdateModalProps['t'];
}

function VersionSelectDropdown({
  id,
  versions,
  expSet,
  showExperimental,
  value,
  onChange,
  t,
}: VersionSelectDropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const reduced = webEffectsReduced();

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      const root = rootRef.current;
      if (!root || root.contains(e.target as Node)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer, true);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [open]);

  const selectedLabel = formatVersionLabel(value, showExperimental, expSet, t);
  const menuScrollable = versions.length > VERSION_MENU_SCROLL_THRESHOLD;

  return (
    <div ref={rootRef} className={'server-update-dialog__version-picker' + (open ? ' is-open' : '')}>
      <button
        type="button"
        id={id}
        className="input server-update-dialog__version-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="server-update-dialog__version-trigger-text">{selectedLabel}</span>
        <span className="server-update-dialog__version-trigger-chevron" aria-hidden="true" />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.ul
            className={
              'server-update-dialog__version-menu' +
              (menuScrollable ? ' server-update-dialog__version-menu--scrollable' : '')
            }
            role="listbox"
            aria-labelledby={id}
            variants={reduced ? undefined : VERSION_MENU_LIST}
            initial={reduced ? false : 'hidden'}
            animate={reduced ? undefined : 'show'}
            exit={reduced ? undefined : 'exit'}
          >
            {versions.map((v) => {
              const label = formatVersionLabel(v, showExperimental, expSet, t);
              const active = v === value;
              return (
                <motion.li
                  key={v}
                  role="presentation"
                  variants={reduced ? undefined : VERSION_MENU_ITEM}
                  style={reduced ? undefined : { transformOrigin: 'top center' }}
                >
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    className={'server-update-dialog__version-option' + (active ? ' is-active' : '')}
                    onClick={() => {
                      onChange(v);
                      setOpen(false);
                    }}
                  >
                    {label}
                  </button>
                </motion.li>
              );
            })}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function formatLogLine(entry: ModJobLogEntry, t: FactorioUpdateModalProps['t']): string {
  if (entry.key) return t(entry.key, ...(entry.args || []));
  return entry.text || '';
}

function actionLabel(status: FactorioUpdateStatus | null, t: FactorioUpdateModalProps['t']): string {
  if (!status) return t('web_update_phase_preparing');
  const phase = status.phase || 'idle';
  if (phase === 'download') return t('web_update_phase_download', status.from || '?', status.to || '?');
  if (phase === 'apply') return t('web_update_phase_apply', status.from || '?', status.to || '?');
  if (phase === 'preparing') return t('web_update_phase_preparing');
  if (phase === 'done') {
    if (status.partial) return t('about_factorio_update_partial_ok', status.final_to || '');
    return t('about_factorio_update_success', status.final_to || '');
  }
  if (phase === 'cancelled') return t('about_factorio_update_cancelled_summary');
  if (phase === 'error') return fuLocalizeError(status.error_key, status.error_args, status.error, t);
  return t('web_update_phase_preparing');
}

function phaseKind(status: FactorioUpdateStatus | null): string {
  if (!status) return 'preparing';
  const phase = status.phase || 'idle';
  if (phase === 'download' || phase === 'apply' || phase === 'preparing') return phase;
  if (phase === 'done') return 'done';
  if (phase === 'cancelled') return 'cancelled';
  if (phase === 'error') return 'error';
  return 'preparing';
}

function barClass(status: FactorioUpdateStatus | null): string {
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

function barWidth(status: FactorioUpdateStatus | null): string {
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

function barText(status: FactorioUpdateStatus | null, t: FactorioUpdateModalProps['t']): string {
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
  if (phase === 'cancelled') return t('web_update_phase_cancelled');
  if (phase === 'error') return t('web_update_phase_error');
  return '';
}

function phaseIcon(kind: string): AppIconName {
  switch (kind) {
    case 'download':
      return 'download';
    case 'apply':
      return 'settings';
    case 'done':
      return 'folder_check';
    case 'error':
      return 'info';
    case 'cancelled':
      return 'close';
    default:
      return 'update';
  }
}

export function FactorioUpdateModal({ factorioUpdate, t }: FactorioUpdateModalProps) {
  const logRef = useRef<HTMLDivElement>(null);
  const status = factorioUpdate.status;
  const running = !!status?.running;
  const logs = Array.isArray(status?.log) ? status.log : [];
  const isPick = factorioUpdate.mode === 'pick';
  const kind = phaseKind(status);

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

  if (!factorioUpdate.open) return null;

  const stepLabel =
    status?.total_steps && status.total_steps > 0
      ? t('web_update_step_label', status.current_step || 0, status.total_steps)
      : '';

  const stepPct =
    status?.total_steps && status.total_steps > 0
      ? Math.min(100, Math.round(((status.current_step || 0) / status.total_steps) * 100))
      : 0;

  return (
    <ModalBackdrop open id="fuModal" onClose={running ? () => {} : factorioUpdate.close}>
      <div
        className={
          'fu-modal server-update-dialog' +
          (isPick ? ' server-update-dialog--pick' : ' server-update-dialog--progress')
        }
        role="dialog"
        aria-modal="true"
        aria-labelledby="fuTitle"
      >
        <div className="fu-modal__header server-update-dialog__header" id="fuTitle">
          <AppIcon name="update" size={22} className="server-update-dialog__header-icon" />
          <div className="server-update-dialog__header-text">
            <span className="server-update-dialog__header-title">{t('web_update_modal_title')}</span>
            {!isPick && running ? (
              <span className="server-update-dialog__header-badge server-update-dialog__header-badge--active">
                {t('about_factorio_update_dialog_starting').replace('…', '')}
              </span>
            ) : null}
          </div>
        </div>

        <div className="fu-modal__body server-update-dialog__body">
          {isPick && (
            <div id="fuPickSection" className="server-update-dialog__pick-card">
              <div className="server-update-dialog__card-head">
                <span className="server-update-dialog__card-head-title">{t('about_factorio_update_pick_version_title')}</span>
              </div>
              <div className="server-update-dialog__field">
                <label className="server-update-dialog__field-label" htmlFor="fuVersionSelect" id="fuPickLabel">
                  {t('web_update_target_label')}
                </label>
                <VersionSelectDropdown
                  id="fuVersionSelect"
                  versions={factorioUpdate.versionOptions.versions}
                  expSet={factorioUpdate.versionOptions.expSet}
                  showExperimental={factorioUpdate.showExperimental}
                  value={factorioUpdate.selectedVersion}
                  onChange={factorioUpdate.setSelectedVersion}
                  t={t}
                />
              </div>
              <FccSwitch
                id="fuShowExperimental"
                className="server-update-dialog__experimental"
                labelClassName="server-update-dialog__experimental-label"
                checked={factorioUpdate.showExperimental}
                onChange={(checked) => factorioUpdate.setShowExperimental(checked)}
                label={t('instances_download_show_experimental')}
              />
            </div>
          )}

          {!isPick && (
            <div id="fuProgressSection" className="server-update-dialog__progress">
              {stepLabel ? (
                <div className="server-update-dialog__step-row" id="fuStepLabel">
                  <span className="server-update-dialog__step-badge">{stepLabel}</span>
                  <div className="server-update-dialog__step-track" aria-hidden="true">
                    <div className="server-update-dialog__step-fill" style={{ width: stepPct + '%' }} />
                  </div>
                </div>
              ) : null}

              <div
                className={'server-update-dialog__status-card server-update-dialog__status-card--' + kind}
                id="fuActionLabel"
              >
                <span className="server-update-dialog__status-icon-wrap" aria-hidden="true">
                  <AppIcon name={phaseIcon(kind)} size={18} className="server-update-dialog__status-icon" />
                </span>
                <span className="server-update-dialog__status-text">{actionLabel(status, t)}</span>
              </div>

              <div className="server-update-dialog__progress-block">
                <div className="server-update-dialog__progress-track fu-progress" aria-hidden="true">
                  <div className={barClass(status)} id="fuBar" style={{ width: barWidth(status) }} />
                </div>
                <div className="server-update-dialog__progress-meta">
                  <span className="server-update-dialog__progress-text" id="fuBarText">
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
                <div className="fu-log server-update-dialog__log" id="fuLog" ref={logRef}>
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
                    <div className="server-update-dialog__log-empty muted">{t('about_factorio_update_dialog_preparing')}</div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="fu-modal__footer server-update-dialog__footer" id="fuFooter">
          {isPick && (
            <>
              <CancelButton onClick={factorioUpdate.close} t={t} />
              <button
                type="button"
                className="btn btn--primary btn--with-icon"
                onClick={() => void factorioUpdate.startUpdate(factorioUpdate.selectedVersion)}
              >
                <AppIcon name="update" size={16} />
                {t('web_update_start_btn')}
              </button>
            </>
          )}
          {!isPick &&
            (running ? (
              <button
                type="button"
                className="btn btn--danger btn--with-icon"
                onClick={() => void factorioUpdate.stopUpdate()}
              >
                <AppIcon name="stop" size={16} />
                {t('about_factorio_update_dialog_stop')}
              </button>
            ) : (
              <button type="button" className="btn btn--with-icon" onClick={factorioUpdate.close}>
                <AppIcon name="close" size={16} />
                {t('close')}
              </button>
            ))}
        </div>
      </div>
    </ModalBackdrop>
  );
}
