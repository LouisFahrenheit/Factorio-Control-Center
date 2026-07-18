import { motion } from 'motion/react';

import type { TabIndicatorRect } from '../hooks/useSlidingTabIndicator';
import { webEffectsReduced } from '../theme/webEffects';

type SlidingTabIndicatorProps = {
  rect: TabIndicatorRect;
  variant?: 'tabs' | 'sub-tabs';
};

/** Single floating highlight — animates only when position/size actually changes. */
export function SlidingTabIndicator({ rect, variant = 'tabs' }: SlidingTabIndicatorProps) {
  if (!rect.visible) return null;

  const reduced = webEffectsReduced();
  const className =
    (variant === 'sub-tabs' ? 'sub-tabs__sliding-highlight' : 'tabs__sliding-highlight') +
    ' tabs__sliding-highlight--float';

  return (
    <motion.span
      className={className}
      aria-hidden="true"
      initial={false}
      animate={{
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      }}
      transition={
        reduced
          ? { duration: 0 }
          : { type: 'spring', stiffness: 420, damping: 34, mass: 0.8 }
      }
    />
  );
}
