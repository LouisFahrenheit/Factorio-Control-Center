import { useRef } from 'react';
import {
  IconCopy,
  IconUserX,
  IconBan,
  IconVolumeOff,
  IconVolume,
  IconEraser,
  IconShield,
  IconShieldOff,
  IconLockOpen,
} from '@tabler/icons-react';
import { AnimatedContextMenu } from '../AnimatedContextMenu';
import { useClampedMenuStyle } from '../../hooks/useClampedMenuStyle';
import { useDismissibleMenu } from '../../hooks/useDismissibleMenu';
import { notifyOk } from '../../lib/notify';

export interface PlayerRowMenuProps {
  open: boolean;
  player: string | null;
  position: { x: number; y: number };
  isAdmin: boolean;
  isBanned: boolean;
  canEditAdmins: boolean;
  onClose: () => void;
  onKick: (player: string) => void;
  onBan: (player: string) => void;
  onUnban: (player: string) => void;
  onMute: (player: string) => void;
  onUnmute: (player: string) => void;
  onPurge: (player: string) => void;
  onToggleAdmin: (player: string) => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function PlayerRowMenu({
  open,
  player,
  position,
  isAdmin,
  isBanned,
  canEditAdmins,
  onClose,
  onKick,
  onBan,
  onUnban,
  onMute,
  onUnmute,
  onPurge,
  onToggleAdmin,
  t,
}: PlayerRowMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useDismissibleMenu(open, onClose, menuRef);
  const menuStyle = useClampedMenuStyle(open, position, menuRef);

  if (!player) return null;

  async function handleCopyNick() {
    if (!player) return;
    try {
      await navigator.clipboard.writeText(player);
      notifyOk(player, t('copied_to_clipboard'));
    } catch {
      // Fallback
      const ta = document.createElement('textarea');
      ta.value = player;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand('copy');
        notifyOk(player, t('copied_to_clipboard'));
      } finally {
        document.body.removeChild(ta);
      }
    }
  }

  return (
    <AnimatedContextMenu
      open={open}
      menuRef={menuRef}
      id="playerRowMenu"
      className="instance-row-menu player-row-menu"
      style={menuStyle}
    >
      <div className="player-row-menu__header">
        <span className="player-row-menu__player-name">{player}</span>
      </div>

      <button
        type="button"
        className="btn instance-row-menu__item btn--with-icon"
        onClick={() => {
          onClose();
          void handleCopyNick();
        }}
      >
        <IconCopy size={16} />
        {t('copy_player_name')}
      </button>

      <button
        type="button"
        className="btn instance-row-menu__item btn--with-icon"
        onClick={() => {
          onClose();
          onKick(player);
        }}
      >
        <IconUserX size={16} />
        {t('kick_player')}
      </button>

      {isBanned ? (
        <button
          type="button"
          className="btn instance-row-menu__item btn--with-icon"
          onClick={() => {
            onClose();
            onUnban(player);
          }}
        >
          <IconLockOpen size={16} />
          {t('unban_player')}
        </button>
      ) : (
        <button
          type="button"
          className="btn btn--danger instance-row-menu__item btn--with-icon"
          onClick={() => {
            onClose();
            onBan(player);
          }}
        >
          <IconBan size={16} />
          {t('ban_player')}
        </button>
      )}

      <button
        type="button"
        className="btn instance-row-menu__item btn--with-icon"
        onClick={() => {
          onClose();
          onMute(player);
        }}
      >
        <IconVolumeOff size={16} />
        {t('mute_player')}
      </button>

      <button
        type="button"
        className="btn instance-row-menu__item btn--with-icon"
        onClick={() => {
          onClose();
          onUnmute(player);
        }}
      >
        <IconVolume size={16} />
        {t('unmute_player')}
      </button>

      <button
        type="button"
        className="btn instance-row-menu__item btn--with-icon"
        onClick={() => {
          onClose();
          onPurge(player);
        }}
      >
        <IconEraser size={16} />
        {t('purge_player')}
      </button>

      {canEditAdmins && (
        <button
          type="button"
          className="btn instance-row-menu__item btn--with-icon"
          onClick={() => {
            onClose();
            onToggleAdmin(player);
          }}
        >
          {isAdmin ? <IconShieldOff size={16} /> : <IconShield size={16} />}
          {isAdmin ? t('demote_admin') : t('promote_admin')}
        </button>
      )}
    </AnimatedContextMenu>
  );
}
