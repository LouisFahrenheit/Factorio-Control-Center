import { useRef } from 'react';
import { AnimatedContextMenu } from '../AnimatedContextMenu';
import { AppIcon } from '../AppIcon';
import { useClampedMenuStyle } from '../../hooks/useClampedMenuStyle';
import { useDismissibleMenu } from '../../hooks/useDismissibleMenu';
import {
  instanceMaintenanceManualMode,
  runningInstanceBlocked,
} from '../../lib/instanceUtils';
import type { InstanceItem } from '../../types/instance';

interface InstanceRowMenuProps {
  open: boolean;
  item: InstanceItem | null;
  position: { x: number; y: number };
  getEffectiveStatus: (item: InstanceItem) => string;
  onClose: () => void;
  onStart: () => void;
  onStop: () => void;
  onKill: () => void;
  onOpen: () => void;
  onEdit: () => void;
  onClone: () => void;
  onDelete: () => void;
  onEndMaintenance: () => void;
  t: (key: string) => string;
}

export function InstanceRowMenu({
  open,
  item,
  position,
  getEffectiveStatus,
  onClose,
  onStart,
  onStop,
  onKill,
  onOpen,
  onEdit,
  onClone,
  onDelete,
  onEndMaintenance,
  t,
}: InstanceRowMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useDismissibleMenu(open, onClose, menuRef);
  const menuStyle = useClampedMenuStyle(open, position, menuRef);

  if (!item) return null;

  const statusRaw = getEffectiveStatus(item);
  const isActive = statusRaw === 'running' || statusRaw === 'starting' || statusRaw === 'stopping';
  const isMaintLocked = statusRaw === 'maintenance' || !!item.maintenanceLock;
  const blocked = runningInstanceBlocked(item, getEffectiveStatus);
  const isManualMaint = instanceMaintenanceManualMode(item, getEffectiveStatus);

  return (
    <AnimatedContextMenu
      open={open}
      menuRef={menuRef}
      id="instanceRowMenu"
      className="instance-row-menu"
      aria-hidden="false"
      style={menuStyle}
    >
      <button
        type="button"
        className="btn instance-row-menu__item btn--with-icon"
        id="btnInstanceMenuOpen"
        onClick={(ev) => {
          ev.stopPropagation();
          onOpen();
        }}
      >
        <AppIcon name="open_panel" size={16} />
        {t('instances_open_btn')}
      </button>
      {!isActive && (
        <button
          type="button"
          className="btn instance-row-menu__item btn--with-icon"
          id="btnInstanceMenuStart"
          disabled={isMaintLocked}
          onClick={(ev) => {
            ev.stopPropagation();
            onStart();
          }}
        >
          <AppIcon name="start" size={16} />
          {t('start_btn')}
        </button>
      )}
      {isActive && (
        <button
          type="button"
          className="btn instance-row-menu__item btn--with-icon"
          id="btnInstanceMenuStop"
          onClick={(ev) => {
            ev.stopPropagation();
            onStop();
          }}
        >
          <AppIcon name="stop" size={16} />
          {t('stop_btn')}
        </button>
      )}
      {isActive && (
        <button
          type="button"
          className="btn btn--danger instance-row-menu__item btn--with-icon"
          id="btnInstanceMenuKill"
          onClick={(ev) => {
            ev.stopPropagation();
            onKill();
          }}
        >
          <AppIcon name="kill" size={16} />
          {t('kill_btn')}
        </button>
      )}
      <button
        type="button"
        className="btn instance-row-menu__item btn--with-icon"
        id="btnInstanceMenuEdit"
        disabled={blocked}
        onClick={onEdit}
      >
        <AppIcon name="edit" size={16} />
        {t('instances_edit_btn')}
      </button>
      <button
        type="button"
        className="btn instance-row-menu__item btn--with-icon"
        id="btnInstanceMenuClone"
        disabled={blocked}
        onClick={onClone}
      >
        <AppIcon name="folder_copy" size={16} />
        {t('instances_clone_btn')}
      </button>
      {isManualMaint && (
        <button
          type="button"
          className="btn instance-row-menu__item btn--with-icon"
          id="btnInstanceMenuEndMaintenance"
          onClick={onEndMaintenance}
        >
          <AppIcon name="maintenance" size={16} />
          {t('instances_menu_end_maintenance')}
        </button>
      )}
      <button
        type="button"
        className="btn btn--danger instance-row-menu__item btn--with-icon"
        id="btnInstanceMenuDelete"
        disabled={blocked}
        onClick={onDelete}
      >
        <AppIcon name="delete" size={16} />
        {t('instances_delete_btn')}
      </button>
    </AnimatedContextMenu>
  );
}
