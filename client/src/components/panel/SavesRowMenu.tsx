import { useRef } from 'react';
import { AnimatedContextMenu } from '../AnimatedContextMenu';
import { AppIcon } from '../AppIcon';
import { useClampedMenuStyle } from '../../hooks/useClampedMenuStyle';
import { useDismissibleMenu } from '../../hooks/useDismissibleMenu';
import type { SaveRow } from '../../lib/saveUtils';

interface SavesRowMenuProps {
  open: boolean;
  item: SaveRow | null;
  position: { x: number; y: number };
  serverBusy: boolean;
  onClose: () => void;
  onDownload: () => void;
  onSetLaunch: () => void;
  onDuplicate: () => void;
  onRename: () => void;
  onDelete: () => void;
  t: (key: string) => string;
}

export function SavesRowMenu({
  open,
  item,
  position,
  serverBusy,
  onClose,
  onDownload,
  onSetLaunch,
  onDuplicate,
  onRename,
  onDelete,
  t,
}: SavesRowMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const isRunningActive = !!item?.is_running_active;

  useDismissibleMenu(open, onClose, menuRef);
  const menuStyle = useClampedMenuStyle(open, position, menuRef);

  if (!item) return null;

  return (
    <AnimatedContextMenu
      open={open}
      menuRef={menuRef}
      id="savesRowMenu"
      className="instance-row-menu"
      style={menuStyle}
    >
      <button type="button" className="btn instance-row-menu__item btn--with-icon" onClick={onDownload}>
        <AppIcon name="download" size={16} />
        {t('saves_manager_download')}
      </button>
      <button
        type="button"
        className="btn instance-row-menu__item btn--with-icon"
        disabled={serverBusy}
        onClick={onSetLaunch}
      >
        <AppIcon name="start_save" size={16} />
        {t('saves_manager_use_for_launch')}
      </button>
      <button type="button" className="btn instance-row-menu__item btn--with-icon" onClick={onDuplicate}>
        <AppIcon name="file_copy" size={16} />
        {t('saves_manager_duplicate')}
      </button>
      <button
        type="button"
        className="btn instance-row-menu__item btn--with-icon"
        disabled={isRunningActive}
        onClick={onRename}
      >
        <AppIcon name="edit" size={16} />
        {t('saves_manager_rename')}
      </button>
      <button
        type="button"
        className="btn btn--danger instance-row-menu__item btn--with-icon"
        disabled={isRunningActive}
        onClick={onDelete}
      >
        <AppIcon name="delete" size={16} />
        {t('saves_manager_delete')}
      </button>
    </AnimatedContextMenu>
  );
}
