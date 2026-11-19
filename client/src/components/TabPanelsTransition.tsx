import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';

import { TAB_PANEL_MOTION } from '../lib/motionPresets';
import { webEffectsReduced } from '../theme/webEffects';
import { useUserWebDisableEffects } from '../hooks/useUserWebDisableEffects';

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
  const userDisabled = useUserWebDisableEffects();
  const reduced = userDisabled || webEffectsReduced();

  if (reduced) {
    const content = (
      <div key={activeKey} className={stageClassName}>
        {children}
      </div>
    );
    return className ? <div className={className}>{content}</div> : content;
  }

  const stage = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={activeKey}
        className={stageClassName}
        initial={TAB_PANEL_MOTION.initial}
        animate={TAB_PANEL_MOTION.animate}
        exit={TAB_PANEL_MOTION.exit}
        transition={TAB_PANEL_MOTION.transition}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );

  if (!className) return stage;
  return <div className={className}>{stage}</div>;
}
