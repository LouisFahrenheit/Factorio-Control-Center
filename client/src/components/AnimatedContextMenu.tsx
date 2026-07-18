import { AnimatePresence, motion, type Transition } from 'motion/react';
import { type CSSProperties, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { webEffectsReduced } from '../theme/webEffects';

const MENU_ENTER: Transition = { duration: 0.2, ease: [0.16, 1, 0.3, 1] };
const MENU_EXIT: Transition = { duration: 0.14, ease: [0.4, 0, 0.7, 0.2] };

interface AnimatedContextMenuProps {
  open: boolean;
  menuRef: RefObject<HTMLDivElement | null>;
  className?: string;
  id?: string;
  style: { left: number; top: number };
  children: ReactNode;
  'aria-hidden'?: boolean | 'false' | 'true';
}

/** Fixed context menu with enter/exit motion (portaled to `document.body`). */
export function AnimatedContextMenu({
  open,
  menuRef,
  className,
  id,
  style,
  children,
  'aria-hidden': ariaHidden,
}: AnimatedContextMenuProps) {
  const reduced = webEffectsReduced();

  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          ref={menuRef}
          id={id}
          className={[className, 'fcc-context-menu'].filter(Boolean).join(' ')}
          aria-hidden={ariaHidden}
          style={
            {
              position: 'fixed',
              left: style.left,
              top: style.top,
              transformOrigin: '0 0',
            } as CSSProperties
          }
          initial={reduced ? false : { opacity: 0, scale: 0.94, y: -6 }}
          animate={reduced ? undefined : { opacity: 1, scale: 1, y: 0 }}
          exit={
            reduced
              ? undefined
              : { opacity: 0, scale: 0.97, y: -3, transition: MENU_EXIT }
          }
          transition={reduced ? { duration: 0 } : MENU_ENTER}
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
