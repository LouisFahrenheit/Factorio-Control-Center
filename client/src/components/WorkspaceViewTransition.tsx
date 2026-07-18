import { AnimatePresence, motion, type Transition } from 'motion/react';
import type { ReactNode } from 'react';
import { hasPendingAppReveal } from '../hooks/useAppShellReveal';
import { FCC_EASE_OUT } from '../lib/motionPresets';
import { webEffectsReduced } from '../theme/webEffects';

const VIEW_ENTER: Transition = { duration: 0.38, ease: FCC_EASE_OUT };
const VIEW_EXIT: Transition = { duration: 0.24, ease: [0.4, 0, 0.65, 0.2] };
const LOGIN_ENTER: Transition = { duration: 0.58, ease: FCC_EASE_OUT };

export type WorkspaceViewKey = 'servers' | 'panel';

interface WorkspaceViewTransitionProps {
  view: WorkspaceViewKey;
  children: ReactNode;
}

export function WorkspaceViewTransition({ view, children }: WorkspaceViewTransitionProps) {
  const reduced = webEffectsReduced();
  const toPanel = view === 'panel';
  const postLogin = hasPendingAppReveal();

  return (
    <div className={`fcc-workspace-stage${postLogin ? ' fcc-workspace-stage--login-reveal' : ''}`}>
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
                    y: 14,
                    scale: 0.992,
                    filter: 'blur(5px)',
                  }
                : {
                    opacity: 0,
                    x: toPanel ? 32 : -32,
                    y: toPanel ? 0 : 6,
                    scale: 0.988,
                    filter: 'blur(4px)',
                  }
          }
          animate={
            reduced
              ? undefined
              : { opacity: 1, x: 0, y: 0, scale: 1, filter: 'blur(0px)' }
          }
          exit={
            reduced
              ? undefined
              : {
                  opacity: 0,
                  x: toPanel ? -18 : 18,
                  scale: 0.996,
                  filter: 'blur(2px)',
                  transition: VIEW_EXIT,
                }
          }
          transition={reduced ? { duration: 0 } : postLogin ? LOGIN_ENTER : VIEW_ENTER}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
