import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';

import { TAB_PANEL_MOTION } from '../lib/motionPresets';
import { webEffectsReduced } from '../theme/webEffects';

type TabPanelsTransitionProps = {
  activeKey: string;
  children: ReactNode;
  className?: string;
  stageClassName?: string;
};

export function TabPanelsTransition({
  activeKey,
  children,
  className,
  stageClassName = 'tab-panels__stage',
}: TabPanelsTransitionProps) {
  const reduced = webEffectsReduced();

  const stage = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={activeKey}
        className={stageClassName}
        initial={reduced ? false : TAB_PANEL_MOTION.initial}
        animate={reduced ? undefined : TAB_PANEL_MOTION.animate}
        exit={reduced ? undefined : TAB_PANEL_MOTION.exit}
        transition={reduced ? { duration: 0 } : TAB_PANEL_MOTION.transition}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );

  if (!className) return stage;
  return <div className={className}>{stage}</div>;
}
