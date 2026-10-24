import {
  InstanceAutostartService,
  AUTOSTART_DELAY_MS,
  AUTOSTART_STAGGER_MS,
} from './instance-autostart.service';
import { InstancesService } from './instances.service';
import { RuntimeService } from '../ops/runtime.service';
import { ModsJobService } from '../ops/mods/mods-job.service';
import { LocaleService } from '../locale/locale.service';
import { FccConfigService } from '../config/fcc-config.service';
import { WebPanelLogService } from '../logging/web-panel-log.service';
import { GameInstance } from './game-instance.entity';

describe('InstanceAutostartService', () => {
  let service: InstanceAutostartService;
  let mockInstances: Partial<InstancesService>;
  let mockRuntime: Partial<RuntimeService>;
  let mockModJobs: Partial<ModsJobService>;
  let mockLocale: Partial<LocaleService>;
  let mockConfig: Partial<FccConfigService>;
  let mockWebLog: Partial<WebPanelLogService>;

  const createInstance = (
    id: string,
    name: string,
    autostartServer: boolean,
  ): GameInstance => {
    const inst = new GameInstance();
    inst.id = id;
    inst.name = name;
    inst.serverPath = `/servers/${id}`;
    inst.ip = '0.0.0.0';
    inst.port = '34197';
    inst.rconPort = 27015;
    inst.rconPassword = 'pass';
    inst.autostartServer = autostartServer;
    inst.autoEnterPanel = false;
    inst.launchSave = 'latest';
    inst.maintenanceLock = false;
    inst.blockUpdates = false;
    inst.experimentalUpdates = false;
    inst.collectGameMetrics = false;
    return inst;
  };

  beforeEach(() => {
    mockInstances = {
      load: jest.fn().mockReturnValue({ items: [] }),
      getById: jest.fn(),
      update: jest
        .fn()
        .mockImplementation((_id: string, item: Partial<GameInstance>) =>
          Promise.resolve(item as GameInstance),
        ),
    };
    mockRuntime = {
      start: jest.fn().mockResolvedValue({ ok: true }),
    };
    mockModJobs = {
      isRunningForInstance: jest.fn().mockReturnValue(false),
    };
    mockLocale = {
      readLang: jest.fn().mockReturnValue({
        headless_autostart_not_started:
          'Autostart: server "{}" did not start: {}',
        headless_autostart_issued:
          'Autostart: start command issued for server "{}".',
      }),
    };
    mockConfig = {
      langCode: 'en',
    };
    mockWebLog = {
      appendDebug: jest.fn(),
    };

    service = new InstanceAutostartService(
      mockInstances as InstancesService,
      mockRuntime as RuntimeService,
      mockModJobs as ModsJobService,
      mockLocale as LocaleService,
      mockConfig as FccConfigService,
      mockWebLog as WebPanelLogService,
    );
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should stagger autostart across multiple instances with a delay', async () => {
    jest.useFakeTimers();

    const inst1 = createInstance('srv-1', 'Server 1', true);
    const inst2 = createInstance('srv-2', 'Server 2', true);
    const inst3 = createInstance('srv-3', 'Server 3', false);

    (mockInstances.load as jest.Mock).mockReturnValue({
      items: [inst1, inst2, inst3],
    });
    (mockInstances.getById as jest.Mock).mockImplementation((id: string) => {
      if (id === 'srv-1') return inst1;
      if (id === 'srv-2') return inst2;
      return inst3;
    });

    service.scheduleAfterPanelStart();

    // Advance initial delay
    await jest.advanceTimersByTimeAsync(AUTOSTART_DELAY_MS);

    // First server should have been started
    expect(mockRuntime.start).toHaveBeenCalledTimes(1);
    expect(mockRuntime.start).toHaveBeenCalledWith(inst1);

    // Advance by stagger delay
    await jest.advanceTimersByTimeAsync(AUTOSTART_STAGGER_MS);

    // Second server should now be started
    expect(mockRuntime.start).toHaveBeenCalledTimes(2);
    expect(mockRuntime.start).toHaveBeenCalledWith(inst2);

    // inst3 has autostartServer: false, so it shouldn't be called
    expect(mockRuntime.start).toHaveBeenCalledTimes(2);
  });

  it('should clear maintenanceLock before autostarting', async () => {
    const inst = createInstance('srv-lock', 'Locked Server', true);
    inst.maintenanceLock = true;

    (mockInstances.load as jest.Mock).mockReturnValue({ items: [inst] });
    (mockInstances.getById as jest.Mock).mockReturnValue(inst);

    await service.maybeAutostart('srv-lock', 0);

    expect(mockInstances.update).toHaveBeenCalledWith(
      'srv-lock',
      expect.objectContaining({
        maintenanceLock: false,
      }),
    );
    expect(mockRuntime.start).toHaveBeenCalledTimes(1);
  });

  it('should skip starting instance if a mod job is running', async () => {
    const inst = createInstance('srv-mod', 'Modding Server', true);
    (mockInstances.load as jest.Mock).mockReturnValue({ items: [inst] });
    (mockInstances.getById as jest.Mock).mockReturnValue(inst);
    (mockModJobs.isRunningForInstance as jest.Mock).mockReturnValue(true);

    await service.maybeAutostart('srv-mod', 0);

    expect(mockRuntime.start).not.toHaveBeenCalled();
    expect(mockWebLog.appendDebug).toHaveBeenCalledWith(
      expect.stringContaining('mod_job_running'),
    );
  });
});
