import { Modal } from '@mantine/core';
import {
  IconClock,
  IconDeviceFloppy,
  IconChartBar,
  IconFileText,
  IconArchive,
  IconCalendar,
  IconRotateClockwise,
  IconPlayerPlay,
} from '@tabler/icons-react';
import { FccSwitch } from '../FccSwitch';

interface BackupAutoSettingsModalProps {
  opened: boolean;
  onClose: () => void;
  enabled: boolean;
  onEnabledChange: (val: boolean) => void;
  interval: string;
  onIntervalChange: (val: string) => void;
  maxCount: string;
  onMaxCountChange: (val: string) => void;
  includeMetrics: boolean;
  onIncludeMetricsChange: (val: boolean) => void;
  includeLogs: boolean;
  onIncludeLogsChange: (val: boolean) => void;
  lastRunAt?: string | null;
  nextRunAt?: string | null;
  onSave: () => void;
  saving: boolean;
  t: (key: string, ...args: (string | number)[]) => string;
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function BackupAutoSettingsModal({
  opened,
  onClose,
  enabled,
  onEnabledChange,
  interval,
  onIntervalChange,
  maxCount,
  onMaxCountChange,
  includeMetrics,
  onIncludeMetricsChange,
  includeLogs,
  onIncludeLogsChange,
  lastRunAt,
  nextRunAt,
  onSave,
  saving,
  t,
}: BackupAutoSettingsModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      size={540}
      title={
        <span className="backup-modal-title">
          <IconClock size={21} className="backup-modal-title__icon" />
          <span>{t('backup_auto_title')}</span>
        </span>
      }
      classNames={{
        content: 'fcc-modal',
        header: 'backup-modal__header',
        body: 'backup-modal__body',
        close: 'backup-modal__close',
      }}
    >
      <div className="backup-modal__content">
        {/* ── Главный тумблер: Hero Card ───────────────────────────── */}
        <div
          className={`backup-auto-hero ${enabled ? 'backup-auto-hero--active' : ''}`}
          onClick={() => onEnabledChange(!enabled)}
        >
          <div className="backup-auto-hero__icon">
            <IconClock size={24} />
          </div>
          <div className="backup-auto-hero__body">
            <span className="backup-auto-hero__title">
              {t('backup_auto_enabled_label')}
            </span>
            <span className="backup-auto-hero__hint">
              {enabled
                ? (t('backup_auto_status_active_desc') || 'Архивы создаются автоматически в фоновом режиме')
                : (t('backup_auto_status_disabled_desc') || 'Создание резервных копий по расписанию отключено')}
            </span>
          </div>
          <div
            className="backup-auto-hero__switch"
            onClick={(e) => e.stopPropagation()}
          >
            <FccSwitch
              id="modalBackupAutoEnabled"
              checked={enabled}
              onChange={onEnabledChange}
            />
          </div>
        </div>

        {/* ── Секция: Параметры расписания ───────────────────────── */}
        <div className={`backup-create-section ${!enabled ? 'backup-section--muted' : ''}`}>
          <span className="backup-create-section__title">
            {t('backup_schedule_section_title') || 'Параметры расписания'}
          </span>

          <div className="backup-auto-params-grid">
            {/* Интервал */}
            <div className="backup-auto-param-card">
              <div className="backup-auto-param-card__label-row">
                <IconCalendar size={16} className="backup-auto-param-card__icon" />
                <span className="backup-auto-param-card__label">
                  {t('backup_auto_interval_label')}
                </span>
              </div>
              <div className="backup-auto-param-card__input-wrap">
                <input
                  id="modalBackupAutoInterval"
                  type="number"
                  className="backup-auto-param-card__input"
                  min={1}
                  max={8760}
                  value={interval}
                  onChange={(e) => onIntervalChange(e.target.value)}
                  disabled={!enabled}
                />
                <span className="backup-auto-param-card__unit">
                  {t('backup_auto_interval_unit')}
                </span>
              </div>
            </div>

            {/* Глубина хранения */}
            <div className="backup-auto-param-card">
              <div className="backup-auto-param-card__label-row">
                <IconArchive size={16} className="backup-auto-param-card__icon" />
                <span className="backup-auto-param-card__label">
                  {t('backup_auto_max_count_label')}
                </span>
              </div>
              <div className="backup-auto-param-card__input-wrap">
                <input
                  id="modalBackupAutoMaxCount"
                  type="number"
                  className="backup-auto-param-card__input"
                  min={1}
                  max={100}
                  value={maxCount}
                  onChange={(e) => onMaxCountChange(e.target.value)}
                  disabled={!enabled}
                />
                <span className="backup-auto-param-card__unit">
                  {t('backup_auto_max_count_unit')}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Секция: Дополнительные данные ──────────────────────── */}
        <div className={`backup-create-section ${!enabled ? 'backup-section--muted' : ''}`}>
          <span className="backup-create-section__title">
            {t('backup_optional_title')}
          </span>

