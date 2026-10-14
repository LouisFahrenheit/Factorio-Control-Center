import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { InstancesController } from './instances.controller';
import { ApiBridgeService } from '../api-bridge.service';
import { SessionService } from '../../auth/session.service';
import { InstancesService } from '../../instances/instances.service';
import { WebPanelEventLogService } from '../../logging/web-panel-event-log.service';
import { AUTH_USER_KEY } from '../../auth/auth.guard';
import { SessionUser } from '../../common/types';

describe('InstancesController', () => {
  let controller: InstancesController;
  let mockBridge: {
    submit: jest.Mock<
      Promise<Record<string, unknown>>,
      [string, Record<string, unknown>?, string?]
    >;
    webActor: jest.Mock<string, [{ username?: string }?]>;
  };
  let mockSessions: {
    getSelectedInstanceId: jest.Mock<string, [string]>;
    setSelectedInstanceId: jest.Mock<void, [string, string]>;
  };
  let mockInstances: {
    getById: jest.Mock;
  };
  let mockEventLog: {
    logDispatchOp: jest.Mock;
  };

  const createMockReq = (
    username = 'alice',
    instanceIds: string[] = ['*'],
    token = 'valid-token',
  ): Request =>
    ({
      [AUTH_USER_KEY]: {
        username,
        role: 'administrator',
        tabs: ['instances'],
        instance_ids: instanceIds,
        enabled: true,
      } as SessionUser,
      headers: {
        authorization: token ? `Bearer ${token}` : undefined,
      },
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

    mockSessions = {
      getSelectedInstanceId: jest
        .fn<string, [string]>()
        .mockReturnValue('inst-1'),
      setSelectedInstanceId: jest.fn<void, [string, string]>(),
    };

    mockInstances = {
      getById: jest.fn().mockImplementation((id: string) => {
        if (id === 'inst-1' || id === 'inst-2') return { id, name: id };
        return null;
      }),
    };

    mockEventLog = {
      logDispatchOp: jest.fn(),
    };

    controller = new InstancesController(
      mockBridge as unknown as ApiBridgeService,
      mockSessions as unknown as SessionService,
      mockInstances as unknown as InstancesService,
      mockEventLog as unknown as WebPanelEventLogService,
    );
  });

  describe('instancesList', () => {
    it('returns all items for admin with * permission', async () => {
      mockBridge.submit.mockResolvedValue({
        ok: true,
        items: [{ id: 'inst-1' }, { id: 'inst-2' }],
      });
      const req = createMockReq('admin', ['*']);

      const res = await controller.instancesList(req);
      expect(res.ok).toBe(true);
      expect(res.selectedId).toBe('inst-1');
      expect((res.items as unknown[]).length).toBe(2);
    });

    it('filters items for restricted user', async () => {
      mockBridge.submit.mockResolvedValue({
        ok: true,
        items: [{ id: 'inst-1' }, { id: 'inst-2' }],
      });
      const req = createMockReq('user', ['inst-2']);

      const res = await controller.instancesList(req);
      expect(res.ok).toBe(true);
      const items = res.items as Array<{ id: string }>;
      expect(items.length).toBe(1);
      expect(items[0]?.id).toBe('inst-2');
      // selected was inst-1, but user only has inst-2, so selectedId resets
      expect(res.selectedId).toBe('');
    });
  });

  describe('instancesAdd', () => {
    it('dispatches instances_add with payload and web_actor', async () => {
      const req = createMockReq('alice');
      await controller.instancesAdd({ name: 'new-server' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('instances_add', {
        name: 'new-server',
        web_actor: 'alice',
      });
    });
  });

  describe('instancesSelect', () => {
    it('selects valid instance for session', () => {
      const req = createMockReq('alice', ['*'], 'tok-123');
      const res = controller.instancesSelect(req, { id: 'inst-1' });

      expect(res).toEqual({ ok: true });
      expect(mockSessions.setSelectedInstanceId).toHaveBeenCalledWith(
        'tok-123',
        'inst-1',
      );
      expect(mockEventLog.logDispatchOp).toHaveBeenCalledTimes(1);
    });

    it('throws BadRequestException for forbidden instance', () => {
      const req = createMockReq('bob', ['inst-2']);
      expect(() => controller.instancesSelect(req, { id: 'inst-1' })).toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException if instance does not exist', () => {
      const req = createMockReq('alice', ['*']);
      expect(() => controller.instancesSelect(req, { id: 'missing' })).toThrow(
        BadRequestException,
      );
    });

    it('throws UnauthorizedException if bearer token is missing', () => {
      const req = createMockReq('alice', ['*'], '');
      expect(() => controller.instancesSelect(req, { id: 'inst-1' })).toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('CRUD operations', () => {
    it('instancesUpdate dispatches instances_update with actor', async () => {
      const req = createMockReq('alice');
      await controller.instancesUpdate('inst-1', { port: 34198 }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('instances_update', {
        id: 'inst-1',
        port: 34198,
        web_actor: 'alice',
      });
    });

    it('instancesClone dispatches instances_clone with actor', async () => {
      const req = createMockReq('alice');
      await controller.instancesClone('inst-1', { new_name: 'clone-1' }, req);
      expect(mockBridge.submit).toHaveBeenCalledWith('instances_clone', {
        id: 'inst-1',
        new_name: 'clone-1',
        web_actor: 'alice',
      });
    });

    it('instancesRemove dispatches instances_remove with delete flags', async () => {
      const req = createMockReq('alice');
      await controller.instancesRemove('inst-1', req, 'true', '1');
      expect(mockBridge.submit).toHaveBeenCalledWith('instances_remove', {
        id: 'inst-1',
        deleteFromDisk: true,
        deleteData: true,
        web_actor: 'alice',
      });
    });
  });

  describe('bootstrap endpoints', () => {
    it('bootstrapStart dispatches instance_bootstrap_start', async () => {
      await controller.bootstrapStart({ id: 'inst-1', version: '2.0.28' });
      expect(mockBridge.submit).toHaveBeenCalledWith(
        'instance_bootstrap_start',
        { id: 'inst-1', version: '2.0.28' },
      );
    });

    it('bootstrapStatus dispatches instance_bootstrap_status', async () => {
      await controller.bootstrapStatus();
      expect(mockBridge.submit).toHaveBeenCalledWith(
        'instance_bootstrap_status',
      );
    });

    it('bootstrapStop dispatches instance_bootstrap_stop', async () => {
      await controller.bootstrapStop();
      expect(mockBridge.submit).toHaveBeenCalledWith('instance_bootstrap_stop');
    });
  });
});
