import { useEffect, type RefObject } from 'react';

/** Close floating row menus on outside click; defer listener so the opening click does not dismiss. */
export function useDismissibleMenu(
  open: boolean,
  onClose: () => void,
  menuRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!open) return;

    const onDocPointer = (ev: MouseEvent) => {
      const menu = menuRef.current;
      if (menu && menu.contains(ev.target as Node)) return;
      onClose();
    };

    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose();
    };

    const timer = window.setTimeout(() => {
      document.addEventListener('mousedown', onDocPointer);
      document.addEventListener('keydown', onKey);
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', onDocPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, menuRef]);
}
