import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import * as net from 'net';

const SERVERDATA_RESPONSE_VALUE = 0;
const SERVERDATA_EXECCOMMAND = 2;
const SERVERDATA_AUTH = 3;
const SERVERDATA_AUTH_RESPONSE = 2;

const RECONNECT_DELAY_MS = 3000;
const KEEPALIVE_INTERVAL_MS = 30000;

interface PendingCommand {
  cmdId: number;
  command: string;
  resolve: (text: string) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

interface RconConnection {
  host: string;
  port: number;
  password: string;
  sock: net.Socket | null;
  authed: boolean;
  buf: Buffer;
  nextId: number;
  /** Commands waiting to be sent (before auth completes) */
  queue: PendingCommand[];
  /** Commands sent, waiting for response */
  pending: Map<number, PendingCommand>;
  destroyed: boolean;
  keepaliveTimer: NodeJS.Timeout | null;
  reconnectTimer: NodeJS.Timeout | null;
}

@Injectable()
export class RconService implements OnModuleDestroy {
  private readonly log = new Logger(RconService.name);
  /** Map keyed by `${host}:${port}` */
  private readonly connections = new Map<string, RconConnection>();

  onModuleDestroy() {
    for (const conn of this.connections.values()) {
      conn.destroyed = true;
      this.clearTimers(conn);
      try {
        conn.sock?.destroy();
      } catch {
        /* ignore */
      }
    }
    this.connections.clear();
  }

  /**
   * Execute a single RCON command, reusing a persistent authenticated socket.
   * Establishes (and caches) the socket on first call; subsequent calls reuse it.
   */
  async run(
    host: string,
    port: number,
    password: string,
    command: string,
    timeoutMs = 20000,
    forceSlashPrefix = true,
  ): Promise<string> {
    let cmd = String(command || '').trim();
    if (!cmd) return '';
    if (forceSlashPrefix && !cmd.startsWith('/')) cmd = '/' + cmd;

    const h = String(host || '127.0.0.1').trim() || '127.0.0.1';
    const p = Number(port);
    if (!Number.isFinite(p) || p < 1 || p > 65535) {
      throw new Error('rcon_invalid_port');
    }

    const key = `${h}:${p}`;
    let conn = this.connections.get(key);

    if (!conn) {
      conn = this.createConnection(h, p, password, key);
      this.connections.set(key, conn);
      this.connect(conn);
    } else if (conn.password !== password) {
      // Password changed — reconnect
      conn.password = password;
      this.reconnect(conn);
    }

    return this.enqueueCommand(conn, cmd, timeoutMs);
  }

  /**
   * Close the persistent connection for a specific host:port.
   * Call when the Factorio server stops.
   */
  close(host: string, port: number): void {
    const key = `${String(host || '127.0.0.1').trim()}:${port}`;
    const conn = this.connections.get(key);
    if (!conn) return;
    conn.destroyed = true;
    this.clearTimers(conn);
    this.failAllPending(conn, new Error('rcon_connection_closed'));
    try {
      conn.sock?.destroy();
    } catch {
      /* ignore */
    }
    conn.sock = null;
    this.connections.delete(key);
  }

  // ─── Internal ─────────────────────────────────────────────────────────────

  private createConnection(
    host: string,
    port: number,
    password: string,
    key: string,
  ): RconConnection {
    return {
      host,
      port,
      password,
      sock: null,
      authed: false,
      buf: Buffer.alloc(0),
      nextId: 10,
      queue: [],
      pending: new Map(),
      destroyed: false,
      keepaliveTimer: null,
      reconnectTimer: null,
    };
  }

  private connect(conn: RconConnection): void {
    if (conn.destroyed) return;
    if (conn.sock) {
      try {
        conn.sock.destroy();
      } catch {
        /* ignore */
      }
    }

    conn.authed = false;
    conn.buf = Buffer.alloc(0);

    const sock = new net.Socket();
    conn.sock = sock;

    sock.setKeepAlive(true, KEEPALIVE_INTERVAL_MS);
    sock.setNoDelay(true);

    sock.on('data', (chunk: Buffer) => {
      conn.buf = Buffer.concat([conn.buf, chunk]);
      this.drain(conn);
    });

    sock.on('error', (err: Error) => {
      if (conn.destroyed) return;
      this.log.debug(`RCON ${conn.host}:${conn.port} socket error: ${err.message}`);
    });

    sock.on('close', () => {
      if (conn.destroyed) return;
      this.log.debug(`RCON ${conn.host}:${conn.port} disconnected — will reconnect`);
      conn.authed = false;
      conn.sock = null;
      this.clearKeepalive(conn);
      // Fail currently pending — they'll be retried via the queue after reconnect
      this.failAllPending(conn, new Error('rcon_connection_closed'));
      this.scheduleReconnect(conn);
    });

    sock.connect(conn.port, conn.host, () => {
      if (conn.destroyed) {
        sock.destroy();
        return;
      }
      // Send auth
      this.sendPacket(conn, 1, SERVERDATA_AUTH, conn.password);
    });
  }

  private scheduleReconnect(conn: RconConnection): void {
    if (conn.destroyed) return;
    if (conn.reconnectTimer) return;
    conn.reconnectTimer = setTimeout(() => {
      conn.reconnectTimer = null;
      if (!conn.destroyed) this.connect(conn);
    }, RECONNECT_DELAY_MS);
  }

