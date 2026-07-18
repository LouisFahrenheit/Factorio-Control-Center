import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { AppIcon } from '../AppIcon';
import type { AnnouncementsApi } from '../../hooks/useAnnouncements';
import type { PlayersApi } from '../../hooks/usePlayers';
import { TabLoadingPlaceholder, tabInitialLoad } from '../TabLoadingPlaceholder';
import { parseActiveBan } from '../../lib/playerUtils';

interface StatsTabProps {
  players: PlayersApi;
  announcements: AnnouncementsApi;
  canAnnounce: boolean;
  announceDisabled: boolean;
  serverRunning: boolean;
  maintenanceLocked: boolean;
  t: (key: string, ...args: (string | number)[]) => string;
}

type SideTab = 'admins' | 'bans' | 'whitelist';

const MOD_ACTIONS = ['Kick', 'Ban', 'Unban', 'Mute', 'Unmute', 'Purge'] as const;

export function StatsTab({
  players,
  announcements,
  canAnnounce,
  announceDisabled,
  serverRunning,
  maintenanceLocked,
  t,
}: StatsTabProps) {
  const chatRef = useRef<HTMLPreElement>(null);
  const [sideTab, setSideTab] = useState<SideTab>('admins');

  const p = players.summary;
  const initialLoading = tabInitialLoad(players.loading, !!p);
  const adminSet = new Set(players.admins.map((s) => s.toLowerCase()));
  const online = p?.online || [];
  const placeholder = t('server_uptime_placeholder');
  const selectedPlayer = players.moderationPlayer.trim().toLowerCase();

  useEffect(() => {
    const el = chatRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    if (atBottom) el.scrollTop = el.scrollHeight;
  }, [players.chatText]);

  function onChatKey(ev: KeyboardEvent<HTMLInputElement>) {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      void players.sendChat();
    }
  }

  const chatDisabled = !serverRunning || maintenanceLocked;

  function runModAction(action: (typeof MOD_ACTIONS)[number]) {
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
  }

  return (
    <div id="tabPanelStats" className="tab-panel tab-panel--active players-tab" role="tabpanel" aria-labelledby="tabBtnStats">
      {initialLoading ? (
        <TabLoadingPlaceholder variant="dashboard" label={t('tab_data_loading')} className="players-tab__loading" />
      ) : (
      <div id="playersRootPanelManage" className="players-tab__body">
        <div className="players-layout">
          <div className="players-layout__main">
            <section className="players-tab__card">
              <header className="players-tab__card-header">
                <h2 className="players-tab__card-title">{t('chat_log_viewer_title')}</h2>
              </header>
              <div className="players-tab__card-body players-tab__card-body--chat">
                <pre
                  ref={chatRef}
                  id="chatLog"
                  className="log-view log-view--tab players-chat-log"
                  tabIndex={0}
                >
                  {players.chatText}
                </pre>
                <div className="players-tab__chat-compose">
                  <div className="players-tab__chat-field control-tab__compact-field">
                    <input
                      type="text"
                      id="playersChatMessage"
                      className="input control-tab__compact-input"
                      autoComplete="off"
                      maxLength={512}
                      disabled={chatDisabled}
                      placeholder={t('players_send_message_placeholder')}
                      value={players.chatMessage}
                      onChange={(e) => players.setChatMessage(e.target.value)}
                      onKeyDown={onChatKey}
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn--with-icon"
                    id="btnPlayersSendMessage"
                    disabled={chatDisabled}
                    onClick={() => void players.sendChat()}
                  >
                    <AppIcon name="start" size={16} />
                    {t('players_send_message_btn')}
                  </button>
                </div>
              </div>
            </section>

            <section className="players-tab__card">
              <header className="players-tab__card-header">
                <h2 className="players-tab__card-title">{t('player_stats')}</h2>
                {(p?.player_stats_rows?.length ?? 0) > 0 ? (
                  <span className="players-tab__badge">{p?.player_stats_rows?.length}</span>
                ) : null}
              </header>
              <div className="players-tab__card-body">
                <div className="table-wrap table-wrap--enter players-tab__table-wrap">
                  <table className="data data--players-stats">
                    <thead>
                      <tr>
                        <th>{t('player')}</th>
                        <th>{t('sessions')}</th>
                        <th>{t('total_time')}</th>
                        <th>{t('time_online')}</th>
                        <th>{t('last_leave_column')}</th>
                      </tr>
                    </thead>
                    <tbody id="tblStatsBody">
                      {(p?.player_stats_rows || []).map((row) => (
                        <tr
                          key={String(row.player)}
                          className={row.online ? 'players-stats-row--online' : undefined}
                          onClick={() => players.setModerationPlayer(String(row.player || ''))}
                        >
                          <td className="players-stats-col-name">{row.player}</td>
                          <td>{row.sessions}</td>
                          <td>{row.total_time}</td>
                          <td className={row.online ? 'cell-online' : undefined}>{row.current_session}</td>
                          <td>{row.last_leave}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </div>

          <aside className="players-layout__side">
            <section className="players-tab__card players-tab__card--moderation">
              <div className="players-mod-panel">
                <div className="players-mod-panel__form">
                  <header className="players-tab__card-header players-tab__card-header--compact players-tab__card-header--moderation">
                    <h2 className="players-tab__card-title">{t('moderation_title')}</h2>
                    <button
                      type="button"
                      className="btn btn--announce-open btn--with-icon players-mod-panel__announce"
                      id="btnOpenAnnounce"
                      style={canAnnounce ? undefined : { display: 'none' }}
                      disabled={announceDisabled}
                      onClick={() => void announcements.openDialog()}
                    >
                      <AppIcon name="supervisor" size={16} />
                      {t('announce_btn')}
                    </button>
                  </header>
                  <div className="players-mod-panel__fields">
                    <input
                      type="text"
                      id="moderationPlayer"
                      className={
                        'input' + (players.moderationPlayerBlink ? ' players-moderation-player--accent-blink' : '')
                      }
                      autoComplete="off"
                      placeholder={t('ban_player_name')}
                      value={players.moderationPlayer}
                      onChange={(e) => players.setModerationPlayer(e.target.value)}
                    />
                    <input
                      type="text"
                      id="moderationReason"
                      className="input"
                      autoComplete="off"
                      placeholder={t('ban_reason')}
                      value={players.moderationReason}
                      onChange={(e) => players.setModerationReason(e.target.value)}
                    />
                  </div>
                  <div className="players-mod-actions">
                    {MOD_ACTIONS.map((action) => (
                      <button
                        key={action}
                        type="button"
                        className="btn players-mod-actions__btn"
                        id={'btn' + action}
                        onClick={() => runModAction(action)}
                      >
                        {action}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="players-online-panel">
                  <header className="players-tab__card-header players-tab__card-header--compact">
                    <h2 className="players-tab__card-title">{t('online_now')}</h2>
                    {online.length > 0 ? <span className="players-tab__badge players-tab__badge--online">{online.length}</span> : null}
                  </header>
                  <ul id="onlineList" className="online-list online-list--players players-online-list">
                    {!online.length ? (
                      <li className="muted players-online-list__empty">{placeholder}</li>
                    ) : (
                      online.map((o) => {
                        const name = String(o.name || '');
                        const isAdmin = adminSet.has(name.toLowerCase());
                        const isSelected = selectedPlayer === name.toLowerCase();
                        return (
                          <li
                            key={name}
                            className={
                              'online-list__item players-online-list__item' +
                              (isAdmin ? ' is-admin' : '') +
                              (isSelected ? ' is-selected' : '')
                            }
                            onClick={() => players.setModerationPlayer(name)}
                          >
                            <span
                              className={
                                'instance-run-dot players-online-list__dot' +
                                (isAdmin ? ' instance-run-dot--on' : '')
                              }
                            />
                            <span className="online-list__name players-online-list__name">{name}</span>
                          </li>
                        );
                      })
                    )}
                  </ul>
                </div>
              </div>
            </section>

            <section className="players-tab__card players-tab__card--access">
              <div className="players-tab__card-body players-tab__card-body--access">
                <div className="sub-tabs players-access-tabs" role="tablist">
                  {(
                    [
                      ['admins', 'admin_editor_title', 'subTabBtnAdmins', 'subTabPanelAdmins'],
                      ['bans', 'active_bans', 'subTabBtnActiveBansSide', 'subTabPanelActiveBansSide'],
                      ['whitelist', 'whitelist_tab', 'subTabBtnWhitelistSide', 'subTabPanelWhitelistSide'],
                    ] as const
                  ).map(([key, i18n, btnId]) => (
                    <button
                      key={key}
                      type="button"
                      id={btnId}
                      className={'sub-tabs__tab' + (sideTab === key ? ' sub-tabs__tab--active' : '')}
                      role="tab"
                      aria-selected={sideTab === key}
                      onClick={() => setSideTab(key)}
                    >
                      {t(i18n)}
                    </button>
                  ))}
                </div>

                {sideTab === 'admins' && (
                  <div id="subTabPanelAdmins" className="sub-tab-panel sub-tab-panel--active players-access-panel" role="tabpanel">
                    <div className="row row--admin-form players-access-form">
                      <input
                        type="text"
                        id="adminNew"
                        className="input"
                        autoComplete="off"
                        placeholder={t('ban_player_name')}
                        disabled={!players.canEditAdmins}
                        title={!players.canEditAdmins ? t('web_admin_edit_no_permission') : undefined}
                        value={players.adminNew}
                        onChange={(e) => players.setAdminNew(e.target.value)}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter') players.addAdmin();
                        }}
                      />
                      <button
                        type="button"
                        className="btn btn--with-icon"
                        id="btnAdminAdd"
                        disabled={!players.canEditAdmins}
                        onClick={players.addAdmin}
                      >
                        <AppIcon name="person_add" size={16} />
                        {t('add_btn')}
                      </button>
                    </div>
                    <ul id="adminUl" className="admin-list players-admin-list">
                      {players.admins.map((name) => (
                        <li key={name}>
                          <span className="players-admin-list__name">{name}</span>
                          {players.canEditAdmins && (
                            <button
                              type="button"
                              className="btn btn-remove btn--with-icon"
                              onClick={() => players.removeAdmin(name)}
                            >
                              <AppIcon name="delete" size={16} />
                              {t('delete_btn')}
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {sideTab === 'bans' && (
                  <div id="subTabPanelActiveBansSide" className="sub-tab-panel sub-tab-panel--active players-access-panel" role="tabpanel">
                    <div className="table-wrap players-tab__table-wrap">
                      <table className="data data--active-bans data--players-access">
                        <thead>
                          <tr>
                            <th>{t('player')}</th>
                            <th>{t('ban_reason_column')}</th>
                            <th>{t('ip_label')}</th>
                          </tr>
                        </thead>
                        <tbody id="tblBansBody">
                          {!p?.active_bans_available ? (
                            <tr>
                              <td colSpan={3}>{t('players_banlist_unavailable')}</td>
                            </tr>
                          ) : (
                            (p?.active_bans || []).map((b, i) => {
                              const parsed = parseActiveBan(b);
                              return (
                                <tr key={`${parsed.player}-${i}`}>
                                  <td
                                    className="active-bans__name-cell"
                                    onClick={() => parsed.player && players.setModerationPlayer(parsed.player)}
                                  >
                                    {parsed.player}
                                  </td>
                                  <td>{parsed.reason}</td>
                                  <td>{parsed.ip}</td>
                                </tr>
                              );
                            })
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {sideTab === 'whitelist' && (
                  <div id="subTabPanelWhitelistSide" className="sub-tab-panel sub-tab-panel--active players-access-panel" role="tabpanel">
                    <p className="hint players-whitelist-status">
                      <span>{t('whitelist_status_label')}</span>{' '}
                      <strong id="whitelistModeLabel">
                        {p?.whitelist_enabled ? t('whitelist_status_enabled') : t('whitelist_status_disabled')}
                      </strong>
                    </p>
                    <div className="row row--ban-form players-access-form">
                      <input
                        type="text"
                        id="whitelistPlayer"
                        className="input input--narrow"
                        autoComplete="off"
                        placeholder={t('ban_player_name')}
                        value={players.whitelistPlayer}
                        onChange={(e) => players.setWhitelistPlayer(e.target.value)}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Enter') void players.whitelistAdd();
                        }}
                      />
                      <button type="button" className="btn btn--with-icon" id="btnWhitelistAdd" onClick={() => void players.whitelistAdd()}>
                        <AppIcon name="person_add" size={16} />
                        {t('add_btn')}
                      </button>
                      <button
                        type="button"
                        className="btn btn--danger btn--with-icon"
                        id="btnWhitelistClear"
                        onClick={() => void players.whitelistClear()}
                      >
                        <AppIcon name="reset" size={16} />
                        {t('reset_btn')}
                      </button>
                    </div>
                    <div className="table-wrap players-tab__table-wrap">
                      <table className="data data--whitelist data--players-access">
                        <thead>
                          <tr>
                            <th>{t('player')}</th>
                            <th className="data__actions-col" aria-hidden="true" />
                          </tr>
                        </thead>
                        <tbody id="tblWhitelistBody">
                          {(p?.whitelist_players || []).map((name) => (
                            <tr key={name}>
                              <td>{name}</td>
                              <td className="data__actions-col">
                                <button
                                  type="button"
                                  className="btn btn-remove btn--with-icon"
                                  onClick={() => void players.whitelistRemove(name)}
                                >
                                  <AppIcon name="delete" size={16} />
                                  {t('delete_btn')}
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
      )}
    </div>
  );
}
