import type { HistoryEvent } from '../types/players';
import { formatPanelActorName } from './actorUtils';
import { formatPanelDateTime, parsePanelDateTime } from './datetimeUtils';
import { formatBanHistoryRow, formatWhitelistHistoryRow } from './playerUtils';

export type PlayerHistoryCategory = 'all' | 'session' | 'ban' | 'kick' | 'mute' | 'whitelist';
export type PlayerHistorySource = 'session' | 'ban' | 'kick' | 'mute' | 'whitelist';
export type PlayerHistoryActionVariant = 'positive' | 'negative' | 'neutral';

export interface UnifiedPlayerHistoryRow {
  id: string;
  source: PlayerHistorySource;
  categoryLabel: string;
  player: string;
  actionLabel: string;
  actionVariant: PlayerHistoryActionVariant;
  detailVal: string;
  actorVal: string;
  actionDate: string;
  sortTs: number;
  searchText: string;
}

const PLAYER_HISTORY_CATEGORY_KEYS: Record<PlayerHistorySource, string> = {
  session: 'history_player_category_session',
  ban: 'history_player_category_ban',
  kick: 'history_player_category_kick',
  mute: 'history_player_category_mute',
  whitelist: 'history_player_category_whitelist',
};

export function playerHistorySourceTypeLabel(
  source: PlayerHistorySource,
  t: (key: string) => string,
): string {
  const key = PLAYER_HISTORY_CATEGORY_KEYS[source];
  return t(key);
}

export function playerHistoryFilterTypeLabel(
  category: PlayerHistoryCategory,
  t: (key: string) => string,
): string {
  if (category === 'all') return t('history_player_category_all');
  return playerHistorySourceTypeLabel(category, t);
}

function actionVariantFromClass(actionClass: string | undefined): PlayerHistoryActionVariant {
  if (actionClass === 'cell-online') return 'positive';
  if (actionClass === 'cell-offline') return 'negative';
  return 'neutral';
}

function rowSortTs(rawDate: unknown): number {
  return parsePanelDateTime(rawDate) ?? 0;
}

function buildSearchText(parts: (string | undefined)[]): string {
  return parts
    .map((part) => String(part || '').trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function pushRow(
  rows: UnifiedPlayerHistoryRow[],
  row: Omit<UnifiedPlayerHistoryRow, 'id' | 'searchText'>,
  index: number,
): void {
  rows.push({
    ...row,
    id: `${row.source}-${row.sortTs}-${row.player}-${row.actionLabel}-${index}`,
    searchText: buildSearchText([row.player, row.categoryLabel, row.actionLabel, row.detailVal, row.actorVal]),
  });
}

export function buildPlayerHistoryRows(
  sessionEvents: HistoryEvent[],
  banEvents: HistoryEvent[],
  kickEvents: HistoryEvent[],
  muteEvents: HistoryEvent[],
  whitelistEvents: HistoryEvent[],
  t: (key: string) => string,
): UnifiedPlayerHistoryRow[] {
  const rows: UnifiedPlayerHistoryRow[] = [];
  let index = 0;

  sessionEvents.forEach((ev) => {
    const rawAction = String(ev.action || '').toUpperCase();
    const actionClass =
      rawAction === 'JOIN' ? 'cell-online' : rawAction === 'LEAVE' ? 'cell-offline' : '';
    pushRow(
      rows,
      {
        source: 'session',
        categoryLabel: playerHistorySourceTypeLabel('session', t),
        player: String(ev.player || ''),
        actionLabel: String(ev.action || ''),
        actionVariant: actionVariantFromClass(actionClass),
        detailVal: '',
        actorVal: '',
        actionDate: formatPanelDateTime(ev.date || ev.time),
        sortTs: rowSortTs(ev.date || ev.time),
      },
      index++,
    );
  });

  banEvents.forEach((ev) => {
    const row = formatBanHistoryRow(ev, t);
    pushRow(
      rows,
      {
        source: 'ban',
        categoryLabel: playerHistorySourceTypeLabel('ban', t),
        player: String(ev.player || ''),
        actionLabel: row.actionLabel,
        actionVariant: actionVariantFromClass(row.actionClass),
        detailVal: row.reasonVal,
        actorVal: row.actorVal,
        actionDate: row.actionDate,
        sortTs: rowSortTs(
          String(ev.action || '').toUpperCase() === 'UNBAN' ? ev.unban_date || ev.date : ev.date,
        ),
      },
      index++,
    );
  });

  kickEvents.forEach((ev) => {
    pushRow(
      rows,
      {
        source: 'kick',
        categoryLabel: playerHistorySourceTypeLabel('kick', t),
        player: String(ev.player || ''),
        actionLabel: String(ev.action || ''),
        actionVariant: 'negative',
        detailVal: String(ev.reason || ''),
        actorVal: formatPanelActorName(ev.actor, t),
        actionDate: formatPanelDateTime(ev.date),
        sortTs: rowSortTs(ev.date),
      },
      index++,
    );
  });

  muteEvents.forEach((ev) => {
    const action = String(ev.action || '').toUpperCase();
    const actionClass = action === 'UNMUTE' ? 'cell-online' : action === 'MUTE' ? 'cell-offline' : '';
    pushRow(
      rows,
      {
        source: 'mute',
        categoryLabel: playerHistorySourceTypeLabel('mute', t),
        player: String(ev.player || ''),
        actionLabel: String(ev.action || ''),
        actionVariant: actionVariantFromClass(actionClass),
        detailVal: '',
        actorVal: formatPanelActorName(ev.actor, t),
        actionDate: formatPanelDateTime(ev.date),
        sortTs: rowSortTs(ev.date),
      },
      index++,
    );
  });

  whitelistEvents.forEach((ev) => {
    const row = formatWhitelistHistoryRow(ev, t);
    pushRow(
      rows,
      {
        source: 'whitelist',
        categoryLabel: playerHistorySourceTypeLabel('whitelist', t),
        player: row.playerCell,
        actionLabel: row.actionLabel,
        actionVariant: actionVariantFromClass(row.actionClass),
        detailVal: '',
        actorVal: row.actorVal,
        actionDate: row.date,
        sortTs: rowSortTs(ev.date),
      },
      index++,
    );
  });

  return rows.sort((a, b) => b.sortTs - a.sortTs || a.id.localeCompare(b.id));
}

export function filterPlayerHistoryRows(
  rows: UnifiedPlayerHistoryRow[],
  category: PlayerHistoryCategory,
  search: string,
): UnifiedPlayerHistoryRow[] {
  const q = search.trim().toLowerCase();
  return rows.filter((row) => {
    if (category !== 'all' && row.source !== category) return false;
    if (!q) return true;
    return row.searchText.includes(q);
  });
}
