import { MaintenanceService, MaintenanceTask } from './maintenance.service';
import { MaintenanceSchedule } from './maintenance-schedule.entity';
import { SystemPreference } from '../config/system-preference.entity';
import { Repository } from 'typeorm';
import { PathsService } from '../config/paths.service';
import { InstancesService } from '../instances/instances.service';
import { FccConfigService } from '../config/fcc-config.service';
import { LocaleService } from '../locale/locale.service';
import { LogRotationService } from '../logging/log-rotation.service';
import { DispatchService } from '../ops/dispatch.service';
import { AuditLogService } from './audit-log.service';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

describe('MaintenanceService', () => {
  let service: MaintenanceService;
  let tempDir: string;
  let pendingPath: string;

  let mockRepo: Partial<Repository<MaintenanceSchedule>>;
  let mockPrefs: Partial<Repository<SystemPreference>>;
  let mockPaths: Partial<PathsService>;
  let mockInstances: Partial<InstancesService>;
  let mockConfig: Partial<FccConfigService>;
  let mockLocale: Partial<LocaleService>;
  let mockLogRotation: Partial<LogRotationService>;
  let mockDispatch: Partial<DispatchService>;
  let mockAuditLog: Partial<AuditLogService>;

  let storedSchedules: MaintenanceSchedule[] = [];
  let storedPrefs: Record<string, string | null> = {};

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-maint-test-'));
    pendingPath = path.join(tempDir, 'maintenance-pending.json');
    storedSchedules = [];
    storedPrefs = {};

    mockRepo = {
      find: jest
        .fn()
        .mockImplementation(() => Promise.resolve([...storedSchedules])),
      findOneBy: jest.fn().mockImplementation((criteria: { id?: string }) => {
        const found = storedSchedules.find((s) => s.id === criteria.id);
        return Promise.resolve(found || null);
      }),
      create: jest
        .fn()
        .mockImplementation((dto: Partial<MaintenanceSchedule>) => {
          return {
            id: dto.id || 'id',
            active: dto.active ?? true,
            timeHhmm: dto.timeHhmm || '04:00',
            weekdays: dto.weekdays || [],
            repeatWeekly: dto.repeatWeekly ?? true,
            manualOnly: dto.manualOnly ?? false,
            timezone: dto.timezone || '',
            instanceIds: dto.instanceIds || [],
            options: dto.options || {},
            lastRunKey: dto.lastRunKey || '',
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }),
      save: jest
        .fn()
        .mockImplementation(
          (entities: MaintenanceSchedule | MaintenanceSchedule[]) => {
            const arr = Array.isArray(entities) ? entities : [entities];
            for (const item of arr) {
              const idx = storedSchedules.findIndex((s) => s.id === item.id);
              if (idx >= 0) storedSchedules[idx] = item;
              else storedSchedules.push(item);
            }
            return Promise.resolve(entities);
          },
        ),
      delete: jest.fn().mockImplementation((ids: string[]) => {
        storedSchedules = storedSchedules.filter((s) => !ids.includes(s.id));
        return Promise.resolve({ raw: [], affected: ids.length });
      }),
    };

    mockPrefs = {
      findOneBy: jest.fn().mockImplementation((criteria: { key?: string }) => {
        if (!criteria.key || !(criteria.key in storedPrefs))
          return Promise.resolve(null);
        return Promise.resolve({
          key: criteria.key,
          value: storedPrefs[criteria.key],
        } as SystemPreference);
      }),
      create: jest.fn().mockImplementation((dto: Partial<SystemPreference>) => {
        return {
          key: dto.key || '',
          value: dto.value || '',
        } as SystemPreference;
      }),
      save: jest.fn().mockImplementation((entity: SystemPreference) => {
        storedPrefs[entity.key] = entity.value;
        return Promise.resolve(entity);
      }),
    };

    mockPaths = {
      maintenancePendingPath: pendingPath,
      maintenanceSchedulerLogPath: jest
        .fn()
        .mockReturnValue(path.join(tempDir, 'scheduler.log')),
    };

    mockInstances = {
      load: jest.fn().mockReturnValue({
        items: [{ id: 'inst-1', name: 'Server 1', serverPath: '/srv1' }],
      }),
      getById: jest.fn().mockReturnValue({ id: 'inst-1', name: 'Server 1' }),
    };

    mockConfig = {
      langCode: 'en',
    };

    mockLocale = {
      readLang: jest.fn().mockReturnValue({}),
    };

    mockLogRotation = {
      logWriteAuditEnabled: jest.fn().mockReturnValue(true),
      logWriteMaintenanceEnabled: jest.fn().mockReturnValue(true),
      appendLine: jest.fn(),
    };

    mockDispatch = {
      dispatch: jest.fn(),
      dispatchWithInstance: jest.fn(),
    };

    mockAuditLog = {
      listReports: jest.fn().mockReturnValue([{ run_id: 'rep-1' }]),
      appendMaintenanceRun: jest.fn(),
      endManualSession: jest.fn(),
      appendManualResumeStep: jest.fn(),
    };

    service = new MaintenanceService(
      mockRepo as Repository<MaintenanceSchedule>,
      mockPrefs as Repository<SystemPreference>,
      mockPaths as PathsService,
      mockInstances as InstancesService,
      mockConfig as FccConfigService,
      mockLocale as LocaleService,
      mockLogRotation as LogRotationService,
      mockDispatch as DispatchService,
      mockAuditLog as AuditLogService,
    );
  });

  afterEach(() => {
    service.onModuleDestroy();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe('lifecycle', () => {
    it('initializes timer on module init and destroys cleanly', async () => {
      await service.onModuleInit();
      service.onModuleDestroy();
    });
  });

  describe('get', () => {
    it('returns schedules with calculated next_fire_iso and scheduler_tz', async () => {
      storedSchedules.push({
        id: 'task-1',
        active: true,
        timeHhmm: '05:00',
        weekdays: [1, 2, 3],
        repeatWeekly: true,
        manualOnly: false,
        timezone: 'UTC',
        instanceIds: ['inst-1'],
        options: { update_mods: true },
        lastRunKey: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.get();
      expect(res.ok).toBe(true);
      expect(res.job_running).toBe(false);
      const tasks = res.tasks as MaintenanceTask[];
      expect(tasks.length).toBe(1);
      expect(tasks[0].id).toBe('task-1');
      expect(tasks[0].next_fire_iso).toBeDefined();
    });
  });

  describe('set', () => {
    it('rejects update without tasks array', async () => {
      const res = await service.set({});
      expect(res).toEqual({ ok: false, error: 'tasks_required' });
    });

    it('rejects update with invalid time format', async () => {
      const res = await service.set({
        tasks: [{ id: 't1', time_hhmm: '99:99' }],
      });
      expect(res).toEqual({ ok: false, error: 'invalid_time', task_id: 't1' });
    });

    it('rejects duplicate task IDs', async () => {
      const res = await service.set({
        tasks: [
          { id: 't1', time_hhmm: '04:00' },
          { id: 't1', time_hhmm: '05:00' },
        ],
      });
      expect(res).toEqual({ ok: false, error: 'duplicate_task_id' });
    });

    it('rejects invalid scheduler timezone', async () => {
      const res = await service.set({
        tasks: [{ id: 't1', time_hhmm: '04:00' }],
        scheduler_tz: 'Invalid/Zone_Name_123',
      });
      expect(res).toEqual({ ok: false, error: 'invalid_scheduler_tz' });
    });

    it('successfully saves valid tasks and updates scheduler timezone', async () => {
      const res = await service.set({
        tasks: [
          {
            id: 'task-daily',
            active: true,
            time_hhmm: '03:30',
            weekdays: [0, 1, 2, 3, 4, 5, 6],
            repeat_weekly: true,
            manual_only: false,
            instance_ids: ['inst-1'],
            options: { update_mods: true, update_factorio: true },
          },
        ],
        scheduler_tz: 'UTC',
      });

      expect(res.ok).toBe(true);
      expect(storedSchedules.length).toBe(1);
      expect(storedSchedules[0].id).toBe('task-daily');
      expect(storedPrefs['maintenance.scheduler_tz']).toBe('UTC');
    });
  });

  describe('reports', () => {
    it('delegates to AuditLogService listReports', () => {
      const res = service.reports();
      expect(res.ok).toBe(true);
      expect(res.reports).toEqual([{ run_id: 'rep-1' }]);
    });
  });

  describe('runNow', () => {
    it('rejects when task is not found', async () => {
      const res = await service.runNow({ task_id: 'unknown' });
      expect(res).toEqual({ ok: false, error: 'task_not_found' });
    });

    it('starts manual task execution when task exists', async () => {
      storedSchedules.push({
        id: 'manual-task',
        active: true,
        timeHhmm: '04:00',
        weekdays: [],
        repeatWeekly: false,
        manualOnly: true,
        timezone: '',
        instanceIds: ['inst-1'],
        options: {},
        lastRunKey: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await service.runNow({
        task_id: 'manual-task',
        actor: 'Admin',
      });
      expect(res.ok).toBe(true);
      expect(res.started).toBe(true);
      expect(res.run_id).toBeDefined();
    });
  });

  describe('pending manual maintenance helpers', () => {
    it('reads, clears, and resumes manual pending states', () => {
      expect(service.hasPendingManual('inst-1')).toBe(false);

      // Write pending file manually to simulate pending maintenance
      fs.writeFileSync(
        pendingPath,
        JSON.stringify({ 'inst-1': { run_id: 'maint-101' } }, null, 2),
        'utf-8',
      );

      expect(service.hasPendingManual('inst-1')).toBe(true);

      // Resume manual on start
      const resumeRes = service.resumeManualOnStart({
        instance_id: 'inst-1',
        actor: 'Admin',
      });
      expect(resumeRes).toEqual({ ok: true, cleared: true });
      expect(service.hasPendingManual('inst-1')).toBe(false);
      expect(mockAuditLog.appendManualResumeStep).toHaveBeenCalledWith(
        'inst-1',
        'Admin',
      );
      expect(mockAuditLog.endManualSession).toHaveBeenCalledWith(
        'inst-1',
        'Admin',
      );

      // Clear manual
      fs.writeFileSync(
        pendingPath,
        JSON.stringify({ 'inst-1': 'active' }, null, 2),
        'utf-8',
      );
      const clearRes = service.clearManual({ instance_id: 'inst-1' });
      expect(clearRes).toEqual({ ok: true });
      expect(service.hasPendingManual('inst-1')).toBe(false);
    });
  });

  describe('job execution pipeline', () => {
    interface MaintenanceServicePrivate {
      runJob(
        task: MaintenanceTask,
        fireIso: string,
        taskId: string,
        initiatedBy?: string,
      ): Promise<void>;
    }

    it('runs stop -> lock -> factorio & mod updates -> start -> unlock and disables oneshot task', async () => {
      storedSchedules.push({
        id: 'oneshot-update',
        active: true,
        timeHhmm: '04:00',
        weekdays: [1],
        repeatWeekly: false,
        manualOnly: false,
        timezone: 'UTC',
        instanceIds: ['inst-1'],
        options: {
          update_factorio: true,
          update_mods: true,
          maintenance: false,
        },
        lastRunKey: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      let currentStatus = 'running';
      const opCalls: Array<{ op: string; payload?: Record<string, unknown> }> =
        [];

      (mockDispatch.dispatchWithInstance as jest.Mock).mockImplementation(
        (_iid: string, op: string, payload?: Record<string, unknown>) => {
          opCalls.push({ op, payload });
          if (op === 'stop_server') {
            currentStatus = 'stopped';
            return Promise.resolve({ ok: true });
          }
          if (op === 'start_server') {
            currentStatus = 'running';
            return Promise.resolve({ ok: true });
          }
          if (op === 'status') {
            return Promise.resolve({ status_kind: currentStatus });
          }
          if (op === 'instance_maintenance_lock') {
            return Promise.resolve({ ok: true });
          }
          if (op === 'factorio_update') {
            return Promise.resolve({ ok: true, started: true });
          }
          if (op === 'factorio_update_status') {
            return Promise.resolve({ phase: 'done' });
          }
          if (op === 'mods_job_start') {
            return Promise.resolve({ ok: true });
          }
          if (op === 'mods_job_status') {
            return Promise.resolve({ phase: 'done', summary: { updated: 2 } });
          }
          return Promise.resolve({ ok: true });
        },
      );

      const priv = service as unknown as MaintenanceServicePrivate;
      await priv.runJob(
        {
          id: 'oneshot-update',
          active: true,
          time_hhmm: '04:00',
          weekdays: [1],
          repeat_weekly: false,
          manual_only: false,
          instance_ids: ['inst-1'],
          options: {
            update_factorio: true,
            update_mods: true,
            maintenance: false,
          },
        },
        '2026-06-01T04:00:00.000Z',
        'oneshot-update',
      );

      const ops = opCalls.map((c) => c.op);
      expect(ops).toEqual([
        'stop_server',
        'status',
        'instance_maintenance_lock',
        'factorio_update',
        'factorio_update_status',
        'mods_job_start',
        'mods_job_status',
        'start_server',
        'status',
        'instance_maintenance_lock',
      ]);

      const lockCalls = opCalls.filter(
        (c) => c.op === 'instance_maintenance_lock',
      );
      expect(lockCalls[0].payload?.locked).toBe(true);
      expect(lockCalls[1].payload?.locked).toBe(false);

      // Oneshot task disabled after successful run
      expect(storedSchedules[0].active).toBe(false);
      expect(mockAuditLog.appendMaintenanceRun).toHaveBeenCalledWith(
        expect.objectContaining({
          task_id: 'oneshot-update',
          success: true,
          error: '',
        }),
      );
    });

    it('stops server without restarting and records pending state in maintenance-only mode', async () => {
      (mockDispatch.dispatchWithInstance as jest.Mock).mockImplementation(
        (_iid: string, op: string) => {
          if (op === 'status') {
            return Promise.resolve({ status_kind: 'stopped' });
          }
          return Promise.resolve({ ok: true });
        },
      );

      const priv = service as unknown as MaintenanceServicePrivate;
      await priv.runJob(
        {
          id: 'maint-stop',
          active: true,
          time_hhmm: '02:00',
          weekdays: [],
          repeat_weekly: false,
          manual_only: true,
          instance_ids: ['inst-1'],
          options: {
            maintenance: true,
            update_mods: false,
            update_factorio: false,
          },
        },
        '2026-06-01T02:00:00.000Z-manual',
        'maint-stop',
        'Admin',
      );

      expect(service.hasPendingManual('inst-1')).toBe(true);
      const calledOps = (
        mockDispatch.dispatchWithInstance as jest.Mock
      ).mock.calls.map((args: unknown[]) => args[1]);
      expect(calledOps).toContain('stop_server');
      expect(calledOps).not.toContain('start_server');
      expect(mockAuditLog.appendMaintenanceRun).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          web_actor: 'Admin',
        }),
      );
    });

    it('skips mod update when policy is cancel and mods require newer Factorio, then restarts server', async () => {
      let currentStatus = 'running';
      (mockDispatch.dispatchWithInstance as jest.Mock).mockImplementation(
        (_iid: string, op: string) => {
          if (op === 'stop_server') {
            currentStatus = 'stopped';
            return Promise.resolve({ ok: true });
          }
          if (op === 'start_server') {
            currentStatus = 'running';
            return Promise.resolve({ ok: true });
          }
          if (op === 'status') {
            return Promise.resolve({ status_kind: currentStatus });
          }
          if (op === 'mods_update_all_plan') {
            return Promise.resolve({
              ok: true,
              mods_needing_game_update: [{ name: 'space-exploration' }],
            });
          }
          return Promise.resolve({ ok: true });
        },
      );

      const priv = service as unknown as MaintenanceServicePrivate;
      await priv.runJob(
        {
          id: 'mods-cancel-policy',
          active: true,
          time_hhmm: '03:00',
          weekdays: [1],
          repeat_weekly: true,
          manual_only: false,
          instance_ids: ['inst-1'],
          options: {
            update_mods: true,
            update_factorio: false,
            maintenance: false,
            mods_game_version_policy: 'cancel',
          },
        },
        '2026-06-01T03:00:00.000Z',
        'mods-cancel-policy',
      );

      const calledOps = (
        mockDispatch.dispatchWithInstance as jest.Mock
      ).mock.calls.map((args: unknown[]) => args[1]);
      expect(calledOps).toContain('mods_update_all_plan');
      expect(calledOps).not.toContain('mods_job_start');
      expect(calledOps).toContain('start_server');
      expect(mockAuditLog.appendMaintenanceRun).toHaveBeenCalledWith(
        expect.objectContaining({ success: true }),
      );
    });

    it('releases maintenance lock and logs failure when mod update job fails to start', async () => {
      const unlockCalls: boolean[] = [];
      (mockDispatch.dispatchWithInstance as jest.Mock).mockImplementation(
        (_iid: string, op: string, payload?: Record<string, unknown>) => {
          if (op === 'status') {
            return Promise.resolve({ status_kind: 'stopped' });
          }
          if (op === 'instance_maintenance_lock') {
            unlockCalls.push(Boolean(payload?.locked));
            return Promise.resolve({ ok: true });
          }
          if (op === 'mods_job_start') {
            return Promise.resolve({ ok: false, error: 'portal_unreachable' });
          }
          return Promise.resolve({ ok: true });
        },
      );

      const priv = service as unknown as MaintenanceServicePrivate;
      await priv.runJob(
        {
          id: 'failing-mods',
          active: true,
          time_hhmm: '03:00',
          weekdays: [1],
          repeat_weekly: true,
          manual_only: false,
          instance_ids: ['inst-1'],
          options: {
            update_mods: true,
            update_factorio: false,
            maintenance: false,
          },
        },
        '2026-06-01T03:00:00.000Z',
        'failing-mods',
      );

      // Acquired true, then guaranteed unlock false in finally
      expect(unlockCalls).toEqual([true, false]);
      expect(mockAuditLog.appendMaintenanceRun).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'portal_unreachable',
        }),
      );
    });
  });
});
