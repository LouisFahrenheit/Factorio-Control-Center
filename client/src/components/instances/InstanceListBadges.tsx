import type { ServerListModBadgeId } from '@fcc/shared/server-list-mod-badges';
import {
  SERVER_LIST_MOD_BADGE_ICON_URL,
  SERVER_LIST_MOD_BADGE_I18N,
  SPACE_AGE_LIST_ICON_URL,
} from '../../lib/serverListIcons';

interface InstanceListBadgesProps {
  hasSpaceAge?: boolean;
  modBadges?: ServerListModBadgeId[];
  showModBadges?: boolean;
  iconsReady: boolean;
  isIconAvailable: (url: string) => boolean;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function InstanceListBadges({
  hasSpaceAge,
  modBadges = [],
  showModBadges = true,
  iconsReady,
  isIconAvailable,
  t,
}: InstanceListBadgesProps) {
  const badges = showModBadges
    ? modBadges.filter((id) => iconsReady && isIconAvailable(SERVER_LIST_MOD_BADGE_ICON_URL[id]))
    : [];
  const showSa = !!hasSpaceAge;

  if (!showSa && badges.length === 0) return null;
  if (!iconsReady) return null;

  return (
    <span className="instance-name-badges">
      {showSa &&
        (isIconAvailable(SPACE_AGE_LIST_ICON_URL) ? (
          <img
            src={SPACE_AGE_LIST_ICON_URL}
            alt=""
            className="instance-list-badge-icon"
            title={t('instance_space_age_badge_title')}
            draggable={false}
          />
        ) : (
          <span className="instance-sa-text" aria-hidden="true">
            SA
          </span>
        ))}
      {badges.map((id) => (
        <img
          key={id}
          src={SERVER_LIST_MOD_BADGE_ICON_URL[id]}
          alt=""
          className="instance-list-badge-icon"
          title={t(SERVER_LIST_MOD_BADGE_I18N[id])}
          draggable={false}
        />
      ))}
    </span>
  );
}
