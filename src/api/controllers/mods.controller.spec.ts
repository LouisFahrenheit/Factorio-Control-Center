import { ModsController } from './mods.controller';
import { ApiBridgeService } from '../api-bridge.service';
import { AUTH_USER_KEY } from '../../auth/auth.guard';
import { SessionUser } from '../../common/types';
import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('ModsController', () => {
  let controller: ModsController;
  let bridge: {
    submit: jest.Mock;
    webActor: jest.Mock;
  };
  let tempDir: string;

  const dummyUser: SessionUser = {
    username: 'admin',
    role: 'administrator',
    tabs: ['instances'],
    instance_ids: ['*'],
    enabled: true,
  };

  const mockRequest = (
    user: SessionUser = dummyUser,
    headers: Record<string, string> = { 'x-fcc-ui-lang': 'en' },
  ): Request =>
    ({
      [AUTH_USER_KEY]: user,
      headers,
    }) as unknown as Request;

  const mockResponse = () => {
    const status = jest.fn();
    const json = jest.fn();
    const download = jest.fn();
    const res = {
      status,
      json,
      download,
    };
    status.mockReturnValue(res);
    json.mockReturnValue(res);
    download.mockReturnValue(res);
    return { res: res as unknown as Response, status, json, download };
  };

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-mods-ctrl-test-'));
  });

  afterAll(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  beforeEach(() => {
    bridge = {
      submit: jest.fn().mockResolvedValue({ ok: true }),
      webActor: jest.fn().mockReturnValue('web:admin'),
    };

    controller = new ModsController(bridge as unknown as ApiBridgeService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('mod list & status', () => {
    it('mods returns installed mods list with ui_lang', async () => {
      const res = await controller.mods(mockRequest(), 'inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'mods_list',
        { ui_lang: 'en' },
        'inst-1',
      );
      expect(res).toEqual({ ok: true });
    });

    it('modList and modListWrite dispatch read/write commands', async () => {
      await controller.modList('inst-1');
      expect(bridge.submit).toHaveBeenCalledWith('read_mod_list', {}, 'inst-1');

      await controller.modListWrite({ mods: [] }, mockRequest(), 'inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'write_mod_list',
        { data: { mods: [] }, actor: 'web:admin' },
        'inst-1',
      );
    });

    it('modsPrefs dispatches mods_set_prefs', async () => {
      await controller.modsPrefs(
        mockRequest(),
        { remove_old_zips: true },
        'inst-1',
      );
      expect(bridge.submit).toHaveBeenCalledWith(
        'mods_set_prefs',
        { remove_old_zips: true, web_actor: 'web:admin' },
        'inst-1',
      );
    });

    it('modsCheckUpdates and status dispatch check commands', async () => {
      await controller.modsCheckUpdates({ foo: 'bar' }, 'inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'mods_check_updates_start',
        { foo: 'bar' },
        'inst-1',
      );

      await controller.modsCheckUpdatesStatus('inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'mods_check_updates_status',
        {},
        'inst-1',
      );
    });
  });

  describe('mod toggles and operations', () => {
    it('modsToggle dispatches mods_set_enabled', async () => {
      await controller.modsToggle(
        { name: 'base', enabled: true },
        mockRequest(),
        'inst-1',
      );
      expect(bridge.submit).toHaveBeenCalledWith(
        'mods_set_enabled',
        { name: 'base', enabled: true, actor: 'web:admin' },
        'inst-1',
      );
    });

    it('modsToggleAll dispatches mods_set_all_enabled', async () => {
      await controller.modsToggleAll(
        { enabled: false },
        mockRequest(),
        'inst-1',
      );
      expect(bridge.submit).toHaveBeenCalledWith(
        'mods_set_all_enabled',
        { enabled: false, actor: 'web:admin' },
        'inst-1',
      );
    });

    it('modsDisableConflicts dispatches mods_disable_conflicts', async () => {
      await controller.modsDisableConflicts(
        { names: ['mod-a'] },
        mockRequest(),
        'inst-1',
      );
      expect(bridge.submit).toHaveBeenCalledWith(
        'mods_disable_conflicts',
        { names: ['mod-a'], actor: 'web:admin' },
        'inst-1',
      );
    });

    it('modsChangelog dispatches mods_get_changelog', async () => {
      await controller.modsChangelog('space-age', 'inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'mods_get_changelog',
        { name: 'space-age' },
        'inst-1',
      );
    });

    it('modsVersion dispatches mods_set_version', async () => {
      await controller.modsVersion(
        { name: 'mod-a', version: '1.0.0' },
        mockRequest(),
        'inst-1',
      );
      expect(bridge.submit).toHaveBeenCalledWith(
        'mods_set_version',
        { name: 'mod-a', version: '1.0.0', actor: 'web:admin' },
        'inst-1',
      );
    });

    it('modsRemove dispatches mods_remove', async () => {
      await controller.modsRemove({ name: 'mod-a' }, mockRequest(), 'inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'mods_remove',
        { name: 'mod-a', actor: 'web:admin' },
        'inst-1',
      );
    });
  });

  describe('mod uploads and downloads', () => {
    it('modsUpload rejects missing file', async () => {
      await expect(
        controller.modsUpload(
          null as unknown as Express.Multer.File,
          mockRequest(),
        ),
      ).rejects.toThrow();
    });

    it('modsUpload processes zip mod archive', async () => {
      const fakeFile = {
        buffer: Buffer.from('PK-MOD-CONTENT'),
        originalname: 'my-mod.zip',
      } as Express.Multer.File;

      await controller.modsUpload(fakeFile, mockRequest(), '1', 'inst-1');

      expect(bridge.submit).toHaveBeenCalledTimes(1);
      const call = bridge.submit.mock.calls[0] as unknown as [
        string,
        { name: string; actor: string; tmp_path: string },
        string,
      ];
      expect(call[0]).toBe('upload_mod_archive');
      expect(call[1].name).toBe('my-mod.zip');
      expect(call[1].actor).toBe('web:admin');
      expect(call[1].tmp_path.includes('fcc-mod-')).toBe(true);
      expect(call[2]).toBe('inst-1');
    });

    it('modsUpload processes mod-settings.dat', async () => {
      const fakeFile = {
        buffer: Buffer.from('DAT-CONTENT'),
        originalname: 'mod-settings.dat',
      } as Express.Multer.File;

      await controller.modsUpload(fakeFile, mockRequest(), 'true', 'inst-1');

      expect(bridge.submit).toHaveBeenCalledTimes(1);
      const call = bridge.submit.mock.calls[0] as unknown as [
        string,
        { confirm_replace: boolean; actor: string; tmp_path: string },
        string,
      ];
      expect(call[0]).toBe('upload_mod_settings_dat');
      expect(call[1].confirm_replace).toBe(true);
      expect(call[1].tmp_path.includes('fcc-modset-')).toBe(true);
      expect(call[2]).toBe('inst-1');
    });

    it('modsImportSavePreview inspects uploaded save file', async () => {
      const fakeFile = {
        buffer: Buffer.from('PK-SAVE-CONTENT'),
        originalname: 'save.zip',
      } as Express.Multer.File;

      await controller.modsImportSavePreview(
        fakeFile,
        mockRequest(dummyUser, { 'x-fcc-ui-lang': 'ru' }),
        'inst-1',
      );

      expect(bridge.submit).toHaveBeenCalledTimes(1);
      const call = bridge.submit.mock.calls[0] as unknown as [
        string,
        { ui_lang: string; tmp_path: string },
        string,
      ];
      expect(call[0]).toBe('inspect_uploaded_save_mods');
      expect(call[1].ui_lang).toBe('ru');
      expect(call[1].tmp_path.includes('fcc-save-prev-')).toBe(true);
      expect(call[2]).toBe('inst-1');
    });

    it('modsDownloadAll returns 404 when file does not exist', async () => {
      bridge.submit.mockResolvedValue({
        ok: true,
        path: '/non/existent/all-mods.zip',
      });
      const { res, status, json } = mockResponse();
      await controller.modsDownloadAll(res, 'inst-1');
      expect(status).toHaveBeenCalledWith(404);
      expect(json).toHaveBeenCalledWith({ ok: false, error: 'not_found' });
    });

    it('modsDownloadAll downloads archive when file exists', async () => {
      const testFile = path.join(tempDir, 'mods.zip');
      fs.writeFileSync(testFile, 'dummy content');
      bridge.submit.mockResolvedValue({
        ok: true,
        path: testFile,
        name: 'my-mods.zip',
      });
      const { res, download } = mockResponse();
      await controller.modsDownloadAll(res, 'inst-1');
      expect(download).toHaveBeenCalledWith(testFile, 'my-mods.zip');
    });

    it('modDownload downloads single mod zip', async () => {
      const testFile = path.join(tempDir, 'mod-a.zip');
      fs.writeFileSync(testFile, 'dummy content');
      bridge.submit.mockResolvedValue({
        ok: true,
        path: testFile,
        name: 'mod-a.zip',
      });
      const { res, download } = mockResponse();
      await controller.modDownload('mod-a', res, 'inst-1');
      expect(download).toHaveBeenCalledWith(testFile, 'mod-a.zip');
    });
  });

  describe('plans and portal', () => {
    it('modsInstallPlan dispatches mods_install_plan', async () => {
      await controller.modsInstallPlan(
        { mod: 'mod-a', version: '1.2.0' },
        'inst-1',
      );
      expect(bridge.submit).toHaveBeenCalledWith(
        'mods_install_plan',
        { mod: 'mod-a', version: '1.2.0' },
        'inst-1',
      );
    });

    it('modsPortalReleases dispatches get_mod_portal_releases', async () => {
      await controller.modsPortalReleases('mod-a', 'inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'get_mod_portal_releases',
        { name: 'mod-a' },
        'inst-1',
      );
    });

    it('modsInstallPlanBatch dispatches mods_install_plan_batch', async () => {
      await controller.modsInstallPlanBatch({ mods: ['mod-a'] }, 'inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'mods_install_plan_batch',
        { mods: ['mod-a'] },
        'inst-1',
      );
    });

    it('modsUpdateAllPlan dispatches mods_update_all_plan', async () => {
      await controller.modsUpdateAllPlan('inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'mods_update_all_plan',
        {},
        'inst-1',
      );
    });
  });

  describe('mod jobs', () => {
    it('modsJobInstall dispatches mods_job_start with mode install', async () => {
      await controller.modsJobInstall(
        { mod: 'mod-a' },
        mockRequest(),
        'inst-1',
      );
      expect(bridge.submit).toHaveBeenCalledWith(
        'mods_job_start',
        { mode: 'install', mod: 'mod-a', actor: 'web:admin' },
        'inst-1',
      );
    });

    it('modsJobInstallSave dispatches mods_job_start with mode install_many', async () => {
      await controller.modsJobInstallSave(
        { save: 's1' },
        mockRequest(),
        'inst-1',
      );
      expect(bridge.submit).toHaveBeenCalledWith(
        'mods_job_start',
        { mode: 'install_many', save: 's1', actor: 'web:admin' },
        'inst-1',
      );
    });

    it('modsJobUpdate dispatches mods_job_start with mode update_one', async () => {
      await controller.modsJobUpdate({ mod: 'mod-a' }, mockRequest(), 'inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'mods_job_start',
        { mode: 'update_one', mod: 'mod-a', actor: 'web:admin' },
        'inst-1',
      );
    });

    it('modsJobUpdateAll dispatches mods_job_start with mode update_all', async () => {
      await controller.modsJobUpdateAll({}, mockRequest(), 'inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'mods_job_start',
        { mode: 'update_all', actor: 'web:admin' },
        'inst-1',
      );
    });

    it('modsJobStatus and stop dispatch job commands', async () => {
      await controller.modsJobStatus('inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'mods_job_status',
        {},
        'inst-1',
      );

      await controller.modsJobStop('inst-1');
      expect(bridge.submit).toHaveBeenCalledWith('mods_job_stop', {}, 'inst-1');
    });
  });

  describe('mod settings', () => {
    it('modSettingsGet and modSettingsPut dispatch read/write commands', async () => {
      await controller.modSettingsGet('inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'mod_settings_read_json',
        {},
        'inst-1',
      );

      await controller.modSettingsPut({ s: 1 }, mockRequest(), 'inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'mod_settings_write_json',
        { data: { s: 1 }, actor: 'web:admin' },
        'inst-1',
      );
    });

    it('modSettingsSchema and status dispatch schema commands', async () => {
      await controller.modSettingsSchema(
        mockRequest(dummyUser, { 'x-fcc-ui-lang': 'ru' }),
        '1',
        'inst-1',
      );
      expect(bridge.submit).toHaveBeenCalledWith(
        'mod_settings_schema',
        { ui_lang: 'ru', refresh: true },
        'inst-1',
      );

      await controller.modSettingsSchemaStatus('inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'mod_settings_schema_status',
        {},
        'inst-1',
      );
    });
  });

  describe('modpacks', () => {
    it('modpacksList dispatches modpack_list', async () => {
      await controller.modpacksList('inst-1');
      expect(bridge.submit).toHaveBeenCalledWith('modpack_list', {}, 'inst-1');
    });

    it('modpackGet dispatches modpack_get', async () => {
      await controller.modpackGet(
        'mp1',
        mockRequest(dummyUser, { 'x-fcc-ui-lang': 'uk' }),
        'inst-1',
      );
      expect(bridge.submit).toHaveBeenCalledWith(
        'modpack_get',
        { name: 'mp1', ui_lang: 'uk' },
        'inst-1',
      );
    });

    it('modpackSave, activate, rename, delete, reset', async () => {
      await controller.modpackSave({ name: 'mp1' }, mockRequest(), 'inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'modpack_save_current',
        { name: 'mp1', actor: 'web:admin' },
        'inst-1',
      );

      await controller.modpackActivate(
        'mp1',
        { option: 1 },
        mockRequest(),
        'inst-1',
      );
      expect(bridge.submit).toHaveBeenCalledWith(
        'modpack_activate',
        { name: 'mp1', option: 1, actor: 'web:admin' },
        'inst-1',
      );

      await controller.modpackRename(
        'mp1',
        { new_name: 'mp2' },
        mockRequest(),
        'inst-1',
      );
      expect(bridge.submit).toHaveBeenCalledWith(
        'modpack_rename',
        { name: 'mp1', new_name: 'mp2', actor: 'web:admin' },
        'inst-1',
      );

      await controller.modpackDelete('mp1', mockRequest(), 'inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'modpack_delete',
        { name: 'mp1', actor: 'web:admin' },
        'inst-1',
      );

      await controller.modpackReset(mockRequest(), 'inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'modpack_reset',
        { actor: 'web:admin' },
        'inst-1',
      );
    });

    it('modpackImportUpload handles file upload', async () => {
      const fakeFile = {
        buffer: Buffer.from('FCC-MODPACK-CONTENT'),
        originalname: 'my-pack.fcc',
      } as Express.Multer.File;

      await controller.modpackImportUpload(fakeFile, mockRequest(), 'inst-1');

      expect(bridge.submit).toHaveBeenCalledTimes(1);
      const call = bridge.submit.mock.calls[0] as unknown as [
        string,
        { actor: string; tmp_path: string },
        string,
      ];
      expect(call[0]).toBe('modpack_import_upload');
      expect(call[1].actor).toBe('web:admin');
      expect(call[1].tmp_path.includes('fcc-modpack-')).toBe(true);
      expect(call[2]).toBe('inst-1');
    });

    it('modpackImportDownloadPlan, AppendDeps, Download, Export', async () => {
      await controller.modpackImportDownloadPlan('mp1', 'inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'modpack_import_download_plan',
        { name: 'mp1' },
        'inst-1',
      );

      await controller.modpackImportAppendDeps('mp1', 'inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'modpack_import_append_dependencies',
        { name: 'mp1' },
        'inst-1',
      );

      await controller.modpackImportDownload(
        'mp1',
        { force: true },
        mockRequest(),
        'inst-1',
      );
      expect(bridge.submit).toHaveBeenCalledWith(
        'modpack_import_start_download',
        { name: 'mp1', force: true, actor: 'web:admin' },
        'inst-1',
      );

      const testFile = path.join(tempDir, 'mp1.fcc');
      fs.writeFileSync(testFile, 'dummy content');
      bridge.submit.mockResolvedValue({
        ok: true,
        path: testFile,
        name: 'mp1.fcc',
      });
      const { res, download } = mockResponse();
      await controller.modpackExport('mp1', res, 'inst-1');
      expect(download).toHaveBeenCalledWith(testFile, 'mp1.fcc');
    });
  });

  describe('map presets', () => {
    it('mapPresetsList, save, delete', async () => {
      await controller.mapPresetsList('inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'map_preset_list',
        {},
        'inst-1',
      );

      await controller.mapPresetSave(
        { name: 'preset-1', state: { seed: 1 } },
        'inst-1',
      );
      expect(bridge.submit).toHaveBeenCalledWith(
        'map_preset_save',
        { name: 'preset-1', state: { seed: 1 } },
        'inst-1',
      );

      await controller.mapPresetDelete('p-1', 'inst-1');
      expect(bridge.submit).toHaveBeenCalledWith(
        'map_preset_delete',
        { id: 'p-1' },
        'inst-1',
      );
    });

    it('mapPresetImportUpload handles file upload', async () => {
      const fakeFile = {
        buffer: Buffer.from('FCC-PRESET-CONTENT'),
        originalname: 'my-preset.fcc',
      } as Express.Multer.File;

      await controller.mapPresetImportUpload(
        fakeFile,
        { name: 'p1' },
        'inst-1',
      );

      expect(bridge.submit).toHaveBeenCalledTimes(1);
      const call = bridge.submit.mock.calls[0] as unknown as [
        string,
        { name: string; tmp_path: string },
        string,
      ];
      expect(call[0]).toBe('map_preset_import_upload');
      expect(call[1].name).toBe('p1');
      expect(call[1].tmp_path.includes('fcc-map-preset-')).toBe(true);
      expect(call[2]).toBe('inst-1');
    });

    it('mapPresetImportBatch dispatches map_preset_import_batch', async () => {
      await controller.mapPresetImportBatch(
        { presets: [{ name: 'p1' }] },
        'inst-1',
      );
      expect(bridge.submit).toHaveBeenCalledWith(
        'map_preset_import_batch',
        { presets: [{ name: 'p1' }] },
        'inst-1',
      );
    });

    it('mapPresetExport downloads preset file', async () => {
      const testFile = path.join(tempDir, 'p1.fcc');
      fs.writeFileSync(testFile, 'dummy content');
      bridge.submit.mockResolvedValue({
        ok: true,
        path: testFile,
        name: 'p1.fcc',
      });
      const { res, download } = mockResponse();
      await controller.mapPresetExport('p1', res, 'inst-1');
      expect(download).toHaveBeenCalledWith(testFile, 'p1.fcc');
    });
  });
});
