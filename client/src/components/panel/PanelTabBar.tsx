import { motion } from 'motion/react';
import { useRef } from 'react';
import type { AppIconName } from '../../lib/appIcons';
import type { PanelTabKey } from '../../lib/permissions';
import { allowedPanelTabs } from '../../lib/permissions';
import { SCREEN_HEADER_VARIANTS } from '../../lib/motionPresets';
import { webEffectsReduced } from '../../theme/webEffects';
import type { AuthUser } from '../../types/instance';
import { useSlidingTabIndicator, TAB_INDICATOR_ID_ATTR } from '../../hooks/useSlidingTabIndicator';
import { AppIcon } from '../AppIcon';
import { SlidingTabIndicator } from '../SlidingTabHighlight';

const PANEL_TAB_ICONS: Record<PanelTabKey, AppIconName> = {
  main: 'start',
  serverSettings: 'settings',
  saves: 'save',
  mods: 'list',
  modpacks: 'folder_copy',
  commands: 'terminal',
  stats: 'users',
  history: 'history',
};

interface PanelTabBarProps {
  user: AuthUser | null;
  active: PanelTabKey;
  onChange: (key: PanelTabKey) => void;
  animate?: boolean;
  t: (key: string) => string;
}

export function PanelTabBar({ user, active, onChange, animate = true, t }: PanelTabBarProps) {
  const tabs = allowedPanelTabs(user);
  const reduced = webEffectsReduced() || !animate;
  const tablistRef = useRef<HTMLElement>(null);
  const indicator = useSlidingTabIndicator(tablistRef, active);
  if (!tabs.length) return null;

  return (
    <motion.nav
      ref={tablistRef}
      className="tabs"
      role="tablist"
      aria-label="sections"
      variants={reduced ? undefined : SCREEN_HEADER_VARIANTS}
      initial={reduced ? false : 'hidden'}
      animate={reduced ? undefined : 'show'}
    >
      <SlidingTabIndicator rect={indicator} />
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={'tabs__tab btn--with-icon' + (active === tab.key ? ' tabs__tab--active' : '')}
          role="tab"
          id={tab.btnId}
          aria-controls={tab.panelId}
          aria-selected={active === tab.key}
          data-i18n={tab.i18n}
          {...{ [TAB_INDICATOR_ID_ATTR]: tab.key }}
          onClick={() => onChange(tab.key)}
        >
          <span className="tabs__tab-inner">
            <AppIcon name={PANEL_TAB_ICONS[tab.key]} size={20} />
            {t(tab.i18n)}
          </span>
        </button>
      ))}
    </motion.nav>
  );
}
