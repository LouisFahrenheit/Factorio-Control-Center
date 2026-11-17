import type { Transition, Variants } from 'motion/react';

export const FCC_EASE_OUT: Transition['ease'] = [0.16, 1, 0.3, 1];

export const SCREEN_SECTION_VARIANTS: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.08, delayChildren: 0.06 },
  },
};

export const SCREEN_HEADER_VARIANTS: Variants = {
  hidden: { opacity: 0, y: -6 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.2, ease: FCC_EASE_OUT },
  },
};

export const SCREEN_BODY_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 6 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.22, ease: FCC_EASE_OUT },
  },
};

export const LIST_CONTAINER_VARIANTS: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.025, delayChildren: 0.015 },
  },
};

export const LIST_ROW_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 6, scale: 0.995 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.2, ease: FCC_EASE_OUT },
  },
};

export const LIST_WRAP_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 6, scale: 0.996 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.22, ease: FCC_EASE_OUT },
  },
};

export function listWrapVariants(listDelay = 0): Variants {
  if (listDelay <= 0) return LIST_WRAP_VARIANTS;
  return {
    hidden: { opacity: 0, y: 6, scale: 0.996 },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      transition: { duration: 0.22, ease: FCC_EASE_OUT, delay: listDelay },
    },
  };
}

export const PANEL_TAB_VARIANTS: Variants = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.035, delayChildren: 0.02 },
  },
};

export const PANEL_BLOCK_VARIANTS: Variants = {
  hidden: { opacity: 0, y: 6, scale: 0.995 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.22, ease: FCC_EASE_OUT },
  },
};

export const TAB_PANEL_ENTER_TRANSITION: Transition = {
  duration: 0.2,
  ease: FCC_EASE_OUT,
};
export const TAB_PANEL_EXIT_TRANSITION: Transition = {
  duration: 0.14,
  ease: [0.4, 0, 0.65, 0.2],
};

export const TAB_PANEL_MOTION = {
  initial: { opacity: 0, y: 6 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4, transition: TAB_PANEL_EXIT_TRANSITION },
  transition: TAB_PANEL_ENTER_TRANSITION,
};
