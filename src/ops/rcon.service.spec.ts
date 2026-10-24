import { Test, TestingModule } from '@nestjs/testing';
import { EventEmitter } from 'events';
import { RconService } from './rcon.service';

class MockSocket extends EventEmitter {
  destroyed = false;
  written: Buffer[] = [];
  connect = jest.fn((_port: number, _host: string, cb?: () => void) => {
    if (cb) {
      cb();
    }
    return this;
  });
  write = jest.fn((data: Buffer) => {
    this.written.push(Buffer.from(data));
    return true;
  });
  setKeepAlive = jest.fn();
  setNoDelay = jest.fn();
  destroy = jest.fn(() => {
    this.destroyed = true;
    return this;
  });
}

const mockSocketInstances: MockSocket[] = [];

jest.mock('net', () => {
  const actualNet = jest.requireActual<typeof import('net')>('net');
  return {
    ...actualNet,
    Socket: jest.fn().mockImplementation(() => {
      const sock = new MockSocket();
      mockSocketInstances.push(sock);
      return sock;
    }),
  };
});

function makeRconPacket(reqId: number, type: number, text: string): Buffer {
  const bodyBuf = Buffer.from(text, 'utf-8');
  const size = 4 + 4 + bodyBuf.length + 2;
  const buf = Buffer.alloc(4 + size);
  buf.writeInt32LE(size, 0);
  buf.writeInt32LE(reqId, 4);
  buf.writeInt32LE(type, 8);
  bodyBuf.copy(buf, 12);
  buf.writeInt16LE(0, 12 + bodyBuf.length);
  return buf;
}

