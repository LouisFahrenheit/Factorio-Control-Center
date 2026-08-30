import { Modal } from '@mantine/core';
import { AppIcon } from '../AppIcon';
import type { BackupEntry, RestoreMode } from '../../hooks/useBackup';

interface BackupRestoreModalProps {
  opened: boolean;
  target: BackupEntry | null;
  mode: RestoreMode;
  onModeChange: (mode: RestoreMode) => void;
  onConfirm: () => void;
  onClose: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function BackupRestoreModal({
  opened,
  target,
  mode,
  onModeChange,
  onConfirm,
  onClose,
  t,
}: BackupRestoreModalProps) {
  if (!target) return null;

  const modes: { id: RestoreMode; label: string }[] = [
    {
      id: 'all',
      label: t('backup_restore_mode_all'),
    },
    {
      id: 'db_only',
      label: t('backup_restore_mode_db_only'),
    },
    {
      id: 'files_only',
      label: t('backup_restore_mode_files_only'),
    },
  ];

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      centered
      size={520}
      title={
        <span className="backup-restore-modal__header-title">
          <AppIcon name="warning" size={20} className="backup-restore-modal__header-icon" />
          <span>{t('backup_restore_confirm_title')}</span>
        </span>
      }
      classNames={{
        content: 'fcc-modal backup-restore-modal',
        header: 'backup-restore-modal__header',
        body: 'backup-restore-modal__body',
        close: 'backup-restore-modal__close',
      }}
    >
      <div className="backup-restore-modal__content">
        {/* Описание и имя архива */}
        <p className="backup-restore-modal__msg">{t('backup_restore_confirm_msg')}</p>

        <div className="backup-restore-modal__file-badge">
          <AppIcon name="folder_zip" size={20} className="backup-restore-modal__file-icon" />
          <span className="backup-restore-modal__file-name">{target.filename}</span>
        </div>

        {/* Предупреждение о перезапуске */}
        <div className="backup-restore-modal__callout">
          <AppIcon name="warning" size={18} className="backup-restore-modal__callout-icon" />
          <span className="backup-restore-modal__callout-text">
            {t('backup_restore_restart_warn')}
          </span>
        </div>

        {/* Выбор режима восстановления */}
        <div className="backup-restore-modal__section">
          <div className="backup-restore-modal__section-title">
            {t('backup_restore_mode_label')}
          </div>
          <div className="backup-restore-modal__options">
            {modes.map((m) => {
              const isSelected = mode === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`backup-restore-modal__option ${
                    isSelected ? 'backup-restore-modal__option--selected' : ''
                  }`}
                  onClick={() => onModeChange(m.id)}
                >
                  <span className={`backup-restore-modal__radio ${isSelected ? 'backup-restore-modal__radio--checked' : ''}`} />
                  <span className="backup-restore-modal__option-label">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Кнопки действий */}
        <div className="backup-restore-modal__actions">
          <button
            type="button"
            className="btn"
            onClick={onClose}
          >
            {t('cancel')}
          </button>
          <button
            type="button"
            id="backupRestoreConfirmBtn"
            className="btn btn--danger btn--with-icon"
            onClick={onConfirm}
          >
            <AppIcon name="restore" size={16} />
            <span>{t('backup_restore_btn')}</span>
          </button>
        </div>
      </div>
    </Modal>
  );
}
