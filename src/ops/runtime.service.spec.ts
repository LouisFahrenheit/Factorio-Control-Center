jest.mock('child_process', () => {
  const actual =
    jest.requireActual<typeof import('child_process')>('child_process');
  return {
    ...actual,
    spawn: jest.fn(),
    execFile: jest.fn(
      (_file: string, _args: unknown, optsOrCb: unknown, maybeCb?: unknown) => {
        const cb =
          typeof optsOrCb === 'function'
            ? (optsOrCb as (
                err: Error | null,
                res: { stdout: string; stderr: string },
              ) => void)
            : (maybeCb as
                | ((
                    err: Error | null,
                    res: { stdout: string; stderr: string },
                  ) => void)
                | undefined);
        if (cb) cb(null, { stdout: '', stderr: '' });
      },
    ),
  };
});

import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import { spawn, type ChildProcessWithoutNullStreams } from 'child_process';
import { RuntimeService, InstanceRuntime } from './runtime.service';
import { RconService } from './rcon.service';
import { PathsService } from '../config/paths.service';
import { InstancesService } from '../instances/instances.service';
import { LogRotationService } from '../logging/log-rotation.service';
import { FccConfigService } from '../config/fcc-config.service';
import { FirewallService } from './firewall/firewall.service';
import { InstanceHistoryService } from './instance-history.service';
import { EventsGateway } from '../ws/events.gateway';
import { NotificationsService } from '../notifications/notifications.service';
import { FactorioLogSessionState } from '../shared/factorio-log-timestamps';
import type { InstanceItem } from '../common/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface FakeChildProcess extends EventEmitter {
  stdout: PassThrough;
  stderr: PassThrough;
  stdin: PassThrough;
  pid: number;
  killed: boolean;
  exitCode: number | null;
  kill: jest.Mock<boolean, [NodeJS.Signals | number | undefined]>;
}

interface RuntimeServicePrivate {
  parseRuntimeLine(rt: InstanceRuntime, line: string): void;
  flushOnlinePlayersStats(): void;
}

