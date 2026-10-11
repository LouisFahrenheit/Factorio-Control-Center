import { ServerOpsService } from './server-ops.service';
import { InstancesService } from '../../instances/instances.service';
import { RuntimeService } from '../runtime.service';
import { PathsService } from '../../config/paths.service';
import { MapGenOpsService } from '../map-gen/map-gen-ops.service';
import { LogRotationService } from '../../logging/log-rotation.service';
import { ModsJobService } from '../mods/mods-job.service';
import { InstanceItem } from '../../common/types';
import * as factorioExec from '../factorio-exec';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../factorio-exec', () => ({
  execFactorio: jest.fn().mockResolvedValue(undefined),
}));

describe('ServerOpsService', () => {
  let service: ServerOpsService;
  let tempDir: string;
  let serverDir: string;
  let savesDir: string;

  let mockInstances: Partial<InstancesService>;
  let mockRuntime: Partial<RuntimeService>;
  let mockPaths: Partial<PathsService>;
  let mockMapGen: Partial<MapGenOpsService>;
  let mockLogRotation: Partial<LogRotationService>;
  let mockModJobs: Partial<ModsJobService>;

  const inst: InstanceItem = {
    id: 'test-inst',
    name: 'Test Server',
    serverPath: '',
    ip: '0.0.0.0',
    port: '34197',
    rconPort: 27015,
    rconPassword: 'pass',
    autostartServer: false,
    autoEnterPanel: false,
    launchSave: 'latest',
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-server-test-'));
    serverDir = path.join(tempDir, 'server');
    savesDir = path.join(serverDir, 'saves');

    fs.mkdirSync(savesDir, { recursive: true });
    inst.serverPath = serverDir;

    // Create mock factorio executable inside bin/x64/
    const binDir = path.join(serverDir, 'bin', 'x64');
    fs.mkdirSync(binDir, { recursive: true });
    const exeName = process.platform === 'win32' ? 'factorio.exe' : 'factorio';
    fs.writeFileSync(path.join(binDir, exeName), '');

    mockInstances = {
      getSelected: jest.fn().mockReturnValue(inst),
      getSelectedId: jest.fn().mockReturnValue(inst.id),
      getById: jest.fn((id: string) => (id === inst.id ? inst : undefined)),
      update: jest.fn().mockResolvedValue(inst),
    };

    mockRuntime = {
      get: jest.fn().mockReturnValue(undefined),
      isRunning: jest.fn().mockReturnValue(false),
      start: jest.fn().mockResolvedValue({ ok: true }),
      stop: jest.fn().mockResolvedValue({ ok: true }),
      kill: jest.fn().mockReturnValue({ ok: true }),
      waitUntilStopped: jest.fn().mockResolvedValue(true),
      rconExec: jest.fn().mockResolvedValue({ ok: true, output: 'success' }),
      logTail: jest.fn().mockReturnValue(['line 1', 'line 2']),
    };

    mockPaths = {
      maintenancePendingPath: path.join(tempDir, 'pending.json'),
      instanceLogPath: jest
        .fn()
        .mockReturnValue(path.join(tempDir, 'instance.log')),
    };

    mockMapGen = {
      resolveCreatePayload: jest.fn().mockReturnValue({
        preset: 'default',
        mapGen: null,
        mapSettings: null,
        seed: null,
      }),
      prepareCreateFiles: jest.fn().mockReturnValue({
        presetOnly: 'default',
      }),
      cleanupWorkDir: jest.fn(),
    };

    mockLogRotation = {
      logWriteInstanceEnabled: jest.fn().mockReturnValue(true),
    };

    mockModJobs = {
      isRunningForInstance: jest.fn().mockReturnValue(false),
    };

    service = new ServerOpsService(
      mockInstances as InstancesService,
      mockRuntime as RuntimeService,
      mockPaths as PathsService,
      mockMapGen as MapGenOpsService,
      mockLogRotation as LogRotationService,
      mockModJobs as ModsJobService,
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('status', () => {
    it('returns error if no instance is selected', () => {
      (mockInstances.getSelected as jest.Mock).mockReturnValue(undefined);
      const res = service.status();
      expect(res).toEqual({ ok: false, error: 'instance_not_found' });
    });

    it('returns stopped status when runtime process is not active', () => {
      const res = service.status();
      expect(res.ok).toBe(true);
      expect(res.process_state).toBe('not_running');
      expect(res.server_running).toBe(false);
      expect(res.status_kind).toBe('stopped');
      expect(res.uptime_seconds).toBeNull();
    });

    it('returns running status with uptime and players when server is inGame', () => {
      const startedAt = Math.floor(Date.now() / 1000) - 120;
      (mockRuntime.get as jest.Mock).mockReturnValue({
        proc: { exitCode: null },
        inGame: true,
        stopping: false,
        lastStartFailed: false,
        lastExitCode: 0,
        missingStartupDependencies: [],
        sessionRawLines: [],
        bind: '0.0.0.0:34197',
        startedAt,
        onlinePlayers: { Alice: 100 },
        serverPath: serverDir,
        gameVersion: '2.0.15',
      });

      const res = service.status();
      expect(res.ok).toBe(true);
      expect(res.server_running).toBe(true);
      expect(res.status_kind).toBe('running');
      expect(typeof res.uptime_seconds).toBe('number');
      expect(res.uptime_seconds).toBeGreaterThanOrEqual(120);
      expect(res.online_players).toEqual([{ name: 'Alice', since: 100 }]);
    });

    it('marks maintenance status when instance has maintenanceLock', () => {
      inst.maintenanceLock = true;
      const res = service.status();
      expect(res.ok).toBe(true);
      expect(res.status_kind).toBe('maintenance');
      inst.maintenanceLock = false;
    });
  });

  describe('start', () => {
    it('returns error if no instance is selected', async () => {
      (mockInstances.getSelected as jest.Mock).mockReturnValue(undefined);
      const res = await service.start();
      expect(res).toEqual({ ok: false, error: 'instance_not_found' });
    });

    it('blocks start when mod job is active', async () => {
      (mockModJobs.isRunningForInstance as jest.Mock).mockReturnValue(true);
      const res = await service.start();
      expect(res).toEqual({ ok: false, error: 'mod_job_running' });
    });

    it('removes maintenanceLock and starts instance', async () => {
      inst.maintenanceLock = true;
      const res = await service.start();
      expect(res).toEqual({ ok: true });
      expect(mockInstances.update).toHaveBeenCalledWith(inst.id, {
        maintenanceLock: false,
      });
      expect(mockRuntime.start).toHaveBeenCalledWith(inst);
      inst.maintenanceLock = false;
    });
  });

  describe('stop and kill', () => {
    it('stop returns error if no instance is selected', async () => {
      (mockInstances.getSelectedId as jest.Mock).mockReturnValue(undefined);
      const res = await service.stop();
      expect(res).toEqual({ ok: false, error: 'instance_not_found' });
    });

    it('stop delegates to runtime.stop', async () => {
      const res = await service.stop();
      expect(res).toEqual({ ok: true });
      expect(mockRuntime.stop).toHaveBeenCalledWith(inst.id);
    });

    it('kill returns error if no instance is selected', () => {
      (mockInstances.getSelectedId as jest.Mock).mockReturnValue(undefined);
      const res = service.kill();
      expect(res).toEqual({ ok: false, error: 'instance_not_found' });
    });

    it('kill delegates to runtime.kill', () => {
      const res = service.kill();
      expect(res).toEqual({ ok: true });
      expect(mockRuntime.kill).toHaveBeenCalledWith(inst.id);
    });
  });

  describe('restart', () => {
    it('stops instance, waits until stopped, and starts instance', async () => {
      (mockRuntime.isRunning as jest.Mock).mockReturnValue(true);
      const res = await service.restart();
      expect(res).toEqual({ ok: true });
      expect(mockRuntime.stop).toHaveBeenCalledWith(inst.id);
      expect(mockRuntime.waitUntilStopped).toHaveBeenCalled();
      expect(mockRuntime.start).toHaveBeenCalledWith(inst);
    });

    it('kills process if stop times out during restart', async () => {
      (mockRuntime.isRunning as jest.Mock).mockReturnValue(true);
      (mockRuntime.waitUntilStopped as jest.Mock)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true);

      const res = await service.restart();
      expect(res).toEqual({ ok: true });
      expect(mockRuntime.kill).toHaveBeenCalledWith(inst.id);
      expect(mockRuntime.start).toHaveBeenCalledWith(inst);
    });

    it('returns error if process fails to stop after kill', async () => {
      (mockRuntime.isRunning as jest.Mock).mockReturnValue(true);
      (mockRuntime.waitUntilStopped as jest.Mock)
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(false);

      const res = await service.restart();
      expect(res).toEqual({ ok: false, error: 'restart_stop_timeout' });
      expect(mockRuntime.start).not.toHaveBeenCalled();
    });
  });

  describe('RCON commands & chat', () => {
    it('saveGame invokes /save via rcon', async () => {
      const res = await service.saveGame();
      expect(res).toEqual({ ok: true });
      expect(mockRuntime.rconExec).toHaveBeenCalledWith(inst.id, '/save');
    });

    it('backup invokes /save backup_* via rcon', async () => {
      const res = await service.backup();
      expect(res).toEqual({ ok: true });
      expect(mockRuntime.rconExec).toHaveBeenCalledWith(
        inst.id,
        expect.stringMatching(/^\/save backup_/),
      );
    });

    it('rconExec sends arbitrary command', async () => {
      const res = await service.rconExec('/time');
      expect(res).toEqual({ ok: true, output: 'success' });
      expect(mockRuntime.rconExec).toHaveBeenCalledWith(inst.id, '/time');
    });

    it('chatSendText rejects empty message', async () => {
      const res = await service.chatSendText('   ');
      expect(res).toEqual({ ok: false, error: 'empty_message' });
    });

    it('chatSendText rejects commands starting with slash or backslash', async () => {
      const res1 = await service.chatSendText('/kick badguy');
      expect(res1).toEqual({ ok: false, error: 'commands_not_allowed' });

      const res2 = await service.chatSendText('\\kick badguy');
      expect(res2).toEqual({ ok: false, error: 'commands_not_allowed' });
    });

    it('chatSendText sends chat text through RCON', async () => {
      const res = await service.chatSendText('Hello everyone!');
      expect(res).toEqual({ ok: true });
      expect(mockRuntime.rconExec).toHaveBeenCalledWith(
        inst.id,
        'Hello everyone!',
        false,
      );
    });
  });

  describe('createSave', () => {
    it('rejects invalid save names', async () => {
      const res = await service.createSave('..');
      expect(res).toEqual({ ok: false, error: 'invalid_name' });
    });

    it('rejects save creation if file already exists', async () => {
      fs.writeFileSync(path.join(savesDir, 'existing.zip'), 'dummy');
      const res = await service.createSave('existing.zip');
      expect(res).toEqual({ ok: false, error: 'exists' });
    });

    it('invokes factorio binary with --create argument', async () => {
      const res = await service.createSave('new_world');
      expect(res).toEqual({ ok: true, name: 'new_world.zip' });
      expect(factorioExec.execFactorio).toHaveBeenCalledWith(
        expect.stringMatching(/factorio(\.exe)?$/),
        expect.arrayContaining(['--create']),
        serverDir,
        300_000,
      );
    });
  });

  describe('log operations', () => {
    it('logTail returns lines from runtime log ring', () => {
      const res = service.logTail(100);
      expect(res).toEqual({ ok: true, lines: ['line 1', 'line 2'] });
      expect(mockRuntime.logTail).toHaveBeenCalledWith(inst.id, 100);
    });

    it('logTail returns empty lines when log rotation is disabled', () => {
      (mockLogRotation.logWriteInstanceEnabled as jest.Mock).mockReturnValue(
        false,
      );
      const res = service.logTail(100);
      expect(res).toEqual({ ok: true, lines: [], instance_log_disabled: true });
    });

    it('logFileHistory returns unknown_instance for non-existent instance ID', () => {
      const res = service.logFileHistory(100, 'nonexistent-id');
      expect(res).toEqual({ ok: false, error: 'unknown_instance' });
    });
  });
});
