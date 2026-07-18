import { useCallback, useLayoutEffect, useState, type RefObject } from 'react';

export const TAB_INDICATOR_ID_ATTR = 'data-tab-indicator-id';

export type TabIndicatorRect = {
  left: number;
  top: number;
  width: number;
  height: number;
  visible: boolean;
};

const HIDDEN: TabIndicatorRect = { left: 0, top: 0, width: 0, height: 0, visible: false };

function sameRect(a: TabIndicatorRect, b: TabIndicatorRect): boolean {
  return (
    a.visible === b.visible &&
    a.left === b.left &&
    a.top === b.top &&
    a.width === b.width &&
    a.height === b.height
  );
}

export function useSlidingTabIndicator(
  containerRef: RefObject<HTMLElement | null>,
  activeId: string,
): TabIndicatorRect {
  const [rect, setRect] = useState<TabIndicatorRect>(HIDDEN);

  const measure = useCallback(() => {
    const root = containerRef.current;
    if (!root || !activeId) {
      setRect((prev) => (prev.visible ? HIDDEN : prev));
      return;
    }

    const tab = root.querySelector(
      `[${TAB_INDICATOR_ID_ATTR}="${CSS.escape(activeId)}"]`,
    ) as HTMLElement | null;
    if (!tab) {
      setRect((prev) => (prev.visible ? HIDDEN : prev));
      return;
    }

    const next: TabIndicatorRect = {
      left: tab.offsetLeft,
      top: tab.offsetTop,
      width: tab.offsetWidth,
      height: tab.offsetHeight,
      visible: true,
    };
    setRect((prev) => (sameRect(prev, next) ? prev : next));
  }, [activeId, containerRef]);

  useLayoutEffect(() => {
    measure();
  }, [measure]);

  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const ro = new ResizeObserver(() => measure());
    ro.observe(root);
    for (const tab of root.querySelectorAll(`[${TAB_INDICATOR_ID_ATTR}]`)) {
      ro.observe(tab);
    }
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [containerRef, measure, activeId]);

  return rect;
}
