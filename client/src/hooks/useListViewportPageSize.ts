import { useLayoutEffect, useState, type RefObject } from 'react';

const DEFAULT_ROW_HEIGHT = 56;
const ROW_GAP = 3;

export function useListViewportPageSize(
  containerRef: RefObject<HTMLElement | null>,
  rowSelector: string,
  enabled: boolean,
  deps: readonly unknown[] = [],
): number {
  const [pageSize, setPageSize] = useState(8);

  useLayoutEffect(() => {
    if (!enabled) return;
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const height = el.clientHeight;
      if (height <= 0) return;
      const sample = el.querySelector(rowSelector) as HTMLElement | null;
      const rowHeight = sample?.offsetHeight || DEFAULT_ROW_HEIGHT;
      const next = Math.max(1, Math.floor((height + ROW_GAP) / (rowHeight + ROW_GAP)));
      setPageSize((prev) => (prev === next ? prev : next));
    };

    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    const split = el.closest('.maintenance-reports-split');
    if (split) ro.observe(split);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [containerRef, rowSelector, enabled, ...deps]);

  return pageSize;
}
