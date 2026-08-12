import { io, Socket } from 'socket.io-client';
import { getToken } from './client';

let socket: Socket | null = null;

/**
 * Get the Socket.IO singleton.
 * Creates the socket on first call, reuses on subsequent calls.
 * The socket auto-connects with the current Bearer token.
 */
export function getSocket(): Socket {
  if (socket) return socket;

  const token = getToken();

  socket = io({
    // When served from the same origin (prod or Vite proxy), no URL needed.
    // Socket.IO will connect to window.location.origin automatically.
    autoConnect: false,
    auth: { token: token || '' },
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
    transports: ['websocket', 'polling'],
  });

  return socket;
}

/** Connect or reconnect with a fresh token. */
export function connectSocket(): void {
  const s = getSocket();
  const token = getToken();
  (s.auth as Record<string, unknown>).token = token || '';
  if (!s.connected) {
    s.connect();
  }
}

/** Disconnect the socket (e.g. on logout). */
export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

/** Subscribe to a specific instance's live events. */
export function subscribeInstance(instanceId: string): void {
  const s = getSocket();
  if (s.connected) {
    s.emit('subscribe_instance', { instanceId });
  }
}

/** Unsubscribe from a specific instance's live events. */
export function unsubscribeInstance(instanceId: string): void {
  const s = getSocket();
  if (s.connected) {
    s.emit('unsubscribe_instance', { instanceId });
  }
}

/** Check if the socket is currently connected. */
export function isSocketConnected(): boolean {
  return socket?.connected === true;
}
