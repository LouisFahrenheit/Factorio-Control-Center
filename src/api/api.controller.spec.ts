import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { ApiController } from './api.controller';
import { ApiBridgeService } from './api-bridge.service';
import { LocaleService } from '../locale/locale.service';
import { FccConfigService, WebPanelIni } from '../config/fcc-config.service';
import { UsersService } from '../auth/users.service';
import { SessionService } from '../auth/session.service';
import { InstancesService } from '../instances/instances.service';
import { WebPanelEventLogService } from '../logging/web-panel-event-log.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AUTH_USER_KEY } from '../auth/auth.guard';
import { SessionUser } from '../common/types';
import { APP_VERSION } from '../constants/fcc.constants';

describe('ApiController', () => {
  let controller: ApiController;
  let mockBridge: Partial<Record<keyof ApiBridgeService, jest.Mock>>;
  let mockLocale: Partial<Record<keyof LocaleService, jest.Mock>>;
  let mockConfig: Partial<Record<keyof FccConfigService, unknown>>;
  let mockUsers: Partial<Record<keyof UsersService, jest.Mock>>;
  let mockSessions: Partial<Record<keyof SessionService, jest.Mock>>;
  let mockInstances: Partial<Record<keyof InstancesService, jest.Mock>>;
  let mockEventLog: Partial<Record<keyof WebPanelEventLogService, jest.Mock>>;
  let mockNotifications: Partial<Record<keyof NotificationsService, jest.Mock>>;

  const mockWebPanel: Partial<WebPanelIni> = {
    web_disable_effects: false,
    toast_duration_sec: 5,
    public_page_enabled: false,
    public_page_route: '/servers',
    public_page_title: 'Factorio Servers',
    public_page_subtitle: 'Public list',
    public_page_theme: '',
    public_page_hide_title: false,
    public_page_hide_subtitle: false,
    public_page_allow_mod_downloads: false,
    public_page_show_players: true,
    public_page_contact_link: '',
  };

  const createMockReq = (
    role: 'administrator' | 'moderator' | 'server_engineer' = 'administrator',
    headers: Record<string, string> = { authorization: 'Bearer token-123' },
  ): Request =>
    ({
      [AUTH_USER_KEY]: {
        username: 'alice',
        role,
        tabs: ['instances'],
        instance_ids: ['*'],
        enabled: true,
      } as SessionUser,
      headers,
    }) as unknown as Request;

  beforeEach(() => {
    mockBridge = {
      submit: jest.fn().mockResolvedValue({ ok: true, items: [] }),
      webActor: jest
        .fn()
        .mockImplementation((u?: SessionUser) =>
          u ? { type: 'web_panel_user', username: u.username } : undefined,
        ),
    };

    mockLocale = {
      getLocale: jest.fn().mockReturnValue({
        lang: 'en',
        strings: { welcome: 'Welcome' },
      }),
      listAvailableLanguages: jest.fn().mockReturnValue(['en', 'ru', 'uk']),
    };

    mockConfig = {
      webPanel: { ...mockWebPanel },
      sharedTheme: 'fcc_classic',
      langCode: 'en',
    };

    mockUsers = {
      hasAnyUser: jest.fn().mockResolvedValue(true),
    };

    mockSessions = {
      getSelectedInstanceId: jest.fn().mockReturnValue('inst-1'),
      setSelectedInstanceId: jest.fn(),
    };
    mockInstances = {
      getById: jest.fn().mockReturnValue({ id: 'inst-1', isPublic: true }),
    };
    mockEventLog = {
      logDispatchOp: jest.fn(),
    };
    mockNotifications = {};

    controller = new ApiController(
      mockBridge as unknown as ApiBridgeService,
      mockLocale as unknown as LocaleService,
      mockConfig as unknown as FccConfigService,
      mockUsers as unknown as UsersService,
      mockSessions as unknown as SessionService,
      mockInstances as unknown as InstancesService,
      mockEventLog as unknown as WebPanelEventLogService,
      mockNotifications as unknown as NotificationsService,
    );
  });

  describe('health', () => {
    it('returns panel health status and application version', () => {
      const res = controller.health();
      expect(res.ok).toBe(true);
      expect(res.version).toBe(APP_VERSION);
      expect(typeof res.host_os).toBe('string');
      expect(typeof res.is_docker).toBe('boolean');
      expect(Array.isArray(res.docker_volumes)).toBe(true);
    });
  });

  describe('localeBootstrap', () => {
    it('returns public locale and theme configurations', async () => {
      const res = await controller.localeBootstrap('en');

      expect(res.ok).toBe(true);
      expect(res.lang).toBe('en');
      expect(res.theme).toBe('fcc_classic');
      expect(res.needs_setup).toBe(false);
      expect(res.available_languages).toEqual(['en', 'ru', 'uk']);
      expect(res.public_page_route).toBe('/servers');
    });

    it('sets needs_setup to true when no users exist', async () => {
      mockUsers.hasAnyUser?.mockResolvedValue(false);
      const res = await controller.localeBootstrap();
      expect(res.needs_setup).toBe(true);
    });
  });

  describe('status', () => {
    it('submits status command to api bridge', async () => {
      mockBridge.submit?.mockResolvedValue({ ok: true, status: 'running' });
      const res = await controller.status();

      expect(mockBridge.submit).toHaveBeenCalledWith('status');
      expect(res).toEqual({ ok: true, status: 'running' });
    });
  });

  describe('publicServers', () => {
    it('throws ForbiddenException when public_page_enabled is false', async () => {
      (mockConfig.webPanel as WebPanelIni).public_page_enabled = false;

      await expect(controller.publicServers()).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('returns formatted public servers when public_page_enabled is true', async () => {
      (mockConfig.webPanel as WebPanelIni).public_page_enabled = true;
      mockBridge.submit?.mockResolvedValue({
        ok: true,
        items: [
          {
            id: 'inst-1',
            name: 'Public Server 1',
            isPublic: true,
            onlinePlayers: ['player1'],
          },
          {
            id: 'inst-2',
            name: 'Private Server 2',
            isPublic: false,
          },
        ],
      });

      const res = await controller.publicServers('en');
      expect(res.ok).toBe(true);
      expect(res.items).toHaveLength(1);
      expect(res.items[0].id).toBe('inst-1');
    });
  });

  describe('program settings filtering and sanitizing', () => {
    it('strips sensitive and admin-only keys for non-admin users', () => {
      const data = {
        server_name: 'My Server',
        global_username: 'superadmin',
        global_token: 'secret-token',
        tls_enabled: true,
        log_rotation_max_mb: 50,
      };

      // Calling internal private helper via any-cast for unit test verification
      const filterFn = (
        controller as unknown as {
          filterProgramSettingsForUser: (
            d: Record<string, unknown>,
            a: boolean,
          ) => Record<string, unknown>;
        }
      ).filterProgramSettingsForUser;

      const nonAdminFiltered = filterFn.call(controller, data, false);
      expect(nonAdminFiltered.server_name).toBe('My Server');
      expect(nonAdminFiltered.global_username).toBeUndefined();
      expect(nonAdminFiltered.global_token).toBeUndefined();
      expect(nonAdminFiltered.tls_enabled).toBeUndefined();
      expect(nonAdminFiltered.log_rotation_max_mb).toBeUndefined();

      const adminFiltered = filterFn.call(controller, data, true);
      expect(adminFiltered.global_username).toBe('superadmin');
      expect(adminFiltered.tls_enabled).toBe(true);
    });

    it('rejects forbidden settings updates from non-admin users', () => {
      const sanitizeFn = (
        controller as unknown as {
          sanitizeProgramSettingsPayload: (
            b: Record<string, unknown>,
            a: boolean,
          ) => Record<string, unknown>;
        }
      ).sanitizeProgramSettingsPayload;

      expect(() => {
        sanitizeFn.call(controller, { global_token: 'hacked' }, false);
      }).toThrow(ForbiddenException);

      expect(() => {
        sanitizeFn.call(controller, { tls_enabled: true }, false);
      }).toThrow(ForbiddenException);

      expect(() => {
        sanitizeFn.call(controller, { log_rotation_max_mb: 100 }, false);
      }).toThrow(ForbiddenException);

      const allowed = sanitizeFn.call(
        controller,
        { server_name: 'Safe' },
        false,
      );
      expect(allowed.server_name).toBe('Safe');
    });
  });

  describe('instances operations', () => {
    it('instancesList filters items based on user instance permissions and returns selectedId', async () => {
      mockBridge.submit?.mockResolvedValue({
        ok: true,
        items: [
          { id: 'inst-1', name: 'Server 1' },
          { id: 'inst-2', name: 'Server 2' },
        ],
      });

      const req = createMockReq('administrator');
      const res = await controller.instancesList(req);
      expect(res.items).toHaveLength(2);
      expect(res.selectedId).toBe('inst-1');
    });

    it('instancesAdd dispatches instances_add command with actor', async () => {
      const req = createMockReq();
      await controller.instancesAdd({ name: 'New Instance' }, req);

      expect(mockBridge.submit).toHaveBeenCalledWith('instances_add', {
        name: 'New Instance',
        web_actor: { type: 'web_panel_user', username: 'alice' },
      });
    });

    it('instancesUpdate dispatches instances_update command with actor and id', async () => {
      const req = createMockReq();
      await controller.instancesUpdate('inst-1', { port: 34198 }, req);

      expect(mockBridge.submit).toHaveBeenCalledWith('instances_update', {
        id: 'inst-1',
        port: 34198,
        web_actor: { type: 'web_panel_user', username: 'alice' },
      });
    });

    it('instancesRemove handles boolean query conversion correctly', async () => {
      const req = createMockReq();
      await controller.instancesRemove('inst-1', req, '1', 'true');

      expect(mockBridge.submit).toHaveBeenCalledWith('instances_remove', {
        id: 'inst-1',
        deleteFromDisk: true,
        deleteData: true,
        web_actor: { type: 'web_panel_user', username: 'alice' },
      });
    });
  });

  describe('server lifecycle and commands', () => {
    it('serverStart dispatches start_server command', async () => {
      const req = createMockReq();
      await controller.serverStart(req, { instance_id: 'inst-1' });

      expect(mockBridge.submit).toHaveBeenCalledWith(
        'start_server',
        { web_actor: { type: 'web_panel_user', username: 'alice' } },
        'inst-1',
      );
    });

    it('serverStop dispatches stop_server command', async () => {
      const req = createMockReq();
      await controller.serverStop(req, { instance_id: 'inst-1' });

      expect(mockBridge.submit).toHaveBeenCalledWith(
        'stop_server',
        { web_actor: { type: 'web_panel_user', username: 'alice' } },
        'inst-1',
      );
    });

    it('serverRestart dispatches restart_server command', async () => {
      const req = createMockReq();
      await controller.serverRestart(req, { instance_id: 'inst-1' });

      expect(mockBridge.submit).toHaveBeenCalledWith(
        'restart_server',
        { web_actor: { type: 'web_panel_user', username: 'alice' } },
        'inst-1',
      );
    });

    it('serverKill dispatches kill_server command', async () => {
      const req = createMockReq();
      await controller.serverKill(req, { instance_id: 'inst-1' });

      expect(mockBridge.submit).toHaveBeenCalledWith(
        'kill_server',
        { web_actor: { type: 'web_panel_user', username: 'alice' } },
        'inst-1',
      );
    });

    it('rcon dispatches rcon_exec command with payload', async () => {
      const req = createMockReq();
      await controller.rcon(req, { command: '/help', source: 'console' });

      expect(mockBridge.submit).toHaveBeenCalledWith('rcon_exec', {
        command: '/help',
        source: 'console',
        command_id: undefined,
        command_name: undefined,
        web_actor: { type: 'web_panel_user', username: 'alice' },
      });
    });

    it('logs submits log_tail with parsed integer tail count', async () => {
      await controller.logs('250', 'inst-1');

      expect(mockBridge.submit).toHaveBeenCalledWith('log_tail', {
        tail: 250,
        instance_id: 'inst-1',
      });
    });
  });

  describe('configuration endpoints', () => {
    it('programConfig returns filtered settings for non-admin user', async () => {
      mockBridge.submit?.mockResolvedValue({
        server_name: 'Factorio Server',
        global_username: 'superadmin',
        tls_enabled: true,
      });

      const nonAdminReq = createMockReq('moderator');
      const res = await controller.programConfig(nonAdminReq);

      expect(res.server_name).toBe('Factorio Server');
      expect(res.global_username).toBeUndefined();
      expect(res.tls_enabled).toBeUndefined();
    });

    it('programFactorioCredentialsVerify succeeds for admin and throws for non-admin', async () => {
      const adminReq = createMockReq('administrator');
      await controller.programFactorioCredentialsVerify(adminReq);
      expect(mockBridge.submit).toHaveBeenCalledWith(
        'verify_factorio_credentials',
      );

      const nonAdminReq = createMockReq('moderator');
      await expect(
        controller.programFactorioCredentialsVerify(nonAdminReq),
      ).rejects.toThrow(ForbiddenException);
    });

    it('programConfigSet sanitizes payload and passes web actor', async () => {
      const adminReq = createMockReq('administrator');
      await controller.programConfigSet(adminReq, { server_name: 'Updated' });

      expect(mockBridge.submit).toHaveBeenCalledWith('set_program_settings', {
        server_name: 'Updated',
        web_actor: { type: 'web_panel_user', username: 'alice' },
      });
    });

    it('serverConfigGet and serverConfigSet dispatch server.ini commands', async () => {
      await controller.serverConfigGet('inst-1');
      expect(mockBridge.submit).toHaveBeenCalledWith(
        'get_server_ini',
        {},
        'inst-1',
      );

      const req = createMockReq();
      await controller.serverConfigSet(
        { port: 34197, instance_id: 'inst-1' },
        req,
      );
      expect(mockBridge.submit).toHaveBeenCalledWith(
        'set_server_ini',
        {
          port: 34197,
          instance_id: 'inst-1',
          web_actor: { type: 'web_panel_user', username: 'alice' },
        },
        'inst-1',
      );
    });
  });

  describe('file and management endpoints', () => {
    it('saves dispatches list_saves with instanceId', async () => {
      await controller.saves('inst-1');
      expect(mockBridge.submit).toHaveBeenCalledWith(
        'list_saves',
        {},
        'inst-1',
      );
    });

    it('serverSettings and serverSettingsWrite dispatch read and write commands', async () => {
      await controller.serverSettings();
      expect(mockBridge.submit).toHaveBeenCalledWith('read_server_settings');

      const req = createMockReq();
      await controller.serverSettingsWrite({ name: 'Factorio Server' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('write_server_settings', {
        data: { name: 'Factorio Server' },
        actor: { type: 'web_panel_user', username: 'alice' },
      });
    });

    it('modList and modListWrite dispatch read and write commands', async () => {
      await controller.modList();
      expect(mockBridge.submit).toHaveBeenCalledWith('read_mod_list');

      const req = createMockReq();
      await controller.modListWrite({ mods: [] }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('write_mod_list', {
        data: { mods: [] },
        actor: { type: 'web_panel_user', username: 'alice' },
      });
    });

    it('adminList and banList dispatch read commands', async () => {
      await controller.adminList();
      expect(mockBridge.submit).toHaveBeenCalledWith('read_admin_list');

      await controller.banList();
      expect(mockBridge.submit).toHaveBeenCalledWith('read_ban_list');
    });

    it('mods passes x-fcc-ui-lang from header to bridge', async () => {
      const req = createMockReq('administrator', { 'x-fcc-ui-lang': 'ru' });
      await controller.mods(req);
      expect(mockBridge.submit).toHaveBeenCalledWith('mods_list', {
        ui_lang: 'ru',
      });
    });

    it('playersSummary dispatches players_summary command', async () => {
      await controller.playersSummary();
      expect(mockBridge.submit).toHaveBeenCalledWith('players_summary');
    });

    it('maintenanceGet and maintenanceSet dispatch maintenance commands', async () => {
      await controller.maintenanceGet();
      expect(mockBridge.submit).toHaveBeenCalledWith('maintenance_get');

      await controller.maintenanceSet({ enabled: true, cron: '0 4 * * *' });
      expect(mockBridge.submit).toHaveBeenCalledWith('maintenance_set', {
        enabled: true,
        cron: '0 4 * * *',
      });
    });
  });
});
