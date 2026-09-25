import { panelTimestamp } from '../../common/datetime.util';
import {
  getPlayerStatsMap,
  recordPlayerJoin,
  addPlayerOnlineSeconds,
  batchAddPlayerOnlineSeconds,
  recordPlayerLeave,
  type PersistentPlayerStat,
} from './player-stats-storage';

export {
  getPlayerStatsMap,
  recordPlayerJoin,
  addPlayerOnlineSeconds,
  batchAddPlayerOnlineSeconds,
  recordPlayerLeave,
  type PersistentPlayerStat,
};

export interface PlayerStatRow {
  player: string;
  sessions: number;
  total_time: string;
  current_session: string;
  last_leave: string;
  online: boolean;
}

export function formatPlayerDuration(totalSeconds: number): string {
  if (!totalSeconds || totalSeconds <= 0) return '0s';
  const sec = Math.floor(totalSeconds);
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;

  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function parseDateMs(d?: string | number): number {
  if (!d) return 0;
  if (typeof d === 'number') return d;
  const str = String(d).trim();
  const iso = str.includes('T') ? str : str.replace(' ', 'T') + 'Z';
  const ms = Date.parse(iso);
  return isNaN(ms) ? Date.parse(str) || 0 : ms;
}

/**
 * Builds the player statistics rows directly from the persistent stats map
 * and the active online players.
 */
export function buildPlayerStatsFromStore(
  statsMap: Record<string, PersistentPlayerStat>,
  onlinePlayers: Record<string, string>,
  playerLastFlushedMs: Record<string, number> = {},
  nowMs = Date.now(),
): PlayerStatRow[] {
  const rows: PlayerStatRow[] = [];
  const processedNames = new Set<string>();

  // 1. Process all players in persistent stats
  for (const [name, st] of Object.entries(statsMap || {})) {
    const playerName = name.trim();
    if (!playerName) continue;
    processedNames.add(playerName);

    const isOnline = Boolean(onlinePlayers && onlinePlayers[playerName]);
    let unflushedSec = 0;
    let currentSessionStr = '—';

    if (isOnline) {
      const sinceMs = parseDateMs(onlinePlayers[playerName]) || nowMs;
      const totalSessionSec = Math.max(0, Math.floor((nowMs - sinceMs) / 1000));
      currentSessionStr = formatPlayerDuration(totalSessionSec);

      // Unflushed time since last periodic tick
      const lastTickMs = playerLastFlushedMs[playerName] || sinceMs;
      unflushedSec = Math.max(0, Math.floor((nowMs - lastTickMs) / 1000));
    }

    const totalSeconds = (Number(st.total_seconds) || 0) + unflushedSec;

    rows.push({
      player: playerName,
      sessions: Math.max(1, Number(st.sessions) || 1),
      total_time: formatPlayerDuration(totalSeconds),
      current_session: currentSessionStr,
      last_leave: st.last_leave && st.last_leave !== '—' ? st.last_leave : '—',
      online: isOnline,
    });
  }

  // 2. Any online player not yet in statsMap (e.g. joined right now)
  for (const [name, since] of Object.entries(onlinePlayers || {})) {
    const playerName = name.trim();
    if (!playerName || processedNames.has(playerName)) continue;

    const sinceMs = parseDateMs(since) || nowMs;
    const sessionSec = Math.max(0, Math.floor((nowMs - sinceMs) / 1000));

    rows.push({
      player: playerName,
      sessions: 1,
      total_time: formatPlayerDuration(sessionSec),
      current_session: formatPlayerDuration(sessionSec),
      last_leave: '—',
      online: true,
    });
  }

  // 3. Sort: online first, then by total seconds played descending, then alphabetical
  rows.sort((a, b) => {
    if (a.online && !b.online) return -1;
    if (!a.online && b.online) return 1;
    return a.player.localeCompare(b.player);
  });

  return rows;
}
