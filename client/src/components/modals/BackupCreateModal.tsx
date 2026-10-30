import { Modal } from '@mantine/core';
import {
  IconArchive,
  IconDeviceFloppy,
  IconCheck,
  IconDatabase,
  IconFileCode,
  IconShieldCheck,
  IconMap,
  IconChartBar,
  IconFileText,
} from '@tabler/icons-react';
import { FccSwitch } from '../FccSwitch';

interface BackupCreateModalProps {
  opened: boolean;
  onClose: () => void;
  includeMetrics: boolean;
  onIncludeMetricsChange: (val: boolean) => void;
  includeLogs: boolean;
  onIncludeLogsChange: (val: boolean) => void;
  onSubmit: () => void;
  creating: boolean;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function BackupCreateModal({
  opened,
  onClose,
  includeMetrics,
  onIncludeMetricsChange,
  includeLogs,
  onIncludeLogsChange,
  onSubmit,
  creating,
  t,
}: BackupCreateModalProps) {
  const defaultItems = [
    {
      id: 'db',
      icon: IconDatabase,
      title: t('backup_included_db'),
    },
    {
      id: 'env',
      icon: IconFileCode,
      title: t('backup_included_env'),
    },
    {
      id: 'tls',
      icon: IconShieldCheck,
      title: t('backup_included_tls'),
    },
    {
      id: 'presets',
      icon: IconMap,
      title: t('backup_included_presets'),
    },
  ];

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      size={560}
      title={
        <span className="backup-modal-title">
          <IconArchive size={21} className="backup-modal-title__icon" />
          <span>{t('backup_create_title')}</span>
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
        <p className="backup-modal__desc">
          {t('backup_create_modal_desc')}
        </p>

        {/* ── Секция: По умолчанию в архиве ──────────────────────── */}
        <div className="backup-create-section">
          <div className="backup-create-section__header">
            <span className="backup-create-section__title">
              {t('backup_included_title')}
            </span>
            <span className="backup-create-section__badge">
              <IconCheck size={13} />
              {t('backup_type_auto') || 'Авто'}
            </span>
          </div>

          <div className="backup-included-list">
            {defaultItems.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.id} className="backup-included-item">
                  <div className="backup-included-item__icon">
                    <Icon size={17} />
                  </div>
                  <span className="backup-included-item__text">{item.title}</span>
                  <IconCheck size={16} className="backup-included-item__check" />
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Секция: Дополнительные опции ──────────────────────── */}
        <div className="backup-create-section">
          <div className="backup-create-section__header">
            <span className="backup-create-section__title">
              {t('backup_optional_title')}
            </span>
          </div>

          <div className="backup-optional-cards">
            {/* Метрики */}
            <div
              className={`backup-opt-card ${includeMetrics ? 'backup-opt-card--active' : ''}`}
              onClick={() => onIncludeMetricsChange(!includeMetrics)}
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
                  id="modalBackupOptMetrics"
                  checked={includeMetrics}
                  onChange={onIncludeMetricsChange}
                />
              </div>
            </div>

            {/* Логи серверов */}
            <div
              className={`backup-opt-card ${includeLogs ? 'backup-opt-card--active' : ''}`}
              onClick={() => onIncludeLogsChange(!includeLogs)}
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
                  id="modalBackupOptLogs"
                  checked={includeLogs}
                  onChange={onIncludeLogsChange}
                />
              </div>
            </div>
          </div>
        </div>

        {/* ── Footer ────────────────────────────────────────────── */}
        <div className="backup-modal__footer">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onClose}
            disabled={creating}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            className="btn btn--primary btn--with-icon"
            disabled={creating}
            onClick={onSubmit}
          >
            {creating ? (
              <>
                <div className="spinner spinner--sm" />
                <span>{t('backup_creating_label')}</span>
              </>
            ) : (
              <>
                <IconDeviceFloppy size={16} />
                <span>{t('backup_create_btn')}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
}
