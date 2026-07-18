import { useEffect, useState } from 'react';
import { AppIcon } from '../AppIcon';
import { usePlayers } from '../../hooks/usePlayers';
import type { useInstances } from '../../hooks/useInstances';
import type { AuthUser } from '../../types/instance';
import { notifyApiError } from '../../lib/networkErrors';
import { notifyErr } from '../../lib/notify';

const MOD_ACTIONS = ['Kick', 'Ban', 'Unban', 'Mute', 'Unmute', 'Purge'] as const;

type ModAction = (typeof MOD_ACTIONS)[number];

interface MobileModerationPanelProps {
  enabled: boolean;
  user: AuthUser;
  globalBans: boolean;
  banServerId: string;
  modServerId: string;
  onModServerIdChange: (id: string) => void;
  instances: ReturnType<typeof useInstances>;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function MobileModerationPanel({
  enabled,
  user,
  globalBans,
  banServerId,
  modServerId,
  onModServerIdChange,
  instances,
  t,
}: MobileModerationPanelProps) {
  const players = usePlayers(enabled, user, t);
  const [busy, setBusy] = useState(false);
  const summary = players.summary;

  useEffect(() => {
    if (!enabled || !banServerId) return;
    void instances.selectInstance(banServerId).catch(() => {});
  }, [enabled, banServerId, instances.selectInstance]);

  async function withSelectedServer(run: () => void) {
    if (!banServerId) {
      notifyErr(t('mobile_title'), t('mobile_server_required'));
      return;
    }
    if (!instances.rows.length) return;
    setBusy(true);
    try {
      await instances.selectInstance(banServerId);
      run();
    } catch (e) {
      notifyApiError(t('mobile_title'), e, t);
    } finally {
      setBusy(false);
    }
  }

  function runModAction(action: ModAction) {
    void withSelectedServer(() => {
      switch (action) {
        case 'Kick':
          players.kick();
          break;
        case 'Ban':
          players.ban();
          break;
        case 'Unban':
          players.unban();
          break;
        case 'Mute':
          players.mute();
          break;
        case 'Unmute':
          players.unmute();
          break;
        case 'Purge':
          players.purge();
          break;
      }
    });
  }

  function runWhitelistAdd() {
    void withSelectedServer(() => {
      void players.whitelistAdd();
    });
  }

  function runWhitelistRemove(name: string) {
    void withSelectedServer(() => {
      void players.whitelistRemove(name);
    });
  }

  function runWhitelistClear() {
    void withSelectedServer(() => {
      void players.whitelistClear();
    });
  }

  const disabled = busy || !instances.rows.length;
  const whitelist = summary?.whitelist_players || [];

  return (
    <>
      <section className="mobile-section mobile-section--moderation">
        <div className="mobile-section__head">
          <h2 className="mobile-section__title">{t('mobile_moderation_title')}</h2>
          <span className="mobile-section__icon" aria-hidden="true">
            <AppIcon name="person_shield" size={18} />
          </span>
        </div>
        <div className="mobile-section__body mobile-section__body--moderation">
          <div className="players-mod-panel mobile-mod-panel">
            {globalBans ? (
              <p className="hint mobile-mod-panel__hint">{t('program_sync_bans_tip')}</p>
            ) : (
              <div className="mobile-field mobile-mod-panel__field">
                <label htmlFor="mobileBanServer">{t('mobile_moderation_server')}</label>
                <select
                  id="mobileBanServer"
                  className="input"
                  value={modServerId}
                  disabled={disabled}
                  onChange={(e) => onModServerIdChange(e.target.value)}
                >
                  {instances.rows.map((it) => (
                    <option key={String(it.id)} value={String(it.id)}>
                      {String(it.name || it.id)}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="players-mod-panel__fields">
              <input
                id="mobileModerationPlayer"
                className="input"
                type="text"
                autoComplete="off"
                value={players.moderationPlayer}
                disabled={disabled}
                placeholder={t('ban_player_name')}
                onChange={(e) => players.setModerationPlayer(e.target.value)}
              />
              <input
                id="mobileModerationReason"
                className="input"
                type="text"
                autoComplete="off"
                value={players.moderationReason}
                disabled={disabled}
                placeholder={t('ban_reason')}
                onChange={(e) => players.setModerationReason(e.target.value)}
              />
            </div>
            <div className="players-mod-actions mobile-mod-actions">
              {MOD_ACTIONS.map((action) => (
                <button
                  key={action}
                  type="button"
                  className="btn players-mod-actions__btn"
                  disabled={disabled}
                  onClick={() => runModAction(action)}
                >
                  {action}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mobile-section mobile-section--whitelist">
        <div className="mobile-section__head">
          <h2 className="mobile-section__title">{t('whitelist_tab')}</h2>
          <span className="mobile-section__icon" aria-hidden="true">
            <AppIcon name="badge" size={18} />
          </span>
        </div>
        <div className="mobile-section__body">
          <p className="hint mobile-whitelist-status">
            <span>{t('whitelist_status_label')}</span>{' '}
            <strong>
              {summary?.whitelist_enabled ? t('whitelist_status_enabled') : t('whitelist_status_disabled')}
            </strong>
          </p>
          <div className="mobile-whitelist-form">
            <input
              id="mobileWhitelistPlayer"
              className="input"
              type="text"
              autoComplete="off"
              value={players.whitelistPlayer}
              disabled={disabled}
              placeholder={t('ban_player_name')}
              onChange={(e) => players.setWhitelistPlayer(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') runWhitelistAdd();
              }}
            />
            <button
              type="button"
              className="btn btn--with-icon mobile-whitelist-form__btn"
              disabled={disabled}
              onClick={() => runWhitelistAdd()}
            >
              <AppIcon name="person_add" size={16} />
              {t('add_btn')}
            </button>
            <button
              type="button"
              className="btn btn--danger btn--with-icon mobile-whitelist-form__btn"
              disabled={disabled}
              onClick={() => runWhitelistClear()}
            >
              <AppIcon name="reset" size={16} />
              {t('reset_btn')}
            </button>
          </div>
          <ul className="mobile-whitelist-list">
            {!whitelist.length ? (
              <li className="mobile-whitelist-list__empty">{t('mobile_whitelist_empty')}</li>
            ) : (
              whitelist.map((name) => (
                <li key={name} className="mobile-whitelist-list__item">
                  <span className="mobile-whitelist-list__name">{name}</span>
                  <button
                    type="button"
                    className="btn btn-remove btn--with-icon mobile-whitelist-list__remove"
                    disabled={disabled}
                    onClick={() => runWhitelistRemove(name)}
                  >
                    <AppIcon name="delete" size={16} />
                    {t('delete_btn')}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>
    </>
  );
}
