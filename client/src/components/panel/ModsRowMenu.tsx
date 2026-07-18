import { useRef } from 'react';
import { AnimatedContextMenu } from '../AnimatedContextMenu';
import { AppIcon } from '../AppIcon';
import { useClampedMenuStyle } from '../../hooks/useClampedMenuStyle';
import { useDismissibleMenu } from '../../hooks/useDismissibleMenu';
import { getModOpenUrl } from '../../lib/modUtils';
import type { ModRow } from '../../types/mods';

interface ModsRowMenuProps {
  open: boolean;
  item: ModRow | null;
  position: { x: number; y: number };
  serverBusy: boolean;
  blockUpdates: boolean;
  onClose: () => void;
  onUpdate: () => void;
  onDownload: () => void;
  onChangelog: () => void;
  onRemove: () => void;
  t: (key: string) => string;
}

export function ModsRowMenu({
  open,
  item,
  position,
  serverBusy,
  blockUpdates,
  onClose,
  onUpdate,
  onDownload,
  onChangelog,
  onRemove,
  t,
}: ModsRowMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissibleMenu(open, onClose, menuRef);
  const menuStyle = useClampedMenuStyle(open, position, menuRef);

  if (!item) return null;

  const isBuiltin = !!item.is_builtin;

  return (
    <AnimatedContextMenu
      open={open}
      menuRef={menuRef}
      id="modsRowMenu"
      className="instance-row-menu"
      style={menuStyle}
    >
      <button
        type="button"
        className="btn instance-row-menu__item btn--with-icon"
        id="btnModsMenuUpdate"
        disabled={serverBusy || isBuiltin || blockUpdates}
        onClick={(ev) => {
          ev.stopPropagation();
          onUpdate();
        }}
      >
        <AppIcon name="mod_update_" size={16} />
        {t('mod_list_update_selected_btn')}
      </button>
      <button
        type="button"
        className="btn instance-row-menu__item btn--with-icon"
        id="btnModsMenuDownload"
        disabled={isBuiltin}
        onClick={(ev) => {
          ev.stopPropagation();
          onDownload();
        }}
      >
        <AppIcon name="download" size={16} />
        {t('mod_list_download_selected_btn')}
      </button>
      <button
        type="button"
        className="btn instance-row-menu__item btn--with-icon"
        id="btnModsMenuChangelog"
        disabled={isBuiltin}
        onClick={(ev) => {
          ev.stopPropagation();
          onChangelog();
        }}
      >
        <AppIcon name="changelog" size={16} />
        {t('mod_list_changelog_btn')}
      </button>
      <button
        type="button"
        className="btn instance-row-menu__item btn--with-icon"
        id="btnModsMenuOpenPortal"
        onClick={(ev) => {
          ev.stopPropagation();
          const url = getModOpenUrl(item.name, isBuiltin);
          onClose();
          if (url) window.open(url, '_blank', 'noopener,noreferrer');
        }}
      >
        <AppIcon name="open_portal" size={16} />
        {t('mod_list_open_portal_btn')}
      </button>
      <button
        type="button"
        className="btn btn--danger instance-row-menu__item btn--with-icon"
        id="btnModsMenuRemove"
        disabled={serverBusy || isBuiltin}
        onClick={(ev) => {
          ev.stopPropagation();
          onRemove();
        }}
      >
        <AppIcon name="delete" size={16} />
        {t('mod_list_remove_mod_btn')}
      </button>
    </AnimatedContextMenu>
  );
}
