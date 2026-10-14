import type { Request } from 'express';
import { MaintenanceController } from './maintenance.controller';
import { ApiBridgeService } from '../api-bridge.service';
import { AUTH_USER_KEY } from '../../auth/auth.guard';
import { SessionUser } from '../../common/types';

describe('MaintenanceController', () => {
  let controller: MaintenanceController;
  let mockBridge: {
    submit: jest.Mock<
      Promise<Record<string, unknown>>,
      [string, Record<string, unknown>?, string?]
    >;
    webActor: jest.Mock<string, [{ username?: string }?]>;
  };

  const createMockReq = (username = 'alice'): Request =>
    ({
      [AUTH_USER_KEY]: {
        username,
        role: 'administrator',
        tabs: ['maintenance'],
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

    controller = new MaintenanceController(
      mockBridge as unknown as ApiBridgeService,
    );
  });

  it('maintenanceGet and maintenanceSet dispatch config operations', async () => {
    await controller.maintenanceGet();
    expect(mockBridge.submit).toHaveBeenCalledWith('maintenance_get');

    await controller.maintenanceSet({ backup_enabled: true });
    expect(mockBridge.submit).toHaveBeenCalledWith('maintenance_set', {
      backup_enabled: true,
    });
  });

  it('maintenanceReports dispatches maintenance_reports', async () => {
    await controller.maintenanceReports();
    expect(mockBridge.submit).toHaveBeenCalledWith('maintenance_reports');
  });

  it('maintenanceRun dispatches maintenance_run_now with actor', async () => {
    const req = createMockReq('alice');
    await controller.maintenanceRun({ task_id: 'vacuum' }, req);
    expect(mockBridge.submit).toHaveBeenCalledWith('maintenance_run_now', {
      task_id: 'vacuum',
      actor: 'alice',
    });
  });

  it('maintenanceClear dispatches maintenance_clear_manual with actor', async () => {
    const req = createMockReq('alice');
    await controller.maintenanceClear({ all: true }, req);
    expect(mockBridge.submit).toHaveBeenCalledWith('maintenance_clear_manual', {
      all: true,
      actor: 'alice',
    });
  });
});
