import { useRef } from 'react';
import { AnimatedContextMenu } from '../AnimatedContextMenu';
import { AppIcon } from '../AppIcon';
import { useClampedMenuStyle } from '../../hooks/useClampedMenuStyle';
import { useDismissibleMenu } from '../../hooks/useDismissibleMenu';
import type { MaintenanceTask } from '../../types/maintenance';

interface MaintenanceTaskMenuProps {
  open: boolean;
  task: MaintenanceTask | null;
  position: { x: number; y: number };
  onClose: () => void;
  onActivate: () => void;
  onDeactivate: () => void;
  onRunNow: () => void;
  onEdit: () => void;
  onDelete: () => void;
  t: (key: string) => string;
}

export function MaintenanceTaskMenu({
  open,
  task,
  position,
  onClose,
  onActivate,
  onDeactivate,
  onRunNow,
  onEdit,
  onDelete,
  t,
}: MaintenanceTaskMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissibleMenu(open, onClose, menuRef);
  const menuStyle = useClampedMenuStyle(open, position, menuRef);

  if (!task) return null;
  const active = !!task.active;

  return (
    <AnimatedContextMenu
      open={open}
      menuRef={menuRef}
      id="maintTaskRowMenu"
      className="maintenance-row-menu"
      aria-hidden="false"
      style={menuStyle}
    >
      {!active && (
        <button type="button" className="btn maintenance-row-menu__item btn--with-icon" onClick={onActivate}>
          <AppIcon name="mode_off_on" size={16} />
          {t('maintenance_menu_activate')}
        </button>
      )}
      {active && (
        <button type="button" className="btn maintenance-row-menu__item btn--with-icon" onClick={onDeactivate}>
          <AppIcon name="mode_off_on" size={16} />
          {t('maintenance_menu_deactivate')}
        </button>
      )}
      <button type="button" className="btn maintenance-row-menu__item btn--with-icon" onClick={onRunNow}>
        <AppIcon name="start" size={16} />
        {t('maintenance_menu_run_now')}
      </button>
      <button type="button" className="btn maintenance-row-menu__item btn--with-icon" onClick={onEdit}>
        <AppIcon name="edit" size={16} />
        {t('maintenance_menu_edit')}
      </button>
      <button type="button" className="btn btn--danger maintenance-row-menu__item btn--with-icon" onClick={onDelete}>
        <AppIcon name="delete" size={16} />
        {t('maintenance_menu_delete')}
      </button>
    </AnimatedContextMenu>
  );
}
