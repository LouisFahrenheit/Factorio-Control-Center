import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ConfigController } from './config.controller';
import { ApiBridgeService } from '../api-bridge.service';
import { FccConfigService } from '../../config/fcc-config.service';
import { InstancesService } from '../../instances/instances.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { AUTH_USER_KEY } from '../../auth/auth.guard';
import { SessionUser } from '../../common/types';

describe('ConfigController', () => {
  let controller: ConfigController;
  let mockBridge: {
    submit: jest.Mock<
      Promise<Record<string, unknown>>,
      [string, Record<string, unknown>?, string?]
    >;
    webActor: jest.Mock<string, [{ username?: string }?]>;
  };
  let mockConfig: {
    notifications: Record<string, unknown>;
    saveNotificationsKeys: jest.Mock;
  };
  let mockInstances: {
    getById: jest.Mock;
    update: jest.Mock;
  };
  let mockNotificationsService: {
    sendTest: jest.Mock;
    testWebhook: jest.Mock;
  };

  const createMockReq = (role = 'administrator', username = 'alice'): Request =>
    ({
      [AUTH_USER_KEY]: {
        username,
        role,
        tabs: ['config'],
        instance_ids: ['*'],
        enabled: true,
      } as SessionUser,
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

    mockConfig = {
      notifications: { telegram_enabled: true },
      saveNotificationsKeys: jest.fn().mockResolvedValue(undefined),
    };

    mockInstances = {
      getById: jest.fn().mockImplementation((id: string) => {
        if (id === 'inst-1') {
          return { id: 'inst-1', notifOverride: '{"telegram_chat_id":"123"}' };
        }
        return null;
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };

    mockNotificationsService = {
      sendTest: jest.fn().mockResolvedValue({ ok: true, sent: 1 }),
      testWebhook: jest.fn().mockResolvedValue({ ok: true }),
    };

    controller = new ConfigController(
      mockBridge as unknown as ApiBridgeService,
      mockConfig as unknown as FccConfigService,
      mockInstances as unknown as InstancesService,
      mockNotificationsService as unknown as NotificationsService,
    );
  });

  describe('program settings', () => {
    it('programConfig returns unfiltered settings for admin', async () => {
      mockBridge.submit.mockResolvedValue({
        port: 8080,
        global_username: 'superadmin',
        tls_enabled: true,
      });
      const req = createMockReq('administrator');

      const res = await controller.programConfig(req);
      expect(res).toEqual({
        port: 8080,
        global_username: 'superadmin',
        tls_enabled: true,
      });
    });

    it('programConfig filters sensitive settings for non-admin', async () => {
      mockBridge.submit.mockResolvedValue({
        port: 8080,
        global_username: 'superadmin',
        tls_enabled: true,
      });
      const req = createMockReq('moderator');

      const res = await controller.programConfig(req);
      expect(res).toEqual({ port: 8080 });
    });

    it('programFactorioCredentialsVerify throws if non-admin', () => {
      const req = createMockReq('user');
      expect(() => controller.programFactorioCredentialsVerify(req)).toThrow(
        ForbiddenException,
      );
    });

    it('programFactorioCredentialsVerify dispatches verify_factorio_credentials for admin', async () => {
      const req = createMockReq('administrator');
      await controller.programFactorioCredentialsVerify(req);
      expect(mockBridge.submit).toHaveBeenCalledWith(
        'verify_factorio_credentials',
      );
    });

    it('programConfigSet allows admin to save settings', async () => {
      const req = createMockReq('administrator', 'alice');
      await controller.programConfigSet(req, { port: 9000 });
      expect(mockBridge.submit).toHaveBeenCalledWith('set_program_settings', {
        port: 9000,
        web_actor: 'alice',
      });
    });

    it('programConfigSet forbids non-admin from modifying admin keys', () => {
      const req = createMockReq('user');
      expect(() =>
        controller.programConfigSet(req, { global_username: 'hacker' }),
      ).toThrow(ForbiddenException);
    });
  });

  describe('server settings', () => {
    it('serverConfigGet dispatches get_server_ini with instanceId', async () => {
      await controller.serverConfigGet('inst-1');
      expect(mockBridge.submit).toHaveBeenCalledWith(
        'get_server_ini',
        {},
        'inst-1',
      );
    });

    it('serverConfigSet dispatches set_server_ini with web_actor', async () => {
      const req = createMockReq('administrator', 'alice');
      await controller.serverConfigSet(
        { port: 34197, instance_id: 'inst-1' },
        req,
      );
      expect(mockBridge.submit).toHaveBeenCalledWith(
        'set_server_ini',
        {
          port: 34197,
          instance_id: 'inst-1',
          web_actor: 'alice',
        },
        'inst-1',
      );
    });
  });

  describe('notifications configuration', () => {
    it('getNotificationsConfig returns config for admin and forbids non-admin', () => {
      const adminReq = createMockReq('administrator');
      expect(controller.getNotificationsConfig(adminReq)).toEqual({
        ok: true,
        telegram_enabled: true,
      });

      const userReq = createMockReq('user');
      expect(() => controller.getNotificationsConfig(userReq)).toThrow(
        ForbiddenException,
      );
    });

    it('setNotificationsConfig saves allowed keys and skips masked tokens', async () => {
      const req = createMockReq('administrator');
      const res = await controller.setNotificationsConfig(req, {
        telegram_enabled: true,
        telegram_bot_token: '***',
        notif_server_started: true,
      });

      expect(res).toEqual({ ok: true });
      expect(mockConfig.saveNotificationsKeys).toHaveBeenCalledWith({
        telegram_enabled: true,
        notif_server_started: true,
      });
    });

    it('getInstanceNotifOverride returns override for valid instance', () => {
      const req = createMockReq('administrator');
      const res = controller.getInstanceNotifOverride(req, 'inst-1');
      expect(res).toEqual({
        ok: true,
        override: { telegram_chat_id: '123' },
      });
    });

    it('getInstanceNotifOverride throws NotFoundException for missing instance', () => {
      const req = createMockReq('administrator');
      expect(() =>
        controller.getInstanceNotifOverride(req, 'inst-404'),
      ).toThrow(NotFoundException);
    });

    it('setInstanceNotifOverride updates instance override', async () => {
      const req = createMockReq('administrator');
      const res = await controller.setInstanceNotifOverride(req, 'inst-1', {
        override: { silent: true },
      });

      expect(res).toEqual({ ok: true });
      expect(mockInstances.update).toHaveBeenCalledWith('inst-1', {
        notifOverride: JSON.stringify({ silent: true }),
      });
    });

    it('testNotifications and testWebhook dispatch to notifications service', async () => {
      const req = createMockReq('administrator');
      await controller.testNotifications(req, { instanceId: 'inst-1' });
      expect(mockNotificationsService.sendTest).toHaveBeenCalledWith('inst-1');

      await controller.testWebhook(req, {
        url: 'https://example.com/webhook',
        secret: 'sec',
        instanceId: 'inst-1',
      });
      expect(mockNotificationsService.testWebhook).toHaveBeenCalledWith(
        { url: 'https://example.com/webhook', secret: 'sec' },
        'inst-1',
      );
    });

    it('testWebhook validates required URL', async () => {
      const req = createMockReq('administrator');
      await expect(async () => {
        await controller.testWebhook(req, { url: '' });
      }).rejects.toThrow(BadRequestException);
    });
  });

  describe('web restart and tls', () => {
    it('webRestart dispatches restart_web_panel', async () => {
      await controller.webRestart();
      expect(mockBridge.submit).toHaveBeenCalledWith('restart_web_panel');
    });

    it('webTlsUpload rejects invalid kind', async () => {
      const res = await controller.webTlsUpload(
        {} as Express.Multer.File,
        'invalid',
      );
      expect(res).toEqual({ ok: false, error: 'tls_upload_invalid_kind' });
    });

    it('webTlsUpload rejects bad extension', async () => {
      const res = await controller.webTlsUpload(
        {
          originalname: 'cert.txt',
          buffer: Buffer.from(''),
        } as Express.Multer.File,
        'cert',
      );
      expect(res).toEqual({ ok: false, error: 'tls_upload_bad_extension' });
    });

    it('webTlsUpload processes file and dispatches upload_web_tls_file', async () => {
      const fakeFile = {
        originalname: 'server.crt',
        buffer: Buffer.from('CERT-DATA'),
      } as Express.Multer.File;

      const res = await controller.webTlsUpload(fakeFile, 'cert');
      expect(mockBridge.submit).toHaveBeenCalledTimes(1);
      const call = mockBridge.submit.mock.calls[0] as unknown as [
        string,
        { tmp_path: string; kind: string },
      ];
      expect(call[0]).toBe('upload_web_tls_file');
      expect(call[1].kind).toBe('cert');
      expect(call[1].tmp_path.includes('fcc-tls')).toBe(true);
      expect(res).toEqual({ ok: true });
    });
  });
});
