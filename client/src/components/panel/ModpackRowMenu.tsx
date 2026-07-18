import { useRef } from 'react';
import { AnimatedContextMenu } from '../AnimatedContextMenu';
import { AppIcon } from '../AppIcon';
import { useClampedMenuStyle } from '../../hooks/useClampedMenuStyle';
import { useDismissibleMenu } from '../../hooks/useDismissibleMenu';

interface ModpackRowMenuProps {
  open: boolean;
  name: string;
  serverBusy: boolean;
  isActive: boolean;
  position: { x: number; y: number };
  onClose: () => void;
  onActivate: () => void;
  onRename: () => void;
  onDelete: () => void;
  t: (key: string) => string;
}

export function ModpackRowMenu({
  open,
  name,
  serverBusy,
  isActive,
  position,
  onClose,
  onActivate,
  onRename,
  onDelete,
  t,
}: ModpackRowMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissibleMenu(open, onClose, menuRef);
  const menuStyle = useClampedMenuStyle(open, position, menuRef);

  if (!name) return null;

  return (
    <AnimatedContextMenu
      open={open}
      menuRef={menuRef}
      id="modpackRowMenu"
      className="instance-row-menu"
      style={menuStyle}
    >
      <button
        type="button"
        className="btn instance-row-menu__item btn--with-icon"
        id="btnModpackMenuActivate"
        disabled={serverBusy || isActive}
        title={isActive ? t('modpack_activate_already_active') : undefined}
        onClick={(ev) => {
          ev.stopPropagation();
          onActivate();
        }}
      >
        <AppIcon name="folder_check" size={16} />
        {t('modpack_activate_btn')}
      </button>
      <button
        type="button"
        className="btn instance-row-menu__item btn--with-icon"
        id="btnModpackMenuRename"
        onClick={(ev) => {
          ev.stopPropagation();
          onRename();
        }}
      >
        <AppIcon name="edit" size={16} />
        {t('modpack_rename_btn')}
      </button>
      <button
        type="button"
        className="btn btn--danger instance-row-menu__item btn--with-icon"
        id="btnModpackMenuDelete"
        onClick={(ev) => {
          ev.stopPropagation();
          onDelete();
        }}
      >
        <AppIcon name="delete" size={16} />
        {t('modpack_delete_btn')}
      </button>
    </AnimatedContextMenu>
  );
}
