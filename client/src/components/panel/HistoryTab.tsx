import { useMemo, useRef, useState, type ComponentType, type ReactNode } from 'react';
import {
  IconSettings,
  IconPackage,
  IconTerminal2,
  IconUsers,
  IconHistory,
} from '@tabler/icons-react';
import {
  useSlidingTabIndicator,
  TAB_INDICATOR_ID_ATTR,
} from '../../hooks/useSlidingTabIndicator';
import { SlidingTabIndicator } from '../SlidingTabHighlight';
import type { PlayersApi } from '../../hooks/usePlayers';
import {
  TabLoadingPlaceholder,
  tabInitialLoad,
} from '../TabLoadingPlaceholder';
import {
  buildCommandsHistoryRows,
  buildModsHistoryRows,
  buildServerHistoryRows,
  commandsHistoryActionFilterLabel,
  COMMANDS_HISTORY_FILTER_ACTIONS,
  filterOpsHistoryRows,
  modsHistoryActionFilterLabel,
  MODS_HISTORY_FILTER_ACTIONS,
  serverHistoryActionFilterLabel,
  SERVER_HISTORY_FILTER_ACTIONS,
  type OpsHistoryActionFilter,
} from '../../lib/historyOpsUtils';
import {
  buildPlayerHistoryRows,
  filterPlayerHistoryRows,
  playerHistoryFilterTypeLabel,
  type PlayerHistoryCategory,
} from '../../lib/playerHistoryUtils';
import { SearchField } from '../SearchField';
import {
  HistoryDetailCell,
  HistoryDetailModal,
  type HistoryDetailPayload,
} from './HistoryDetailView';

