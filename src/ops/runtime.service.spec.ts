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
import type { ChildProcessWithoutNullStreams } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

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
    };
    mockPaths = {
      backupsDir: path.join(tempDir, 'backups'),
      instanceLogsDir: path.join(tempDir, 'logs'),
    };
    mockInstances = {
      getById: jest.fn(),
    };
    mockLogRotation = {
      appendLine: jest.fn(),
    };
    mockConfig = {
      webPanel: {} as unknown as FccConfigService['webPanel'],
    };
    mockFirewall = {
      logStartupNotice: jest.fn(),
      tryApplyOnGameStart: jest.fn(),
    };
    mockInstanceHistory = {
      recordInGameCommand: jest.fn(),
    };
    mockEventsGateway = {
      emitStatusUpdate: jest.fn(),
      emitPlayersUpdate: jest.fn(),
      emitChatLine: jest.fn(),
    };
    mockNotifications = {
      onServerStarted: jest.fn(),
      onServerStopped: jest.fn(),
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
      if (rt.proc) rt.proc.exitCode = 0;
      expect(service.isRunning('inst-1')).toBe(false);

      if (rt.proc) rt.proc.exitCode = null;
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
});
