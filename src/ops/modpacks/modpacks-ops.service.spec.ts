import { ModpacksOpsService } from './modpacks-ops.service';
import { PathsService } from '../../config/paths.service';
import { InstancesService } from '../../instances/instances.service';
import { RuntimeService } from '../runtime.service';
import { ModPortalService } from '../mod-portal/mod-portal.service';
import { ModsJobService } from '../mods/mods-job.service';
import { ProgramOpsService } from '../program/program-ops.service';
import { FccConfigService } from '../../config/fcc-config.service';
import { LocaleService } from '../../locale/locale.service';
import { InstanceItem } from '../../common/types';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('ModpacksOpsService', () => {
  let service: ModpacksOpsService;
  let tempDir: string;
  let modpacksDir: string;
  let serverDir: string;
  let serverModsDir: string;

  let mockPaths: Partial<PathsService>;
  let mockInstances: Partial<InstancesService>;
  let mockRuntime: Partial<RuntimeService>;
  let mockPortal: Partial<ModPortalService>;
  let mockModJobs: Partial<ModsJobService>;
  let mockProgram: Partial<ProgramOpsService>;
  let mockConfig: Partial<FccConfigService>;
  let mockLocale: Partial<LocaleService>;

  const defaultInstance: InstanceItem = {
    id: 'test-inst',
    name: 'Test Server',
    serverPath: '',
    ip: '127.0.0.1',
    port: '34197',
    rconPort: 27015,
    rconPassword: 'secret',
    autostartServer: false,
    autoEnterPanel: false,
    launchSave: 'latest',
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-modpacks-test-'));
    modpacksDir = path.join(tempDir, 'modpacks');
    serverDir = path.join(tempDir, 'server');
    serverModsDir = path.join(serverDir, 'mods');

    fs.mkdirSync(modpacksDir, { recursive: true });
    fs.mkdirSync(serverModsDir, { recursive: true });

    defaultInstance.serverPath = serverDir;

    // Create a mock mod list and a mod zip in serverModsDir
    fs.writeFileSync(
      path.join(serverModsDir, 'mod-list.json'),
      JSON.stringify(
        {
          mods: [
            { name: 'base', enabled: true },
            { name: 'flib', enabled: true, version: '0.14.0' },
          ],
        },
        null,
        2,
      ),
      'utf-8',
    );
    fs.writeFileSync(
      path.join(serverModsDir, 'flib_0.14.0.zip'),
      'mock-zip-binary-data',
    );

    mockPaths = {
      modpacksDir,
    };

    mockInstances = {
      getSelected: jest.fn().mockReturnValue({ ...defaultInstance }),
      getSelectedId: jest.fn().mockReturnValue('test-inst'),
    };

    mockRuntime = {
      isRunning: jest.fn().mockReturnValue(false),
    };

    mockPortal = {
      fetchModInfo: jest.fn(),
    };

    mockModJobs = {
      queueDownload: jest.fn(),
    };

    mockProgram = {
      modpackActivateUseSymlinks: jest.fn().mockReturnValue(false),
    };

    mockConfig = {
      langCode: 'en',
      translateModNames: false,
    };

    mockLocale = {
      readLang: jest.fn().mockReturnValue({}),
    };

    service = new ModpacksOpsService(
      mockPaths as PathsService,
      mockInstances as InstancesService,
      mockRuntime as RuntimeService,
      mockPortal as ModPortalService,
      mockModJobs as ModsJobService,
      mockProgram as ProgramOpsService,
      mockConfig as FccConfigService,
      mockLocale as LocaleService,
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe('list and get', () => {
    it('returns empty list when no modpacks exist', () => {
      const res = service.list();
      expect(res.ok).toBe(true);
      expect(res.modpacks).toEqual([]);
      expect(res.active).toBe('');
    });

    it('returns not_found when getting non-existent modpack', () => {
      expect(service.get('non-existent')).toEqual({
        ok: false,
        error: 'not_found',
      });
      expect(service.get('')).toEqual({
        ok: false,
        error: 'invalid_name',
      });
    });
  });

  describe('saveCurrent and get', () => {
    it('saves current server mods into a new modpack', () => {
      const res = service.saveCurrent('pack-one', 'My first modpack', true);
      expect(res.ok).toBe(true);
      expect(res.name).toBe('pack-one');

      const packDir = path.join(modpacksDir, 'pack-one');
      expect(fs.existsSync(packDir)).toBe(true);
      expect(fs.existsSync(path.join(packDir, 'metadata.json'))).toBe(true);
      expect(fs.existsSync(path.join(packDir, 'mods', 'flib_0.14.0.zip'))).toBe(
        true,
      );

      const getRes = service.get('pack-one');
      expect(getRes.ok).toBe(true);
      const modpack = getRes.modpack as Record<string, unknown>;
      expect(modpack.name).toBe('pack-one');
      expect(modpack.mods_count).toBe(2);
    });

    it('rejects saving modpack if name already exists', () => {
      service.saveCurrent('duplicate-pack');
      const secondSave = service.saveCurrent('duplicate-pack');
      expect(secondSave).toEqual({ ok: false, error: 'exists' });
    });

    it('rejects saving modpack when no user mods are installed', () => {
      fs.writeFileSync(
        path.join(serverModsDir, 'mod-list.json'),
        JSON.stringify({ mods: [{ name: 'base', enabled: true }] }),
        'utf-8',
      );
      fs.rmSync(path.join(serverModsDir, 'flib_0.14.0.zip'));

      const res = service.saveCurrent('empty-pack');
      expect(res).toEqual({ ok: false, error: 'empty' });
    });
  });

  describe('activate', () => {
    beforeEach(() => {
      service.saveCurrent('space-pack');
    });

    it('rejects activation when server is running', () => {
      (mockRuntime.isRunning as jest.Mock).mockReturnValue(true);
      const res = service.activate('space-pack', false);
      expect(res).toEqual({ ok: false, error: 'server_running' });
    });

    it('rejects activation for unknown modpack', () => {
      const res = service.activate('unknown-pack', false);
      expect(res).toEqual({ ok: false, error: 'not_found' });
    });

    it('activates modpack and copies files into instance mods folder', () => {
      // Remove server mods to ensure activate restores them
      fs.rmSync(path.join(serverModsDir, 'flib_0.14.0.zip'), { force: true });

      const res = service.activate('space-pack', false);
      expect(res.ok).toBe(true);
      expect(res.name).toBe('space-pack');
      expect(fs.existsSync(path.join(serverModsDir, 'flib_0.14.0.zip'))).toBe(
        true,
      );

      // Subsequent activation returns already_active
      const second = service.activate('space-pack', false);
      expect(second).toEqual({ ok: false, error: 'already_active' });
    });
  });

  describe('rename and delete', () => {
    beforeEach(() => {
      service.saveCurrent('old-pack');
    });

    it('renames a modpack and updates active state if active', () => {
      service.activate('old-pack', false);

      const renRes = service.rename('old-pack', 'new-pack');
      expect(renRes).toEqual({ ok: true, name: 'new-pack' });

      expect(fs.existsSync(path.join(modpacksDir, 'old-pack'))).toBe(false);
      expect(fs.existsSync(path.join(modpacksDir, 'new-pack'))).toBe(true);

      const listRes = service.list();
      expect(listRes.active).toBe('new-pack');
    });

    it('returns error when renaming to existing name', () => {
      service.saveCurrent('second-pack');
      const res = service.rename('old-pack', 'second-pack');
      expect(res).toEqual({ ok: false, error: 'exists' });
    });

    it('deletes modpack and unsets active', () => {
      service.activate('old-pack', false);
      const delRes = service.delete('old-pack');
      expect(delRes).toEqual({ ok: true });

      expect(fs.existsSync(path.join(modpacksDir, 'old-pack'))).toBe(false);
      expect(service.list().active).toBe('');
    });
  });

  describe('reset', () => {
    it('resets server mods and active modpack state', () => {
      service.saveCurrent('test-pack');
      service.activate('test-pack', false);

      const resetRes = service.reset();
      expect(resetRes.ok).toBe(true);
      expect(service.list().active).toBe('');
    });

    it('rejects reset if server is running', () => {
      (mockRuntime.isRunning as jest.Mock).mockReturnValue(true);
      expect(service.reset()).toEqual({ ok: false, error: 'server_running' });
    });
  });

  describe('exportPrepare and importUpload', () => {
    beforeEach(() => {
      service.saveCurrent('exportable-pack');
    });

    it('exports modpack as .fcc JSON format and imports it under a new name', () => {
      const expRes = service.exportPrepare('exportable-pack', false, '', 'fcc');
      expect(expRes.ok).toBe(true);
      const filePath = String(expRes.path);
      expect(fs.existsSync(filePath)).toBe(true);

      const impRes = service.importUpload(filePath, 'imported-fcc');
      expect(impRes.ok).toBe(true);
      expect(impRes.name).toBe('imported-fcc');
      expect(fs.existsSync(path.join(modpacksDir, 'imported-fcc'))).toBe(true);

      fs.rmSync(filePath, { force: true });
    });

    it('exports modpack as .zip format and imports it under a new name', () => {
      const expRes = service.exportPrepare('exportable-pack', false, '', 'zip');
      expect(expRes.ok).toBe(true);
      const filePath = String(expRes.path);
      expect(fs.existsSync(filePath)).toBe(true);

      const impRes = service.importUpload(filePath, 'imported-zip');
      expect(impRes.ok).toBe(true);
      expect(impRes.name).toBe('imported-zip');
      expect(fs.existsSync(path.join(modpacksDir, 'imported-zip'))).toBe(true);

      fs.rmSync(filePath, { force: true });
    });

    it('rejects export if modpack does not exist', () => {
      const res = service.exportPrepare('non-existent');
      expect(res).toEqual({ ok: false, error: 'not_found' });
    });
  });
});
