import { InstanceHistoryService } from './instance-history.service';
import { InstancesService } from '../instances/instances.service';
import * as fs from 'fs';
import * as jsonStore from '../common/json-store';

jest.mock('fs', () => ({
  ...jest.requireActual<Record<string, unknown>>('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

jest.mock('../common/json-store', () => ({
  writeJsonFile: jest.fn(),
}));

describe('InstanceHistoryService', () => {
  let service: InstanceHistoryService;
  let mockInstances: {
    getSelected: jest.Mock;
  };

  const mockFs = jest.mocked(fs);
  const mockJsonStore = jest.mocked(jsonStore);

  beforeEach(() => {
    jest.clearAllMocks();

    mockInstances = {
      getSelected: jest.fn().mockReturnValue({
        id: 'inst-1',
        name: 'Instance 1',
        serverPath: '/factorio/server1',
      }),
    };

    mockFs.existsSync.mockReturnValue(false);

    service = new InstanceHistoryService(
      mockInstances as unknown as InstancesService,
    );
  });

  describe('tail methods', () => {
    it('tailServer returns empty array if file missing or corrupted', () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(service.tailServer('/factorio/server1')).toEqual([]);

      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readFileSync as unknown as jest.Mock).mockReturnValue(
        '{bad-json',
      );
      expect(service.tailServer('/factorio/server1')).toEqual([]);
    });

    it('tailServer, tailMods, tailCommands read and reverse last events', () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readFileSync as unknown as jest.Mock).mockReturnValue(
        JSON.stringify({
          server_history: [
            { action: 'start', date: '2026-10-30T10:00:00Z' },
            { action: 'stop', date: '2026-10-30T11:00:00Z' },
          ],
          mods_history: [{ action: 'install', date: '2026-10-30T10:30:00Z' }],
          commands_history: [
            { action: 'execute', date: '2026-10-30T10:45:00Z' },
          ],
        }),
      );

      const serverTail = service.tailServer('/factorio/server1');
      expect(serverTail).toHaveLength(2);
      expect(serverTail[0].action).toBe('stop');
      expect(serverTail[1].action).toBe('start');

      const modsTail = service.tailMods('/factorio/server1');
      expect(modsTail).toHaveLength(1);
      expect(modsTail[0].action).toBe('install');

      const cmdTail = service.tailCommands('/factorio/server1');
      expect(cmdTail).toHaveLength(1);
      expect(cmdTail[0].action).toBe('execute');
    });
  });

  describe('recordInGameCommand() and recordStartupError()', () => {
    it('recordInGameCommand appends commands_history event', () => {
      service.recordInGameCommand(
        '/factorio/server1',
        'player1',
        '/help',
        true,
      );

      expect(mockJsonStore.writeJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('server-history.json'),
        expect.objectContaining({
          commands_history: [
            expect.objectContaining({
              action: 'execute',
              actor: 'player1',
              target: '/help',
              success: true,
              detail: { source: 'in_game' },
            }),
          ],
        }),
      );
    });

    it('recordStartupError appends startup_error to server_history', () => {
      service.recordStartupError('/factorio/server1', {
        exit_code: 1,
        missing_deps: ['flib'],
      });

      expect(mockJsonStore.writeJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('server-history.json'),
        expect.objectContaining({
          server_history: [
            expect.objectContaining({
              action: 'startup_error',
              actor: 'system',
              success: false,
              detail: { exit_code: 1, missing_deps: ['flib'] },
            }),
          ],
        }),
      );
    });
  });

  describe('recordFactorioUpdate()', () => {
    it('ignores empty serverPath', () => {
      service.recordFactorioUpdate('', 'admin', true, {});
      expect(mockJsonStore.writeJsonFile).not.toHaveBeenCalled();
    });

    it('records version update changes and partial flag', () => {
      service.recordFactorioUpdate('/factorio/server1', 'admin', true, {
        from: '2.0.10',
        to: '2.0.15',
        partial: true,
      });

      expect(mockJsonStore.writeJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('server-history.json'),
        expect.objectContaining({
          server_history: [
            expect.objectContaining({
              action: 'update',
              actor: 'admin',
              success: true,
              changes: [{ key: 'version', from: '2.0.10', to: '2.0.15' }],
              detail: { partial: true },
            }),
          ],
        }),
      );
    });
  });

  describe('recordModsJob()', () => {
    it('skips idle or preparing phases', () => {
      service.recordModsJob(
        'install',
        { actor: 'admin' },
        { installed: [], updated: [], failed: [], phase: 'preparing' },
      );
      service.recordModsJob(
        'install',
        { actor: 'admin' },
        { installed: [], updated: [], failed: [], phase: 'idle' },
      );
      expect(mockJsonStore.writeJsonFile).not.toHaveBeenCalled();
    });

    it('records completed mods job for updates, imports, and installs', () => {
      service.recordModsJob(
        'update_all',
        { actor: 'admin' },
        {
          installed: ['mod-a'],
          updated: ['mod-b'],
          failed: [],
          phase: 'done',
        },
      );

      expect(mockJsonStore.writeJsonFile).toHaveBeenCalledWith(
        expect.stringContaining('server-history.json'),
        expect.objectContaining({
          mods_history: [
            expect.objectContaining({
              action: 'update',
              actor: 'admin',
              success: true,
              detail: {
                mode: 'update_all',
                installed: ['mod-a'],
                updated: ['mod-b'],
                failed: [],
              },
            }),
          ],
        }),
      );

      // Test import_modpack mode
      service.recordModsJob(
        'import_modpack',
        { actor: 'admin', modpack_name: 'SpacePack' },
        {
          installed: ['space-age'],
          updated: [],
          failed: [],
          phase: 'done',
        },
      );

      const lastCall = mockJsonStore.writeJsonFile.mock.calls.slice(-1)[0];
      const doc = lastCall[1] as {
        mods_history: { action: string; target: string }[];
      };
      expect(
        doc.mods_history.some(
          (x) => x.action === 'modpack_import' && x.target === 'SpacePack',
        ),
      ).toBe(true);
    });
  });

  describe('recordFromDispatch()', () => {
    it('does nothing if no selected instance', () => {
      mockInstances.getSelected.mockReturnValue(null);
      service.recordFromDispatch('start_server', {}, { ok: true });
      expect(mockJsonStore.writeJsonFile).not.toHaveBeenCalled();
    });

    it('records server lifecycle ops (start, stop, restart, kill, save, backup)', () => {
      const ops = [
        ['start_server', 'start'],
        ['stop_server', 'stop'],
        ['restart_server', 'restart'],
        ['kill_server', 'kill'],
        ['save_game', 'save'],
        ['backup', 'backup'],
        ['create_server_settings_from_example', 'settings_reset'],
      ] as const;

      for (const [op, expectedAction] of ops) {
        service.recordFromDispatch(op, { actor: 'alice' }, { ok: true });
        const lastCall = mockJsonStore.writeJsonFile.mock.calls.slice(-1)[0];
        const doc = lastCall[1] as {
          server_history: {
            action: string;
            actor: string;
            success: boolean;
          }[];
        };
        expect(
          doc.server_history.some(
            (x) =>
              x.action === expectedAction &&
              x.actor === 'alice' &&
              x.success === true,
          ),
        ).toBe(true);
      }
    });

    it('records server settings and save file management ops', () => {
      // set_server_ini
      service.recordFromDispatch(
        'set_server_ini',
        { actor: 'bob' },
        {
          ok: true,
          settings_changes: [{ key: 'port', from: '34197', to: '34198' }],
        },
      );

      // create_save
      service.recordFromDispatch(
        'create_save',
        { name: 'new_save' },
        { ok: true },
      );

      // delete_save
      service.recordFromDispatch(
        'delete_save',
        { name: 'old_save' },
        { ok: true },
      );

      // duplicate_save
      service.recordFromDispatch(
        'duplicate_save',
        { name: 'save_1' },
        { ok: true, name: 'save_1_copy' },
      );

      // rename_save
      service.recordFromDispatch(
        'rename_save',
        { name: 'save_a', new_name: 'save_b' },
        { ok: true },
      );

      // upload_save_archive
      service.recordFromDispatch(
        'upload_save_archive',
        { name: 'uploaded.zip' },
        { ok: true },
      );

      expect(mockJsonStore.writeJsonFile).toHaveBeenCalled();
    });

    it('records commands ops (rcon_exec, write_commands_catalog)', () => {
      // rcon_exec
      service.recordFromDispatch(
        'rcon_exec',
        { command: '/time', source: 'web_panel', command_name: 'Check Time' },
        { ok: true, output: 'Current time is noon' },
      );

      // write_commands_catalog
      service.recordFromDispatch(
        'write_commands_catalog',
        { actor: 'admin' },
        {
          ok: true,
          catalog_changes: [
            {
              action: 'command_created',
              target: 'Restart Alert',
              detail: { line: '/alert restart' },
            },
          ],
        },
      );

      expect(mockJsonStore.writeJsonFile).toHaveBeenCalled();
    });

    it('records mods operations (install, remove, enable, disable, modpack)', () => {
      // upload_mod_archive
      service.recordFromDispatch(
        'upload_mod_archive',
        { name: 'flib' },
        { ok: true },
      );

      // mods_remove
      service.recordFromDispatch(
        'mods_remove',
        { name: 'flib', scope: 'zip', version: '0.1.0' },
        { ok: true },
      );

      // mods_set_enabled
      service.recordFromDispatch(
        'mods_set_enabled',
        { name: 'flib', enabled: true },
        { ok: true },
      );
      service.recordFromDispatch(
        'mods_set_enabled',
        { name: 'flib', enabled: false },
        { ok: true },
      );

      // mods_set_all_enabled
      service.recordFromDispatch(
        'mods_set_all_enabled',
        { enabled: true },
        { ok: true, changed: 5 },
      );

      // mods_set_version
      service.recordFromDispatch(
        'mods_set_version',
        { name: 'flib', version: '0.2.0' },
        { ok: true },
      );

      // modpack operations
      service.recordFromDispatch(
        'modpack_activate',
        { name: 'Pack1' },
        { ok: true },
      );
      service.recordFromDispatch(
        'modpack_save_current',
        { name: 'Pack2' },
        { ok: true },
      );
      service.recordFromDispatch(
        'modpack_delete',
        { name: 'Pack1' },
        { ok: true },
      );
      service.recordFromDispatch('modpack_reset', {}, { ok: true });
      service.recordFromDispatch(
        'modpack_import_upload',
        { name: 'PackImport' },
        { ok: true },
      );
      service.recordFromDispatch(
        'modpack_rename',
        { old: 'OldName', new: 'NewName' },
        { ok: true },
      );

      // set_program_settings symlink pref
      service.recordFromDispatch(
        'set_program_settings',
        { modpack_activate_use_symlinks: true },
        { ok: true },
      );

      // upload_mod_settings_dat
      service.recordFromDispatch('upload_mod_settings_dat', {}, { ok: true });

      expect(mockJsonStore.writeJsonFile).toHaveBeenCalled();
    });
  });
});
