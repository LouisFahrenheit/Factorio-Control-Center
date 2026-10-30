import { Test, TestingModule } from '@nestjs/testing';
import { EventsGateway } from './events.gateway';
import { SessionService } from '../auth/session.service';
import { UsersService } from '../auth/users.service';
import type { Socket, Server } from 'socket.io';
import type { SessionUser } from '../common/types';

interface MockSocket {
  id: string;
  handshake: {
    auth: Record<string, unknown>;
  };
  rooms: Set<string>;
  disconnect: jest.Mock;
  join: jest.Mock;
  leave: jest.Mock;
  emit: jest.Mock;
}

function createMockSocket(
  id = 'socket-1',
  token?: string,
  initialRooms: string[] = [],
): MockSocket {
  return {
    id,
    handshake: {
      auth: token !== undefined ? { token } : {},
    },
    rooms: new Set(['socket-1', ...initialRooms]),
    disconnect: jest.fn(),
    join: jest.fn((_room: string) => undefined),
    leave: jest.fn((_room: string) => undefined),
    emit: jest.fn(),
  };
}

describe('EventsGateway', () => {
  let gateway: EventsGateway;
  let sessionsMock: {
    resolve: jest.MockedFunction<
      (token: string) => Promise<SessionUser | null>
    >;
  };
  let usersMock: Record<string, jest.Mock>;
  let mockServer: {
    to: jest.Mock;
    sockets: {
      sockets: Map<string, MockSocket>;
    };
  };
  let mockRoomEmitter: {
    emit: jest.Mock;
  };

  beforeEach(async () => {
    sessionsMock = {
      resolve: jest.fn(),
    };
    usersMock = {};

    mockRoomEmitter = {
      emit: jest.fn(),
    };
    mockServer = {
      to: jest.fn().mockReturnValue(mockRoomEmitter),
      sockets: {
        sockets: new Map<string, MockSocket>(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventsGateway,
        { provide: SessionService, useValue: sessionsMock },
        { provide: UsersService, useValue: usersMock },
      ],
    }).compile();

    gateway = module.get<EventsGateway>(EventsGateway);
    gateway.server = mockServer as unknown as Server;
  });

  it('should be defined', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('disconnects if client has no token in handshake auth', async () => {
      const client = createMockSocket('client-no-token');
      await gateway.handleConnection(client as unknown as Socket);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(sessionsMock.resolve).not.toHaveBeenCalled();
    });

    it('disconnects if session cannot be resolved', async () => {
      const client = createMockSocket('client-invalid', 'bad-token');
      sessionsMock.resolve.mockResolvedValue(null);

      await gateway.handleConnection(client as unknown as Socket);

      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('disconnects if resolved user is disabled', async () => {
      const client = createMockSocket('client-disabled', 'token-123');
      sessionsMock.resolve.mockResolvedValue({
        username: 'banned_user',
        enabled: false,
        role: 'user',
        instance_ids: ['inst-1'],
      } as SessionUser);

      await gateway.handleConnection(client as unknown as Socket);

      expect(client.disconnect).toHaveBeenCalledWith(true);
    });

    it('authenticates and stores allowed instances for enabled user', async () => {
      const client = createMockSocket('client-ok', 'good-token');
      sessionsMock.resolve.mockResolvedValue({
        username: 'alice',
        enabled: true,
        role: 'user',
        instance_ids: ['inst-1', 'inst-2'],
      } as SessionUser);

      await gateway.handleConnection(client as unknown as Socket);

      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('handles user without instance_ids gracefully', async () => {
      const client = createMockSocket('client-no-instances', 'good-token');
      sessionsMock.resolve.mockResolvedValue({
        username: 'admin',
        enabled: true,
        role: 'admin',
      } as SessionUser);

      await gateway.handleConnection(client as unknown as Socket);

      expect(client.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('handleDisconnect', () => {
    it('cleans up authenticated state on disconnect', async () => {
      const client = createMockSocket('client-dc', 'token-dc');
      sessionsMock.resolve.mockResolvedValue({
        username: 'bob',
        enabled: true,
        role: 'user',
      } as SessionUser);

      await gateway.handleConnection(client as unknown as Socket);
      gateway.handleDisconnect(client as unknown as Socket);

      // Verify no errors and state cleaned up
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('handles disconnect of unauthenticated client cleanly', () => {
      const client = createMockSocket('unknown-client');
      expect(() =>
        gateway.handleDisconnect(client as unknown as Socket),
      ).not.toThrow();
    });
  });

  describe('handleSubscribe & handleUnsubscribe', () => {
    let client: MockSocket;

    beforeEach(async () => {
      client = createMockSocket('sub-client', 'token-sub', [
        'instance:inst-prev',
        'other-room',
      ]);
      sessionsMock.resolve.mockResolvedValue({
        username: 'subscriber',
        enabled: true,
        role: 'user',
        instance_ids: ['inst-1'],
      } as SessionUser);
      await gateway.handleConnection(client as unknown as Socket);
    });

    it('ignores subscription if instanceId is empty', () => {
      gateway.handleSubscribe(client as unknown as Socket, {
        instanceId: '   ',
      });
      expect(client.join).not.toHaveBeenCalled();
    });

    it('does not allow subscribe if client does not have access', () => {
      gateway.handleSubscribe(client as unknown as Socket, {
        instanceId: 'forbidden-inst',
      });
      expect(client.join).not.toHaveBeenCalled();
    });

    it('leaves previous instance room and joins new one on allowed subscribe', () => {
      gateway.handleSubscribe(client as unknown as Socket, {
        instanceId: 'inst-1',
      });

      expect(client.leave).toHaveBeenCalledWith('instance:inst-prev');
      expect(client.join).toHaveBeenCalledWith('instance:inst-1');
    });

    it('allows subscribe if user has wildcard * access', async () => {
      const adminClient = createMockSocket('admin-client', 'token-admin');
      sessionsMock.resolve.mockResolvedValue({
        username: 'superadmin',
        enabled: true,
        role: 'admin',
        instance_ids: ['*'],
      } as SessionUser);
      await gateway.handleConnection(adminClient as unknown as Socket);

      gateway.handleSubscribe(adminClient as unknown as Socket, {
        instanceId: 'any-instance',
      });

      expect(adminClient.join).toHaveBeenCalledWith('instance:any-instance');
    });

    it('handles unsubscribe cleanly', () => {
      gateway.handleUnsubscribe(client as unknown as Socket, {
        instanceId: 'inst-1',
      });
      expect(client.leave).toHaveBeenCalledWith('instance:inst-1');
    });

    it('ignores unsubscribe if instanceId is missing', () => {
      gateway.handleUnsubscribe(client as unknown as Socket, {});
      expect(client.leave).not.toHaveBeenCalled();
    });
  });

  describe('emit methods', () => {
    it('emits log_line to instance room', () => {
      gateway.emitLogLine('inst-10', 'server started');

      expect(mockServer.to).toHaveBeenCalledWith('instance:inst-10');
      expect(mockRoomEmitter.emit).toHaveBeenCalledWith('log_line', {
        instanceId: 'inst-10',
        line: 'server started',
      });
    });

    it('emits status_update to instance room', () => {
      gateway.emitStatusUpdate('inst-10', { running: true, players: 3 });

      expect(mockServer.to).toHaveBeenCalledWith('instance:inst-10');
      expect(mockRoomEmitter.emit).toHaveBeenCalledWith('status_update', {
        instanceId: 'inst-10',
        running: true,
        players: 3,
      });
    });

    it('emits chat_line to instance room', () => {
      gateway.emitChatLine('inst-10', '<Alice> Hello world');

      expect(mockServer.to).toHaveBeenCalledWith('instance:inst-10');
      expect(mockRoomEmitter.emit).toHaveBeenCalledWith('chat_line', {
        instanceId: 'inst-10',
        line: '<Alice> Hello world',
      });
    });

    it('emits players_update to instance room', () => {
      gateway.emitPlayersUpdate('inst-10', {
        Alice: '2026-10-30T20:00:00Z',
        Bob: '2026-10-30T20:05:00Z',
      });

      expect(mockServer.to).toHaveBeenCalledWith('instance:inst-10');
      expect(mockRoomEmitter.emit).toHaveBeenCalledWith('players_update', {
        instanceId: 'inst-10',
        online_players: [
          { name: 'Alice', since: '2026-10-30T20:00:00Z' },
          { name: 'Bob', since: '2026-10-30T20:05:00Z' },
        ],
      });
    });

    it('does nothing in emit methods if server is not initialized', () => {
      gateway.server = undefined as unknown as Server;

      expect(() => gateway.emitLogLine('i', 'line')).not.toThrow();
      expect(() => gateway.emitStatusUpdate('i', {})).not.toThrow();
      expect(() => gateway.emitChatLine('i', 'line')).not.toThrow();
      expect(() => gateway.emitPlayersUpdate('i', {})).not.toThrow();
      expect(() => gateway.broadcastInstancesList({})).not.toThrow();
    });
  });

  describe('broadcastInstancesList', () => {
    it('broadcasts instances_update to authenticated sockets', async () => {
      const socket1 = createMockSocket('s1', 't1');
      const socket2 = createMockSocket('s2', 't2');

      mockServer.sockets.sockets.set('s1', socket1);
      mockServer.sockets.sockets.set('s2', socket2);

      sessionsMock.resolve.mockResolvedValue({
        username: 'user1',
        enabled: true,
        role: 'user',
      } as SessionUser);

      await gateway.handleConnection(socket1 as unknown as Socket);
      await gateway.handleConnection(socket2 as unknown as Socket);

      gateway.broadcastInstancesList({ instances: ['inst-1', 'inst-2'] });

      expect(socket1.emit).toHaveBeenCalledWith('instances_update', {
        instances: ['inst-1', 'inst-2'],
      });
      expect(socket2.emit).toHaveBeenCalledWith('instances_update', {
        instances: ['inst-1', 'inst-2'],
      });
    });
  });
});
