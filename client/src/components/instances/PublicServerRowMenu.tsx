import { useRef } from 'react';
import {
  IconPencil,
  IconEye,
  IconEyeOff,
  IconCopy,
  IconExternalLink,
} from '@tabler/icons-react';
import { AnimatedContextMenu } from '../AnimatedContextMenu';
import { useClampedMenuStyle } from '../../hooks/useClampedMenuStyle';
import { useDismissibleMenu } from '../../hooks/useDismissibleMenu';
import type { InstanceItem } from '../../types/instance';

interface PublicServerRowMenuProps {
  open: boolean;
  item: InstanceItem | null;
  position: { x: number; y: number };
  onClose: () => void;
  onEdit: (item: InstanceItem) => void;
  onTogglePublic: (item: InstanceItem, makePublic: boolean) => void;
  onCopyAddress: (item: InstanceItem) => void;
  onOpenPublicPage?: (item: InstanceItem) => void;
  isPublicPageEnabled: boolean;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function PublicServerRowMenu({
  open,
  item,
  position,
  onClose,
  onEdit,
  onTogglePublic,
  onCopyAddress,
  onOpenPublicPage,
  isPublicPageEnabled,
  t,
}: PublicServerRowMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  useDismissibleMenu(open, onClose, menuRef);
  const menuStyle = useClampedMenuStyle(open, position, menuRef);

  if (!item) return null;

  const isPublic = Boolean(item.isPublic);

  return (
    <AnimatedContextMenu
      open={open}
      menuRef={menuRef}
      id="publicServerRowMenu"
      className="instance-row-menu"
      aria-hidden="false"
      style={menuStyle}
    >
      <button
        type="button"
        className="btn instance-row-menu__item btn--with-icon"
        id="btnPublicMenuEdit"
        onClick={(ev) => {
          ev.stopPropagation();
          onClose();
          onEdit(item);
        }}
      >
        <IconPencil size={16} />
        {t('instances_edit_btn') || t('edit_btn') || 'Редактировать'}
      </button>

      <button
        type="button"
        className="btn instance-row-menu__item btn--with-icon"
        id="btnPublicMenuToggle"
        onClick={(ev) => {
          ev.stopPropagation();
          onClose();
          onTogglePublic(item, !isPublic);
        }}
      >
        {isPublic ? <IconEyeOff size={16} /> : <IconEye size={16} />}
        {isPublic
          ? t('public_disable_server') || 'Скрыть с публичной страницы'
          : t('public_enable_server') || 'Отображать на публичной странице'}
      </button>

      <button
        type="button"
        className="btn instance-row-menu__item btn--with-icon"
        id="btnPublicMenuCopyAddr"
        onClick={(ev) => {
          ev.stopPropagation();
          onClose();
          onCopyAddress(item);
        }}
      >
        <IconCopy size={16} />
        {t('copy_ip') || 'Скопировать IP'}
      </button>

      {onOpenPublicPage && isPublic && isPublicPageEnabled && (
        <button
          type="button"
          className="btn instance-row-menu__item btn--with-icon"
          id="btnPublicMenuOpenPage"
          onClick={(ev) => {
            ev.stopPropagation();
            onClose();
            onOpenPublicPage(item);
          }}
        >
          <IconExternalLink size={16} />
          {t('open_public_page') || 'Открыть публичную страницу'}
        </button>
      )}
    </AnimatedContextMenu>
  );
}
