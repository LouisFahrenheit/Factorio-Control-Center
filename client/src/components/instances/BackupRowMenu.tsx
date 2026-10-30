import { useRef } from 'react';
import { IconDownload, IconRotateClockwise, IconTrash } from '@tabler/icons-react';
import { AnimatedContextMenu } from '../AnimatedContextMenu';
import { useClampedMenuStyle } from '../../hooks/useClampedMenuStyle';
import { useDismissibleMenu } from '../../hooks/useDismissibleMenu';
import type { BackupEntry } from '../../hooks/useBackup';

interface BackupRowMenuProps {
  open: boolean;
  entry: BackupEntry | null;
  position: { x: number; y: number };
  onClose: () => void;
  onDownload: (entry: BackupEntry) => void;
  onRestore: (entry: BackupEntry) => void;
  onDelete: (entry: BackupEntry) => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function BackupRowMenu({
  open,
  entry,
  position,
  onClose,
  onDownload,
  onRestore,
  onDelete,
  t,
}: BackupRowMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissibleMenu(open, onClose, menuRef);
  const menuStyle = useClampedMenuStyle(open, position, menuRef);

  if (!entry) return null;

  return (
    <AnimatedContextMenu
      open={open}
      menuRef={menuRef}
      id="backupRowMenu"
      className="instance-row-menu"
      aria-hidden="false"
      style={menuStyle}
    >
      <button
        type="button"
        className="btn instance-row-menu__item btn--with-icon"
        id="btnBackupMenuDownload"
        onClick={(ev) => {
          ev.stopPropagation();
          onClose();
          onDownload(entry);
        }}
      >
        <IconDownload size={16} />
        {t('backup_download_btn')}
      </button>

      <button
        type="button"
        className="btn instance-row-menu__item btn--with-icon"
        id="btnBackupMenuRestore"
        onClick={(ev) => {
          ev.stopPropagation();
          onClose();
          onRestore(entry);
        }}
      >
        <IconRotateClockwise size={16} />
        {t('backup_restore_btn')}
      </button>

      <button
        type="button"
        className="btn btn--danger instance-row-menu__item btn--with-icon"
        id="btnBackupMenuDelete"
        onClick={(ev) => {
          ev.stopPropagation();
          onClose();
          onDelete(entry);
        }}
      >
        <IconTrash size={16} />
        {t('backup_delete_btn')}
      </button>
    </AnimatedContextMenu>
  );
}