          <div className="backup-optional-cards">
            {/* Метрики */}
            <div
              className={`backup-opt-card ${includeMetrics && enabled ? 'backup-opt-card--active' : ''} ${!enabled ? 'backup-opt-card--disabled' : ''}`}
              onClick={() => enabled && onIncludeMetricsChange(!includeMetrics)}
            >
              <div className="backup-opt-card__icon">
                <IconChartBar size={22} />
              </div>
              <div className="backup-opt-card__body">
                <span className="backup-opt-card__title">
                  {t('backup_opt_include_metrics')}
                </span>
                <span className="backup-opt-card__hint">
                  {t('backup_opt_include_metrics_desc')}
                </span>
              </div>
              <div
                className="backup-opt-card__switch"
                onClick={(e) => e.stopPropagation()}
              >
                <FccSwitch
                  id="modalBackupAutoMetrics"
                  checked={includeMetrics}
                  disabled={!enabled}
                  onChange={onIncludeMetricsChange}
                />
              </div>
            </div>

            {/* Логи серверов */}
            <div
              className={`backup-opt-card ${includeLogs && enabled ? 'backup-opt-card--active' : ''} ${!enabled ? 'backup-opt-card--disabled' : ''}`}
              onClick={() => enabled && onIncludeLogsChange(!includeLogs)}
            >
              <div className="backup-opt-card__icon">
                <IconFileText size={22} />
              </div>
              <div className="backup-opt-card__body">
                <span className="backup-opt-card__title">
                  {t('backup_opt_include_logs')}
                </span>
                <span className="backup-opt-card__hint">
                  {t('backup_opt_include_logs_desc')}
                </span>
              </div>
              <div
                className="backup-opt-card__switch"
                onClick={(e) => e.stopPropagation()}
              >
                <FccSwitch
                  id="modalBackupAutoLogs"
                  checked={includeLogs}
                  disabled={!enabled}
                  onChange={onIncludeLogsChange}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Секция: Статус выполнения ───────────────────────────── */}
        {enabled && (lastRunAt || nextRunAt) ? (
          <div className="backup-auto-status-card">
            {lastRunAt ? (
              <div className="backup-auto-status-row">
                <div className="backup-auto-status-label">
                  <IconRotateClockwise size={15} />
                  <span>{t('backup_auto_last_run')}</span>
                </div>
                <span className="backup-auto-status-value">{formatDate(lastRunAt)}</span>
              </div>
            ) : null}
            {nextRunAt ? (
              <div className="backup-auto-status-row">
                <div className="backup-auto-status-label">
                  <IconPlayerPlay size={15} />
                  <span>{t('backup_auto_next_run')}</span>
                </div>
                <span className="backup-auto-status-value backup-auto-status-value--next">
                  {formatDate(nextRunAt)}
                </span>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ── Footer ────────────────────────────────────────────── */}
        <div className="backup-modal__footer">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onClose}
            disabled={saving}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            className="btn btn--primary btn--with-icon"
            disabled={saving}
            onClick={onSave}
          >
            {saving ? (
              <>
                <div className="spinner spinner--sm" />
                <span>{t('saving')}</span>
              </>
            ) : (
              <>
                <IconDeviceFloppy size={16} />
                <span>{t('backup_auto_save_btn')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
