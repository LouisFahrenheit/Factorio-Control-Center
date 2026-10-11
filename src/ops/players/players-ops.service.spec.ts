import { PlayersOpsService } from './players-ops.service';
import { InstancesService } from '../../instances/instances.service';
import { RuntimeService } from '../runtime.service';
import { FilesOpsService } from '../files/files-ops.service';
import { InstancePropagateService } from '../instance-propagate.service';
import { InstanceHistoryService } from '../instance-history.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { PathsService } from '../../config/paths.service';
import { InstanceItem } from '../../common/types';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('PlayersOpsService', () => {
  let service: PlayersOpsService;
  let tempDir: string;
  let serverDir: string;

  let mockInstances: Partial<InstancesService>;
  let mockRuntime: Partial<RuntimeService>;
  let mockFiles: Partial<FilesOpsService>;
  let mockPropagate: Partial<InstancePropagateService>;
  let mockInstanceHistory: Partial<InstanceHistoryService>;
  let mockNotifications: Partial<NotificationsService>;
  let mockPaths: Partial<PathsService>;

  const inst: InstanceItem = {
    id: 'inst-1',
    name: 'Server 1',
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
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-players-test-'));
    serverDir = path.join(tempDir, 'server');
    fs.mkdirSync(serverDir, { recursive: true });
    inst.serverPath = serverDir;

    mockInstances = {
      getSelected: jest.fn().mockReturnValue(inst),
      getSelectedId: jest.fn().mockReturnValue('inst-1'),
    };

    mockRuntime = {
      get: jest.fn().mockReturnValue({
        onlinePlayers: { Alice: 120 },
        playerLastTick: { Alice: 1000 },
      }),
      isRunning: jest.fn().mockReturnValue(false),
      rconExec: jest.fn().mockResolvedValue({ ok: true }),
    };

    mockFiles = {};

    mockPropagate = {
      propagateBanList: jest.fn(),
      propagateWhitelist: jest.fn(),
    };

    mockInstanceHistory = {
      tailServer: jest.fn().mockReturnValue([]),
      tailMods: jest.fn().mockReturnValue([]),
      tailCommands: jest.fn().mockReturnValue([]),
    };

    mockNotifications = {
      onModeration: jest.fn(),
    };

    mockPaths = {};

    service = new PlayersOpsService(
      mockInstances as InstancesService,
      mockRuntime as RuntimeService,
      mockFiles as FilesOpsService,
      mockPropagate as InstancePropagateService,
      mockInstanceHistory as InstanceHistoryService,
      mockNotifications as NotificationsService,
      mockPaths as PathsService,
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('summary', () => {
    it('returns instance_not_found if no instance is selected', () => {
      (mockInstances.getSelected as jest.Mock).mockReturnValue(undefined);
      const res = service.summary();
      expect(res).toEqual({ ok: false, error: 'instance_not_found' });
    });

    it('returns summary with online players, bans, whitelist, and stats', () => {
      fs.writeFileSync(
        path.join(serverDir, 'server-banlist.json'),
        JSON.stringify([
          { username: 'BadPlayer', reason: 'griefing', address: '' },
        ]),
      );
      fs.writeFileSync(
        path.join(serverDir, 'server-whitelist.json'),
        JSON.stringify(['Alice']),
      );

      const res = service.summary();
      expect(res.ok).toBe(true);
      expect(res.online).toEqual([{ name: 'Alice', since: 120 }]);
      expect(res.whitelist_players).toEqual(['Alice']);
      expect(res.whitelist_enabled).toBe(true);
      const bans = res.active_bans as { username: string; reason: string }[];
      expect(bans).toHaveLength(1);
      expect(bans[0].username).toBe('BadPlayer');
    });
  });

  describe('ban & unban', () => {
    it('rejects empty or whitespace player names', async () => {
      const res = await service.ban('   ');
      expect(res).toEqual({ ok: false, error: 'empty_player' });
    });

    it('bans offline player directly to server-banlist.json and records history', async () => {
      (mockRuntime.isRunning as jest.Mock).mockReturnValue(false);

      const res = await service.ban('BadGuy', 'bad behavior', 'Admin1');
      expect(res).toEqual({ ok: true, offline: true });

      const banlist = JSON.parse(
        fs.readFileSync(path.join(serverDir, 'server-banlist.json'), 'utf8'),
      ) as { username: string; reason: string }[];
      expect(banlist.some((b) => b.username === 'BadGuy')).toBe(true);

      expect(mockPropagate.propagateBanList).toHaveBeenCalledWith(serverDir);
      expect(mockNotifications.onModeration).toHaveBeenCalledWith(
        'inst-1',
        'ban',
        'BadGuy',
        'Admin1',
        'bad behavior',
      );
    });

    it('bans online player via RCON and repairs banlist', async () => {
      (mockRuntime.isRunning as jest.Mock).mockReturnValue(true);

      const res = await service.ban('OnlineTroll', 'spamming', 'Mod1');
      expect(res).toEqual({ ok: true });
      expect(mockRuntime.rconExec).toHaveBeenCalledWith(
        'inst-1',
        '/ban OnlineTroll spamming',
      );
    });

    it('unbans offline player directly from banlist file', async () => {
      (mockRuntime.isRunning as jest.Mock).mockReturnValue(false);
      fs.writeFileSync(
        path.join(serverDir, 'server-banlist.json'),
        JSON.stringify([{ username: 'Pardoned', reason: '', address: '' }]),
      );

      const res = await service.unban('Pardoned', 'Admin1');
      expect(res).toEqual({ ok: true, offline: true });

      const banlist = JSON.parse(
        fs.readFileSync(path.join(serverDir, 'server-banlist.json'), 'utf8'),
      ) as { username: string }[];
      expect(banlist.some((b) => b.username === 'Pardoned')).toBe(false);
    });

    it('unbans online player via RCON', async () => {
      (mockRuntime.isRunning as jest.Mock).mockReturnValue(true);

      const res = await service.unban('Player1', 'Mod1');
      expect(res).toEqual({ ok: true });
      expect(mockRuntime.rconExec).toHaveBeenCalledWith(
        'inst-1',
        '/unban Player1',
      );
    });
  });

  describe('kick, mute, unmute, purge', () => {
    it('returns not_running error when executing action on offline server', async () => {
      (mockRuntime.isRunning as jest.Mock).mockReturnValue(false);
      const res = await service.kick('Troublemaker', 'too loud');
      expect(res).toEqual({ ok: false, error: 'not_running' });
    });

    it('executes kick via RCON when server is running', async () => {
      (mockRuntime.isRunning as jest.Mock).mockReturnValue(true);
      const res = await service.kick('LoudGuy', 'please quiet', 'Admin');
      expect(res).toEqual({ ok: true });
      expect(mockRuntime.rconExec).toHaveBeenCalledWith(
        'inst-1',
        '/kick LoudGuy please quiet',
      );
      expect(mockNotifications.onModeration).toHaveBeenCalledWith(
        'inst-1',
        'kick',
        'LoudGuy',
        'Admin',
        'please quiet',
      );
    });

    it('executes mute and unmute via RCON', async () => {
      (mockRuntime.isRunning as jest.Mock).mockReturnValue(true);

      const muteRes = await service.mute('Spammer');
      expect(muteRes).toEqual({ ok: true });
      expect(mockRuntime.rconExec).toHaveBeenCalledWith(
        'inst-1',
        '/mute Spammer',
      );

      const unmuteRes = await service.unmute('Spammer');
      expect(unmuteRes).toEqual({ ok: true });
      expect(mockRuntime.rconExec).toHaveBeenCalledWith(
        'inst-1',
        '/unmute Spammer',
      );
    });

    it('executes purge via RCON', async () => {
      (mockRuntime.isRunning as jest.Mock).mockReturnValue(true);
      const res = await service.purge('Griefer');
      expect(res).toEqual({ ok: true });
      expect(mockRuntime.rconExec).toHaveBeenCalledWith(
        'inst-1',
        '/purge Griefer',
      );
    });
  });

  describe('whitelist operations', () => {
    it('whitelistAdd adds player to server-whitelist.json', async () => {
      const res = await service.whitelistAdd('NewFriend', 'Admin');
      expect(res).toEqual({ ok: true });

      const list = JSON.parse(
        fs.readFileSync(path.join(serverDir, 'server-whitelist.json'), 'utf8'),
      ) as string[];
      expect(list).toContain('NewFriend');
      expect(mockPropagate.propagateWhitelist).toHaveBeenCalledWith(serverDir);
    });

    it('whitelistRemove removes player from whitelist', async () => {
      fs.writeFileSync(
        path.join(serverDir, 'server-whitelist.json'),
        JSON.stringify(['PlayerA', 'PlayerB']),
      );

      const res = await service.whitelistRemove('PlayerA', 'Admin');
      expect(res).toEqual({ ok: true });

      const list = JSON.parse(
        fs.readFileSync(path.join(serverDir, 'server-whitelist.json'), 'utf8'),
      ) as string[];
      expect(list).not.toContain('PlayerA');
      expect(list).toContain('PlayerB');
    });

    it('whitelistClear empties whitelist and notifies', async () => {
      fs.writeFileSync(
        path.join(serverDir, 'server-whitelist.json'),
        JSON.stringify(['PlayerA', 'PlayerB']),
      );

      const res = await service.whitelistClear('Admin');
      expect(res).toEqual({ ok: true });

      const list = JSON.parse(
        fs.readFileSync(path.join(serverDir, 'server-whitelist.json'), 'utf8'),
      ) as string[];
      expect(list).toEqual([]);
      expect(mockNotifications.onModeration).toHaveBeenCalledWith(
        'inst-1',
        'whitelist_clear',
        '*',
        'Admin',
      );
    });
  });
});
