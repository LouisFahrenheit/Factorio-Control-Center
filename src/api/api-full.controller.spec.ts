import type { Request, Response } from 'express';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ApiFullController } from './api-full.controller';
import { ApiBridgeService } from './api-bridge.service';
import { LocaleService } from '../locale/locale.service';
import { FccConfigService } from '../config/fcc-config.service';
import { UsersService } from '../auth/users.service';
import { MapGenOpsService } from '../ops/map-gen/map-gen-ops.service';
import { AUTH_USER_KEY } from '../auth/auth.guard';
import { SessionUser } from '../common/types';

describe('ApiFullController', () => {
  let controller: ApiFullController;
  let mockBridge: {
    submit: jest.Mock<
      Promise<Record<string, unknown>>,
      [string, Record<string, unknown>?, string?]
    >;
    webActor: jest.Mock<string, [{ username?: string }?]>;
  };
  let mockLocale: Record<string, jest.Mock>;
  let mockConfig: Record<string, unknown>;
  let mockUsers: Record<string, jest.Mock>;
  let mockMapGen: {
    getSchema: jest.Mock;
    parseExchangeString: jest.Mock;
    exportExchangeString: jest.Mock;
    generatePreview: jest.Mock;
  };
  let tempDir: string;

  const createMockReq = (
    username = 'alice',
    instanceId?: string,
    headers: Record<string, string> = { 'x-fcc-ui-lang': 'en' },
  ): Request =>
    ({
      [AUTH_USER_KEY]: {
        username,
        role: 'administrator',
        tabs: ['instances'],
        instance_ids: instanceId ? [instanceId] : ['*'],
        enabled: true,
      } as SessionUser,
      headers,
    }) as unknown as Request;

  const createMockRes = (): {
    status: jest.Mock;
    json: jest.Mock;
    download: jest.Mock;
    setHeader: jest.Mock;
    write: jest.Mock;
    end: jest.Mock;
  } => {
    const res: Record<string, jest.Mock> = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.download = jest.fn().mockReturnValue(res);
    res.setHeader = jest.fn().mockReturnValue(res);
    res.write = jest.fn().mockReturnValue(true);
    res.end = jest.fn().mockReturnValue(res);
    return res as unknown as {
      status: jest.Mock;
      json: jest.Mock;
      download: jest.Mock;
      setHeader: jest.Mock;
      write: jest.Mock;
      end: jest.Mock;
    };
  };

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-api-full-test-'));

    mockBridge = {
      submit: jest
        .fn<
          Promise<Record<string, unknown>>,
          [string, Record<string, unknown>?, string?]
        >()
        .mockResolvedValue({ ok: true }),
      webActor: jest
        .fn<string, [{ username?: string }?]>()
        .mockImplementation((u?: { username?: string }) => u?.username || ''),
    };

    mockLocale = {};
    mockConfig = {};
    mockUsers = {};

    mockMapGen = {
      getSchema: jest.fn().mockReturnValue({ type: 'object', properties: {} }),
      parseExchangeString: jest
        .fn()
        .mockReturnValue({ map_gen_settings: { seed: 123 } }),
      exportExchangeString: jest
        .fn()
        .mockReturnValue('>>>MAP_EXCHANGE_TEST<<<'),
      generatePreview: jest.fn().mockResolvedValue(Buffer.from('fake-png')),
    };

    controller = new ApiFullController(
      mockBridge as unknown as ApiBridgeService,
      mockLocale as unknown as LocaleService,
      mockConfig as unknown as FccConfigService,
      mockUsers as unknown as UsersService,
      mockMapGen as unknown as MapGenOpsService,
    );
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe('server and saves operations', () => {
    it('serverSave dispatches save_game with web_actor', async () => {
      const req = createMockReq('alice');
      await controller.serverSave(req);
      expect(mockBridge.submit).toHaveBeenCalledWith('save_game', {
        web_actor: 'alice',
      });
    });

    it('serverBackup dispatches backup with web_actor', async () => {
      const req = createMockReq('alice');
      await controller.serverBackup(req);
      expect(mockBridge.submit).toHaveBeenCalledWith('backup', {
        web_actor: 'alice',
      });
    });

    it('serverRestart dispatches restart_server with web_actor', async () => {
      const req = createMockReq('alice');
      await controller.serverRestart(req);
      expect(mockBridge.submit).toHaveBeenCalledWith('restart_server', {
        web_actor: 'alice',
      });
    });

    it('serverCreateSave dispatches create_save with payload and web_actor', async () => {
      const req = createMockReq('alice');
      await controller.serverCreateSave(req, {
        name: 'world1',
        mode: 'normal',
        seed: 42,
      });
      expect(mockBridge.submit).toHaveBeenCalledWith('create_save', {
        name: 'world1',
        mode: 'normal',
        preset: undefined,
        seed: 42,
        map_gen_settings: undefined,
        map_settings: undefined,
        map_exchange_string: undefined,
        web_actor: 'alice',
      });
    });

    it('saveDownload sends 404 if file does not exist', async () => {
      mockBridge.submit.mockResolvedValue({
        ok: true,
        path: '/non/existent/save.zip',
        name: 'save.zip',
      });
      const res = createMockRes();

      await controller.saveDownload('save1', res as unknown as Response);
      expect(res.status).toHaveBeenCalledWith(404);
      expect(res.json).toHaveBeenCalledWith({ ok: false, error: 'not_found' });
    });

    it('saveDownload downloads file when it exists', async () => {
      const testFile = path.join(tempDir, 'save1.zip');
      fs.writeFileSync(testFile, 'dummy content');
      mockBridge.submit.mockResolvedValue({
        ok: true,
        path: testFile,
        name: 'save1.zip',
      });
      const res = createMockRes();

      await controller.saveDownload('save1', res as unknown as Response);
      expect(res.download).toHaveBeenCalledWith(testFile, 'save1.zip');
    });

    it('saveInspect dispatches inspect_save with name and lang', async () => {
      const req = createMockReq('alice');
      await controller.saveInspect('my_save', req);
      expect(mockBridge.submit).toHaveBeenCalledWith('inspect_save', {
        name: 'my_save',
        ui_lang: 'en',
      });
    });

    it('saveRename dispatches rename_save with actor', async () => {
      const req = createMockReq('alice');
      await controller.saveRename('old_name', { new_name: 'new_name' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('rename_save', {
        name: 'old_name',
        new_name: 'new_name',
        actor: 'alice',
      });
    });

    it('saveDuplicate dispatches duplicate_save with actor', async () => {
      const req = createMockReq('alice');
      await controller.saveDuplicate('save1', req);
      expect(mockBridge.submit).toHaveBeenCalledWith('duplicate_save', {
        name: 'save1',
        actor: 'alice',
      });
    });

    it('saveTransfer dispatches transfer_save with actor', async () => {
      const req = createMockReq('alice');
      await controller.saveTransfer(
        'save1',
        { target_instance_id: 'inst-2', mode: 'copy' },
        req,
      );
      expect(mockBridge.submit).toHaveBeenCalledWith('transfer_save', {
        name: 'save1',
        target_instance_id: 'inst-2',
        mode: 'copy',
        target_name: '',
        overwrite: false,
        actor: 'alice',
      });
    });

    it('saveSetLaunch dispatches set_launch_save with actor', async () => {
      const req = createMockReq('alice');
      await controller.saveSetLaunch({ name: 'current_save.zip' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('set_launch_save', {
        name: 'current_save.zip',
        actor: 'alice',
      });
    });

    it('saveDelete dispatches delete_save with actor', async () => {
      const req = createMockReq('alice');
      await controller.saveDelete('old_save', req);
      expect(mockBridge.submit).toHaveBeenCalledWith('delete_save', {
        name: 'old_save',
        actor: 'alice',
      });
    });

    it('saveUpload handles multer file upload and cleanup', async () => {
      const req = createMockReq('alice');
      const fakeFile = {
        buffer: Buffer.from('PK\x03\x04'),
        originalname: 'uploaded.zip',
      } as Express.Multer.File;

      await controller.saveUpload(fakeFile, req, 'custom_name.zip');
      expect(mockBridge.submit).toHaveBeenCalledTimes(1);
      const call = mockBridge.submit.mock.calls[0];
      expect(call?.[0]).toBe('upload_save_archive');
      const payload = call?.[1];
      expect(payload?.name).toBe('custom_name.zip');
      expect(payload?.actor).toBe('alice');
      expect(typeof payload?.tmp_path).toBe('string');
    });

    it('serverSettingsExample dispatches create_server_settings_from_example', async () => {
      const req = createMockReq('alice');
      await controller.serverSettingsExample(req);
      expect(mockBridge.submit).toHaveBeenCalledWith(
        'create_server_settings_from_example',
        { actor: 'alice' },
      );
    });
  });

  describe('map generation endpoints', () => {
    it('mapGenSchema calls mapGen.getSchema()', () => {
      const res = controller.mapGenSchema();
      expect(mockMapGen.getSchema).toHaveBeenCalled();
      expect(res).toEqual({ type: 'object', properties: {} });
    });

    it('mapGenParseExchange calls mapGen.parseExchangeString()', () => {
      const res = controller.mapGenParseExchange({
        map_exchange_string: '>>>EXCHANGE<<<',
      });
      expect(mockMapGen.parseExchangeString).toHaveBeenCalledWith(
        '>>>EXCHANGE<<<',
      );
      expect(res).toEqual({ map_gen_settings: { seed: 123 } });
    });

    it('mapGenExportExchange calls mapGen.exportExchangeString()', () => {
      const res = controller.mapGenExportExchange({
        map_gen_settings: { seed: 42 },
        map_settings: null,
        space_age: true,
      });
      expect(mockMapGen.exportExchangeString).toHaveBeenCalledWith(
        { seed: 42 },
        null,
        true,
      );
      expect(res).toBe('>>>MAP_EXCHANGE_TEST<<<');
    });

    it('mapGenPreview returns generated preview data', async () => {
      const res = await controller.mapGenPreview({ seed: 555 });

      expect(mockMapGen.generatePreview).toHaveBeenCalledWith(
        {},
        555,
        undefined,
        undefined,
        { skipMapSettings: undefined, previewSize: undefined },
      );
      expect(res).toEqual(Buffer.from('fake-png'));
    });
  });

  describe('factorio update endpoints', () => {
    it('factorioCheck and factorioCheckAll dispatch update checks', async () => {
      await controller.factorioCheck();
      expect(mockBridge.submit).toHaveBeenCalledWith('factorio_update_check');

      await controller.factorioCheckAll();
      expect(mockBridge.submit).toHaveBeenCalledWith(
        'factorio_update_check_all',
      );
    });

    it('factorioReleases dispatches factorio_releases', async () => {
      await controller.factorioReleases();
      expect(mockBridge.submit).toHaveBeenCalledWith('factorio_releases');
    });

    it('factorioUpdate dispatches factorio_update with actor', async () => {
      const req = createMockReq('alice');
      await controller.factorioUpdate({ target_version: '2.0.20' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('factorio_update', {
        target_version: '2.0.20',
        actor: 'alice',
      });
    });

    it('factorioUpdateStatus and factorioUpdateStop dispatch update commands', async () => {
      await controller.factorioUpdateStatus();
      expect(mockBridge.submit).toHaveBeenCalledWith('factorio_update_status');

      await controller.factorioUpdateStop();
      expect(mockBridge.submit).toHaveBeenCalledWith('factorio_update_stop');
    });
  });

  describe('mods operations and portal', () => {
    it('modsCheckUpdates and modsCheckUpdatesStatus dispatch check operations', async () => {
      await controller.modsCheckUpdates({ force: true });
      expect(mockBridge.submit).toHaveBeenCalledWith(
        'mods_check_updates_start',
        { force: true },
      );

      await controller.modsCheckUpdatesStatus();
      expect(mockBridge.submit).toHaveBeenCalledWith(
        'mods_check_updates_status',
      );
    });

    it('modsToggle dispatches mods_set_enabled with actor', async () => {
      const req = createMockReq('alice');
      await controller.modsToggle({ name: 'flib', enabled: true }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('mods_set_enabled', {
        name: 'flib',
        enabled: true,
        actor: 'alice',
      });
    });

    it('modsToggleAll and modsDisableConflicts dispatch batch operations', async () => {
      const req = createMockReq('alice');
      await controller.modsToggleAll({ enabled: false }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('mods_set_all_enabled', {
        enabled: false,
        actor: 'alice',
      });

      await controller.modsDisableConflicts({ names: ['mod-a'] }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('mods_disable_conflicts', {
        names: ['mod-a'],
        actor: 'alice',
      });
    });

    it('modsVersion dispatches mods_set_version with actor', async () => {
      const req = createMockReq('alice');
      await controller.modsVersion(
        { name: 'space-age', version: '2.0.10' },
        req,
      );
      expect(mockBridge.submit).toHaveBeenCalledWith('mods_set_version', {
        name: 'space-age',
        version: '2.0.10',
        actor: 'alice',
      });
    });

    it('modsRemove dispatches mods_remove with actor', async () => {
      const req = createMockReq('alice');
      await controller.modsRemove({ name: 'old-mod' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('mods_remove', {
        name: 'old-mod',
        actor: 'alice',
      });
    });

    it('modsPortalReleases and modsInstallPlan dispatch portal operations', async () => {
      await controller.modsPortalReleases('rate-calculator');
      expect(mockBridge.submit).toHaveBeenCalledWith(
        'get_mod_portal_releases',
        { name: 'rate-calculator' },
      );

      await controller.modsInstallPlan({
        mod: 'rate-calculator',
        version: '3.0.0',
      });
      expect(mockBridge.submit).toHaveBeenCalledWith('mods_install_plan', {
        mod: 'rate-calculator',
        version: '3.0.0',
      });
    });

    it('modsJob endpoints dispatch job controls with actor', async () => {
      const req = createMockReq('alice');
      await controller.modsJobInstall({ plan: [] }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('mods_job_start', {
        mode: 'install',
        plan: [],
        actor: 'alice',
      });

      await controller.modsJobStatus();
      expect(mockBridge.submit).toHaveBeenCalledWith('mods_job_status');

      await controller.modsJobStop();
      expect(mockBridge.submit).toHaveBeenCalledWith('mods_job_stop');
    });
  });

  describe('moderation, bans, and whitelist', () => {
    it('bansSync, ban and unban dispatch ban operations', async () => {
      const req = createMockReq('alice');
      await controller.bansSync();
      expect(mockBridge.submit).toHaveBeenCalledWith('sync_bans');

      await controller.ban({ username: 'griefer', reason: 'griefing' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('ban_player', {
        username: 'griefer',
        reason: 'griefing',
        actor: 'alice',
      });

      await controller.unban({ username: 'griefer' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('unban_player', {
        username: 'griefer',
        actor: 'alice',
      });
    });

    it('moderation endpoints dispatch kick, mute, unmute, and purge', async () => {
      const req = createMockReq('alice');
      await controller.mute({ username: 'spammer' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('mute_player', {
        username: 'spammer',
        actor: 'alice',
      });

      await controller.unmute({ username: 'spammer' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('unmute_player', {
        username: 'spammer',
        actor: 'alice',
      });

      await controller.kick({ username: 'afk_player', reason: 'afk' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('kick_player', {
        username: 'afk_player',
        reason: 'afk',
        actor: 'alice',
      });

      await controller.purge({ username: 'spammer' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('purge_player', {
        username: 'spammer',
        actor: 'alice',
      });
    });

    it('whitelist endpoints dispatch add, remove, and clear', async () => {
      const req = createMockReq('alice');
      await controller.wlAdd({ username: 'trusted_player' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('whitelist_add', {
        username: 'trusted_player',
        actor: 'alice',
      });

      await controller.wlRemove({ username: 'untrusted_player' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('whitelist_remove', {
        username: 'untrusted_player',
        actor: 'alice',
      });

      await controller.wlClear(req);
      expect(mockBridge.submit).toHaveBeenCalledWith('whitelist_clear', {
        actor: 'alice',
      });
    });
  });

  describe('logs, chat, modpacks, and presets', () => {
    it('logsHistory and logsProgram dispatch log queries', async () => {
      await controller.logsHistory('100', 'inst-1', 'false');
      expect(mockBridge.submit).toHaveBeenCalledWith('log_file_history', {
        tail: 100,
        instance_id: 'inst-1',
        full: false,
      });

      await controller.logsProgram('web', '200', 'false');
      expect(mockBridge.submit).toHaveBeenCalledWith('program_log_history', {
        kind: 'web',
        tail: 200,
        full: false,
      });
    });

    it('chatLog and chatAnnouncement dispatch chat operations', async () => {
      await controller.chatLog('50');
      expect(mockBridge.submit).toHaveBeenCalledWith('chat_log_tail', {
        tail: 50,
      });

      await controller.chatAnnouncement({ message: 'Server reboot soon' });
      expect(mockBridge.submit).toHaveBeenCalledWith('chat_send_text', {
        message: 'Server reboot soon',
      });
    });

    it('modpacks endpoints dispatch CRUD and activation operations', async () => {
      const req = createMockReq('alice');
      await controller.modpacksList();
      expect(mockBridge.submit).toHaveBeenCalledWith('modpack_list');

      await controller.modpackGet('vanilla-plus', req);
      expect(mockBridge.submit).toHaveBeenCalledWith('modpack_get', {
        name: 'vanilla-plus',
        ui_lang: 'en',
      });

      await controller.modpackSave({ name: 'pack1' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('modpack_save_current', {
        name: 'pack1',
        actor: 'alice',
      });

      await controller.modpackActivate('pack1', {}, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('modpack_activate', {
        name: 'pack1',
        actor: 'alice',
      });

      await controller.modpackDelete('pack1', req);
      expect(mockBridge.submit).toHaveBeenCalledWith('modpack_delete', {
        name: 'pack1',
        actor: 'alice',
      });
    });

    it('mapPresets endpoints dispatch preset operations', async () => {
      await controller.mapPresetsList();
      expect(mockBridge.submit).toHaveBeenCalledWith('map_preset_list');

      await controller.mapPresetSave({ name: 'Deathworld' });
      expect(mockBridge.submit).toHaveBeenCalledWith('map_preset_save', {
        name: 'Deathworld',
        state: undefined,
      });

      await controller.mapPresetDelete('preset-1');
      expect(mockBridge.submit).toHaveBeenCalledWith('map_preset_delete', {
        id: 'preset-1',
      });
    });
  });

  describe('filesystem browser endpoints', () => {
    it('fsDirs returns directory listing for valid path', () => {
      const subDir = path.join(tempDir, 'subfolder');
      fs.mkdirSync(subDir);

      const res = controller.fsDirs(tempDir) as {
        ok: boolean;
        current: string;
        items: Array<{ name: string; path: string; isDir: boolean }>;
      };

      expect(res.ok).toBe(true);
      expect(res.items.some((it) => it.name === 'subfolder')).toBe(true);
    });

    it('fsPathInfo returns accurate inspection for existing and non-existing paths', () => {
      const nonExistent = controller.fsPathInfo(path.join(tempDir, 'missing'));
      expect(nonExistent).toEqual(
        expect.objectContaining({
          ok: true,
          exists: false,
          is_dir: false,
        }),
      );

      const existingDir = controller.fsPathInfo(tempDir);
      expect(existingDir).toEqual(
        expect.objectContaining({
          ok: true,
          exists: true,
          is_dir: true,
        }),
      );
    });

    it('fsMkdir creates valid subdirectory and validates errors', () => {
      const invalid = controller.fsMkdir({ path: tempDir, name: '..' });
      expect(invalid).toEqual({ ok: false, error: 'folder_name_invalid' });

      const created = controller.fsMkdir({ path: tempDir, name: 'new-folder' });
      expect(created).toEqual({
        ok: true,
        path: path.join(tempDir, 'new-folder'),
      });
      expect(fs.existsSync(path.join(tempDir, 'new-folder'))).toBe(true);

      const duplicate = controller.fsMkdir({
        path: tempDir,
        name: 'new-folder',
      });
      expect(duplicate).toEqual({ ok: false, error: 'folder_exists' });
    });
  });
});
