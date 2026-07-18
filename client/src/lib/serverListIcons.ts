import { useEffect, useState } from 'react';
import {
  SERVER_LIST_MOD_BADGE_ORDER,
  type ServerListModBadgeId,
} from '@fcc/shared/server-list-mod-badges';

/** Optional icons under `public/assets/server-list/`. */

export const SPACE_AGE_LIST_ICON_URL = '/assets/server-list/space-age.png';

export const SERVER_LIST_MOD_BADGE_ICON_URL: Record<ServerListModBadgeId, string> = {
  krastorio: '/assets/server-list/krastorio.png',
  nullius: '/assets/server-list/nullius.png',
  space_exploration: '/assets/server-list/space_exploration.png',
  ultracube: '/assets/server-list/ultracube.png',
  pyanodons: '/assets/server-list/pyanodons.png',
  angels: '/assets/server-list/angels.png',
};

export const SERVER_LIST_MOD_BADGE_I18N: Record<ServerListModBadgeId, string> = {
  krastorio: 'instance_mod_badge_krastorio_title',
  nullius: 'instance_mod_badge_nullius_title',
  space_exploration: 'instance_mod_badge_space_exploration_title',
  ultracube: 'instance_mod_badge_ultracube_title',
  pyanodons: 'instance_mod_badge_pyanodons_title',
  angels: 'instance_mod_badge_angels_title',
};

const ALL_LIST_ICON_URLS = [
  SPACE_AGE_LIST_ICON_URL,
  ...SERVER_LIST_MOD_BADGE_ORDER.map((id) => SERVER_LIST_MOD_BADGE_ICON_URL[id]),
];

const iconAvailability = new Map<string, boolean>();
let probePromise: Promise<void> | null = null;

function probeIcon(url: string): Promise<void> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      iconAvailability.set(url, true);
      resolve();
    };
    img.onerror = () => {
      iconAvailability.set(url, false);
      resolve();
    };
    img.src = url;
  });
}

/** Resolves once; caches whether each list icon URL is reachable. */
export function ensureServerListIconsProbed(): Promise<void> {
  if (iconAvailability.size >= ALL_LIST_ICON_URLS.length) {
    return Promise.resolve();
  }
  if (!probePromise) {
    probePromise = Promise.all(ALL_LIST_ICON_URLS.map(probeIcon)).then(() => undefined);
  }
  return probePromise;
}

export function getServerListIconAvailable(url: string): boolean | null {
  return iconAvailability.has(url) ? iconAvailability.get(url)! : null;
}

/** Probe once per page load (cached). */
export function useServerListIconsProbe(): { ready: boolean; isAvailable: (url: string) => boolean } {
  const [ready, setReady] = useState(iconAvailability.size >= ALL_LIST_ICON_URLS.length);

  useEffect(() => {
    if (ready) return;
    let cancelled = false;
    ensureServerListIconsProbed().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready]);

  return {
    ready,
    isAvailable: (url: string) => iconAvailability.get(url) === true,
  };
}

/** @deprecated Use useServerListIconsProbe */
export function useSpaceAgeListIconAvailable(): { iconOk: boolean; resolved: boolean } {
  const { ready, isAvailable } = useServerListIconsProbe();
  return { iconOk: isAvailable(SPACE_AGE_LIST_ICON_URL), resolved: ready };
}
