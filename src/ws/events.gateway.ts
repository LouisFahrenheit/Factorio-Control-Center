import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Injectable, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { SessionService } from '../auth/session.service';
import { UsersService } from '../auth/users.service';

/** Room name for a specific instance's live data. */
function instanceRoom(instanceId: string): string {
  return `instance:${instanceId}`;
}

@Injectable()
@WebSocketGateway({
  cors: { origin: '*' },
  // Path is the default `/socket.io`
})
export class EventsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  private readonly log = new Logger(EventsGateway.name);

  @WebSocketServer()
  server!: Server;

  /** Maps socket.id → authenticated username */
  private readonly authenticated = new Map<string, string>();

  /** Maps socket.id → set of allowed instance IDs (or '*' for admins) */
  private readonly allowedInstances = new Map<string, Set<string>>();

  constructor(
    private readonly sessions: SessionService,
    private readonly users: UsersService,
  ) {}

  // ── Connection lifecycle ─────────────────────────────────────────────

  async handleConnection(client: Socket): Promise<void> {
    const token = String(
      (client.handshake?.auth as Record<string, unknown>)?.token || '',
    ).trim();

    if (!token) {
      client.disconnect(true);
      return;
    }

    const user = await this.sessions.resolve(token);
    if (!user || !user.enabled) {
      client.disconnect(true);
      return;
    }

    this.authenticated.set(client.id, user.username);

    const instanceIds = new Set<string>(
      Array.isArray(user.instance_ids) ? user.instance_ids : [],
    );
    this.allowedInstances.set(client.id, instanceIds);

    this.log.debug(`WS connected: ${user.username} (${client.id})`);
  }

  handleDisconnect(client: Socket): void {
    const username = this.authenticated.get(client.id);
    this.authenticated.delete(client.id);
    this.allowedInstances.delete(client.id);
    if (username) {
      this.log.debug(`WS disconnected: ${username} (${client.id})`);
    }
  }

  // ── Client subscriptions ─────────────────────────────────────────────

  @SubscribeMessage('subscribe_instance')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { instanceId?: string },
  ): void {
    const instanceId = String(data?.instanceId || '').trim();
    if (!instanceId) return;

    if (!this.canAccessInstance(client.id, instanceId)) {
      return;
    }

    // Leave any other instance rooms first (one instance at a time)
    for (const room of client.rooms) {
      if (room.startsWith('instance:') && room !== instanceRoom(instanceId)) {
        void client.leave(room);
      }
    }

    void client.join(instanceRoom(instanceId));
  }

  @SubscribeMessage('unsubscribe_instance')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { instanceId?: string },
  ): void {
    const instanceId = String(data?.instanceId || '').trim();
    if (!instanceId) return;
    void client.leave(instanceRoom(instanceId));
  }

  // ── Server-side emit methods (called by other services) ──────────────

  /** Push a single log line to all clients subscribed to this instance. */
  emitLogLine(instanceId: string, line: string): void {
    if (!this.server) return;
    this.server.to(instanceRoom(instanceId)).emit('log_line', {
      instanceId,
      line,
    });
  }

  /** Push a status update to all clients subscribed to this instance. */
  emitStatusUpdate(instanceId: string, status: Record<string, unknown>): void {
    if (!this.server) return;
    this.server.to(instanceRoom(instanceId)).emit('status_update', {
      instanceId,
      ...status,
    });
  }

  /** Push a chat line to all clients subscribed to this instance. */
  emitChatLine(instanceId: string, line: string): void {
    if (!this.server) return;
    this.server.to(instanceRoom(instanceId)).emit('chat_line', {
      instanceId,
      line,
    });
  }

  /** Push players update to all clients subscribed to this instance. */
  emitPlayersUpdate(
    instanceId: string,
    onlinePlayers: Record<string, string>,
  ): void {
    if (!this.server) return;
    this.server.to(instanceRoom(instanceId)).emit('players_update', {
      instanceId,
      online_players: Object.entries(onlinePlayers).map(([name, since]) => ({
        name,
        since,
      })),
    });
  }

  /** Broadcast instances list update to all authenticated clients. */
  broadcastInstancesList(data: Record<string, unknown>): void {
    if (!this.server) return;
    for (const [socketId] of this.authenticated) {
      const socket = this.server.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('instances_update', data);
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────

  private canAccessInstance(socketId: string, instanceId: string): boolean {
    const allowed = this.allowedInstances.get(socketId);
    if (!allowed) return false;
    if (allowed.has('*')) return true;
    return allowed.has(instanceId);
  }
}
