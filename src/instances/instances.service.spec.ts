import { InstancesService } from './instances.service';
import { GameInstance } from './game-instance.entity';
import { SystemPreference } from '../config/system-preference.entity';
import { MaintenanceSchedule } from '../maintenance/maintenance-schedule.entity';
import { PathsService } from '../config/paths.service';
import { FccConfigService } from '../config/fcc-config.service';
import { AuditLogService } from '../maintenance/audit-log.service';
import { Repository } from 'typeorm';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('InstancesService', () => {
  let service: InstancesService;
  let tempDir: string;
  let server1Dir: string;
  let server2Dir: string;

  let mockRepo: Partial<Repository<GameInstance>>;
  let mockPrefs: Partial<Repository<SystemPreference>>;
  let mockMaintenanceRepo: Partial<Repository<MaintenanceSchedule>>;
  let mockPaths: Partial<PathsService>;
  let mockConfig: Partial<FccConfigService>;
  let mockAuditLog: Partial<AuditLogService>;

  const createMockInstance = (
    id: string,
    name: string,
    serverPath: string,
    port = '34197',
  ): GameInstance => {
    const inst = new GameInstance();
    inst.id = id;
    inst.name = name;
    inst.serverPath = serverPath;
    inst.ip = '0.0.0.0';
    inst.port = port;
    inst.rconPort = 27015;
    inst.rconPassword = 'pass';
    inst.autostartServer = false;
    inst.autoEnterPanel = false;
    inst.launchSave = 'latest';
    inst.maintenanceLock = false;
    inst.blockUpdates = false;
    inst.experimentalUpdates = false;
    inst.collectGameMetrics = false;
    return inst;
  };

  const setupServerExecutable = (dir: string) => {
    fs.mkdirSync(dir, { recursive: true });
    const binDir = path.join(dir, 'bin', 'x64');
    fs.mkdirSync(binDir, { recursive: true });
    const exeName = process.platform === 'win32' ? 'factorio.exe' : 'factorio';
    fs.writeFileSync(path.join(binDir, exeName), '');
  };

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-instances-test-'));
    server1Dir = path.join(tempDir, 'server1');
    server2Dir = path.join(tempDir, 'server2');

    setupServerExecutable(server1Dir);
    setupServerExecutable(server2Dir);

    const initialInst = createMockInstance('inst-1', 'Server 1', server1Dir);
    const dbItems: GameInstance[] = [initialInst];
    const dbPrefs: Map<string, SystemPreference> = new Map([
      [
        'instances.selected_id',
        {
          key: 'instances.selected_id',
          value: 'inst-1',
          updatedAt: new Date(),
        },
      ],
    ]);

    mockRepo = {
      find: jest.fn().mockImplementation(() => Promise.resolve([...dbItems])),
      save: jest
        .fn()
        .mockImplementation((entity: GameInstance | GameInstance[]) => {
          if (Array.isArray(entity)) {
            dbItems.length = 0;
            for (const item of entity) dbItems.push(item);
            return Promise.resolve(entity);
          }
          const existingIdx = dbItems.findIndex((x) => x.id === entity.id);
          if (existingIdx >= 0) dbItems[existingIdx] = entity;
          else dbItems.push(entity);
          return Promise.resolve(entity);
        }),
      delete: jest.fn().mockImplementation((id: string) => {
        const idx = dbItems.findIndex((x) => x.id === id);
        if (idx >= 0) dbItems.splice(idx, 1);
        return Promise.resolve({ raw: [], affected: 1 });
      }),
      create: jest
        .fn()
        .mockImplementation(
          (dto: Partial<GameInstance>): GameInstance =>
            Object.assign(new GameInstance(), dto),
        ),
    };

    mockPrefs = {
      findOneBy: jest
        .fn()
        .mockImplementation(
          ({ key }: { key: string }): Promise<SystemPreference | null> =>
            Promise.resolve(dbPrefs.get(key) || null),
        ),
      save: jest.fn().mockImplementation((entity: SystemPreference) => {
        dbPrefs.set(entity.key, entity);
        return Promise.resolve(entity);
      }),
      create: jest
        .fn()
        .mockImplementation(
          (dto: Partial<SystemPreference>): SystemPreference =>
            Object.assign(new SystemPreference(), dto),
        ),
    };

    mockMaintenanceRepo = {
      find: jest.fn().mockResolvedValue([]),
      save: jest.fn().mockResolvedValue([]),
    };

    mockPaths = {
      announcementsPath: jest
        .fn()
        .mockReturnValue(path.join(tempDir, 'announcements.json')),
      instanceLogPath: jest
        .fn()
        .mockReturnValue(path.join(tempDir, 'logs', 'instance.log')),
      maintenancePendingPath: path.join(tempDir, 'pending.json'),
    };

    mockConfig = {
      webPanel: {
        require_unique_instance_game_ports: true,
        server_settings_default_public_off: true,
        server_settings_apply_global_credentials: false,
        global_username: '',
        global_token: '',
      },
    } as unknown as FccConfigService;

    mockAuditLog = {
      purgeInstance: jest.fn(),
    };

    service = new InstancesService(
      mockRepo as Repository<GameInstance>,
      mockPrefs as Repository<SystemPreference>,
      mockMaintenanceRepo as Repository<MaintenanceSchedule>,
      mockPaths as PathsService,
      mockConfig as FccConfigService,
      mockAuditLog as AuditLogService,
    );

    await service.onModuleInit();
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('initialization and retrieval', () => {
    it('loads cache and selectedId onModuleInit', () => {
      expect(service.getSelectedId()).toBe('inst-1');
      const item = service.getSelected();
      expect(item).toBeDefined();
      expect(item?.name).toBe('Server 1');
    });

    it('list returns items and selectedId', () => {
      const res = service.list();
      expect(res.ok).toBe(true);
      expect(res.items).toHaveLength(1);
      expect(res.selectedId).toBe('inst-1');
    });

    it('select switches active instance', async () => {
      const notFound = await service.select('unknown');
      expect(notFound).toEqual({ ok: false, error: 'not_found' });

      const ok = await service.select('inst-1');
      expect(ok).toEqual({ ok: true });
      expect(service.getSelectedId()).toBe('inst-1');
    });

    it('withInstance scopes active instance id inside callback', async () => {
      let activeInside = '';
      await service.withInstance('inst-1', () => {
        activeInside = service.getSelectedId();
      });
      expect(activeInside).toBe('inst-1');

      await expect(
        service.withInstance('nonexistent-id', () => {
          // should fail
        }),
      ).rejects.toThrow('instance_select_failed');
    });
  });

  describe('add instance', () => {
    it('rejects missing or invalid serverPath', async () => {
      const res = await service.add({
        name: 'New Server',
        serverPath: path.join(tempDir, 'does-not-exist'),
      });
      expect(res).toEqual({ ok: false, error: 'invalid_server_path' });
    });

    it('rejects path without factorio executable', async () => {
      const noExeDir = path.join(tempDir, 'empty-server');
      fs.mkdirSync(noExeDir, { recursive: true });

      const res = await service.add({
        name: 'No Exe Server',
        serverPath: noExeDir,
      });
      expect(res).toEqual({ ok: false, error: 'instance_executable_missing' });
    });

    it('rejects duplicate serverPath', async () => {
      const res = await service.add({
        name: 'Duplicate Server',
        serverPath: server1Dir,
      });
      expect(res.ok).toBe(false);
      expect(res.error).toBe('instance_path_exists');
    });

    it('rejects port conflict if unique ports required and autoFix is false', async () => {
      const res = await service.add({
        name: 'Port Conflict Server',
        serverPath: server2Dir,
        port: '34197', // same port as Server 1
        autoFixPortsOnConflict: false,
      });
      expect(res).toEqual({ ok: false, error: 'port_in_use' });
    });

    it('auto-picks free port when autoFixPortsOnConflict is true', async () => {
      const res = await service.add({
        name: 'Auto Fix Server',
        serverPath: server2Dir,
        port: '34197',
        autoFixPortsOnConflict: true,
      });
      expect(res.ok).toBe(true);
      expect(res.item).toBeDefined();
      expect(res.item?.port).toBe('34198');
    });
  });

  describe('update instance', () => {
    it('returns not_found when updating nonexistent instance', async () => {
      const res = await service.update('unknown', { name: 'New' });
      expect(res).toEqual({ ok: false, error: 'not_found' });
    });

    it('updates instance fields and records changes while masking passwords', async () => {
      const res = await service.update('inst-1', {
        name: 'Renamed Server',
        rconPassword: 'new-secret-password',
      });

      expect(res.ok).toBe(true);
      expect(res.changes).toContain('name=Renamed Server');
      expect(res.changes).toContain('rconPassword=(changed)');

      const updated = service.getById('inst-1');
      expect(updated?.name).toBe('Renamed Server');
      expect(updated?.rconPassword).toBe('new-secret-password');
    });
  });

  describe('remove instance', () => {
    it('returns not_found when removing nonexistent instance', async () => {
      const res = await service.remove('nonexistent');
      expect(res).toEqual({ ok: false, error: 'not_found' });
    });

    it('removes instance and falls back selectedId to remaining instance', async () => {
      // First add second instance
      await service.add({
        name: 'Server 2',
        serverPath: server2Dir,
        port: '34198',
      });
      expect(service.list().items).toHaveLength(2);

      const res = await service.remove('inst-1');
      expect(res.ok).toBe(true);
      expect(service.list().items).toHaveLength(1);
      expect(service.getSelectedId()).not.toBe('inst-1');
    });

    it('removes files from disk when deleteFromDisk is requested', async () => {
      const toDeleteDir = path.join(tempDir, 'delete-target');
      setupServerExecutable(toDeleteDir);

      const addRes = await service.add({
        name: 'Delete Target',
        serverPath: toDeleteDir,
        port: '34199',
      });
      const id = addRes.item!.id;
      expect(fs.existsSync(toDeleteDir)).toBe(true);

      const removeRes = await service.remove(id, { deleteFromDisk: true });
      expect(removeRes.ok).toBe(true);
      expect(fs.existsSync(toDeleteDir)).toBe(false);
    });
  });

  describe('clone instance', () => {
    it('returns not_found when cloning unknown instance', async () => {
      const res = await service.clone('unknown');
      expect(res).toEqual({ ok: false, error: 'not_found' });
    });

    it('clones instance files and registers new cloned instance', async () => {
      const res = await service.clone('inst-1', 'Server 1 Clone');
      expect(res.ok).toBe(true);
      expect(res.item).toBeDefined();
      expect(res.item?.name).toBe('Server 1 Clone');
      expect(res.item?.port).toBe('34198'); // Next free port
      expect(fs.existsSync(res.item!.serverPath)).toBe(true);
    });
  });
});
