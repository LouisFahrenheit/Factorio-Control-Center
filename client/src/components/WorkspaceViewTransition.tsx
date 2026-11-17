import { AnimatePresence, motion, type Transition } from 'motion/react';
import type { ReactNode } from 'react';
import { hasPendingAppReveal } from '../hooks/useAppShellReveal';
import { FCC_EASE_OUT } from '../lib/motionPresets';
import { webEffectsReduced } from '../theme/webEffects';

const VIEW_ENTER: Transition = { duration: 0.22, ease: FCC_EASE_OUT };
const VIEW_EXIT: Transition = { duration: 0.15, ease: [0.4, 0, 0.65, 0.2] };
const LOGIN_ENTER: Transition = { duration: 0.42, ease: FCC_EASE_OUT };

export type WorkspaceViewKey = 'servers' | 'panel';

interface WorkspaceViewTransitionProps {
  view: WorkspaceViewKey;
  children: ReactNode;
}

export function WorkspaceViewTransition({
  view,
  children,
}: WorkspaceViewTransitionProps) {
  const reduced = webEffectsReduced();
  const toPanel = view === 'panel';
  const postLogin = hasPendingAppReveal();

  return (
    <div
      className={`fcc-workspace-stage${postLogin ? ' fcc-workspace-stage--login-reveal' : ''}`}
    >
      <AnimatePresence mode="wait" initial={!reduced}>
        <motion.div
          key={view}
          className="fcc-workspace-view"
          initial={
            reduced
              ? false
              : postLogin
                ? {
                    opacity: 0,
                    y: 8,
                    scale: 0.996,
                  }
                : {
                    opacity: 0,
                    x: toPanel ? 14 : -14,
                    y: toPanel ? 0 : 4,
                    scale: 0.995,
                  }
          }
          animate={reduced ? undefined : { opacity: 1, x: 0, y: 0, scale: 1 }}
          exit={
            reduced
              ? undefined
              : {
                  opacity: 0,
                  x: toPanel ? -10 : 10,
                  scale: 0.996,
                  transition: VIEW_EXIT,
                }
          }
          transition={
            reduced ? { duration: 0 } : postLogin ? LOGIN_ENTER : VIEW_ENTER
          }
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
