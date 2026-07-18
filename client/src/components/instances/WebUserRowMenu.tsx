import { useRef } from 'react';
import { AnimatedContextMenu } from '../AnimatedContextMenu';
import { AppIcon } from '../AppIcon';
import { useClampedMenuStyle } from '../../hooks/useClampedMenuStyle';
import { useDismissibleMenu } from '../../hooks/useDismissibleMenu';
import type { WebUser } from '../../types/webUser';

interface WebUserRowMenuProps {
  open: boolean;
  user: WebUser | null;
  position: { x: number; y: number };
  lastAdminLocked?: boolean;
  onClose: () => void;
  onEnable: () => void;
  onDisable: () => void;
  onEdit: () => void;
  onDelete: () => void;
  t: (key: string) => string;
}

export function WebUserRowMenu({
  open,
  user,
  position,
  lastAdminLocked = false,
  onClose,
  onEnable,
  onDisable,
  onEdit,
  onDelete,
  t,
}: WebUserRowMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissibleMenu(open, onClose, menuRef);
  const menuStyle = useClampedMenuStyle(open, position, menuRef);

  if (!user) return null;
  const enabled = user.enabled !== false;

  return (
    <AnimatedContextMenu
      open={open}
      menuRef={menuRef}
      id="webUserRowMenu"
      className="instance-row-menu"
      aria-hidden="false"
      style={menuStyle}
    >
      {!enabled && (
        <button type="button" className="btn instance-row-menu__item btn--with-icon" onClick={onEnable}>
          <AppIcon name="mode_off_on" size={16} />
          {t('maintenance_menu_activate')}
        </button>
      )}
      {enabled && !lastAdminLocked && (
        <button type="button" className="btn instance-row-menu__item btn--with-icon" onClick={onDisable}>
          <AppIcon name="mode_off_on" size={16} />
          {t('maintenance_menu_deactivate')}
        </button>
      )}
      <button type="button" className="btn instance-row-menu__item btn--with-icon" onClick={onEdit}>
        <AppIcon name="edit" size={16} />
        {t('maintenance_menu_edit')}
      </button>
      {!lastAdminLocked && (
        <button type="button" className="btn btn--danger instance-row-menu__item btn--with-icon" onClick={onDelete}>
          <AppIcon name="delete" size={16} />
          {t('maintenance_menu_delete')}
        </button>
      )}
    </AnimatedContextMenu>
  );
}
