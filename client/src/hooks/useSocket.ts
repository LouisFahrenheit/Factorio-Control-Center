import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  connectSocket,
  disconnectSocket,
  getSocket,
  isSocketConnected,
  subscribeInstance,
  unsubscribeInstance,
} from '../api/socket';
import { getToken } from '../api/client';
import type { PanelStatus } from '../types/panel';

/**
 * Manages the Socket.IO lifecycle: connect on login, disconnect on logout,
 * subscribe to the selected instance, and dispatch incoming WS events
 * to the React Query cache for real-time updates.
 */
export function useSocket(
  loggedIn: boolean,
  selectedInstanceId: string,
) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const prevInstanceRef = useRef('');

  // ── Connect / disconnect based on auth state ───────────────────────
  useEffect(() => {
    if (!loggedIn || !getToken()) {
      disconnectSocket();
      setConnected(false);
      return;
    }

    connectSocket();
    const socket = getSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    // If already connected (e.g. fast re-render)
    if (socket.connected) setConnected(true);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [loggedIn]);

  // ── Subscribe to instance room when selection changes ──────────────
  useEffect(() => {
    if (!connected) return;

    const prev = prevInstanceRef.current;
    if (prev && prev !== selectedInstanceId) {
      unsubscribeInstance(prev);
    }

    const iid = String(selectedInstanceId || '').trim();
    if (iid) {
      subscribeInstance(iid);
      prevInstanceRef.current = iid;
    }
  }, [connected, selectedInstanceId]);

  // Re-subscribe after reconnect
  useEffect(() => {
    if (!connected) return;
    const iid = String(selectedInstanceId || '').trim();
    if (iid) {
      subscribeInstance(iid);
    }
  }, [connected, selectedInstanceId]);

  // ── Listen for WS events and update React Query cache ──────────────
  useEffect(() => {
    if (!loggedIn) return;

    const socket = getSocket();

    const onStatusUpdate = (data: Record<string, unknown>) => {
      const iid = String(data.instanceId || '').trim();
      if (!iid) return;
      // Update the panel status cache directly
      qc.setQueryData(['panel', 'status', iid], (old: PanelStatus | undefined) => {
        if (!old) return data as PanelStatus;
        return { ...old, ...data } as PanelStatus;
      });
    };

    const onPlayersUpdate = (data: Record<string, unknown>) => {
      // Invalidate players summary so the UI re-fetches
      void qc.invalidateQueries({ queryKey: ['players', 'summary'] });
      // Also update online_players in status cache
      const iid = String(data.instanceId || '').trim();
      if (iid) {
        qc.setQueryData(['panel', 'status', iid], (old: PanelStatus | undefined) => {
          if (!old) return old;
          return {
            ...old,
            online_players: data.online_players as unknown[],
          } as PanelStatus;
        });
      }
    };

    const onInstancesUpdate = (_data: Record<string, unknown>) => {
      void qc.invalidateQueries({ queryKey: ['instances'] });
    };

    socket.on('status_update', onStatusUpdate);
    socket.on('players_update', onPlayersUpdate);
    socket.on('instances_update', onInstancesUpdate);

    return () => {
      socket.off('status_update', onStatusUpdate);
      socket.off('players_update', onPlayersUpdate);
      socket.off('instances_update', onInstancesUpdate);
    };
  }, [loggedIn, qc]);

  return { connected, isSocketConnected };
}

/**
 * Hook that provides a callback to append log lines received via WS.
 * Used by useServerControl to get real-time log updates.
 */
export function useSocketLogLines(
  loggedIn: boolean,
  onLogLine: (line: string) => void,
) {
  const callbackRef = useRef(onLogLine);
  callbackRef.current = onLogLine;

  useEffect(() => {
    if (!loggedIn) return;

    const socket = getSocket();

    const handler = (data: { line?: string }) => {
      const line = String(data?.line || '');
      if (line) callbackRef.current(line);
    };

    socket.on('log_line', handler);
    return () => {
      socket.off('log_line', handler);
    };
  }, [loggedIn]);
}

/**
 * Hook that provides a callback to append chat lines received via WS.
 * Used by usePlayers to get real-time chat updates.
 */
export function useSocketChatLines(
  loggedIn: boolean,
  onChatLine: (line: string) => void,
) {
  const callbackRef = useRef(onChatLine);
  callbackRef.current = onChatLine;

  useEffect(() => {
    if (!loggedIn) return;

    const socket = getSocket();

    const handler = (data: { line?: string }) => {
      const line = String(data?.line || '');
      if (line) callbackRef.current(line);
    };

    socket.on('chat_line', handler);
    return () => {
      socket.off('chat_line', handler);
    };
  }, [loggedIn]);
}