interface HistoryTabProps {
  players: PlayersApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

type HistoryTabKey = 'player' | 'server' | 'mods' | 'commands';

type ActionVariant = 'positive' | 'negative' | 'neutral';

const HISTORY_TABS: {
  key: HistoryTabKey;
  i18n: string;
  btnId: string;
  Icon: ComponentType<{ size?: number; className?: string }>;
}[] = [
  {
    key: 'server',
    i18n: 'server_history',
    btnId: 'subTabBtnServerHistory',
    Icon: IconSettings,
  },
  {
    key: 'mods',
    i18n: 'mods_history',
    btnId: 'subTabBtnModsHistory',
    Icon: IconPackage,
  },
  {
    key: 'commands',
    i18n: 'commands_history',
    btnId: 'subTabBtnCommandsHistory',
    Icon: IconTerminal2,
  },
  {
    key: 'player',
    i18n: 'player_history',
    btnId: 'subTabBtnPlayerHistory',
    Icon: IconUsers,
  },
];

const PLAYER_HISTORY_CATEGORY_KEYS: PlayerHistoryCategory[] = [
  'all',
  'session',
  'ban',
  'kick',
  'mute',
  'whitelist',
  'admin',
];

function HistoryActionBadge({
  label,
  variant,
}: {
  label: string;
  variant: ActionVariant;
}) {
  return (
    <span className={`history-action-badge history-action-badge--${variant}`}>
      {label}
    </span>
  );
}

function HistoryTableWrap({
  empty,
  emptyMessage,
  children,
  t,
}: {
  empty: boolean;
  emptyMessage?: string;
  children: ReactNode;
  t: HistoryTabProps['t'];
}) {
  if (empty) {
    return (
      <div className="history-tab__table-wrap history-tab__table-wrap--empty">
        <div className="history-tab__empty">
          <IconHistory size={36} className="history-tab__empty-icon" />
          <span>{emptyMessage || t('history_empty')}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="table-wrap table-wrap--enter history-tab__table-wrap">
      {children}
    </div>
  );
}

function HistoryFilterToolbar({
  searchId,
  searchPlaceholder,
  search,
  onSearchChange,
  categoryId,
  category,
  onCategoryChange,
  categoryOptions,
  categoryOptionLabel,
  filterLabelKey,
  t,
}: {
  searchId: string;
  searchPlaceholder: string;
  search: string;
  onSearchChange: (value: string) => void;
  categoryId: string;
  category: string;
  onCategoryChange: (value: string) => void;
  categoryOptions: readonly string[];
  categoryOptionLabel: (value: string) => string;
  filterLabelKey: string;
  t: HistoryTabProps['t'];
}) {
  return (
    <div className="history-tab__toolbar">
      <SearchField
        type="text"
        id={searchId}
        className="history-tab__search"
        placeholder={searchPlaceholder}
        autoComplete="off"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      <label className="history-tab__filter">
        <span className="history-tab__filter-label">{t(filterLabelKey)}</span>
        <select
          id={categoryId}
          className="input input--narrow history-tab__filter-select"
          value={category}
          onChange={(e) => onCategoryChange(e.target.value)}
        >
          {categoryOptions.map((key) => (
            <option key={key} value={key}>
              {categoryOptionLabel(key)}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

export function HistoryTab({ players, t }: HistoryTabProps) {
  const [historyTab, setHistoryTab] = useState<HistoryTabKey>('server');
  const subTabsRef = useRef<HTMLDivElement>(null);
  const slidingRect = useSlidingTabIndicator(subTabsRef, historyTab);
  const [playerSearch, setPlayerSearch] = useState('');
  const [playerCategory, setPlayerCategory] =
    useState<PlayerHistoryCategory>('all');
  const [serverSearch, setServerSearch] = useState('');
  const [serverActionFilter, setServerActionFilter] =
    useState<OpsHistoryActionFilter>('all');
  const [modsSearch, setModsSearch] = useState('');
  const [modsActionFilter, setModsActionFilter] =
    useState<OpsHistoryActionFilter>('all');
  const [commandsSearch, setCommandsSearch] = useState('');
  const [commandsActionFilter, setCommandsActionFilter] =
    useState<OpsHistoryActionFilter>('all');
  const [detailModal, setDetailModal] = useState<HistoryDetailPayload | null>(
    null,
  );
  const p = players.summary;
  const initialLoading = tabInitialLoad(players.loading, !!p);

  const playerHistoryRows = useMemo(
    () =>
      buildPlayerHistoryRows(
        p?.history || [],
        p?.ban_history_tail || [],
        p?.kick_history_tail || [],
        p?.mute_history_tail || [],
        p?.whitelist_history_tail || [],
        p?.admin_history_tail || [],
        t,
      ),
    [p, t],
  );

  const filteredPlayerHistoryRows = useMemo(
    () =>
      filterPlayerHistoryRows(playerHistoryRows, playerCategory, playerSearch),
    [playerHistoryRows, playerCategory, playerSearch],
  );

  const serverHistoryRows = useMemo(
    () => buildServerHistoryRows(p?.server_history_tail || [], t),
    [p?.server_history_tail, t],
  );

  const modsHistoryRows = useMemo(
    () => buildModsHistoryRows(p?.mods_history_tail || [], t),
    [p?.mods_history_tail, t],
  );

  const commandsHistoryRows = useMemo(
    () => buildCommandsHistoryRows(p?.commands_history_tail || [], t),
    [p?.commands_history_tail, t],
  );

  const serverFilterActions = useMemo(() => {
    const present = [
      ...new Set(serverHistoryRows.map((row) => row.action).filter(Boolean)),
    ].sort();
    const known = SERVER_HISTORY_FILTER_ACTIONS.filter((action) =>
      present.includes(action),
    );
    const unknown = present.filter(
      (action) =>
        !SERVER_HISTORY_FILTER_ACTIONS.includes(
          action as (typeof SERVER_HISTORY_FILTER_ACTIONS)[number],
        ),
    );
    return ['all', ...known, ...unknown];
  }, [serverHistoryRows]);

  const modsFilterActions = useMemo(() => {
    const present = [
      ...new Set(modsHistoryRows.map((row) => row.action).filter(Boolean)),
    ].sort();
    const known = MODS_HISTORY_FILTER_ACTIONS.filter((action) =>
      present.includes(action),
    );
    const unknown = present.filter(
      (action) =>
        !MODS_HISTORY_FILTER_ACTIONS.includes(
          action as (typeof MODS_HISTORY_FILTER_ACTIONS)[number],
        ),
    );
    return ['all', ...known, ...unknown];
  }, [modsHistoryRows]);

  const commandsFilterActions = useMemo(() => {
    const present = [
      ...new Set(commandsHistoryRows.map((row) => row.action).filter(Boolean)),
    ].sort();
    const known = COMMANDS_HISTORY_FILTER_ACTIONS.filter((action) =>
      present.includes(action),
    );
    const unknown = present.filter(
      (action) =>
        !COMMANDS_HISTORY_FILTER_ACTIONS.includes(
          action as (typeof COMMANDS_HISTORY_FILTER_ACTIONS)[number],
        ),
    );
    return ['all', ...known, ...unknown];
  }, [commandsHistoryRows]);

  const effectiveServerActionFilter = serverFilterActions.includes(
    serverActionFilter,
  )
    ? serverActionFilter
    : 'all';

  const effectiveModsActionFilter = modsFilterActions.includes(modsActionFilter)
    ? modsActionFilter
    : 'all';

  const effectiveCommandsActionFilter = commandsFilterActions.includes(
    commandsActionFilter,
  )
    ? commandsActionFilter
    : 'all';

  const filteredServerHistoryRows = useMemo(
    () =>
      filterOpsHistoryRows(
        serverHistoryRows,
        effectiveServerActionFilter,
        serverSearch,
      ),
    [serverHistoryRows, effectiveServerActionFilter, serverSearch],
  );

  const filteredModsHistoryRows = useMemo(
    () =>
      filterOpsHistoryRows(
        modsHistoryRows,
        effectiveModsActionFilter,
        modsSearch,
      ),
    [modsHistoryRows, effectiveModsActionFilter, modsSearch],
  );

  const filteredCommandsHistoryRows = useMemo(
    () =>
      filterOpsHistoryRows(
        commandsHistoryRows,
        effectiveCommandsActionFilter,
        commandsSearch,
      ),
    [commandsHistoryRows, effectiveCommandsActionFilter, commandsSearch],
  );

  const tabCounts = useMemo(
    () => ({
      player: playerHistoryRows.length,
      server: serverHistoryRows.length,
      mods: modsHistoryRows.length,
      commands: commandsHistoryRows.length,
    }),
    [
      playerHistoryRows.length,
      serverHistoryRows.length,
      modsHistoryRows.length,
      commandsHistoryRows.length,
    ],
  );

  const playerHistoryEmptyMessage =
    playerHistoryRows.length &&
    (playerSearch.trim() || playerCategory !== 'all')
      ? t('history_player_filter_empty')
      : t('history_empty');

  const serverHistoryEmptyMessage =
    serverHistoryRows.length &&
    (serverSearch.trim() || effectiveServerActionFilter !== 'all')
      ? t('history_player_filter_empty')
      : t('history_empty');

  const modsHistoryEmptyMessage =
    modsHistoryRows.length &&
    (modsSearch.trim() || effectiveModsActionFilter !== 'all')
      ? t('history_player_filter_empty')
      : t('history_empty');

  const commandsHistoryEmptyMessage =
    commandsHistoryRows.length &&
    (commandsSearch.trim() || effectiveCommandsActionFilter !== 'all')
      ? t('history_player_filter_empty')
      : t('history_empty');

  const openDetailModal = (payload: HistoryDetailPayload) =>
    setDetailModal(payload);
  const closeDetailModal = () => setDetailModal(null);

  const detailPayload = (
    row: {
      actionLabel: string;
      detailVal: string;
      targetVal?: string;
      actorVal: string;
      actionDate: string;
    },
    extra?: Partial<HistoryDetailPayload>,
  ): HistoryDetailPayload => ({
    title: row.actionLabel,
    target:
      extra?.target ?? (row.targetVal ? String(row.targetVal) : undefined),
    detail: row.detailVal,
    actor: row.actorVal,
    date: row.actionDate,
    ...extra,
  });

  return (
    <div
      id="tabPanelHistory"
      className="tab-panel tab-panel--active history-tab"
      role="tabpanel"
      aria-labelledby="tabBtnHistory"
    >
      {initialLoading ? (
        <TabLoadingPlaceholder
          variant="table"
          label={t('tab_data_loading')}
          className="history-tab__loading"
        />
      ) : (
        <div id="playersRootPanelHistory" className="history-tab__body">
          <section className="history-tab__card">
            <div className="history-tab__header-bar">
              <div
                ref={subTabsRef}
                className="sub-tabs history-tab__sub-tabs"
                role="tablist"
              >
                <SlidingTabIndicator rect={slidingRect} variant="sub-tabs" />
                {HISTORY_TABS.map(({ key, i18n, btnId, Icon }) => {
                  const count = tabCounts[key];
                  return (
                    <button
                      key={key}
                      type="button"
                      id={btnId}
                      className={
                        'sub-tabs__tab btn--with-icon' +
                        (historyTab === key ? ' sub-tabs__tab--active' : '')
                      }
                      role="tab"
                      aria-selected={historyTab === key}
                      {...{ [TAB_INDICATOR_ID_ATTR]: key }}
                      onClick={() => setHistoryTab(key)}
                    >
                      <span className="sub-tabs__tab-inner">
                        <Icon size={16} />
                        {t(i18n)}
                        {count > 0 ? (
                          <span className="history-tab__tab-badge">{count}</span>
                        ) : null}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="history-tab__card-body">
              {historyTab === 'player' && (
                <div
                  id="subTabPanelPlayerHistory"
                  className="sub-tab-panel sub-tab-panel--active"
                  role="tabpanel"
                >
                  <HistoryFilterToolbar
                    searchId="playerHistorySearch"
                    searchPlaceholder={t('search_placeholder')}
                    search={playerSearch}
                    onSearchChange={setPlayerSearch}
                    categoryId="playerHistoryCategory"
                    category={playerCategory}
                    onCategoryChange={(value) =>
                      setPlayerCategory(value as PlayerHistoryCategory)
                    }
                    categoryOptions={PLAYER_HISTORY_CATEGORY_KEYS}
                    categoryOptionLabel={(key) =>
                      playerHistoryFilterTypeLabel(
                        key as PlayerHistoryCategory,
                        t,
                      )
                    }
                    filterLabelKey="history_player_type_column"
                    t={t}
                  />
                  <HistoryTableWrap
                    empty={!filteredPlayerHistoryRows.length}
                    emptyMessage={playerHistoryEmptyMessage}
                    t={t}
                  >
                    <table className="data data--history">
                      <thead>
                        <tr>
                          <th>{t('player')}</th>
                          <th>{t('history_player_type_column')}</th>
                          <th>{t('action')}</th>
                          <th>{t('ban_reason_column')}</th>
                          <th>{t('actor_column')}</th>
                          <th>{t('ban_date_column')}</th>
                        </tr>
                      </thead>
                      <tbody id="tblPlayerHistoryBody">
                        {filteredPlayerHistoryRows.map((row) => (
                          <tr key={row.id}>
                            <td className="history-col-player">{row.player}</td>
                            <td className="history-col-type">
                              <span className="history-type-badge">
                                {row.categoryLabel}
                              </span>
                            </td>
                            <td>
                              <HistoryActionBadge
                                label={row.actionLabel}
                                variant={row.actionVariant}
                              />
                            </td>
                            <td
                              className="history-col-reason"
                              title={row.detailVal}
                            >
                              {row.detailVal || '—'}
                            </td>
                            <td className="history-col-actor">
                              {row.actorVal || '—'}
                            </td>
                            <td className="history-col-date">
                              {row.actionDate}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </HistoryTableWrap>
                </div>
              )}

              {historyTab === 'server' && (
                <div
                  id="subTabPanelServerHistory"
                  className="sub-tab-panel sub-tab-panel--active"
                  role="tabpanel"
                >
                  <HistoryFilterToolbar
                    searchId="serverHistorySearch"
                    searchPlaceholder={t('search_placeholder')}
                    search={serverSearch}
                    onSearchChange={setServerSearch}
                    categoryId="serverHistoryAction"
                    category={effectiveServerActionFilter}
                    onCategoryChange={setServerActionFilter}
                    categoryOptions={serverFilterActions}
                    categoryOptionLabel={(key) =>
                      serverHistoryActionFilterLabel(key, t)
                    }
                    filterLabelKey="action"
                    t={t}
                  />
                  <HistoryTableWrap
                    empty={!filteredServerHistoryRows.length}
                    emptyMessage={serverHistoryEmptyMessage}
                    t={t}
                  >
                    <table className="data data--history">
                      <thead>
                        <tr>
                          <th>{t('action')}</th>
                          <th>{t('history_detail_column')}</th>
                          <th>{t('ban_date_column')}</th>
                          <th>{t('actor_column')}</th>
                        </tr>
                      </thead>
                      <tbody id="tblServerHistoryBody">
                        {filteredServerHistoryRows.map((row) => (
                          <tr
                            key={row.id}
                            className={
                              row.failed ? 'history-row--failed' : undefined
                            }
                          >
                            <td>
                              <HistoryActionBadge
                                label={row.actionLabel}
                                variant={row.actionVariant}
                              />
                            </td>
                            <td
                              className="history-col-reason"
                              title={
                                row.detailVal.length <= 80
                                  ? row.detailVal
                                  : undefined
                              }
                            >
                              {row.detailVal.length > 80 ||
                              row.detailVal.includes('\n') ? (
                                <HistoryDetailCell
                                  detail={row.detailVal}
                                  payload={detailPayload(row)}
                                  t={t}
                                  onOpen={openDetailModal}
                                />
                              ) : (
                                row.detailVal
                              )}
                            </td>
                            <td className="history-col-date">
                              {row.actionDate}
                            </td>
                            <td className="history-col-actor">
                              {row.actorVal}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </HistoryTableWrap>
                </div>
              )}

              {historyTab === 'mods' && (
                <div
                  id="subTabPanelModsHistory"
                  className="sub-tab-panel sub-tab-panel--active"
                  role="tabpanel"
                >
                  <HistoryFilterToolbar
                    searchId="modsHistorySearch"
                    searchPlaceholder={t('search_placeholder')}
                    search={modsSearch}
                    onSearchChange={setModsSearch}
                    categoryId="modsHistoryAction"
                    category={effectiveModsActionFilter}
                    onCategoryChange={setModsActionFilter}
                    categoryOptions={modsFilterActions}
                    categoryOptionLabel={(key) =>
                      modsHistoryActionFilterLabel(key, t)
                    }
                    filterLabelKey="action"
                    t={t}
                  />
                  <HistoryTableWrap
                    empty={!filteredModsHistoryRows.length}
                    emptyMessage={modsHistoryEmptyMessage}
                    t={t}
                  >
                    <table className="data data--history">
                      <thead>
                        <tr>
                          <th>{t('history_target_column')}</th>
                          <th>{t('action')}</th>
                          <th>{t('history_detail_column')}</th>
                          <th>{t('ban_date_column')}</th>
                          <th>{t('actor_column')}</th>
                        </tr>
                      </thead>
                      <tbody id="tblModsHistoryBody">
                        {filteredModsHistoryRows.map((row) => (
                          <tr
                            key={row.id}
                            className={
                              row.failed ? 'history-row--failed' : undefined
                            }
                          >
                            <td className="history-col-player">
                              {row.targetVal || '—'}
                            </td>
                            <td>
                              <HistoryActionBadge
                                label={row.actionLabel}
                                variant={row.actionVariant}
                              />
                            </td>
                            <td
                              className="history-col-reason"
                              title={
                                row.detailVal.length <= 80
                                  ? row.detailVal
                                  : undefined
                              }
                            >
                              {row.detailVal.length > 80 ||
                              row.detailVal.includes('\n') ? (
                                <HistoryDetailCell
                                  detail={row.detailVal}
                                  payload={detailPayload(row)}
                                  t={t}
                                  onOpen={openDetailModal}
                                />
                              ) : (
                                row.detailVal
                              )}
                            </td>
                            <td className="history-col-date">
                              {row.actionDate}
                            </td>
                            <td className="history-col-actor">
                              {row.actorVal}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </HistoryTableWrap>
                </div>
              )}

              {historyTab === 'commands' && (
                <div
                  id="subTabPanelCommandsHistory"
                  className="sub-tab-panel sub-tab-panel--active"
                  role="tabpanel"
                >
                  <HistoryFilterToolbar
                    searchId="commandsHistorySearch"
                    searchPlaceholder={t('search_placeholder')}
                    search={commandsSearch}
                    onSearchChange={setCommandsSearch}
                    categoryId="commandsHistoryAction"
                    category={effectiveCommandsActionFilter}
                    onCategoryChange={setCommandsActionFilter}
                    categoryOptions={commandsFilterActions}
                    categoryOptionLabel={(key) =>
                      commandsHistoryActionFilterLabel(key, t)
                    }
                    filterLabelKey="action"
                    t={t}
                  />
                  <HistoryTableWrap
                    empty={!filteredCommandsHistoryRows.length}
                    emptyMessage={commandsHistoryEmptyMessage}
                    t={t}
                  >
                    <table className="data data--history">
                      <thead>
                        <tr>
                          <th>{t('history_target_column')}</th>
                          <th>{t('action')}</th>
                          <th>{t('history_detail_column')}</th>
                          <th>{t('ban_date_column')}</th>
                          <th>{t('actor_column')}</th>
                        </tr>
                      </thead>
                      <tbody id="tblCommandsHistoryBody">
                        {filteredCommandsHistoryRows.map((row) => (
                          <tr
                            key={row.id}
                            className={
                              row.failed ? 'history-row--failed' : undefined
                            }
                          >
                            <td
                              className="history-col-player history-col-target"
                              title={row.targetVal}
                            >
                              {row.targetVal || '—'}
                            </td>
                            <td>
                              <HistoryActionBadge
                                label={row.actionLabel}
                                variant={row.actionVariant}
                              />
                            </td>
                            <td className="history-col-reason">
                              <HistoryDetailCell
                                detail={row.detailVal}
                                payload={detailPayload(row)}
                                t={t}
                                onOpen={openDetailModal}
                              />
                            </td>
                            <td className="history-col-date">
                              {row.actionDate}
                            </td>
                            <td className="history-col-actor">
                              {row.actorVal}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </HistoryTableWrap>
                </div>
              )}
            </div>
          </section>
        </div>
      )}
      <HistoryDetailModal
        payload={detailModal}
        onClose={closeDetailModal}
        t={t}
      />
    </div>
  );
}