describe('RuntimeService', () => {
  let service: RuntimeService;
  let tempDir: string;
  let mockRcon: Partial<RconService>;
  let mockPaths: Partial<PathsService>;
  let mockInstances: Partial<InstancesService>;
  let mockLogRotation: Partial<LogRotationService>;
  let mockConfig: Partial<FccConfigService>;
  let mockFirewall: Partial<FirewallService>;
  let mockInstanceHistory: Partial<InstanceHistoryService>;
  let mockEventsGateway: Partial<EventsGateway>;
  let mockNotifications: Partial<NotificationsService>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-runtime-test-'));

    mockRcon = {
      run: jest.fn(),
      close: jest.fn(),
    };
    mockPaths = {
      backupsDir: path.join(tempDir, 'backups'),
      instanceLogsDir: path.join(tempDir, 'logs'),
      instanceLogPath: jest.fn((id: string) =>
        path.join(tempDir, 'logs', id, 'server.log'),
      ),
    };
    mockInstances = {
      getById: jest.fn(),
    };
    mockLogRotation = {
      appendLine: jest.fn(),
      logWriteInstanceEnabled: jest.fn().mockReturnValue(true),
    };
    mockConfig = {
      webPanel: {} as unknown as FccConfigService['webPanel'],
    };
    mockFirewall = {
      logStartupNotice: jest.fn(),
      tryApplyOnGameStart: jest.fn().mockResolvedValue(undefined),
    };
    mockInstanceHistory = {
      recordInGameCommand: jest.fn(),
      recordStartupError: jest.fn(),
    };
    mockEventsGateway = {
      emitStatusUpdate: jest.fn(),
      emitPlayersUpdate: jest.fn(),
      emitChatLine: jest.fn(),
      emitLogLine: jest.fn(),
    };
    mockNotifications = {
      onServerStarted: jest.fn(),
      onServerStopped: jest.fn(),
      onServerStartFailed: jest.fn(),
      onServerCrash: jest.fn(),
      onPlayerJoin: jest.fn(),
      onPlayerLeave: jest.fn(),
      onModeration: jest.fn(),
      onChatMessage: jest.fn(),
    };

    service = new RuntimeService(
      mockRcon as RconService,
      mockPaths as PathsService,
      mockInstances as InstancesService,
      mockLogRotation as LogRotationService,
      mockConfig as FccConfigService,
      mockFirewall as FirewallService,
      mockInstanceHistory as InstanceHistoryService,
      mockEventsGateway as EventsGateway,
      mockNotifications as NotificationsService,
    );
  });

  afterEach(async () => {
    service.runtimes.clear();
    await service.onModuleDestroy();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  function createMockRuntime(instanceId = 'inst-1'): InstanceRuntime {
    return {
      proc: {
        killed: false,
        exitCode: null,
        kill: jest.fn(),
      } as unknown as ChildProcessWithoutNullStreams,
      startedAt: Date.now(),
      bind: '0.0.0.0:34197',
      saveName: 'save1.zip',
      serverPath: tempDir,
      logRing: [],
      sessionRawLines: [],
      logSession: new FactorioLogSessionState(),
      logPath: path.join(tempDir, 'server.log'),
      stopping: false,
      inGame: false,
      wasEverInGame: false,
      onlinePlayers: {},
      playerLastTick: {},
      rconHost: '127.0.0.1',
      rconPort: 27015,
      rconPassword: 'pass',
      lastExitCode: 0,
      lastStartFailed: false,
      missingStartupDependencies: [],
      missingStartupDepsSeen: new Set(),
      gameVersion: '2.0.0',
      sawShutdownMarker: false,
      sawSaveProgress100: false,
      sawRemoteQuit: false,
      killRequested: false,
      stopWatchdogActive: false,
      serverShutdownLogged: false,
      shutdownMarkerAt: 0,
      shutdownKillScheduled: false,
      instanceId,
    };
  }

  describe('query state methods', () => {
    it('should return correct isRunning status', () => {
      expect(service.isRunning('inst-1')).toBe(false);

      const rt = createMockRuntime('inst-1');
      service.runtimes.set('inst-1', rt);
      expect(service.isRunning('inst-1')).toBe(true);

      // If process exited, isRunning is false
      if (rt.proc) {
        Object.defineProperty(rt.proc, 'exitCode', {
          value: 0,
          writable: true,
          configurable: true,
        });
      }
      expect(service.isRunning('inst-1')).toBe(false);

      if (rt.proc) {
        Object.defineProperty(rt.proc, 'exitCode', {
          value: null,
          writable: true,
          configurable: true,
        });
      }
      rt.proc = null;
      expect(service.isRunning('inst-1')).toBe(false);
    });

    it('should return runtime instance via get()', () => {
      const rt = createMockRuntime('inst-1');
      service.runtimes.set('inst-1', rt);
      expect(service.get('inst-1')).toBe(rt);
      expect(service.get('unknown')).toBeUndefined();
    });
  });

  describe('log line parsing (parseRuntimeLine)', () => {
    let rt: InstanceRuntime;
    let privateService: RuntimeServicePrivate;

    beforeEach(() => {
      rt = createMockRuntime('inst-1');
      service.runtimes.set('inst-1', rt);
      privateService = service as unknown as RuntimeServicePrivate;
    });

    it('should handle player join line and notify', () => {
      const line = '2026-01-01 12:00:00 [JOIN] Engineer joined the game';
      privateService.parseRuntimeLine(rt, line);

      expect(rt.onlinePlayers['Engineer']).toBeDefined();
      expect(mockNotifications.onPlayerJoin).toHaveBeenCalledWith(
        'inst-1',
        'Engineer',
      );
      expect(mockEventsGateway.emitPlayersUpdate).toHaveBeenCalledWith(
        'inst-1',
        rt.onlinePlayers,
      );
    });

    it('should handle player leave line and notify', () => {
      rt.onlinePlayers['Engineer'] = new Date().toISOString();
      rt.playerLastTick['Engineer'] = Date.now() - 5000;

      const line = '2026-01-01 12:05:00 [LEAVE] Engineer left the game';
      privateService.parseRuntimeLine(rt, line);

      expect(rt.onlinePlayers['Engineer']).toBeUndefined();
      expect(mockNotifications.onPlayerLeave).toHaveBeenCalledWith(
        'inst-1',
        'Engineer',
      );
      expect(mockEventsGateway.emitPlayersUpdate).toHaveBeenCalledWith(
        'inst-1',
        rt.onlinePlayers,
      );
    });

    it('should handle kick moderation event with reason', () => {
      const line =
        '2026-01-01 12:10:00 [KICK] BadActor was kicked by Moderator. Reason: Spamming chat';
      privateService.parseRuntimeLine(rt, line);

      expect(mockNotifications.onModeration).toHaveBeenCalledWith(
        'inst-1',
        'kick',
        'BadActor',
        'Moderator',
        'Spamming chat',
      );
    });

    it('should handle ban moderation event with reason', () => {
      const line =
        '2026-01-01 12:15:00 [BAN] GriefPlayer was banned by Admin. Reason: Destroyed main base';
      privateService.parseRuntimeLine(rt, line);

      expect(mockNotifications.onModeration).toHaveBeenCalledWith(
        'inst-1',
        'ban',
        'GriefPlayer',
        'Admin',
        'Destroyed main base',
      );
    });

    it('should handle unban event', () => {
      const line =
        '2026-01-01 12:20:00 [UNBAN] ReformedPlayer was unbanned by Admin';
      privateService.parseRuntimeLine(rt, line);

      expect(mockNotifications.onModeration).toHaveBeenCalledWith(
        'inst-1',
        'unban',
        'ReformedPlayer',
        'Admin',
      );
    });

    it('should detect in-game transition and notify server started', () => {
      expect(rt.inGame).toBe(false);
      const line =
        '2026-01-01 12:00:00 Info ServerMultiplayerManager.cpp:780: changing state from(CreatingGame) to(InGame)';
      privateService.parseRuntimeLine(rt, line);

      expect(rt.inGame).toBe(true);
      expect(rt.wasEverInGame).toBe(true);
      expect(mockNotifications.onServerStarted).toHaveBeenCalledWith('inst-1');
      expect(mockEventsGateway.emitStatusUpdate).toHaveBeenCalled();
    });

    it('should handle in-game chat messages', () => {
      const line = '2026-01-01 12:00:00 [CHAT] Engineer: Hello Factorio';
      privateService.parseRuntimeLine(rt, line);

      expect(mockNotifications.onChatMessage).toHaveBeenCalledWith(
        'inst-1',
        'Engineer',
        'Hello Factorio',
      );
      expect(mockEventsGateway.emitChatLine).toHaveBeenCalledWith(
        'inst-1',
        line,
      );
      expect(mockLogRotation.appendLine).toHaveBeenCalledWith(
        path.join(rt.serverPath, 'chat_log.txt'),
        line,
      );
    });
  });

  describe('flushOnlinePlayersStats', () => {
    it('should batch update online seconds and refresh playerLastTick', () => {
      const rt = createMockRuntime('inst-1');
      const oldTick = Date.now() - 30_000;
      rt.onlinePlayers['Engineer'] = new Date().toISOString();
      rt.playerLastTick['Engineer'] = oldTick;
      service.runtimes.set('inst-1', rt);

      const privateService = service as unknown as RuntimeServicePrivate;
      privateService.flushOnlinePlayersStats();

      expect(rt.playerLastTick['Engineer']).toBeGreaterThan(oldTick);
    });
  });

  describe('process lifecycle (start, close, stop, kill, shutdown)', () => {
    const mockedSpawn = spawn as jest.MockedFunction<typeof spawn>;

    function createFakeChildProcess(pid = 4242): FakeChildProcess {
      const ee = new EventEmitter() as FakeChildProcess;
      ee.stdout = new PassThrough();
      ee.stderr = new PassThrough();
      ee.stdin = new PassThrough();
      ee.pid = pid;
      ee.killed = false;
      ee.exitCode = null;
      ee.kill = jest.fn(() => {
        ee.killed = true;
        return true;
      });
      return ee;
    }

    function makeInstanceItem(
      overrides: Partial<InstanceItem> = {},
    ): InstanceItem {
      return {
        id: 'inst-1',
        name: 'Nauvis Main',
        serverPath: tempDir,
        ip: '0.0.0.0',
        port: '34197',
        rconPort: 27015,
        rconPassword: 'secret',
        launchSave: 'world.zip',
        autostartServer: false,
        autoEnterPanel: false,
        blockUpdates: false,
        experimentalUpdates: false,
        collectGameMetrics: true,
        isPublic: false,
        publicDescription: '',
        publicConnectionAddress: '',
        ...overrides,
      };
    }

    function setupValidServerFiles(): void {
      fs.writeFileSync(
        path.join(tempDir, 'server-settings.json'),
        JSON.stringify({ name: 'Nauvis Main' }),
        'utf-8',
      );
      const savesDir = path.join(tempDir, 'saves');
      fs.mkdirSync(savesDir, { recursive: true });
      fs.writeFileSync(path.join(savesDir, 'world.zip'), 'PK', 'utf-8');

      const binDir = path.join(tempDir, 'bin', 'x64');
      fs.mkdirSync(binDir, { recursive: true });
      fs.writeFileSync(path.join(binDir, 'factorio.exe'), 'MZ', 'utf-8');
    }

    beforeEach(() => {
      mockedSpawn.mockReset();
    });

    it('validates preconditions before spawning Factorio process', async () => {
      // Missing saves directory
      fs.writeFileSync(path.join(tempDir, 'server-settings.json'), '{}');
      expect(await service.start(makeInstanceItem())).toEqual({
        ok: false,
        error: 'no_saves',
      });

      // Specific save missing
      fs.mkdirSync(path.join(tempDir, 'saves'), { recursive: true });
      expect(
        await service.start(makeInstanceItem({ launchSave: 'missing.zip' })),
      ).toEqual({
        ok: false,
        error: 'save_not_found',
      });

      // Save exists, executable missing
      fs.writeFileSync(path.join(tempDir, 'saves', 'world.zip'), 'PK');
      expect(await service.start(makeInstanceItem())).toEqual({
        ok: false,
        error: 'no_factorio_exe',
      });

      // Executable exists, invalid network bind settings
      setupValidServerFiles();
      expect(
        await service.start(makeInstanceItem({ ip: '999.999.999.999' })),
      ).toEqual({
        ok: false,
        error: 'invalid_ip',
      });
      expect(await service.start(makeInstanceItem({ port: '70000' }))).toEqual({
        ok: false,
        error: 'invalid_port',
      });

      // Rejects starting an already running instance
      service.runtimes.set('inst-1', createMockRuntime('inst-1'));
      expect(await service.start(makeInstanceItem())).toEqual({
        ok: false,
        error: 'already_busy',
      });
    });

    it('records startup failure and notifies onServerStartFailed when process exits before InGame', async () => {
      setupValidServerFiles();
      const fakeProc = createFakeChildProcess();
      mockedSpawn.mockReturnValue(
        fakeProc as unknown as ChildProcessWithoutNullStreams,
      );

      const res = await service.start(makeInstanceItem());
      expect(res).toEqual({ ok: true });
      expect(service.isRunning('inst-1')).toBe(true);

      fakeProc.stdout.write(
        '0.500 Error ModManager.cpp:1625: Failed to load mod "krastorio2": missing dependency flib >= 0.14.0\n',
      );
      fakeProc.exitCode = 1;
      fakeProc.emit('close', 1);

      const rt = service.get('inst-1');
      expect(rt?.lastStartFailed).toBe(true);
      expect(rt?.proc).toBeNull();
      expect(mockInstanceHistory.recordStartupError).toHaveBeenCalledWith(
        tempDir,
        expect.objectContaining({ exit_code: 1 }),
      );
      expect(mockNotifications.onServerStartFailed).toHaveBeenCalledWith(
        'inst-1',
        1,
      );
      expect(mockNotifications.onServerCrash).not.toHaveBeenCalled();
      expect(mockRcon.close).toHaveBeenCalledWith('127.0.0.1', 27015);
    });

    it('flushes online players and notifies onServerCrash on unexpected exit after InGame', async () => {
      setupValidServerFiles();
      const fakeProc = createFakeChildProcess();
      mockedSpawn.mockReturnValue(
        fakeProc as unknown as ChildProcessWithoutNullStreams,
      );

      await service.start(makeInstanceItem());
      fakeProc.stdout.write(
        '1.000 Info ServerMultiplayerManager.cpp:780: changing state from(CreatingGame) to(InGame)\n',
      );
      fakeProc.stdout.write(
        '2026-01-01 12:00:00 [JOIN] Alice joined the game\n',
      );

      const rt = service.get('inst-1');
      expect(rt?.inGame).toBe(true);
      expect(rt?.onlinePlayers['Alice']).toBeDefined();

      // Unexpected crash (exitCode 1 without shutdown marker or kill request)
      fakeProc.exitCode = 1;
      fakeProc.emit('close', 1);

      expect(rt?.lastStartFailed).toBe(false);
      expect(rt?.inGame).toBe(false);
      expect(rt?.onlinePlayers).toEqual({});
      expect(mockNotifications.onServerCrash).toHaveBeenCalledWith('inst-1', 1);
      expect(mockNotifications.onServerStopped).not.toHaveBeenCalled();
    });

    it('handles graceful stop via RCON /quit and waitUntilStopped', async () => {
      expect(await service.stop('inst-1')).toEqual({
        ok: false,
        error: 'not_running',
      });

      setupValidServerFiles();
      const fakeProc = createFakeChildProcess();
      mockedSpawn.mockReturnValue(
        fakeProc as unknown as ChildProcessWithoutNullStreams,
      );
      (mockRcon.run as jest.Mock).mockResolvedValueOnce('');

      await service.start(makeInstanceItem());
      const stopRes = await service.stop('inst-1');
      expect(stopRes).toEqual({ ok: true });
      expect(mockRcon.run).toHaveBeenCalledWith(
        '127.0.0.1',
        27015,
        'secret',
        '/quit',
        25000,
      );

      const rt = service.get('inst-1');
      expect(rt?.stopping).toBe(true);

      // Process exits cleanly shortly after /quit
      fakeProc.exitCode = 0;
      fakeProc.emit('close', 0);

      expect(await service.waitUntilStopped('inst-1', 50)).toBe(true);
      expect(rt?.stopping).toBe(false);
      expect(mockNotifications.onServerStopped).toHaveBeenCalledWith('inst-1');
      expect(mockNotifications.onServerCrash).not.toHaveBeenCalled();
    });

    it('treats explicit kill() as intentional stop rather than crash', async () => {
      expect(await service.kill('inst-1')).toEqual({
        ok: false,
        error: 'not_running',
      });

      setupValidServerFiles();
      const fakeProc = createFakeChildProcess();
      mockedSpawn.mockReturnValue(
        fakeProc as unknown as ChildProcessWithoutNullStreams,
      );

      await service.start(makeInstanceItem());
      const killRes = await service.kill('inst-1');
      expect(killRes).toEqual({ ok: true });
      expect(fakeProc.kill).toHaveBeenCalledWith('SIGKILL');

      fakeProc.exitCode = 1;
      fakeProc.emit('close', 1);

      expect(mockNotifications.onServerStopped).toHaveBeenCalledWith('inst-1');
      expect(mockNotifications.onServerCrash).not.toHaveBeenCalled();
    });

    it('sends graceful RCON /quit on module destroy and falls back to SIGTERM if RCON fails', async () => {
      const rt1 = createMockRuntime('inst-1');
      const rt2 = createMockRuntime('inst-2');

      (mockRcon.run as jest.Mock)
        .mockImplementationOnce(() => {
          if (rt1.proc) {
            Object.defineProperty(rt1.proc, 'exitCode', { value: 0 });
          }
          return Promise.resolve('');
        })
        .mockImplementationOnce(() => {
          return Promise.reject(new Error('rcon_refused'));
        });

      const killSpy = jest.fn(() => {
        if (rt2.proc) {
          Object.defineProperty(rt2.proc, 'exitCode', { value: 0 });
        }
        return true;
      });
      if (rt2.proc) {
        rt2.proc.kill = killSpy;
      }

      service.runtimes.set('inst-1', rt1);
      service.runtimes.set('inst-2', rt2);

      await service.onModuleDestroy();

      expect(mockRcon.run).toHaveBeenCalledTimes(2);
      expect(killSpy).toHaveBeenCalledWith('SIGTERM');
    });
  });
});