describe('RconService', () => {
  let service: RconService;

  beforeEach(async () => {
    jest.useFakeTimers();
    mockSocketInstances.length = 0;

    const module: TestingModule = await Test.createTestingModule({
      providers: [RconService],
    }).compile();

    service = module.get<RconService>(RconService);
  });

  afterEach(() => {
    service.close('127.0.0.1', 27015);
    service.onModuleDestroy();
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('run command & authentication', () => {
    it('should return empty string for blank or empty command', async () => {
      const result = await service.run('127.0.0.1', 27015, 'pass', '   ');
      expect(result).toBe('');
      expect(mockSocketInstances.length).toBe(0);
    });

    it('should throw error for invalid ports', async () => {
      await expect(
        service.run('127.0.0.1', 0, 'pass', '/help'),
      ).rejects.toThrow('rcon_invalid_port');
      await expect(
        service.run('127.0.0.1', 70000, 'pass', '/help'),
      ).rejects.toThrow('rcon_invalid_port');
      await expect(
        service.run('127.0.0.1', NaN, 'pass', '/help'),
      ).rejects.toThrow('rcon_invalid_port');
    });

    it('should connect, authenticate, and execute command successfully', async () => {
      const runPromise = service.run('127.0.0.1', 27015, 'secret-pw', 'help');
      expect(mockSocketInstances.length).toBe(1);
      const sock = mockSocketInstances[0];

      // Check auth packet sent (reqId: 1, type: 3 = SERVERDATA_AUTH)
      expect(sock.written.length).toBe(1);
      const authPacket = sock.written[0];
      expect(authPacket.readInt32LE(4)).toBe(1);
      expect(authPacket.readInt32LE(8)).toBe(3);

      // Simulate server accepting auth (type 2 = SERVERDATA_AUTH_RESPONSE, reqId 1)
      const authResp = makeRconPacket(1, 2, '');
      sock.emit('data', authResp);

      // Now queued command should be flushed and written to socket
      expect(sock.written.length).toBe(2);
      const cmdPacket = sock.written[1];
      const cmdReqId = cmdPacket.readInt32LE(4);
      expect(cmdReqId).toBeGreaterThanOrEqual(10);
      expect(cmdPacket.readInt32LE(8)).toBe(2); // SERVERDATA_EXECCOMMAND
      const cmdText = cmdPacket
        .subarray(12, cmdPacket.length - 2)
        .toString('utf-8');
      expect(cmdText).toBe('/help'); // forced slash prefix

      // Simulate server responding to command (type 0 = SERVERDATA_RESPONSE_VALUE)
      const cmdResp = makeRconPacket(cmdReqId, 0, 'Available commands: /help');
      sock.emit('data', cmdResp);

      const result = await runPromise;
      expect(result).toBe('Available commands: /help');
    });

    it('should not force slash prefix if forceSlashPrefix is false', async () => {
      const runPromise = service.run(
        '127.0.0.1',
        27015,
        'pass',
        'raw_cmd',
        5000,
        false,
      );
      const sock = mockSocketInstances[0];

      // Authenticate
      sock.emit('data', makeRconPacket(1, 2, ''));

      expect(sock.written.length).toBe(2);
      const cmdPacket = sock.written[1];
      const cmdReqId = cmdPacket.readInt32LE(4);
      const cmdText = cmdPacket
        .subarray(12, cmdPacket.length - 2)
        .toString('utf-8');
      expect(cmdText).toBe('raw_cmd');

      sock.emit('data', makeRconPacket(cmdReqId, 0, 'ok'));
      await expect(runPromise).resolves.toBe('ok');
    });

    it('should reject pending commands if authentication fails (reqId -1)', async () => {
      const runPromise = service.run('127.0.0.1', 27015, 'wrong-pw', '/time');
      const sock = mockSocketInstances[0];

      // Send auth fail packet
      const failResp = makeRconPacket(-1, 2, '');
      sock.emit('data', failResp);

      await expect(runPromise).rejects.toThrow('rcon_auth_failed');
      expect(sock.destroy).toHaveBeenCalled();
    });
  });

  describe('TCP fragmentation & multi-packet handling', () => {
    it('should handle fragmented response split across multiple data chunks', async () => {
      const runPromise = service.run('127.0.0.1', 27015, 'pass', '/status');
      const sock = mockSocketInstances[0];
      sock.emit('data', makeRconPacket(1, 2, ''));

      const cmdPacket = sock.written[1];
      const cmdReqId = cmdPacket.readInt32LE(4);

      const fullPacket = makeRconPacket(cmdReqId, 0, 'Server status: ONLINE');
      const chunk1 = fullPacket.subarray(0, 10);
      const chunk2 = fullPacket.subarray(10);

      sock.emit('data', chunk1);
      sock.emit('data', chunk2);

      const result = await runPromise;
      expect(result).toBe('Server status: ONLINE');
    });

    it('should handle multiple responses combined into a single data chunk', async () => {
      const p1 = service.run('127.0.0.1', 27015, 'pass', '/cmd1');
      const p2 = service.run('127.0.0.1', 27015, 'pass', '/cmd2');
      const sock = mockSocketInstances[0];
      sock.emit('data', makeRconPacket(1, 2, ''));

      const reqId1 = sock.written[1].readInt32LE(4);
      const reqId2 = sock.written[2].readInt32LE(4);

      const combined = Buffer.concat([
        makeRconPacket(reqId1, 0, 'res1'),
        makeRconPacket(reqId2, 0, 'res2'),
      ]);

      sock.emit('data', combined);

      expect(await p1).toBe('res1');
      expect(await p2).toBe('res2');
    });

    it('should drop connection and log warning on invalid packet length (< 10)', async () => {
      const runPromise = service.run('127.0.0.1', 27015, 'pass', '/check');
      const sock = mockSocketInstances[0];
      sock.emit('data', makeRconPacket(1, 2, ''));

      // Send corrupted packet with size = 5 (< 10)
      const corrupted = Buffer.alloc(8);
      corrupted.writeInt32LE(5, 0);
      sock.emit('data', corrupted);

      expect(sock.destroy).toHaveBeenCalled();

      // Ensure pending command does not linger
      service.close('127.0.0.1', 27015);
      await expect(runPromise).rejects.toThrow('rcon_connection_closed');
    });
  });

  describe('timeouts and special commands', () => {
    it('should timeout and reject command with rcon_timeout', async () => {
      const p = service.run('127.0.0.1', 27015, 'pass', '/slow', 2000);
      const sock = mockSocketInstances[0];
      sock.emit('data', makeRconPacket(1, 2, ''));

      jest.advanceTimersByTime(2500);

      await expect(p).rejects.toThrow('rcon_timeout');
    });

    it('should resolve empty string for /quit even on timeout', async () => {
      const p = service.run('127.0.0.1', 27015, 'pass', '/quit', 1000);
      const sock = mockSocketInstances[0];
      sock.emit('data', makeRconPacket(1, 2, ''));

      jest.advanceTimersByTime(1500);

      await expect(p).resolves.toBe('');
    });

    it('should resolve empty string for /quit on immediate resolve', async () => {
      const p = service.run('127.0.0.1', 27015, 'pass', '/quit');
      const sock = mockSocketInstances[0];
      sock.emit('data', makeRconPacket(1, 2, ''));

      const reqId = sock.written[1].readInt32LE(4);
      sock.emit('data', makeRconPacket(reqId, 0, 'Quitting factorio'));

      await expect(p).resolves.toBe('');
    });
  });

  describe('reconnection and lifecycle', () => {
    it('should reconnect when password changes for the same host and port', async () => {
      const p1 = service.run('127.0.0.1', 27015, 'pass1', '/c1');
      const sock1 = mockSocketInstances[0];
      sock1.emit('data', makeRconPacket(1, 2, ''));
      const reqId1 = sock1.written[1].readInt32LE(4);
      sock1.emit('data', makeRconPacket(reqId1, 0, 'ok1'));
      await expect(p1).resolves.toBe('ok1');

      // Now run with new password
      const p2 = service.run('127.0.0.1', 27015, 'pass2', '/c2');

      expect(mockSocketInstances.length).toBe(2);
      const sock2 = mockSocketInstances[1];
      expect(sock1.destroy).toHaveBeenCalled();

      // Check auth sent with new password
      const newAuth = sock2.written[0];
      const newPass = newAuth
        .subarray(12, newAuth.length - 2)
        .toString('utf-8');
      expect(newPass).toBe('pass2');

      sock2.emit('data', makeRconPacket(1, 2, ''));
      const reqId2 = sock2.written[1].readInt32LE(4);
      sock2.emit('data', makeRconPacket(reqId2, 0, 'ok2'));
      await expect(p2).resolves.toBe('ok2');
    });

    it('should handle disconnect close event and schedule reconnection', async () => {
      const p = service.run('127.0.0.1', 27015, 'pass', '/test');
      const sock = mockSocketInstances[0];
      sock.emit('data', makeRconPacket(1, 2, ''));

      // Disconnect socket unexpectedly
      sock.emit('close');

      await expect(p).rejects.toThrow('rcon_connection_closed');

      // Advance by reconnect delay (3000ms)
      jest.advanceTimersByTime(3000);
      expect(mockSocketInstances.length).toBe(2);
    });

    it('should close connection explicitly and fail pending commands', async () => {
      const p = service.run('127.0.0.1', 27015, 'pass', '/hanging');
      const sock = mockSocketInstances[0];
      sock.emit('data', makeRconPacket(1, 2, ''));

      service.close('127.0.0.1', 27015);

      await expect(p).rejects.toThrow('rcon_connection_closed');
      expect(sock.destroy).toHaveBeenCalled();
    });

    it('should send keepalive packet periodically when connection is idle and authed', async () => {
      const p = service.run('127.0.0.1', 27015, 'pass', '/init');
      const sock = mockSocketInstances[0];
      sock.emit('data', makeRconPacket(1, 2, ''));
      const reqId = sock.written[1].readInt32LE(4);
      sock.emit('data', makeRconPacket(reqId, 0, 'ready'));
      await p;

      const countBefore = sock.written.length;
      // Advance by keepalive interval (30000ms)
      jest.advanceTimersByTime(30000);

      expect(sock.written.length).toBe(countBefore + 1);
      const pingPacket = sock.written[sock.written.length - 1];
      expect(pingPacket.readInt32LE(4)).toBe(9); // cmdId 9 is keepalive
      expect(pingPacket.readInt32LE(8)).toBe(2); // SERVERDATA_EXECCOMMAND
    });
  });
});
