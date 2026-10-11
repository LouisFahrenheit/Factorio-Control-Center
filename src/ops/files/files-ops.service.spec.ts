import { FilesOpsService } from './files-ops.service';
import { InstancesService } from '../../instances/instances.service';
import { RuntimeService } from '../runtime.service';
import { InstancePropagateService } from '../instance-propagate.service';
import { ModSettingsSchemaService } from './mod-settings-schema.service';
import { FccConfigService } from '../../config/fcc-config.service';
import { ModPortalService } from '../mod-portal/mod-portal.service';
import { InstanceItem } from '../../common/types';
import { modSettingsFromJson } from '../factorio-data-codec';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('FilesOpsService', () => {
  let service: FilesOpsService;
  let tempDir: string;
  let serverDir: string;
  let modsDir: string;

  let mockInstances: Partial<InstancesService>;
  let mockRuntime: Partial<RuntimeService>;
  let mockPropagate: Partial<InstancePropagateService>;
  let mockSchema: Partial<ModSettingsSchemaService>;
  let mockConfig: Partial<FccConfigService>;
  let mockPortal: Partial<ModPortalService>;

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

  const createValidModSettingsBuffer = () => {
    const ms = modSettingsFromJson({
      '!type': 'ModSettings',
      version: [2, 0, 0, 0],
      has_quality: false,
      data: {
        startup: {
          'test-setting': { value: true },
        },
      },
    });
    return ms.save();
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-files-test-'));
    serverDir = path.join(tempDir, 'server');
    modsDir = path.join(serverDir, 'mods');

    fs.mkdirSync(modsDir, { recursive: true });
    inst.serverPath = serverDir;

    mockInstances = {
      getSelected: jest.fn().mockReturnValue(inst),
    };

    mockRuntime = {
      isRunning: jest.fn().mockReturnValue(false),
      rconExec: jest.fn().mockResolvedValue({ ok: true }),
    };

    mockPropagate = {
      propagateAdminList: jest.fn().mockResolvedValue(undefined),
    };

    mockSchema = {
      invalidateInstance: jest.fn(),
    };

    mockConfig = {
      webPanel: {
        server_settings_default_public_off: true,
        server_settings_apply_global_credentials: false,
        global_username: '',
        global_token: '',
      },
    } as unknown as FccConfigService;

    mockPortal = {
      clearVerifyCache: jest.fn(),
    };

    service = new FilesOpsService(
      mockInstances as InstancesService,
      mockRuntime as RuntimeService,
      mockPropagate as InstancePropagateService,
      mockSchema as ModSettingsSchemaService,
      mockConfig as FccConfigService,
      mockPortal as ModPortalService,
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('server-settings operations', () => {
    it('readServerSettings returns instance_not_found if no instance selected', () => {
      (mockInstances.getSelected as jest.Mock).mockReturnValue(undefined);
      const res = service.readServerSettings();
      expect(res).toEqual({ ok: false, error: 'instance_not_found' });
    });

    it('readServerSettings reads existing server-settings.json', () => {
      const p = path.join(serverDir, 'server-settings.json');
      fs.writeFileSync(p, JSON.stringify({ name: 'My Factorio Server' }));

      const res = service.readServerSettings();
      expect(res.ok).toBe(true);
      expect(res.data).toEqual({ name: 'My Factorio Server' });
    });

    it('writeServerSettings rejects non-object or array data', () => {
      expect(service.writeServerSettings('invalid')).toEqual({
        ok: false,
        error: 'invalid_data',
      });
      expect(service.writeServerSettings(['item'])).toEqual({
        ok: false,
        error: 'invalid_data',
      });
    });

    it('writeServerSettings enforces token and password exclusivity', () => {
      const data = {
        name: 'Server',
        token: 'token123',
        password: 'pass',
      };

      const res = service.writeServerSettings(data);
      expect(res).toEqual({
        ok: false,
        error: 'server_settings_error_token_password_exclusive',
      });
    });

    it('writeServerSettings enforces authentication if server is public', () => {
      const data = {
        name: 'Server',
        visibility: { public: true },
        token: '',
        password: '',
      };

      const res = service.writeServerSettings(data);
      expect(res).toEqual({
        ok: false,
        error: 'server_settings_error_public_needs_auth',
      });
    });

    it('writeServerSettings writes normalized settings, diffs changes, and clears cache', () => {
      const p = path.join(serverDir, 'server-settings.json');
      fs.writeFileSync(
        p,
        JSON.stringify({ name: 'Old Server', max_players: 10 }),
      );

      const res = service.writeServerSettings({
        name: 'New Server',
        max_players: 20,
        game_password: null,
      });

      expect(res.ok).toBe(true);
      expect(mockPortal.clearVerifyCache).toHaveBeenCalled();
      const onDisk = JSON.parse(fs.readFileSync(p, 'utf8')) as Record<
        string,
        unknown
      >;
      expect(onDisk.name).toBe('New Server');
      expect(onDisk.game_password).toBe('');
    });
  });

  describe('admin-list operations', () => {
    it('writeAdminList rejects non-array inputs', async () => {
      const res = await service.writeAdminList('not-an-array');
      expect(res).toEqual({ ok: false, error: 'invalid_data' });
    });

    it('writeAdminList writes, deduplicates and propagates when server is stopped', async () => {
      const res = await service.writeAdminList(['Alice', 'Bob', 'Alice', '  ']);
      expect(res).toEqual({ ok: true });

      const p = path.join(serverDir, 'server-adminlist.json');
      const onDisk = JSON.parse(fs.readFileSync(p, 'utf8')) as string[];
      expect(onDisk).toEqual(['Alice', 'Bob']);
      expect(mockPropagate.propagateAdminList).toHaveBeenCalledWith('inst-1', [
        'Alice',
        'Bob',
      ]);
    });

    it('writeAdminList executes promote and demote via RCON when server is running', async () => {
      (mockRuntime.isRunning as jest.Mock).mockReturnValue(true);
      const p = path.join(serverDir, 'server-adminlist.json');
      fs.writeFileSync(p, JSON.stringify(['Alice', 'Charlie']));

      const res = await service.writeAdminList(['Alice', 'Bob']);
      expect(res.ok).toBe(true);
      expect(res.runtime).toBe(true);
      expect(res.promoted).toEqual(['Bob']);
      expect(res.demote).toBeUndefined();
      expect(res.demoted).toEqual(['Charlie']);

      expect(mockRuntime.rconExec).toHaveBeenCalledWith(
        'inst-1',
        '/promote Bob',
      );
      expect(mockRuntime.rconExec).toHaveBeenCalledWith(
        'inst-1',
        '/demote Charlie',
      );
    });
  });

  describe('mod-list and ban-list operations', () => {
    it('readModList and writeModList operate on mod-list.json', () => {
      const data = {
        mods: [{ name: 'base', enabled: true }],
      };

      const writeRes = service.writeModList(data);
      expect(writeRes.ok).toBe(true);

      const readRes = service.readModList();
      expect(readRes.ok).toBe(true);
      expect(readRes.data).toEqual(data);
    });

    it('readBanList ensures banlist file and returns array', () => {
      const res = service.readBanList();
      expect(res.ok).toBe(true);
      expect(Array.isArray(res.data)).toBe(true);
    });
  });

  describe('mod-settings upload and json operations', () => {
    it('uploadModSettingsDat blocks upload when server is running', () => {
      (mockRuntime.isRunning as jest.Mock).mockReturnValue(true);
      const res = service.uploadModSettingsDat('/tmp/fake', false);
      expect(res).toEqual({ ok: false, error: 'server_running' });
    });

    it('uploadModSettingsDat rejects missing or invalid binary file', () => {
      const missingRes = service.uploadModSettingsDat(
        path.join(tempDir, 'missing.dat'),
        false,
      );
      expect(missingRes).toEqual({ ok: false, error: 'tmp_not_found' });

      const corruptPath = path.join(tempDir, 'corrupt.dat');
      fs.writeFileSync(corruptPath, Buffer.from([0, 0, 0, 0, 0, 0, 0, 0, 0]));

      const corruptRes = service.uploadModSettingsDat(corruptPath, false);
      expect(corruptRes).toEqual({ ok: false, error: 'invalid_mod_settings' });
    });

    it('uploadModSettingsDat replaces file and invalidates schema', () => {
      const validPath = path.join(tempDir, 'valid.dat');
      fs.writeFileSync(validPath, createValidModSettingsBuffer());

      const res = service.uploadModSettingsDat(validPath, false);
      expect(res.ok).toBe(true);
      expect(res.name).toBe('mod-settings.dat');
      expect(mockSchema.invalidateInstance).toHaveBeenCalledWith('inst-1');
      expect(fs.existsSync(path.join(modsDir, 'mod-settings.dat'))).toBe(true);
    });

    it('modSettingsReadJson returns default json when file is missing', () => {
      const res = service.modSettingsReadJson();
      expect(res.ok).toBe(true);
      expect(res.missing_file).toBe(true);
      expect(typeof res.json_text).toBe('string');
    });

    it('modSettingsWriteJson saves mod-settings.dat and calculates changes', () => {
      const initialDoc = {
        '!type': 'ModSettings',
        version: [2, 0, 0, 0],
        has_quality: false,
        data: {
          startup: {
            'custom-speed': { value: 1.0 },
          },
        },
      };

      const res1 = service.modSettingsWriteJson(initialDoc);
      expect(res1.ok).toBe(true);
      expect(fs.existsSync(path.join(modsDir, 'mod-settings.dat'))).toBe(true);

      const updatedDoc = {
        '!type': 'ModSettings',
        version: [2, 0, 0, 0],
        has_quality: false,
        data: {
          startup: {
            'custom-speed': { value: 2.5 },
          },
        },
      };

      const res2 = service.modSettingsWriteJson(updatedDoc);
      expect(res2.ok).toBe(true);
      expect(res2.settings_changes).toEqual([
        {
          key: '[startup] custom-speed',
          from: '1',
          to: '2.5',
        },
      ]);
    });
  });
});
