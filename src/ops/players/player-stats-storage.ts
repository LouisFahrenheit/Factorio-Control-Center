import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { panelTimestamp } from '../../common/datetime.util';

export interface PersistentPlayerStat {
  sessions: number;
  total_seconds: number;
  last_leave?: string;
}

export interface HistoryJsonDoc {
  stats?: Record<string, PersistentPlayerStat>;
  history?: Array<{ player?: string; action?: string; date?: string }>;
  [key: string]: unknown;
}

function readHistoryDoc(serverPath: string): HistoryJsonDoc {
  const filePath = join(serverPath, 'server-history.json');
  if (!existsSync(filePath)) return {};
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8')) as HistoryJsonDoc;
  } catch {
    return {};
  }
}

function writeHistoryDoc(serverPath: string, doc: HistoryJsonDoc): void {
  const filePath = join(serverPath, 'server-history.json');
  try {
    writeFileSync(filePath, JSON.stringify(doc, null, 2) + '\n', 'utf-8');
  } catch {
    /* ignore write errors */
  }
}

/**
 * Reads all persistent player stats from server-history.json.
 * If stats object does not exist yet, initializes it.
 */
export function getPlayerStatsMap(
  serverPath: string,
): Record<string, PersistentPlayerStat> {
  const doc = readHistoryDoc(serverPath);
  if (doc.stats && typeof doc.stats === 'object') {
    return doc.stats;
  }
  return {};
}

/**
 * Called when a player joins the server.
 * Increments session count and ensures player stat entry exists.
 */
export function recordPlayerJoin(
  serverPath: string,
  playerName: string,
): void {
  const name = String(playerName || '').trim();
  if (!name) return;

  const doc = readHistoryDoc(serverPath);
  doc.stats = doc.stats || {};
  const current = doc.stats[name] || {
    sessions: 0,
    total_seconds: 0,
    last_leave: '—',
  };

  current.sessions = (Number(current.sessions) || 0) + 1;
  current.total_seconds = Number(current.total_seconds) || 0;
  doc.stats[name] = current;

  writeHistoryDoc(serverPath, doc);
}

/**
 * Adds elapsed online seconds to a player's total time.
 */
export function addPlayerOnlineSeconds(
  serverPath: string,
  playerName: string,
  seconds: number,
  lastLeave?: string,
): void {
  const name = String(playerName || '').trim();
  if (!name) return;
  const sec = Math.max(0, Math.floor(seconds));
  if (sec <= 0 && !lastLeave) return;

  const doc = readHistoryDoc(serverPath);
  doc.stats = doc.stats || {};
  const current = doc.stats[name] || {
    sessions: 1,
    total_seconds: 0,
    last_leave: '—',
  };

  current.total_seconds = (Number(current.total_seconds) || 0) + sec;
  if (lastLeave) {
    current.last_leave = lastLeave;
  }
  doc.stats[name] = current;

  writeHistoryDoc(serverPath, doc);
}

/**
 * Batch flushes online seconds for multiple players at once (e.g. on interval tick).
 */
export function batchAddPlayerOnlineSeconds(
  serverPath: string,
  playerDeltas: Record<string, number>,
): void {
  const entries = Object.entries(playerDeltas).filter(
    ([name, sec]) => name && sec > 0,
  );
  if (!entries.length) return;

  const doc = readHistoryDoc(serverPath);
  doc.stats = doc.stats || {};

  for (const [p, sec] of entries) {
    const name = p.trim();
    const current = doc.stats[name] || {
      sessions: 1,
      total_seconds: 0,
      last_leave: '—',
    };
    current.total_seconds = (Number(current.total_seconds) || 0) + Math.floor(sec);
    doc.stats[name] = current;
  }

  writeHistoryDoc(serverPath, doc);
}

/**
 * Called when a player leaves the server.
 * Flushes final session seconds and sets last_leave timestamp.
 */
export function recordPlayerLeave(
  serverPath: string,
  playerName: string,
  elapsedSeconds: number,
): void {
  const name = String(playerName || '').trim();
  if (!name) return;

  addPlayerOnlineSeconds(
    serverPath,
    name,
    elapsedSeconds,
    panelTimestamp(),
  );
}
