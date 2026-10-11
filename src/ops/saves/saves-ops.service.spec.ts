import { SavesOpsService } from './saves-ops.service';
import { InstancesService } from '../../instances/instances.service';
import {
  SaveInspectService,
  type SaveInspectResult,
} from '../save-inspect/save-inspect.service';
import { RuntimeService } from '../runtime.service';
import { ModPortalService } from '../mod-portal/mod-portal.service';
import { FccConfigService } from '../../config/fcc-config.service';
import { InstanceItem } from '../../common/types';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('SavesOpsService', () => {
  let service: SavesOpsService;
  let tempDir: string;
  let instance1Dir: string;
  let instance2Dir: string;
  let instance1SavesDir: string;
  let instance2SavesDir: string;

  let mockInstances: Partial<InstancesService>;
  let mockInspect: Partial<SaveInspectService>;
  let mockRuntime: Partial<RuntimeService>;
  let mockPortal: Partial<ModPortalService>;
  let mockConfig: Partial<FccConfigService>;

  const inst1: InstanceItem = {
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

  const inst2: InstanceItem = {
    id: 'inst-2',
    name: 'Server 2',
    serverPath: '',
    ip: '0.0.0.0',
    port: '34198',
    rconPort: 27016,
    rconPassword: 'pass',
    autostartServer: false,
    autoEnterPanel: false,
    launchSave: 'latest',
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-saves-test-'));
    instance1Dir = path.join(tempDir, 'instance1');
    instance2Dir = path.join(tempDir, 'instance2');
    instance1SavesDir = path.join(instance1Dir, 'saves');
    instance2SavesDir = path.join(instance2Dir, 'saves');

    fs.mkdirSync(instance1SavesDir, { recursive: true });
    fs.mkdirSync(instance2SavesDir, { recursive: true });

    inst1.serverPath = instance1Dir;
    inst2.serverPath = instance2Dir;

    mockInstances = {
      getSelected: jest.fn().mockReturnValue(inst1),
      getById: jest.fn((id: string) => {
        if (id === 'inst-1') return inst1;
        if (id === 'inst-2') return inst2;
        return undefined;
      }),
      update: jest.fn().mockResolvedValue(inst1),
    };

    mockInspect = {
      inspectSaveZip: jest.fn(),
    };

    mockRuntime = {
      get: jest.fn().mockReturnValue(undefined),
      isRunning: jest.fn().mockReturnValue(false),
    };

    mockPortal = {
      isBuiltin: jest.fn((name: string) => name === 'base'),
      listZipVersions: jest.fn().mockReturnValue([]),
    };

    mockConfig = {
      langCode: 'en',
      translateModNames: true,
    };

    service = new SavesOpsService(
      mockInstances as InstancesService,
      mockInspect as SaveInspectService,
      mockRuntime as RuntimeService,
      mockPortal as ModPortalService,
      mockConfig as FccConfigService,
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('list', () => {
    it('returns error when no instance is selected', () => {
      (mockInstances.getSelected as jest.Mock).mockReturnValue(undefined);
      const res = service.list();
      expect(res).toEqual({ ok: false, error: 'instance_not_found' });
    });

    it('lists existing saves and marks running active save when running', () => {
      fs.writeFileSync(path.join(instance1SavesDir, 'world1.zip'), 'dummy1');
      fs.writeFileSync(path.join(instance1SavesDir, 'world2.zip'), 'dummy2');

      (mockRuntime.isRunning as jest.Mock).mockReturnValue(true);
      (mockRuntime.get as jest.Mock).mockReturnValue({
        saveName: 'world1.zip',
        proc: { exitCode: null },
      });

      const res = service.list();
      expect(res.ok).toBe(true);
      expect(res.running_now).toBe(true);
      expect(res.running_active_save).toBe('world1.zip');

      const saves = res.saves as { name: string; is_running_active: boolean }[];
      expect(saves).toHaveLength(2);
      const w1 = saves.find((s) => s.name === 'world1.zip');
      const w2 = saves.find((s) => s.name === 'world2.zip');
      expect(w1?.is_running_active).toBe(true);
      expect(w2?.is_running_active).toBe(false);
    });

    it('resolves active save from latest file when not explicitly in runtime', () => {
      fs.writeFileSync(path.join(instance1SavesDir, 'auto1.zip'), 'data');

      const res = service.list();
      expect(res.ok).toBe(true);
      expect(res.running_now).toBe(false);
      expect(res.running_active_save).toBe('');
    });
  });

  describe('downloadPath', () => {
    it('rejects invalid names and path traversal dot characters', () => {
      const resDot = service.downloadPath('..');
      expect(resDot).toEqual({ ok: false, error: 'invalid_name' });

      const resSlash = service.downloadPath('../..');
      expect(resSlash).toEqual({ ok: false, error: 'invalid_name' });
    });

    it('returns not_found when save does not exist or tries to escape saves dir', () => {
      const res = service.downloadPath('../../../etc/passwd');
      expect(res).toEqual({ ok: false, error: 'not_found' });

      const resMissing = service.downloadPath('missing.zip');
      expect(resMissing).toEqual({ ok: false, error: 'not_found' });
    });

    it('returns valid path for existing save file', () => {
      const filePath = path.join(instance1SavesDir, 'mysave.zip');
      fs.writeFileSync(filePath, 'zipcontent');

      const res = service.downloadPath('mysave.zip');
      expect(res.ok).toBe(true);
      expect(res.path).toBe(filePath);
      expect(res.name).toBe('mysave.zip');
    });
  });

  describe('inspectSave', () => {
    it('returns error when save file does not exist', async () => {
      const res = await service.inspectSave('nonexistent.zip');
      expect(res.ok).toBe(false);
      expect(res.error).toBe('not_found');
    });

    it('inspects save zip and formats header metadata', async () => {
      const filePath = path.join(instance1SavesDir, 'test_save.zip');
      fs.writeFileSync(filePath, 'content');

      const inspectResult: SaveInspectResult = {
        path: filePath,
        header: {
          factorio_version: [2, 0, 15, 0],
          campaign: 'freeplay',
          level_name: 'level',
          base_mod: 'base',
          difficulty: 1,
          finished: false,
          player_won: false,
          next_level: '',
          can_continue: true,
          finished_but_continuing: false,
          saving_replay: false,
          allow_non_admin_debug_options: false,
          loaded_from: [2, 0, 15],
          loaded_from_build: 12345,
          allowed_commands: 0,
          mods: [
            { name: 'base', version: [2, 0, 15], crc: 111 },
            { name: 'flib', version: [0, 14, 0], crc: 222 },
          ],
        },
        header_error: null,
        header_source: 'level-init.dat',
        members: [{ name: 'level.dat', file_size: 100, compress_size: 50 }],
        has_level_dat: true,
        has_level_init: true,
        script_output_files: [],
      };

      (mockInspect.inspectSaveZip as jest.Mock).mockResolvedValue(
        inspectResult,
      );

      const res = await service.inspectSave('test_save.zip');
      expect(res.ok).toBe(true);
      expect(res.name).toBe('test_save.zip');
      const header = res.header as Record<string, unknown>;
      expect(header.factorio_version).toBe('2.0.15');
      expect(header.base_mod).toBe('base');
      expect(Array.isArray(header.mods)).toBe(true);
    });
  });

  describe('inspectUploadedSaveMods', () => {
    it('returns error if tmpPath does not exist', async () => {
      const res = await service.inspectUploadedSaveMods('/nonexistent/tmp.zip');
      expect(res).toEqual({ ok: false, error: 'not_found' });
    });

    it('returns inspect_failed if header could not be read', async () => {
      const tmpFile = path.join(tempDir, 'corrupt.zip');
      fs.writeFileSync(tmpFile, 'corrupt');

      (mockInspect.inspectSaveZip as jest.Mock).mockResolvedValue({
        path: tmpFile,
        header: null,
        header_error: 'corrupt_archive',
        header_source: null,
        members: [],
        has_level_dat: false,
        has_level_init: false,
        script_output_files: [],
      });

      const res = await service.inspectUploadedSaveMods(tmpFile);
      expect(res.ok).toBe(false);
      expect(res.error).toBe('inspect_failed');
    });

    it('filters out builtin mods and checks installed versions', async () => {
      const tmpFile = path.join(tempDir, 'valid.zip');
      fs.writeFileSync(tmpFile, 'valid');

      (mockInspect.inspectSaveZip as jest.Mock).mockResolvedValue({
        path: tmpFile,
        header: {
          factorio_version: [2, 0, 0, 0],
          mods: [
            { name: 'base', version: [2, 0, 0], crc: 1 },
            { name: 'custom-mod', version: [1, 2, 3], crc: 2 },
          ],
        },
        members: [],
        has_level_dat: true,
        has_level_init: false,
        script_output_files: [],
      });

      (mockPortal.listZipVersions as jest.Mock).mockReturnValue(['1.2.0']);

      const res = await service.inspectUploadedSaveMods(tmpFile);
      expect(res.ok).toBe(true);
      const mods = res.mods as {
        name: string;
        installed: boolean;
        installed_versions: string[];
      }[];
      expect(mods).toHaveLength(1);
      expect(mods[0].name).toBe('custom-mod');
      expect(mods[0].installed).toBe(true);
      expect(mods[0].installed_versions).toEqual(['1.2.0']);
    });
  });

  describe('rename', () => {
    it('blocks renaming an active running save', () => {
      fs.writeFileSync(path.join(instance1SavesDir, 'active.zip'), 'data');
      (mockRuntime.get as jest.Mock).mockReturnValue({
        saveName: 'active.zip',
        proc: { exitCode: null },
      });

      const res = service.rename('active.zip', 'newname.zip');
      expect(res).toEqual({ ok: false, error: 'running_active_save' });
    });

    it('returns not_found if source file does not exist', () => {
      const res = service.rename('missing.zip', 'newname.zip');
      expect(res).toEqual({ ok: false, error: 'not_found' });
    });

    it('returns exists if destination already exists', () => {
      fs.writeFileSync(path.join(instance1SavesDir, 'old.zip'), 'old');
      fs.writeFileSync(path.join(instance1SavesDir, 'target.zip'), 'existing');

      const res = service.rename('old.zip', 'target.zip');
      expect(res).toEqual({ ok: false, error: 'exists' });
    });

    it('successfully renames file', () => {
      fs.writeFileSync(path.join(instance1SavesDir, 'old.zip'), 'old');

      const res = service.rename('old.zip', 'renamed.zip');
      expect(res).toEqual({ ok: true, name: 'renamed.zip' });
      expect(fs.existsSync(path.join(instance1SavesDir, 'old.zip'))).toBe(
        false,
      );
      expect(fs.existsSync(path.join(instance1SavesDir, 'renamed.zip'))).toBe(
        true,
      );
    });
  });

  describe('delete', () => {
    it('blocks deleting active running save', () => {
      fs.writeFileSync(path.join(instance1SavesDir, 'running.zip'), 'data');
      (mockRuntime.get as jest.Mock).mockReturnValue({
        saveName: 'running.zip',
        proc: { exitCode: null },
      });

      const res = service.delete('running.zip');
      expect(res).toEqual({ ok: false, error: 'running_active_save' });
    });

    it('returns not_found if file does not exist', () => {
      const res = service.delete('missing.zip');
      expect(res).toEqual({ ok: false, error: 'not_found' });
    });

    it('deletes file successfully', () => {
      fs.writeFileSync(path.join(instance1SavesDir, 'to_delete.zip'), 'data');
      const res = service.delete('to_delete.zip');
      expect(res).toEqual({ ok: true });
      expect(fs.existsSync(path.join(instance1SavesDir, 'to_delete.zip'))).toBe(
        false,
      );
    });
  });

  describe('duplicate', () => {
    it('returns not_found when duplicating missing file', () => {
      const res = service.duplicate('missing.zip');
      expect(res).toEqual({ ok: false, error: 'not_found' });
    });

    it('creates a copy with unique name', () => {
      fs.writeFileSync(path.join(instance1SavesDir, 'original.zip'), 'data');
      const res = service.duplicate('original.zip');
      expect(res.ok).toBe(true);
      expect(typeof res.name).toBe('string');
      expect((res.name as string).startsWith('original_copy_')).toBe(true);
      expect(
        fs.existsSync(path.join(instance1SavesDir, res.name as string)),
      ).toBe(true);
    });
  });

  describe('transfer', () => {
    it('rejects transfer when target instance ID is invalid or same as current', async () => {
      const res1 = await service.transfer('save.zip', '');
      expect(res1).toEqual({ ok: false, error: 'invalid_target_server' });

      const res2 = await service.transfer('save.zip', 'inst-1');
      expect(res2).toEqual({ ok: false, error: 'invalid_target_server' });
    });

    it('rejects transfer when target server does not exist', async () => {
      const res = await service.transfer('save.zip', 'unknown-server');
      expect(res).toEqual({ ok: false, error: 'target_server_not_found' });
    });

    it('rejects transfer when source save file is not found', async () => {
      const res = await service.transfer('missing.zip', 'inst-2');
      expect(res).toEqual({ ok: false, error: 'not_found' });
    });

    it('mode move blocks transfer if active save on source server', async () => {
      fs.writeFileSync(path.join(instance1SavesDir, 'active.zip'), 'data');
      (mockRuntime.get as jest.Mock).mockReturnValue({
        saveName: 'active.zip',
        proc: { exitCode: null },
      });

      const res = await service.transfer('active.zip', 'inst-2', {
        mode: 'move',
      });
      expect(res).toEqual({ ok: false, error: 'running_active_save' });
    });

    it('mode copy transfers save to target instance without deleting source', async () => {
      fs.writeFileSync(
        path.join(instance1SavesDir, 'save_copy.zip'),
        'content',
      );

      const res = await service.transfer('save_copy.zip', 'inst-2', {
        mode: 'copy',
      });
      expect(res.ok).toBe(true);
      expect(res.mode).toBe('copy');
      expect(res.target_name).toBe('save_copy.zip');
      expect(fs.existsSync(path.join(instance1SavesDir, 'save_copy.zip'))).toBe(
        true,
      );
      expect(fs.existsSync(path.join(instance2SavesDir, 'save_copy.zip'))).toBe(
        true,
      );
    });

    it('mode move moves save and updates launchSave if moving launch save', async () => {
      fs.writeFileSync(
        path.join(instance1SavesDir, 'save_move.zip'),
        'content',
      );
      inst1.launchSave = 'save_move.zip';

      const res = await service.transfer('save_move.zip', 'inst-2', {
        mode: 'move',
      });
      expect(res.ok).toBe(true);
      expect(res.mode).toBe('move');
      expect(fs.existsSync(path.join(instance1SavesDir, 'save_move.zip'))).toBe(
        false,
      );
      expect(fs.existsSync(path.join(instance2SavesDir, 'save_move.zip'))).toBe(
        true,
      );
      expect(mockInstances.update).toHaveBeenCalledWith('inst-1', {
        launchSave: 'latest',
      });
    });
  });

  describe('setLaunchSave', () => {
    it('sets launchSave to latest and logs setting change', async () => {
      inst1.launchSave = 'old.zip';
      const res = await service.setLaunchSave('latest');
      expect(res.ok).toBe(true);
      expect(res.settings_changes).toEqual([
        { key: 'save', from: 'old.zip', to: 'latest' },
      ]);
      expect(mockInstances.update).toHaveBeenCalledWith('inst-1', {
        launchSave: 'latest',
      });
    });

    it('returns not_in_list if save does not exist in saves directory', async () => {
      const res = await service.setLaunchSave('missing.zip');
      expect(res).toEqual({ ok: false, error: 'not_in_list' });
    });

    it('sets launchSave to valid existing save', async () => {
      fs.writeFileSync(path.join(instance1SavesDir, 'valid.zip'), 'data');
      inst1.launchSave = 'latest';

      const res = await service.setLaunchSave('valid.zip');
      expect(res.ok).toBe(true);
      expect(res.settings_changes).toEqual([
        { key: 'save', from: 'latest', to: 'valid.zip' },
      ]);
      expect(mockInstances.update).toHaveBeenCalledWith('inst-1', {
        launchSave: 'valid.zip',
      });
    });
  });

  describe('uploadArchive', () => {
    it('returns tmp_not_found if temporary file does not exist', async () => {
      const res = await service.uploadArchive('/no/file.zip', 'target.zip');
      expect(res).toEqual({ ok: false, error: 'tmp_not_found' });
    });

    it('returns error if archive validation fails', async () => {
      const tmpPath = path.join(tempDir, 'invalid_upload.zip');
      fs.writeFileSync(tmpPath, 'bad');

      (mockInspect.inspectSaveZip as jest.Mock).mockResolvedValue({
        path: tmpPath,
        header: null,
        header_error: 'bad_zip: corrupt',
        header_source: null,
        members: [],
        has_level_dat: false,
        has_level_init: false,
        script_output_files: [],
      });

      const res = await service.uploadArchive(tmpPath, 'world.zip');
      expect(res.ok).toBe(false);
      expect(res.error).toBe('invalid_save_zip');
    });

    it('copies valid archive to saves directory', async () => {
      const tmpPath = path.join(tempDir, 'valid_upload.zip');
      fs.writeFileSync(tmpPath, 'valid_content_123');

      (mockInspect.inspectSaveZip as jest.Mock).mockResolvedValue({
        path: tmpPath,
        header: {
          factorio_version: [2, 0, 10, 0],
          mods: [],
        },
        members: [],
        has_level_dat: true,
        has_level_init: false,
        script_output_files: [],
      });

      const res = await service.uploadArchive(tmpPath, 'new_world.zip');
      expect(res.ok).toBe(true);
      expect(res.name).toBe('new_world.zip');
      expect(res.bytes).toBe(17);
      expect(fs.existsSync(path.join(instance1SavesDir, 'new_world.zip'))).toBe(
        true,
      );
    });
  });
});
