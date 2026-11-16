import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import { createPortal } from 'react-dom';

interface AccessSummaryListProps {
  items: string[];
  maxVisible: number;
  variant: 'table' | 'card';
  title: string;
  emptyText?: string;
  highlightSingle?: boolean;
}

const VIEWPORT_PADDING = 10;

export function AccessSummaryList({
  items,
  maxVisible,
  variant,
  title,
  emptyText = '—',
  highlightSingle = false,
}: AccessSummaryListProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number }>({
    left: 0,
    top: 0,
  });

  const triggerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<number | null>(null);

  const visibleItems = items.slice(0, maxVisible);
  const hiddenCount = Math.max(0, items.length - maxVisible);
  const hasOverflow = hiddenCount > 0;

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
    }, 110);
  }, [clearCloseTimer]);

  const handleMouseEnter = useCallback(() => {
    if (!hasOverflow) return;
    clearCloseTimer();
    setOpen(true);
  }, [hasOverflow, clearCloseTimer]);

  const handleMoreClick = useCallback(
    (ev: MouseEvent<HTMLButtonElement>) => {
      ev.stopPropagation();
      clearCloseTimer();
      setOpen((prev) => !prev);
    },
    [clearCloseTimer],
  );

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    const triggerEl = triggerRef.current;
    const popoverEl = popoverRef.current;
    if (!triggerEl || !popoverEl) return;

    const updatePosition = () => {
      const triggerRect = triggerEl.getBoundingClientRect();
      const popRect = popoverEl.getBoundingClientRect();

      let top = triggerRect.bottom + 6;
      if (
        top + popRect.height + VIEWPORT_PADDING > window.innerHeight &&
        triggerRect.top - popRect.height - 6 >= VIEWPORT_PADDING
      ) {
        top = triggerRect.top - popRect.height - 6;
      } else {
        top = Math.min(
          top,
          Math.max(
            VIEWPORT_PADDING,
            window.innerHeight - popRect.height - VIEWPORT_PADDING,
          ),
        );
      }

      const maxLeft = Math.max(
        VIEWPORT_PADDING,
        window.innerWidth - popRect.width - VIEWPORT_PADDING,
      );
      const left = Math.min(
        Math.max(VIEWPORT_PADDING, triggerRect.left),
        maxLeft,
      );

      setCoords({ left: Math.round(left), top: Math.round(top) });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    return () => window.removeEventListener('resize', updatePosition);
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;

    const handleScroll = (ev: Event) => {
      if (
        popoverRef.current &&
        ev.target instanceof Node &&
        popoverRef.current.contains(ev.target)
      ) {
        return;
      }
      setOpen(false);
    };

    const handleKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        setOpen(false);
      }
    };

    const handlePointerDown = (ev: PointerEvent) => {
      const target = ev.target;
      if (!(target instanceof Node)) return;
      if (triggerRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  if (items.length === 0) {
    return <span className="access-summary__empty">{emptyText}</span>;
  }

  const joinedVisible = visibleItems.join(', ');
  const fullTooltip = !hasOverflow ? items.join(', ') : undefined;

  return (
    <>
      <div
        ref={triggerRef}
        className={`access-summary access-summary--${variant}`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={scheduleClose}
        title={fullTooltip}
      >
        <span
          className={
            'access-summary__text' +
            (highlightSingle ? ' access-summary__text--highlight' : '')
          }
        >
          {joinedVisible}
        </span>
        {hasOverflow && (
          <button
            type="button"
            className="access-summary__more"
            onClick={handleMoreClick}
            aria-expanded={open}
          >
            +{hiddenCount}
          </button>
        )}
      </div>

      {open &&
        hasOverflow &&
        createPortal(
          <div
            ref={popoverRef}
            className="access-summary-popover"
            style={
              {
                position: 'fixed',
                left: coords.left,
                top: coords.top,
              } as CSSProperties
            }
            onMouseEnter={clearCloseTimer}
            onMouseLeave={scheduleClose}
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="access-summary-popover__head">
              <span className="access-summary-popover__title">{title}</span>
              <span className="access-summary-popover__count">
                {items.length}
              </span>
            </div>
            <ul
              className={
                'access-summary-popover__list' +
                (items.length > 6
                  ? ' access-summary-popover__list--two-col'
                  : '')
              }
            >
              {items.map((item, idx) => (
                <li
                  key={`${item}-${idx}`}
                  className="access-summary-popover__item"
                >
                  <span className="access-summary-popover__dot" />
                  <span className="access-summary-popover__label">{item}</span>
                </li>
              ))}
            </ul>
          </div>,
          document.body,
        )}
    </>
  );
}
