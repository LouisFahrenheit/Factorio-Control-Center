import { ServerOpsController } from './server-ops.controller';
import { ApiBridgeService } from '../api-bridge.service';
import { AUTH_USER_KEY } from '../../auth/auth.guard';
import { SessionUser } from '../../common/types';
import type { Request } from 'express';

describe('ServerOpsController', () => {
  let controller: ServerOpsController;
  let bridge: {
    submit: jest.Mock;
    webActor: jest.Mock;
  };

  const dummyUser: SessionUser = {
    username: 'admin',
    role: 'administrator',
    tabs: ['instances'],
    instance_ids: ['*'],
    enabled: true,
  };

  const mockRequest = (user: SessionUser = dummyUser): Request =>
    ({
      [AUTH_USER_KEY]: user,
    }) as unknown as Request;

  beforeEach(() => {
    bridge = {
      submit: jest.fn().mockResolvedValue({ ok: true }),
      webActor: jest.fn().mockReturnValue('web:admin'),
    };

    controller = new ServerOpsController(bridge as unknown as ApiBridgeService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('serverStart', () => {
    it('dispatches start_server with web_actor and instance_id', async () => {
      const res = await controller.serverStart(mockRequest(), {
        instance_id: 'inst-1',
      });
      expect(bridge.submit).toHaveBeenCalledWith(
        'start_server',
        { web_actor: 'web:admin' },
        'inst-1',
      );
      expect(res).toEqual({ ok: true });
    });
  });

  describe('serverStop', () => {
    it('dispatches stop_server', async () => {
      const res = await controller.serverStop(mockRequest());
      expect(bridge.submit).toHaveBeenCalledWith(
        'stop_server',
        { web_actor: 'web:admin' },
        undefined,
      );
      expect(res).toEqual({ ok: true });
    });
  });

  describe('serverRestart', () => {
    it('dispatches restart_server', async () => {
      const res = await controller.serverRestart(mockRequest(), {
        instance_id: ' inst-2 ',
      });
      expect(bridge.submit).toHaveBeenCalledWith(
        'restart_server',
        { web_actor: 'web:admin' },
        'inst-2',
      );
      expect(res).toEqual({ ok: true });
    });
  });

  describe('serverKill', () => {
    it('dispatches kill_server', async () => {
      const res = await controller.serverKill(mockRequest(), {
        instance_id: 'inst-1',
      });
      expect(bridge.submit).toHaveBeenCalledWith(
        'kill_server',
        { web_actor: 'web:admin' },
        'inst-1',
      );
      expect(res).toEqual({ ok: true });
    });
  });

  describe('serverSave', () => {
    it('dispatches save_game', async () => {
      const res = await controller.serverSave(mockRequest(), {
        instance_id: 'inst-1',
      });
      expect(bridge.submit).toHaveBeenCalledWith(
        'save_game',
        { web_actor: 'web:admin' },
        'inst-1',
      );
      expect(res).toEqual({ ok: true });
    });
  });

  describe('serverBackup', () => {
    it('dispatches backup', async () => {
      const res = await controller.serverBackup(mockRequest(), {
        instance_id: 'inst-1',
      });
      expect(bridge.submit).toHaveBeenCalledWith(
        'backup',
        { web_actor: 'web:admin' },
        'inst-1',
      );
      expect(res).toEqual({ ok: true });
    });
  });

  describe('serverCreateSave', () => {
    it('dispatches create_save with options', async () => {
      const res = await controller.serverCreateSave(mockRequest(), {
        name: 'test_save',
        mode: 'freeplay',
        seed: 12345,
        instance_id: 'inst-1',
      });
      expect(bridge.submit).toHaveBeenCalledWith(
        'create_save',
        {
          name: 'test_save',
          mode: 'freeplay',
          preset: undefined,
          seed: 12345,
          map_gen_settings: undefined,
          map_settings: undefined,
          map_exchange_string: undefined,
          web_actor: 'web:admin',
        },
        'inst-1',
      );
      expect(res).toEqual({ ok: true });
    });
  });

  describe('serverSettingsExample', () => {
    it('dispatches create_server_settings_from_example', async () => {
      const res = await controller.serverSettingsExample(mockRequest(), {
        instance_id: 'inst-1',
      });
      expect(bridge.submit).toHaveBeenCalledWith(
        'create_server_settings_from_example',
        { actor: 'web:admin' },
        'inst-1',
      );
      expect(res).toEqual({ ok: true });
    });
  });

  describe('rcon', () => {
    it('dispatches rcon_exec with command details', async () => {
      const res = await controller.rcon(mockRequest(), {
        command: '/players',
        source: 'web',
        command_id: 'cmd-1',
        command_name: 'players',
        instance_id: 'inst-1',
      });
      expect(bridge.submit).toHaveBeenCalledWith(
        'rcon_exec',
        {
          command: '/players',
          source: 'web',
          command_id: 'cmd-1',
          command_name: 'players',
          web_actor: 'web:admin',
        },
        'inst-1',
      );
      expect(res).toEqual({ ok: true });
    });
  });
});
