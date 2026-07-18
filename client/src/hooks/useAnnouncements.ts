import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getToken, api } from '../api/client';
import {
  announceBodyToChatLines,
  announceListLabel,
  newAnnouncementItem,
  normalizeAnnounceState,
  serializeAnnounceState,
} from '../lib/announcementUtils';
import { localizePlayersChatApiError } from '../lib/playerUtils';
import { notifyApiError } from '../lib/networkErrors';
import { notifyErr, notifyOk, notifyWarn } from '../lib/notify';
import type { AnnouncementItem, AnnouncementsLoadResponse, AnnouncementsState } from '../types/announcements';

export function useAnnouncements(
  enabled: boolean,
  instanceId: string,
  serverRunning: boolean,
  onlineCount: number,
  t: (key: string, ...args: (string | number)[]) => string,
) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<AnnouncementsState>(() => normalizeAnnounceState(null));
  const [loadedForInstance, setLoadedForInstance] = useState('');
  const persistTimerRef = useRef<number | null>(null);
  const loadPromiseRef = useRef<Promise<void> | null>(null);

  const selectedItem = useMemo(
    () => state.items.find((x) => x.id === state.selectedId) || null,
    [state.items, state.selectedId],
  );

  const persistNow = useCallback(async (s: AnnouncementsState) => {
    const payload = serializeAnnounceState(s);
    await api('/api/announcements', { method: 'PUT', body: JSON.stringify(payload) });
  }, []);

  const schedulePersist = useCallback(
    (s: AnnouncementsState) => {
      if (!getToken()) return;
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
      persistTimerRef.current = window.setTimeout(() => {
        persistTimerRef.current = null;
        persistNow(s).catch(() => {});
      }, 650);
    },
    [persistNow],
  );

  const loadFromServer = useCallback(
    async (force = false) => {
      const iid = String(instanceId || '');
      if (!getToken() || !iid) return;
      if (!force && loadedForInstance === iid && loadPromiseRef.current) {
        await loadPromiseRef.current;
        return;
      }
      if (!force && loadedForInstance === iid) return;

      const run = (async () => {
        const r = await api<AnnouncementsLoadResponse>('/api/announcements');
        if (!r || r.ok === false) throw new Error(String(r?.error || 'load_failed'));
        let next = normalizeAnnounceState(r.data || {});
        setState(next);
        setLoadedForInstance(iid);
      })();

      loadPromiseRef.current = run;
      try {
        await run;
      } finally {
        loadPromiseRef.current = null;
      }
    },
    [instanceId, loadedForInstance, persistNow],
  );

  useEffect(() => {
    if (!enabled || !instanceId) {
      setLoadedForInstance('');
      setState(normalizeAnnounceState(null));
    }
  }, [enabled, instanceId]);

  useEffect(() => {
    if (!enabled || !instanceId) return;
    loadFromServer(false).catch(() => {});
  }, [enabled, instanceId, loadFromServer]);

  const openDialog = useCallback(async () => {
    try {
      await loadFromServer(true);
    } catch (e) {
      notifyApiError(t('announce_btn'), e, t);
    }
    setOpen(true);
  }, [loadFromServer, t]);

  const closeDialog = useCallback(() => {
    setOpen(false);
    const norm = normalizeAnnounceState(state);
    if (getToken()) persistNow(norm).catch(() => {});
  }, [persistNow, state]);

  const selectItem = useCallback(
    (id: string) => {
      setState((prev) => {
        const norm = normalizeAnnounceState({ ...prev, selectedId: id });
        schedulePersist(norm);
        return norm;
      });
    },
    [schedulePersist],
  );

  const updateSelected = useCallback(
    (patch: Partial<AnnouncementItem>) => {
      setState((prev) => {
        if (!prev.selectedId) return prev;
        const items = prev.items.map((it) => (it.id === prev.selectedId ? { ...it, ...patch } : it));
        const norm = normalizeAnnounceState({ ...prev, items });
        schedulePersist(norm);
        return norm;
      });
    },
    [schedulePersist],
  );

  const addItem = useCallback(() => {
    const item = newAnnouncementItem();
    setState((prev) => {
      const norm = normalizeAnnounceState({
        ...prev,
        items: [...prev.items, item],
        selectedId: item.id,
      });
      schedulePersist(norm);
      return norm;
    });
  }, [schedulePersist]);

  const deleteItem = useCallback(() => {
    setState((prev) => {
      if (!prev.selectedId) return prev;
      const items = prev.items.filter((x) => x.id !== prev.selectedId);
      const norm = normalizeAnnounceState({
        ...prev,
        items,
        selectedId: items.length ? items[0].id : null,
      });
      schedulePersist(norm);
      return norm;
    });
  }, [schedulePersist]);

  const postLines = useCallback(async (lines: string[]) => {
    for (const line of lines) {
      const r = await api<{ ok?: boolean; error?: string }>('/api/chat/send-announcement', {
        method: 'POST',
        body: JSON.stringify({ message: line }),
      });
      if (r?.ok === false) throw new Error(String(r.error || 'send_failed'));
    }
  }, []);

  const sendNow = useCallback(async () => {
    if (!serverRunning) {
      notifyWarn(t('announce_btn'), t('server_not_running_msg'));
      return;
    }
    if (!selectedItem) {
      notifyWarn(t('announce_btn'), t('announce_need_select'));
      return;
    }
    const lines = announceBodyToChatLines(selectedItem.body);
    if (!lines.length) {
      notifyWarn(t('announce_btn'), t('announce_empty_message'));
      return;
    }
    try {
      await postLines(lines);
      notifyOk(t('announce_btn'), t('announce_sent_ok'));
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      notifyErr(t('announce_btn'), localizePlayersChatApiError(raw, t));
    }
  }, [postLines, selectedItem, serverRunning, t]);

  const tickAutoSend = useCallback(() => {
    if (!serverRunning || !enabled) return;
    const now = Date.now();
    let changed = false;
    const nextItems = state.items.map((item) => ({ ...item }));
    for (const item of nextItems) {
      if (!item.autoRepeat) continue;
      const lines = announceBodyToChatLines(item.body);
      if (!lines.length) continue;
      const hours = Math.max(1, Math.min(99, parseInt(String(item.intervalHours), 10) || 6));
      const ms = hours * 3600000;
      let last = item.lastAutoSentAt || 0;
      if (last <= 0) {
        item.lastAutoSentAt = now;
        changed = true;
        continue;
      }
      if (now - last < ms) continue;
      if (item.skipWhenNoPlayers !== false && onlineCount <= 0) continue;
      const itemId = item.id;
      void postLines(lines)
        .then(() => {
          setState((prev) => {
            const items = prev.items.map((it) =>
              it.id === itemId ? { ...it, lastAutoSentAt: Date.now() } : it,
            );
            const norm = normalizeAnnounceState({ ...prev, items });
            persistNow(norm).catch(() => {});
            return norm;
          });
        })
        .catch(() => {});
    }
    if (changed) {
      setState((prev) => {
        const norm = normalizeAnnounceState({ ...prev, items: nextItems });
        schedulePersist(norm);
        return norm;
      });
    }
  }, [enabled, onlineCount, persistNow, postLines, schedulePersist, serverRunning, state.items]);

  useEffect(() => {
    if (!enabled) return;
    const id = window.setInterval(() => tickAutoSend(), 60000);
    return () => window.clearInterval(id);
  }, [enabled, tickAutoSend]);

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) window.clearTimeout(persistTimerRef.current);
    };
  }, []);

  return {
    open,
    state,
    selectedItem,
    listLabel: (it: AnnouncementItem) => announceListLabel(it, t),
    openDialog,
    closeDialog,
    selectItem,
    updateSelected,
    addItem,
    deleteItem,
    sendNow,
  };
}

export type AnnouncementsApi = ReturnType<typeof useAnnouncements>;
