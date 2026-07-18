import type { AnnouncementItem, AnnouncementsState } from '../types/announcements';

export function announceDefaultState(): AnnouncementsState {
  return { items: [], selectedId: null };
}

function normalizeItemSchedule(
  it: Record<string, unknown>,
): Pick<AnnouncementItem, 'intervalHours' | 'autoRepeat' | 'lastAutoSentAt' | 'skipWhenNoPlayers'> {
  const def = { intervalHours: 6, autoRepeat: false, lastAutoSentAt: 0, skipWhenNoPlayers: true };
  let ih = parseInt(String(it.intervalHours ?? ''), 10);
  if (!Number.isFinite(ih)) ih = def.intervalHours;
  ih = Math.min(99, Math.max(1, ih));

  const autoRepeat = Object.prototype.hasOwnProperty.call(it, 'autoRepeat') ? !!it.autoRepeat : def.autoRepeat;
  const lastAutoSentAt = typeof it.lastAutoSentAt === 'number' ? it.lastAutoSentAt : def.lastAutoSentAt;
  const skipWhenNoPlayers = Object.prototype.hasOwnProperty.call(it, 'skipWhenNoPlayers')
    ? !!it.skipWhenNoPlayers
    : def.skipWhenNoPlayers;

  return { intervalHours: ih, autoRepeat, lastAutoSentAt, skipWhenNoPlayers };
}

export function normalizeAnnounceState(j: unknown): AnnouncementsState {
  const base = announceDefaultState();
  if (!j || typeof j !== 'object') return base;
  const root = j as Record<string, unknown>;
  const items = Array.isArray(root.items) ? root.items : [];

  const cleaned: AnnouncementItem[] = [];
  for (const raw of items) {
    if (!raw || typeof raw !== 'object') continue;
    const it = raw as Record<string, unknown>;
    const id = String(it.id || '').trim();
    if (!id) continue;
    cleaned.push({
      id,
      title: String(it.title || ''),
      body: String(it.body || ''),
      forAllServers: !!it.forAllServers,
      ...normalizeItemSchedule(it),
    });
  }
  let selectedId = root.selectedId == null || root.selectedId === '' ? null : String(root.selectedId);
  if (selectedId && !cleaned.some((x) => x.id === selectedId)) selectedId = null;
  if (!selectedId && cleaned.length) selectedId = cleaned[0].id;
  return {
    version: typeof root.version === 'number' ? root.version : 1,
    items: cleaned,
    selectedId,
  };
}

export function newAnnounceId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* ignore */
  }
  return 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

export function announceBodyToChatLines(body: string): string[] {
  return String(body || '')
    .split(/\r\n|[\n\r]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function announceListLabel(
  it: AnnouncementItem,
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  const title = (it.title || '').trim();
  if (title) return title;
  const lines = announceBodyToChatLines(it.body || '');
  if (lines.length) {
    const first = lines[0];
    return first.length > 52 ? first.slice(0, 49) + '…' : first;
  }
  return t('announce_untitled');
}

export function serializeAnnounceState(state: AnnouncementsState): Record<string, unknown> {
  const norm = normalizeAnnounceState(state);
  return {
    version: 1,
    items: norm.items.map((it) => ({
      id: it.id,
      title: it.title,
      body: it.body,
      forAllServers: !!it.forAllServers,
      intervalHours: Math.min(99, Math.max(1, parseInt(String(it.intervalHours), 10) || 6)),
      autoRepeat: !!it.autoRepeat,
      lastAutoSentAt: typeof it.lastAutoSentAt === 'number' ? it.lastAutoSentAt : 0,
      skipWhenNoPlayers: it.skipWhenNoPlayers !== false,
    })),
    selectedId: norm.selectedId,
  };
}

export function newAnnouncementItem(): AnnouncementItem {
  return {
    id: newAnnounceId(),
    title: '',
    body: '',
    forAllServers: false,
    intervalHours: 6,
    autoRepeat: false,
    lastAutoSentAt: 0,
    skipWhenNoPlayers: true,
  };
}