  private reconnect(conn: RconConnection): void {
    conn.authed = false;
    this.clearTimers(conn);
    this.failAllPending(conn, new Error('rcon_reconnecting'));
    try {
      conn.sock?.destroy();
    } catch {
      /* ignore */
    }
    conn.sock = null;
    this.connect(conn);
  }

  private drain(conn: RconConnection): void {
    while (conn.buf.length >= 4) {
      const size = conn.buf.readInt32LE(0);
      if (size < 10) {
        this.log.warn(`RCON ${conn.host}:${conn.port} bad packet, dropping connection`);
        conn.sock?.destroy();
        return;
      }
      const total = 4 + size;
      if (conn.buf.length < total) return;

      const body = conn.buf.subarray(4, total);
      conn.buf = conn.buf.subarray(total);

      const reqId = body.readInt32LE(0);
      const type = body.readInt32LE(4);
      const text = body.subarray(8, body.length - 2).toString('utf-8');

      if (!conn.authed) {
        if (reqId === -1) {
          this.log.error(`RCON ${conn.host}:${conn.port} auth failed`);
          this.failAllPending(conn, new Error('rcon_auth_failed'));
          conn.sock?.destroy();
          return;
        }
        if (type === SERVERDATA_AUTH_RESPONSE && reqId === 1) {
          conn.authed = true;
          this.startKeepalive(conn);
          this.flushQueue(conn);
        }
        continue;
      }

      if (type === SERVERDATA_RESPONSE_VALUE) {
        const cmd = conn.pending.get(reqId);
        if (cmd) {
          clearTimeout(cmd.timer);
          conn.pending.delete(reqId);
          cmd.resolve(text);
        }
      }
    }
  }

  private flushQueue(conn: RconConnection): void {
    while (conn.queue.length > 0) {
      const item = conn.queue.shift()!;
      this.sendCommand(conn, item);
    }
  }

  private sendCommand(conn: RconConnection, item: PendingCommand): void {
    conn.pending.set(item.cmdId, item);
    this.sendPacket(conn, item.cmdId, SERVERDATA_EXECCOMMAND, item.command);
  }

  private enqueueCommand(
    conn: RconConnection,
    command: string,
    timeoutMs: number,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      const cmdId = conn.nextId++;
      if (conn.nextId > 2_000_000) conn.nextId = 10;

      const isQuit = command === '/quit' || command === 'quit';

      const timer = setTimeout(() => {
        conn.pending.delete(cmdId);
        // Remove from queue if it never got sent
        const qi = conn.queue.findIndex((q) => q.cmdId === cmdId);
        if (qi >= 0) conn.queue.splice(qi, 1);
        if (isQuit) {
          resolve('');
        } else {
          reject(new Error('rcon_timeout'));
        }
      }, timeoutMs);

      const item: PendingCommand = {
        cmdId,
        command,
        resolve: (text: string) => {
          if (isQuit) {
            // Factorio closes the socket on /quit — that's fine
            resolve('');
          } else {
            resolve(text);
          }
        },
        reject,
        timer,
      };

      if (conn.authed && conn.sock && !conn.sock.destroyed) {
        this.sendCommand(conn, item);
      } else {
        conn.queue.push(item);
      }
    });
  }

  private sendPacket(
    conn: RconConnection,
    reqId: number,
    type: number,
    body: string,
  ): void {
    if (!conn.sock || conn.sock.destroyed) return;
    const payload = Buffer.from(body, 'utf-8');
    const packet = Buffer.alloc(12 + payload.length + 2);
    const size = 4 + 4 + payload.length + 2;
    packet.writeInt32LE(size, 0);
    packet.writeInt32LE(reqId, 4);
    packet.writeInt32LE(type, 8);
    payload.copy(packet, 12);
    packet.writeInt16LE(0, 12 + payload.length);
    try {
      conn.sock.write(packet);
    } catch {
      /* ignore — error event will handle disconnect */
    }
  }

  private startKeepalive(conn: RconConnection): void {
    this.clearKeepalive(conn);
    conn.keepaliveTimer = setInterval(() => {
      // Send a no-op ping to keep the connection alive
      if (conn.authed && conn.sock && !conn.sock.destroyed) {
        // Use a high cmdId that we never wait on
        this.sendPacket(conn, 9, SERVERDATA_EXECCOMMAND, '');
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  private clearKeepalive(conn: RconConnection): void {
    if (conn.keepaliveTimer) {
      clearInterval(conn.keepaliveTimer);
      conn.keepaliveTimer = null;
    }
  }

  private clearTimers(conn: RconConnection): void {
    this.clearKeepalive(conn);
    if (conn.reconnectTimer) {
      clearTimeout(conn.reconnectTimer);
      conn.reconnectTimer = null;
    }
  }

  private failAllPending(conn: RconConnection, err: Error): void {
    for (const item of conn.pending.values()) {
      clearTimeout(item.timer);
      item.reject(err);
    }
    conn.pending.clear();

    for (const item of conn.queue) {
      clearTimeout(item.timer);
      item.reject(err);
    }
    conn.queue = [];
  }
}
