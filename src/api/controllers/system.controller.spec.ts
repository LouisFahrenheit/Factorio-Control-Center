import type { Request, Response } from 'express';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { SystemController } from './system.controller';
import { ApiBridgeService } from '../api-bridge.service';
import { LocaleService } from '../../locale/locale.service';
import { FccConfigService } from '../../config/fcc-config.service';
import { UsersService } from '../../auth/users.service';
import { InstancesService } from '../../instances/instances.service';
import { AUTH_USER_KEY } from '../../auth/auth.guard';
import { SessionUser } from '../../common/types';

describe('SystemController', () => {
  let controller: SystemController;
  let mockBridge: {
    submit: jest.Mock<
      Promise<Record<string, unknown>>,
      [string, Record<string, unknown>?, string?]
    >;
    webActor: jest.Mock<string, [{ username?: string }?]>;
  };
  let mockLocale: {
    getLocale: jest.Mock;
    listAvailableLanguages: jest.Mock;
  };
  let mockConfig: {
    sharedTheme: string;
    langCode: string;
    webPanel: {
      web_disable_effects?: boolean;
      toast_duration_sec?: number;
      public_page_enabled?: boolean;
      public_page_route?: string;
      public_page_title?: string;
      public_page_subtitle?: string;
      public_page_theme?: string;
      public_page_hide_title?: boolean;
      public_page_hide_subtitle?: boolean;
      public_page_allow_mod_downloads?: boolean;
      public_page_show_players?: boolean;
      public_page_contact_link?: string;
      public_host?: string;
    };
  };
  let mockUsers: {
    hasAnyUser: jest.Mock;
  };
  let mockInstances: {
    getById: jest.Mock;
    withInstance: jest.Mock;
  };

  const createMockReq = (
    username = 'alice',
    headers: Record<string, string> = { 'x-fcc-ui-lang': 'en' },
    ip = '127.0.0.1',
  ): Request =>
    ({
      [AUTH_USER_KEY]: {
        username,
        role: 'administrator',
        tabs: ['instances'],
        instance_ids: ['*'],
        enabled: true,
      } as SessionUser,
      headers,
      ip,
      socket: { remoteAddress: ip },
    }) as unknown as Request;

  beforeEach(() => {
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

    mockLocale = {
      getLocale: jest.fn().mockReturnValue({ lang: 'en', strings: {} }),
      listAvailableLanguages: jest.fn().mockReturnValue(['en', 'ru']),
    };

    mockConfig = {
      sharedTheme: 'dark',
      langCode: 'en',
      webPanel: {
        web_disable_effects: false,
        toast_duration_sec: 5,
        public_page_enabled: true,
        public_page_route: '/public',
        public_page_title: 'Factorio Public Servers',
        public_page_subtitle: 'Welcome',
        public_page_theme: 'dark',
        public_page_hide_title: false,
        public_page_hide_subtitle: false,
        public_page_allow_mod_downloads: true,
        public_page_show_players: true,
        public_page_contact_link: 'https://example.com',
        public_host: '1.2.3.4',
      },
    };

    mockUsers = {
      hasAnyUser: jest.fn().mockResolvedValue(true),
    };

    mockInstances = {
      getById: jest.fn(),
      withInstance: jest
        .fn()
        .mockImplementation((_id, fn: () => unknown) => fn()),
    };

    controller = new SystemController(
      mockBridge as unknown as ApiBridgeService,
      mockLocale as unknown as LocaleService,
      mockConfig as unknown as FccConfigService,
      mockUsers as unknown as UsersService,
      mockInstances as unknown as InstancesService,
    );
  });

  describe('health and bootstrap', () => {
    it('health returns platform and version payload', () => {
      const res = controller.health();
      expect(res.ok).toBe(true);
      expect(typeof res.version).toBe('string');
      expect(typeof res.host_os).toBe('string');
    });

    it('localeBootstrap returns bootstrap configuration', async () => {
      const res = await controller.localeBootstrap('ru');
      expect(res.ok).toBe(true);
      expect(res.lang).toBe('en');
      expect(res.needs_setup).toBe(false);
      expect(mockLocale.getLocale).toHaveBeenCalledWith('ru');
    });

    it('getLocale returns locale strings', () => {
      const res = controller.getLocale('en');
      expect(res).toEqual({ lang: 'en', strings: {} });
    });

    it('status dispatches status command', async () => {
      await controller.status();
      expect(mockBridge.submit).toHaveBeenCalledWith('status');
    });
  });

  describe('public servers and mod downloads', () => {
    it('publicServers throws ForbiddenException when public page is disabled', async () => {
      mockConfig.webPanel.public_page_enabled = false;
      await expect(controller.publicServers('en')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('publicServers returns filtered public instances', async () => {
      mockBridge.submit.mockResolvedValueOnce({
        ok: true,
        items: [
          { id: 'inst-1', isPublic: true, name: 'Public Server 1' },
          { id: 'inst-2', isPublic: false, name: 'Private Server' },
        ],
      });

      const res = await controller.publicServers('en');
      expect(res.ok).toBe(true);
      expect(res.items).toHaveLength(1);
      expect(res.items[0].id).toBe('inst-1');
    });

    it('downloadInstanceModsPublic throws ForbiddenException when public downloads disabled', async () => {
      mockConfig.webPanel.public_page_allow_mod_downloads = false;
      const req = createMockReq('alice');
      const res = {} as Response;
      await expect(
        controller.downloadInstanceModsPublic('inst-1', res, req),
      ).rejects.toThrow(ForbiddenException);
    });

    it('downloadInstanceModsPublic throws NotFoundException when server not public', async () => {
      mockInstances.getById.mockReturnValue(null);
      const req = createMockReq('alice');
      const res = {} as Response;
      await expect(
        controller.downloadInstanceModsPublic('inst-1', res, req),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('announcements and chat', () => {
    it('serverSettings and serverSettingsWrite dispatch settings commands', async () => {
      await controller.serverSettings();
      expect(mockBridge.submit).toHaveBeenCalledWith('read_server_settings');

      const req = createMockReq('alice');
      await controller.serverSettingsWrite({ name: 'my-server' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('write_server_settings', {
        data: { name: 'my-server' },
        actor: 'alice',
      });
    });

    it('announcements and announcementsWrite dispatch read/write commands', async () => {
      await controller.announcements();
      expect(mockBridge.submit).toHaveBeenCalledWith('announcements_read');

      await controller.announcementsWrite({ data: 'Maintenance soon' });
      expect(mockBridge.submit).toHaveBeenCalledWith('announcements_write', {
        data: 'Maintenance soon',
      });
    });

    it('chatSend validates empty message and dispatches', async () => {
      expect(() => controller.chatSend({ message: '   ' })).toThrow(
        BadRequestException,
      );

      await controller.chatSend({ message: 'Hello server' });
      expect(mockBridge.submit).toHaveBeenCalledWith('chat_send_text', {
        message: 'Hello server',
      });
    });

    it('chatAnnouncement dispatches chat_send_text', async () => {
      await controller.chatAnnouncement({ message: 'Announcement' });
      expect(mockBridge.submit).toHaveBeenCalledWith('chat_send_text', {
        message: 'Announcement',
      });
    });

    it('chatLog dispatches chat_log_tail with parsed tail', async () => {
      await controller.chatLog('100');
      expect(mockBridge.submit).toHaveBeenCalledWith('chat_log_tail', {
        tail: 100,
      });
    });
  });

  describe('commands catalog', () => {
    it('commandsCatalog and commandsPut dispatch catalog operations with ui_lang', async () => {
      const req = createMockReq('alice', { 'x-fcc-ui-lang': 'ru' });

      await controller.commandsCatalog(req);
      expect(mockBridge.submit).toHaveBeenCalledWith('read_commands_catalog', {
        ui_lang: 'ru',
      });

      await controller.commandsPut({ commands: [] }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('write_commands_catalog', {
        data: { commands: [] },
        ui_lang: 'ru',
        web_actor: 'alice',
      });
    });
  });

  describe('factorio update endpoints', () => {
    it('factorioCheck and factorioCheckAll dispatch checks', async () => {
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
      await controller.factorioUpdate({ target_version: '2.0.25' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('factorio_update', {
        target_version: '2.0.25',
        actor: 'alice',
      });
    });

    it('factorioUpdateStatus and factorioUpdateStop dispatch controls', async () => {
      await controller.factorioUpdateStatus();
      expect(mockBridge.submit).toHaveBeenCalledWith('factorio_update_status');

      await controller.factorioUpdateStop();
      expect(mockBridge.submit).toHaveBeenCalledWith('factorio_update_stop');
    });
  });
});
