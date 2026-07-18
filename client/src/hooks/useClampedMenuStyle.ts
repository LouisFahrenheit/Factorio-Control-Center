import { useLayoutEffect, useState, type RefObject } from 'react';

const MENU_VIEWPORT_PADDING = 8;

function clampMenuPosition(
  x: number,
  y: number,
  menuWidth: number,
  menuHeight: number,
  padding = MENU_VIEWPORT_PADDING,
): { left: number; top: number } {
  const maxLeft = Math.max(padding, window.innerWidth - menuWidth - padding);
  const maxTop = Math.max(padding, window.innerHeight - menuHeight - padding);
  return {
    left: Math.min(Math.max(padding, x), maxLeft),
    top: Math.min(Math.max(padding, y), maxTop),
  };
}

/** Keep fixed-position row menus inside the viewport after measuring rendered size. */
export function useClampedMenuStyle(
  open: boolean,
  position: { x: number; y: number },
  menuRef: RefObject<HTMLElement | null>,
): { left: number; top: number } {
  const [style, setStyle] = useState(() =>
    clampMenuPosition(position.x, position.y, 0, 0),
  );

  useLayoutEffect(() => {
    if (!open) return;
    const el = menuRef.current;
    if (!el) return;

    const apply = () => {
      const rect = el.getBoundingClientRect();
      setStyle(
        clampMenuPosition(position.x, position.y, rect.width, rect.height),
      );
    };

    apply();
    window.addEventListener('resize', apply);
    return () => window.removeEventListener('resize', apply);
  }, [open, position.x, position.y, menuRef]);

  return style;
}
