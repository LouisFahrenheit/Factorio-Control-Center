import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from 'react';
import {
  IconMessage,
  IconChartBar,
  IconUsers,
  IconSend,
  IconSpeakerphone,
  IconUserPlus,
  IconTrash,
  IconRotateClockwise,
  IconShield,
  IconListCheck,
  IconBan,
} from '@tabler/icons-react';
import type { AnnouncementsApi } from '../../hooks/useAnnouncements';
import type { PlayersApi } from '../../hooks/usePlayers';
import {
  TabLoadingPlaceholder,
  tabInitialLoad,
} from '../TabLoadingPlaceholder';
import { parseActiveBan } from '../../lib/playerUtils';
import { PlayerRowMenu } from './PlayerRowMenu';
import { PlayerReasonModal } from './PlayerReasonModal';

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

  // Context Menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPlayer, setMenuPlayer] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  // Reason Modal state
  const [reasonModalOpen, setReasonModalOpen] = useState(false);
  const [reasonAction, setReasonAction] = useState<'kick' | 'ban'>('kick');
  const [reasonPlayer, setReasonPlayer] = useState('');

  const p = players.summary;
  const initialLoading = tabInitialLoad(players.loading, !!p);
  const adminSet = new Set(players.admins.map((s) => s.toLowerCase()));
  const bannedSet = new Set(
    (p?.active_bans || [])
      .map((b) => parseActiveBan(b).player.toLowerCase())
      .filter(Boolean),
  );
  const online = p?.online || [];
  const placeholder = t('server_uptime_placeholder');

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

  function openPlayerMenu(e: MouseEvent, playerName: string) {
    e.preventDefault();
    e.stopPropagation();
    const name = playerName.trim();
    if (!name) return;
    setMenuPlayer(name);
    setMenuPos({ x: e.clientX, y: e.clientY });
    setMenuOpen(true);
  }

  function handleKick(player: string) {
    setReasonPlayer(player);
    setReasonAction('kick');
    setReasonModalOpen(true);
  }

  function handleBan(player: string) {
    setReasonPlayer(player);
    setReasonAction('ban');
    setReasonModalOpen(true);
  }

  function handleReasonSubmit(reason: string) {
    if (reasonAction === 'ban') {
      players.ban(reasonPlayer, reason);
    } else {
      players.kick(reasonPlayer, reason);
    }
  }

  function handleToggleAdmin(player: string) {
    const isAdmin = adminSet.has(player.toLowerCase());
    if (isAdmin) {
      players.removeAdmin(player);
    } else {
      players.addAdmin(player);
    }
  }

  return (
    <div
      id="tabPanelStats"
      className="tab-panel tab-panel--active players-tab"
      role="tabpanel"
      aria-labelledby="tabBtnStats"
    >
      {initialLoading ? (
        <TabLoadingPlaceholder
          variant="dashboard"
          label={t('tab_data_loading')}
          className="players-tab__loading"
        />
      ) : (
        <div id="playersRootPanelManage" className="players-tab__body">
          <div className="players-layout">
            <div className="players-layout__main">
              <section className="players-tab__card">
                <header className="players-tab__card-header">
                  <div className="players-tab__card-header-main">
                    <span className="players-tab__card-header-icon">
                      <IconMessage size={18} />
                    </span>
                    <h2 className="players-tab__card-title">
                      {t('chat_log_viewer_title')}
                    </h2>
                  </div>
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
                      className="btn btn--primary btn--with-icon players-tab__chat-send-btn"
                      id="btnPlayersSendMessage"
                      disabled={chatDisabled}
                      onClick={() => void players.sendChat()}
                    >
                      <IconSend size={16} />
                      {t('players_send_message_btn')}
                    </button>
                    {canAnnounce && (
                      <button
                        type="button"
                        className="btn btn--announce-open btn--with-icon players-tab__chat-announce-btn"
                        id="btnOpenAnnounce"
                        disabled={announceDisabled}
                        onClick={() => void announcements.openDialog()}
                      >
                        <IconSpeakerphone size={16} />
                        {t('announce_btn')}
                      </button>
                    )}
                  </div>
                </div>
              </section>

              <section className="players-tab__card">
                <header className="players-tab__card-header">
                  <div className="players-tab__card-header-main">
                    <span className="players-tab__card-header-icon">
                      <IconChartBar size={18} />
                    </span>
                    <h2 className="players-tab__card-title">
                      {t('player_stats')}
                    </h2>
                  </div>
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
                        {(p?.player_stats_rows || []).map((row) => {
                          const name = String(row.player || '');
                          return (
                            <tr
                              key={name}
                              className={
                                row.online
                                  ? 'players-stats-row--online'
                                  : undefined
                              }
                            >
                              <td
                                className="players-stats-col-name player-stats__name-cell"
                                onClick={(e) => openPlayerMenu(e, name)}
                                title={name}
                              >
                                {name}
                              </td>
                              <td>{row.sessions}</td>
                              <td>{row.total_time}</td>
                              <td
                                className={
                                  row.online ? 'cell-online' : undefined
                                }
                              >
                                {row.current_session}
                              </td>
                              <td>{row.last_leave}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            </div>

            <aside className="players-layout__side">
              <section className="players-tab__card players-tab__card--online">
                <header className="players-tab__card-header players-tab__card-header--compact">
                  <div className="players-tab__card-header-main">
                    <span className="players-tab__card-header-icon">
                      <IconUsers size={18} />
                    </span>
                    <h2 className="players-tab__card-title">
                      {t('online_now')}
                    </h2>
                  </div>
                </header>
                <ul
                  id="onlineList"
                  className="online-list online-list--players players-online-list"
                >
                  {!online.length ? (
                    <li className="muted players-online-list__empty">
                      {placeholder}
                    </li>
                  ) : (
                    online.map((o) => {
                      const name = String(o.name || '');
                      const isAdmin = adminSet.has(name.toLowerCase());
                      const isSelected =
                        menuOpen &&
                        menuPlayer?.toLowerCase() === name.toLowerCase();
                      return (
                        <li
                          key={name}
                          className={
                            'online-list__item players-online-list__item' +
                            (isAdmin ? ' is-admin' : '') +
                            (isSelected ? ' is-selected' : '')
                          }
                          onClick={(e) => openPlayerMenu(e, name)}
                        >
                          {isAdmin ? (
                            <span
                              className="players-online-list__admin-icon"
                              title={t('admin_editor_title')}
                            >
                              <IconShield size={14} />
                            </span>
                          ) : null}
                          <span className="online-list__name players-online-list__name">
                            {name}
                          </span>
                        </li>
                      );
                    })
                  )}
                </ul>
              </section>

              <section className="players-tab__card players-tab__card--access">
                <div className="players-tab__card-body players-tab__card-body--access">
                  <div className="players-access-tabs-bar">
                    <div
                      className="sub-tabs players-access-tabs"
                      role="tablist"
                    >
                      {(
                        [
                          [
                            'admins',
                            'admin_editor_title',
                            'subTabBtnAdmins',
                            'subTabPanelAdmins',
                            IconShield,
                          ],
                          [
                            'bans',
                            'active_bans',
                            'subTabBtnActiveBansSide',
                            'subTabPanelActiveBansSide',
                            IconBan,
                          ],
                          [
                            'whitelist',
                            'whitelist_tab',
                            'subTabBtnWhitelistSide',
                            'subTabPanelWhitelistSide',
                            IconListCheck,
                          ],
                        ] as const
                      ).map(([key, i18n, btnId, , TabIcon]) => (
                        <button
                          key={key}
                          type="button"
                          id={btnId}
                          className={
                            'sub-tabs__tab btn--with-icon' +
                            (sideTab === key ? ' sub-tabs__tab--active' : '')
                          }
                          role="tab"
                          aria-selected={sideTab === key}
                          onClick={() => setSideTab(key)}
                        >
                          <TabIcon size={14} />
                          {t(i18n)}
                        </button>
                      ))}
                    </div>
                    {sideTab === 'whitelist' && (
                      <div
                        className={
                          'players-whitelist-pill' +
                          (p?.whitelist_enabled
                            ? ' players-whitelist-pill--enabled'
                            : ' players-whitelist-pill--disabled')
                        }
                        title={
                          t('whitelist_status_label') +
                          ' ' +
                          (p?.whitelist_enabled
                            ? t('whitelist_status_enabled')
                            : t('whitelist_status_disabled'))
                        }
                      >
                        <span className="players-whitelist-pill__dot" />
                        <span className="players-whitelist-pill__text">
                          {p?.whitelist_enabled
                            ? t('whitelist_status_enabled')
                            : t('whitelist_status_disabled')}
                        </span>
                      </div>
                    )}
                  </div>

                  {sideTab === 'admins' && (
                    <div
                      id="subTabPanelAdmins"
                      className="sub-tab-panel sub-tab-panel--active players-access-panel"
                      role="tabpanel"
                    >
                      <div className="row row--admin-form players-access-form">
                        <input
                          type="text"
                          id="adminNew"
                          className="input"
                          autoComplete="off"
                          placeholder={t('ban_player_name')}
                          disabled={!players.canEditAdmins}
                          title={
                            !players.canEditAdmins
                              ? t('web_admin_edit_no_permission')
                              : undefined
                          }
                          value={players.adminNew}
                          onChange={(e) => players.setAdminNew(e.target.value)}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter') players.addAdmin();
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn--with-icon players-access-form__btn"
                          id="btnAdminAdd"
                          disabled={!players.canEditAdmins}
                          onClick={() => players.addAdmin()}
                        >
                          <IconUserPlus size={16} />
                          {t('add_btn')}
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger btn--with-icon players-access-form__btn"
                          id="btnAdminClear"
                          disabled={
                            !players.canEditAdmins || !players.admins.length
                          }
                          onClick={() => void players.adminsClear()}
                        >
                          <IconRotateClockwise size={16} />
                          {t('reset_btn')}
                        </button>
                      </div>
                      <ul
                        id="adminUl"
                        className="admin-list players-admin-list"
                      >
                        {players.admins.map((name) => (
                          <li key={name}>
                            <span className="players-admin-list__name">
                              {name}
                            </span>
                            {players.canEditAdmins && (
                              <button
                                type="button"
                                className="btn btn-remove btn--with-icon"
                                onClick={() => players.removeAdmin(name)}
                              >
                                <IconTrash size={15} />
                                {t('delete_btn')}
                              </button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {sideTab === 'bans' && (
                    <div
                      id="subTabPanelActiveBansSide"
                      className="sub-tab-panel sub-tab-panel--active players-access-panel"
                      role="tabpanel"
                    >
                      <div className="row row--ban-form players-access-form">
                        <input
                          type="text"
                          id="banPlayerInput"
                          className="input"
                          autoComplete="off"
                          placeholder={t('ban_player_name')}
                          value={players.banPlayer}
                          onChange={(e) => players.setBanPlayer(e.target.value)}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter') {
                              const pl = players.banPlayer.trim();
                              if (pl) {
                                handleBan(pl);
                                players.setBanPlayer('');
                              }
                            }
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn--with-icon players-access-form__btn"
                          id="btnBanAdd"
                          onClick={() => {
                            const pl = players.banPlayer.trim();
                            if (pl) {
                              handleBan(pl);
                              players.setBanPlayer('');
                            }
                          }}
                        >
                          <IconUserPlus size={16} />
                          {t('add_btn')}
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger btn--with-icon players-access-form__btn"
                          id="btnBansClear"
                          disabled={!p?.active_bans?.length}
                          onClick={() => void players.bansClear()}
                        >
                          <IconRotateClockwise size={16} />
                          {t('reset_btn')}
                        </button>
                      </div>
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
                                <td colSpan={3}>
                                  {t('players_banlist_unavailable')}
                                </td>
                              </tr>
                            ) : (
                              (p?.active_bans || []).map((b, i) => {
                                const parsed = parseActiveBan(b);
                                return (
                                  <tr key={`${parsed.player}-${i}`}>
                                    <td
                                      className="active-bans__name-cell"
                                      onClick={(e) =>
                                        parsed.player &&
                                        openPlayerMenu(e, parsed.player)
                                      }
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
                    <div
                      id="subTabPanelWhitelistSide"
                      className="sub-tab-panel sub-tab-panel--active players-access-panel"
                      role="tabpanel"
                    >
                      <div className="row row--ban-form players-access-form">
                        <input
                          type="text"
                          id="whitelistPlayer"
                          className="input"
                          autoComplete="off"
                          placeholder={t('ban_player_name')}
                          value={players.whitelistPlayer}
                          onChange={(e) =>
                            players.setWhitelistPlayer(e.target.value)
                          }
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter') void players.whitelistAdd();
                          }}
                        />
                        <button
                          type="button"
                          className="btn btn--with-icon players-access-form__btn"
                          id="btnWhitelistAdd"
                          onClick={() => void players.whitelistAdd()}
                        >
                          <IconUserPlus size={16} />
                          {t('add_btn')}
                        </button>
                        <button
                          type="button"
                          className="btn btn--danger btn--with-icon players-access-form__btn"
                          id="btnWhitelistClear"
                          disabled={!p?.whitelist_players?.length}
                          onClick={() => void players.whitelistClear()}
                        >
                          <IconRotateClockwise size={16} />
                          {t('reset_btn')}
                        </button>
                      </div>
                      <ul
                        id="whitelistUl"
                        className="admin-list players-admin-list"
                      >
                        {(p?.whitelist_players || []).map((name) => (
                          <li key={name}>
                            <span className="players-admin-list__name">
                              {name}
                            </span>
                            <button
                              type="button"
                              className="btn btn-remove btn--with-icon"
                              onClick={() => void players.whitelistRemove(name)}
                            >
                              <IconTrash size={15} />
                              {t('delete_btn')}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </section>
            </aside>
          </div>
        </div>
      )}

      {/* ── Context Menu on Player click ── */}
      <PlayerRowMenu
        open={menuOpen}
        player={menuPlayer}
        position={menuPos}
        isAdmin={menuPlayer ? adminSet.has(menuPlayer.toLowerCase()) : false}
        isBanned={menuPlayer ? bannedSet.has(menuPlayer.toLowerCase()) : false}
        canEditAdmins={players.canEditAdmins}
        onClose={() => setMenuOpen(false)}
        onKick={handleKick}
        onBan={handleBan}
        onUnban={(pl) => players.unban(pl)}
        onMute={(pl) => players.mute(pl)}
        onUnmute={(pl) => players.unmute(pl)}
        onPurge={(pl) => players.purge(pl)}
        onToggleAdmin={handleToggleAdmin}
        t={t}
      />

      {/* ── Player Reason Modal (Kick / Ban) ── */}
      <PlayerReasonModal
        open={reasonModalOpen}
        player={reasonPlayer}
        action={reasonAction}
        onClose={() => setReasonModalOpen(false)}
        onSubmit={handleReasonSubmit}
        t={t}
      />
    </div>
  );
}
