import {
  Inject,
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  forwardRef,
} from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { randomUUID } from 'crypto';
import { readJsonFile, writeJsonFile } from '../common/json-store';
import { PathsService } from '../config/paths.service';
import { FccConfigService } from '../config/fcc-config.service';
import { LogRotationService } from '../logging/log-rotation.service';
import { InstancesService } from '../instances/instances.service';
import { LocaleService } from '../locale/locale.service';
import { DispatchService } from '../ops/dispatch.service';
import { AuditLogService } from './audit-log.service';
import {
  INSTANCE_ALL,
  effectiveSchedulerTz,
  effectiveTaskTz,
  fireIsoFromMs,
  normalizeTaskInstanceIds,
  nextFireUtcMs,
  parseHhmm,
  taskTargetInstanceIds,
  validateIanaZone,
} from './maintenance-time.util';

export const MAINTENANCE_PANEL_ACTOR = 'System: Panel';

const WARN_DELTAS_SEC = [3600, 1800, 300, 60] as const;
const WARN_KEYS = [
  'maintenance_chat_60m',
  'maintenance_chat_30m',
  'maintenance_chat_5m',
  'maintenance_chat_1m',
] as const;

const WARN_FALLBACKS: Record<string, string> = {
  maintenance_chat_60m: 'Maintenance will start in 1 hour.',
  maintenance_chat_30m: 'Maintenance will start in 30 minutes.',
  maintenance_chat_5m: 'Maintenance will start in 5 minutes.',
  maintenance_chat_1m:
    'Maintenance started. Server will be stopped in 1 minute.',
};

interface MaintenanceTask {
  id: string;
  active: boolean;
  time_hhmm: string;
  weekdays: number[];
  repeat_weekly: boolean;
  manual_only: boolean;
  timezone?: string;
  instance_ids: string[];
  options: {
    update_mods?: boolean;
    update_factorio?: boolean;
    maintenance?: boolean;
    mods_game_version_policy?: 'cancel' | 'skip' | 'force';
  };
  last_run_key?: string;
  next_fire_iso?: string | null;
}

interface WarnState {
  fire_iso: string;
  sent: Set<number>;
}

@Injectable()
export class MaintenanceService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(MaintenanceService.name);
  private timer?: NodeJS.Timeout;
  private jobRunning = false;
  private lastFireByTask = new Map<string, string>();
  private warnByTask = new Map<string, WarnState>();

  constructor(
    private readonly paths: PathsService,
    private readonly instances: InstancesService,
    private readonly config: FccConfigService,
    private readonly locale: LocaleService,
    private readonly logRotation: LogRotationService,
    @Inject(forwardRef(() => DispatchService))
    private readonly dispatch: DispatchService,
    private readonly auditLog: AuditLogService,
  ) {}

  onModuleInit(): void {
    this.loadDoc();
    this.maintLog(
      `scheduler_started tz=${effectiveSchedulerTz(this.loadDoc().scheduler_tz) || 'local'}`,
    );
    this.timer = setInterval(() => void this.schedulerTick(), 10_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  get(): Record<string, unknown> {
    const doc = this.loadDoc();
    let tasks = doc.tasks || [];
    const rec = this.reconcileTasksWithInstances(tasks);
    if (rec.changed) {
      writeJsonFile(this.paths.maintenancePath, { ...doc, tasks: rec.tasks });
      tasks = rec.tasks;
    }
    const outTasks = tasks.map((t) => {
      const tz = effectiveTaskTz(t, doc.scheduler_tz || '');
      const nfMs = nextFireUtcMs(t, tz);
      return { ...t, next_fire_iso: nfMs != null ? fireIsoFromMs(nfMs) : null };
    });
    return {
      ok: true,
      tasks: outTasks,
      job_running: this.jobRunning,
      scheduler_tz: doc.scheduler_tz || '',
    };
  }

  set(kwargs: Record<string, unknown>): Record<string, unknown> {
    const raw = kwargs.tasks;
    if (!Array.isArray(raw)) return { ok: false, error: 'tasks_required' };

    const tasks: MaintenanceTask[] = [];
    const seen = new Set<string>();
    for (const x of raw) {
      const nt = this.normalizeTask(x);
      const bad = this.taskBlockedUpdateTargetId(nt);
      if (bad)
        return {
          ok: false,
          error: 'maintenance_instance_updates_forbidden',
          instance_id: bad,
        };
      if (!parseHhmm(nt.time_hhmm))
        return { ok: false, error: 'invalid_time', task_id: nt.id };
      if (seen.has(nt.id)) return { ok: false, error: 'duplicate_task_id' };
      seen.add(nt.id);
      tasks.push(nt);
    }

    const rec = this.reconcileTasksWithInstances(tasks);
    const doc = this.loadDoc();
    const save: Record<string, unknown> = { ...doc, tasks: rec.tasks };
    if ('scheduler_tz' in kwargs) {
      const s =
        kwargs.scheduler_tz == null ? '' : String(kwargs.scheduler_tz).trim();
      if (s && !validateIanaZone(s))
        return { ok: false, error: 'invalid_scheduler_tz' };
      save.scheduler_tz = s;
    }
    writeJsonFile(this.paths.maintenancePath, save);
    return this.get();
  }

  reports(): Record<string, unknown> {
    const reports = this.auditLog.listReports();
    return { ok: true, reports, items: reports };
  }

  runNow(kwargs: Record<string, unknown>): Record<string, unknown> {
    if (this.jobRunning) return { ok: false, error: 'job_running' };
    const taskId = String(kwargs.task_id || kwargs.id || '').trim();
    const doc = this.loadDoc();
    const task = (doc.tasks || []).find((t) => t.id === taskId);
    if (!task) return { ok: false, error: 'task_not_found' };
    const runId = `${new Date().toISOString()}-manual`;
    const initiatedBy =
      String(kwargs.actor || kwargs.web_actor || '').trim() || undefined;
    void this.runJob(task, runId, task.id, initiatedBy);
    return { ok: true, started: true, run_id: runId };
  }

  hasPendingManual(instanceId: string): boolean {
    const iid = String(instanceId || '').trim();
    if (!iid) return false;
    const data = readJsonFile<Record<string, unknown>>(
      this.paths.maintenancePendingPath,
      {},
    );
    const ent = data[iid];
    if (typeof ent === 'string') return !!ent.trim();
    if (ent && typeof ent === 'object' && !Array.isArray(ent)) {
      return !!String((ent as { run_id?: string }).run_id || '').trim();
    }
    return false;
  }

  clearManual(kwargs: Record<string, unknown>): Record<string, unknown> {
    const iid = String(kwargs.instance_id || '').trim();
    const actor = String(kwargs.actor || '').trim() || undefined;
    const data = readJsonFile<Record<string, unknown>>(
      this.paths.maintenancePendingPath,
      {},
    );
    if (iid) {
      this.auditLog.endManualSession(iid, actor);
      delete data[iid];
    } else {
      for (const key of Object.keys(data)) {
        this.auditLog.endManualSession(key, actor);
        delete data[key];
      }
    }
    writeJsonFile(this.paths.maintenancePendingPath, data);
    return { ok: true };
  }

  resumeManualOnStart(
    kwargs: Record<string, unknown>,
  ): Record<string, unknown> {
    const iid = String(kwargs.instance_id || '').trim();
    if (!iid || !this.hasPendingManual(iid))
      return { ok: true, cleared: false };
    const actor =
      String(kwargs.actor || kwargs.web_actor || '').trim() || undefined;
    this.auditLog.appendManualResumeStep(iid, actor);
    this.auditLog.endManualSession(iid, actor);
    const data = readJsonFile<Record<string, unknown>>(
      this.paths.maintenancePendingPath,
      {},
    );
    delete data[iid];
    writeJsonFile(this.paths.maintenancePendingPath, data);
    return { ok: true, cleared: true };
  }

  resumeManualWhenRunning(instanceId: string, actor?: string): void {
    const iid = String(instanceId || '').trim();
    if (!iid || !this.hasPendingManual(iid)) return;
    void this.waitAndResumeManual(iid, actor);
  }

  private async waitAndResumeManual(
    iid: string,
    actor?: string,
  ): Promise<void> {
    try {
      const ok = await this.waitStatus(iid, ['running'], 200);
      if (ok && this.hasPendingManual(iid)) {
        this.resumeManualOnStart({ instance_id: iid, actor });
      }
    } catch {
      /* ignore */
    }
  }

  private async schedulerTick(): Promise<void> {
    const doc = this.loadDoc();
    let tasks = doc.tasks || [];
    const rec = this.reconcileTasksWithInstances(tasks);
    if (rec.changed) {
      writeJsonFile(this.paths.maintenancePath, { ...doc, tasks: rec.tasks });
      tasks = rec.tasks;
    }

    const nowMs = Date.now();
    for (const task of tasks) {
      if (!task.active || task.manual_only) continue;
      const tz = effectiveTaskTz(task, doc.scheduler_tz || '');
      const nfMs = nextFireUtcMs(task, tz, new Date(nowMs));
      if (nfMs == null) continue;
      try {
        const deltaSec = (nfMs - nowMs) / 1000;
        if (deltaSec >= -120 && deltaSec <= 240) {
          this.maintLog(
            `tick task_id=${task.id} active tz=${tz || 'local'} next_fire=${fireIsoFromMs(nfMs)} delta_sec=${deltaSec.toFixed(1)}`,
          );
        }
        await this.tickWarnsForTask(task, nfMs, tz);
        await this.tickFireForTask(task, nfMs, tz);
      } catch (e) {
        this.maintLog(
          `tick_exception task_id=${task.id} next_fire=${fireIsoFromMs(nfMs)} err=${e instanceof Error ? e.message : String(e)}`,
        );
      }
    }
  }

  private async tickWarnsForTask(
    task: MaintenanceTask,
    nfMs: number,
    tz: string,
  ): Promise<void> {
    if (this.jobRunning) return;
    const taskId = task.id;
    const targets = taskTargetInstanceIds(task);
    if (!targets.length || !targets[0]) return;

    const fireIso = fireIsoFromMs(nfMs);
    let st = this.warnByTask.get(taskId);
    if (!st || st.fire_iso !== fireIso) {
      st = { fire_iso: fireIso, sent: new Set() };
      this.warnByTask.set(taskId, st);
    }

    const nowMs = Date.now();
    for (let i = 0; i < WARN_DELTAS_SEC.length; i += 1) {
      const sec = WARN_DELTAS_SEC[i];
      if (st.sent.has(sec)) continue;
      const thresholdMs = nfMs - sec * 1000;
      if (thresholdMs <= nowMs && nowMs < thresholdMs + 120_000) {
        const key = WARN_KEYS[i];
        if (targets[0] === INSTANCE_ALL) {
          for (const sub of this.allInstanceIds())
            await this.sendWarnChat(key, sub);
        } else if (targets.length > 1) {
          for (const sub of targets) await this.sendWarnChat(key, sub);
        } else {
          await this.sendWarnChat(key, targets[0]);
        }
        this.maintLog(
          `warn_emit task_id=${taskId} key=${key} next_fire=${fireIso} targets=${targets.join(',')}`,
        );
        st.sent.add(sec);
      }
    }
  }

  private async tickFireForTask(
    task: MaintenanceTask,
    nfMs: number,
    tz: string,
  ): Promise<void> {
    const taskId = task.id;
    const fireIso = fireIsoFromMs(nfMs);
    const nowMs = Date.now();
    const fireSlopEarlyMs = 15_000;
    const fireWindowMs = 3 * 60_000;
    if (!(nfMs - fireSlopEarlyMs <= nowMs && nowMs < nfMs + fireWindowMs))
      return;

    if (this.jobRunning) {
      this.maintLog(
        `fire_skip job_running task_id=${taskId} fire_iso=${fireIso}`,
      );
      return;
    }
    if (this.lastFireByTask.get(taskId) === fireIso) {
      this.maintLog(
        `fire_skip last_fire_same task_id=${taskId} fire_iso=${fireIso}`,
      );
      return;
    }

    this.jobRunning = true;
    this.lastFireByTask.set(taskId, fireIso);
    this.maintLog(`fire_start task_id=${taskId} fire_iso=${fireIso}`);
    void this.runJob(task, fireIso, taskId);
  }

  private reportWebActor(fireIso: string, initiatedBy?: string): string {
    if (fireIso.endsWith('-manual')) {
      return String(initiatedBy || '').trim() || MAINTENANCE_PANEL_ACTOR;
    }
    return MAINTENANCE_PANEL_ACTOR;
  }

  private async runJob(
    task: MaintenanceTask,
    fireIso: string,
    taskId: string,
    initiatedBy?: string,
  ): Promise<void> {
    const webActor = this.reportWebActor(fireIso, initiatedBy);
    try {
      const targets = taskTargetInstanceIds(task);
      if (!targets.length || !targets[0]) {
        this.appendReport(
          this.emptyTargetReport(taskId, fireIso, task, webActor),
        );
        return;
      }

      if (targets[0] === INSTANCE_ALL) {
        let subs = this.allInstanceIds();
        const opts = this.normalizedOptions(task.options);
        const um = !!opts.update_mods && !opts.maintenance;
        const uf = !!opts.update_factorio && !opts.maintenance;
        if (subs.length && (um || uf)) {
          subs = subs.filter(
            (sid) => !this.instances.getById(sid)?.blockUpdates,
          );
        }
        if (!subs.length) {
          const now = new Date().toISOString();
          const manual = fireIso.endsWith('-manual');
          this.appendReport({
            task_id: taskId,
            run_id: fireIso,
            started_at: now,
            finished_at: now,
            instance_id: INSTANCE_ALL,
            instance_name: 'All servers',
            steps: [
              {
                t: now,
                kind: 'run_initiated',
                detail: {
                  message_key: manual
                    ? 'maintenance_report_run_initiated_manual'
                    : 'maintenance_report_run_initiated_scheduled',
                  actor: webActor,
                },
              },
            ],
            success: false,
            error: um || uf ? 'all_instances_updates_blocked' : 'no_instances',
            task_options: opts,
            run_trigger: manual ? 'manual' : 'scheduled',
            web_actor: webActor,
          });
          return;
        }
        let allOk = true;
        for (const sub of subs) {
          const t2 = { ...task, instance_ids: [sub] };
          const ok = await this.runJobImpl(
            t2,
            fireIso,
            taskId,
            false,
            webActor,
          );
          allOk = allOk && ok;
        }
        if (allOk) this.maybeDisableOneshotTask(taskId);
        return;
      }

      if (targets.length > 1) {
        let allOk = true;
        for (const sub of targets) {
          const t2 = { ...task, instance_ids: [sub] };
          const ok = await this.runJobImpl(
            t2,
            fireIso,
            taskId,
            false,
            webActor,
          );
          allOk = allOk && ok;
        }
        if (allOk) this.maybeDisableOneshotTask(taskId);
        return;
      }

      await this.runJobImpl(task, fireIso, taskId, true, webActor);
    } catch (e) {
      this.maintLog(
        `job_thread_exception task_id=${taskId} fire_iso=${fireIso} err=${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      this.jobRunning = false;
    }
  }

  private async runJobImpl(
    task: MaintenanceTask,
    fireIso: string,
    taskId: string,
    applyOneshot: boolean,
    webActor: string,
  ): Promise<boolean> {
    const opts = this.normalizedOptions(task.options);
    const maintenance = !!opts.maintenance;
    const updateMods = !!opts.update_mods && !maintenance;
    const updateFactorio = !!opts.update_factorio && !maintenance;
    const targets = taskTargetInstanceIds(task);
    const iid = targets.length === 1 ? targets[0] : '';
    const item = iid ? this.instances.getById(iid) : undefined;
    const reportRunId = iid ? `${fireIso}#${iid}` : fireIso;

    const report: Record<string, unknown> = {
      task_id: taskId,
      run_id: reportRunId,
      started_at: new Date().toISOString(),
      finished_at: '',
      instance_id: iid,
      instance_name: item?.name || iid || '(current)',
      steps: [],
      success: false,
      error: '',
      task_options: opts,
      run_trigger: fireIso.endsWith('-manual') ? 'manual' : 'scheduled',
      web_actor: webActor,
    };
    const steps = report.steps as Record<string, unknown>[];
    const step = (kind: string, extra: Record<string, unknown> = {}) => {
      steps.push({ t: new Date().toISOString(), kind, ...extra });
    };
    step('run_initiated', {
      detail: {
        message_key: fireIso.endsWith('-manual')
          ? 'maintenance_report_run_initiated_manual'
          : 'maintenance_report_run_initiated_scheduled',
        actor: webActor,
      },
    });
    const dispatch = (op: string, payload: Record<string, unknown> = {}) =>
      iid
        ? this.dispatch.dispatchWithInstance(iid, op, {
            ...payload,
            _maintenance_internal: true,
          })
        : this.dispatch.dispatch(op, {
            ...payload,
            _maintenance_internal: true,
          });

    let lockedForService = false;
    try {
      if ((updateMods || updateFactorio) && iid && item?.blockUpdates) {
        step('updates_blocked_skip', { instance_id: iid });
        report.error = 'updates_blocked_by_instance_setting';
        return false;
      }

      const stop = await dispatch('stop_server');
      step('stop_request', { detail: stop });
      if (
        !(await this.waitStatus(
          iid,
          ['stopped', 'error', 'maintenance', 'maintenance_manual'],
          200,
        ))
      ) {
        step('wait_stopped', { ok: false });
        report.error = 'stop_timeout';
        return false;
      }
      step('wait_stopped', { ok: true });

      const needServiceLock = updateMods || updateFactorio;
      if (needServiceLock && iid) {
        const lk = await dispatch('instance_maintenance_lock', {
          instance_id: iid,
          locked: true,
        });
        step('maintenance_lock', { detail: lk });
        if (lk.ok === false) {
          report.error = String(lk.error || 'maintenance_lock_failed');
          return false;
        }
        lockedForService = true;
      }

      if (maintenance) {
        step('maintenance', {
          detail: { message_key: 'maintenance_report_stopped_mode' },
        });
        report.success = true;
        if (iid) this.pendingSet(iid, reportRunId);
        if (applyOneshot) this.maybeDisableOneshotTask(taskId);
        return true;
      }

      if (updateFactorio) {
        const start = await dispatch('factorio_update', {
          maintenance_auto: true,
          experimental: !!item?.experimentalUpdates,
        });
        step('factorio_update_start', { detail: start });
        if (start.ok === false)
          throw new Error(String(start.error || 'factorio_update_failed'));
        if (start.started) {
          const fin = await this.poll(
            iid,
            'factorio_update_status',
            7200,
            'factorio_update_poll_timeout',
          );
          step('factorio_update', { detail: fin });
          if (String(fin.phase || '') !== 'done' || fin.error)
            throw new Error(
              String(fin.error || fin.phase || 'factorio_update_failed'),
            );
        } else {
          step('factorio_update', { ok: true, note: 'already_latest' });
        }
      }

      if (updateMods) {
        const gamePolicy = updateFactorio
          ? 'force'
          : opts.mods_game_version_policy || 'skip';
        let skipModUpdate = false;

        if (gamePolicy === 'cancel') {
          const planCheck = await dispatch('mods_update_all_plan');
          step('mods_update_all_plan', { detail: planCheck });
          if (planCheck.ok === false)
            throw new Error(
              String(planCheck.error || 'mods_update_all_plan_failed'),
            );
          const needsGame = Array.isArray(planCheck.mods_needing_game_update)
            ? planCheck.mods_needing_game_update
            : [];
          if (needsGame.length > 0) {
            step('mods_update_skipped_game_version', {
              ok: true,
              detail: {
                message_key: 'maintenance_report_mods_cancelled_game_version',
                count: needsGame.length,
                mods: needsGame,
              },
            });
            skipModUpdate = true;
          }
        }

        if (!skipModUpdate) {
          const allowRequiresGameUpdate = gamePolicy === 'force';
          const start = await dispatch('mods_job_start', {
            mode: 'update_all',
            remove_old_zips: true,
            actor: webActor,
            maintenance_auto: true,
            allow_requires_game_update: allowRequiresGameUpdate,
          });
          step('mods_job_start', { detail: start });
          if (start.ok === false)
            throw new Error(String(start.error || 'mods_job_start_failed'));
          const fin = await this.poll(
            iid,
            'mods_job_status',
            7200,
            'mods_job_poll_timeout',
          );
          step('mods_update', {
            ok: String(fin.phase || '') === 'done',
            phase: fin.phase,
            summary: fin.summary,
            error: fin.error,
          });
          if (String(fin.phase || '') !== 'done')
            throw new Error(
              String(fin.error || fin.phase || 'mods_job_failed'),
            );
        }
      }

      const startServer = await dispatch('start_server');
      step('start_server', { detail: startServer });
      if (startServer.ok === false)
        throw new Error(String(startServer.error || 'start_failed'));
      if (await this.waitStatus(iid, ['running'], 200)) {
        step('wait_running', { ok: true });
        report.success = true;
      } else {
        step('wait_running', { ok: false });
        report.error = 'start_timeout';
      }

      if (applyOneshot && report.success) this.maybeDisableOneshotTask(taskId);
      return !!report.success;
    } catch (e) {
      report.error = e instanceof Error ? e.message : String(e);
      report.success = false;
      steps.push({
        t: new Date().toISOString(),
        kind: 'exception',
        error: report.error,
      });
      return false;
    } finally {
      if (lockedForService && iid) {
        await dispatch('instance_maintenance_lock', {
          instance_id: iid,
          locked: false,
        });
      }
      report.finished_at = new Date().toISOString();
      this.appendReport(report);
    }
  }

  private async sendWarnChat(key: string, instanceId: string): Promise<void> {
    const iid = String(instanceId || '').trim();
    if (!iid) return;
    const st = await this.dispatch.dispatchWithInstance(iid, 'status', {
      _maintenance_internal: true,
    });
    if (String(st.status_kind || '') !== 'running') return;
    const msg = this.langText(key);
    if (!msg) return;
    try {
      await this.dispatch.dispatchWithInstance(iid, 'chat_send_text', {
        message: msg,
        _maintenance_internal: true,
      });
    } catch {
      /* ignore chat errors */
    }
  }

  private langText(key: string): string {
    const loc = this.locale.getLocale(this.config.langCode);
    const s = loc.strings[key];
    if (typeof s === 'string' && s && s !== key) return s;
    return WARN_FALLBACKS[key] || key;
  }

  private allInstanceIds(): string[] {
    return this.instances
      .load()
      .items.map((it) => String(it.id || '').trim())
      .filter(Boolean);
  }

  private reconcileTasksWithInstances(tasks: MaintenanceTask[]): {
    tasks: MaintenanceTask[];
    changed: boolean;
  } {
    const valid = new Set(this.allInstanceIds());
    let changed = false;
    const out: MaintenanceTask[] = [];
    for (const raw of tasks) {
      if (!raw || typeof raw !== 'object') continue;
      const td = { ...raw };
      const targets = taskTargetInstanceIds(td);
      if (!targets.length || targets[0] === INSTANCE_ALL) {
        out.push(td);
        continue;
      }
      const stale = targets.filter((x) => !valid.has(x));
      if (!stale.length) {
        out.push(td);
        continue;
      }
      const filtered = targets.filter((x) => valid.has(x));
      td.active = false;
      td.instance_ids = filtered;
      delete (td as { instance_id?: string }).instance_id;
      changed = true;
      out.push(td);
    }
    return { tasks: out, changed };
  }

  private normalizeTask(raw: unknown): MaintenanceTask {
    const base: MaintenanceTask = {
      id: randomUUID(),
      active: true,
      time_hhmm: '04:00',
      weekdays: [],
      repeat_weekly: true,
      manual_only: false,
      instance_ids: [],
      options: {
        update_mods: false,
        update_factorio: false,
        maintenance: false,
      },
    };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
    const r = raw as Record<string, unknown>;
    const tid = String(r.id || '').trim();
    base.id = tid || randomUUID();
    base.active = r.active !== false;
    base.time_hhmm = String(r.time_hhmm || '04:00').trim() || '04:00';
    base.manual_only = !!r.manual_only;
    const days: number[] = [];
    if (Array.isArray(r.weekdays)) {
      for (const x of r.weekdays) {
        const d = parseInt(String(x), 10);
        if (Number.isFinite(d) && d >= 0 && d <= 6) days.push(d);
      }
    }
    base.weekdays = [...new Set(days)].sort((a, b) => a - b);
    base.repeat_weekly = r.repeat_weekly !== false;
    if (base.manual_only) {
      base.weekdays = [];
      base.repeat_weekly = false;
    } else if (!base.weekdays.length) {
      base.repeat_weekly = false;
    }
    base.instance_ids = normalizeTaskInstanceIds(r.instance_ids, r.instance_id);
    delete (base as { instance_id?: string }).instance_id;
    base.options = this.normalizedOptions(r.options);
    const tzRaw = String(r.timezone || '').trim();
    if (tzRaw) {
      if (!validateIanaZone(tzRaw)) {
        base.timezone = '';
      } else {
        base.timezone = tzRaw;
      }
    }
    return base;
  }

  private normalizedOptions(raw: unknown): MaintenanceTask['options'] {
    const o: MaintenanceTask['options'] = {
      update_mods: false,
      update_factorio: false,
      maintenance: false,
      mods_game_version_policy: 'skip',
    };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return o;
    const r = raw as Record<string, unknown>;
    if ('update_mods' in r) o.update_mods = !!r.update_mods;
    if ('update_factorio' in r) o.update_factorio = !!r.update_factorio;
    if ('maintenance' in r) o.maintenance = !!r.maintenance;
    if (o.maintenance)
      return { update_mods: false, update_factorio: false, maintenance: true };
    const policyRaw = String(r.mods_game_version_policy || '').trim();
    if (
      policyRaw === 'cancel' ||
      policyRaw === 'skip' ||
      policyRaw === 'force'
    ) {
      o.mods_game_version_policy = policyRaw;
    } else {
      o.mods_game_version_policy = o.update_factorio ? 'force' : 'skip';
    }
    return o;
  }

  private taskBlockedUpdateTargetId(task: MaintenanceTask): string {
    const opts = this.normalizedOptions(task.options);
    if (opts.maintenance) return '';
    if (!opts.update_mods && !opts.update_factorio) return '';
    const targets = taskTargetInstanceIds(task);
    if (!targets.length || targets[0] === INSTANCE_ALL) return '';
    for (const tid of targets) {
      if (this.instances.getById(tid)?.blockUpdates) return tid;
    }
    return '';
  }

  private maybeDisableOneshotTask(taskId: string): void {
    const doc = this.loadDoc();
    let changed = false;
    for (const t of doc.tasks || []) {
      if (t.id !== taskId) continue;
      if (t.manual_only) break;
      if (t.repeat_weekly && t.weekdays?.length) break;
      t.active = false;
      changed = true;
      break;
    }
    if (changed) writeJsonFile(this.paths.maintenancePath, doc);
  }

  private emptyTargetReport(
    taskId: string,
    fireIso: string,
    task: MaintenanceTask,
    webActor: string,
  ): Record<string, unknown> {
    const opts = this.normalizedOptions(task.options);
    const now = new Date().toISOString();
    const manual = fireIso.endsWith('-manual');
    return {
      task_id: taskId,
      run_id: fireIso,
      started_at: now,
      finished_at: now,
      instance_id: '',
      instance_name: '',
      steps: [
        {
          t: now,
          kind: 'run_initiated',
          detail: {
            message_key: manual
              ? 'maintenance_report_run_initiated_manual'
              : 'maintenance_report_run_initiated_scheduled',
            actor: webActor,
          },
        },
      ],
      success: false,
      error: 'no_instance',
      task_options: opts,
      run_trigger: manual ? 'manual' : 'scheduled',
      web_actor: webActor,
    };
  }

  private async waitStatus(
    iid: string,
    wanted: string[],
    timeoutSec: number,
  ): Promise<boolean> {
    const deadline = Date.now() + timeoutSec * 1000;
    while (Date.now() < deadline) {
      const st = iid
        ? await this.dispatch.dispatchWithInstance(iid, 'status', {
            _maintenance_internal: true,
          })
        : await this.dispatch.dispatch('status', {
            _maintenance_internal: true,
          });
      if (wanted.includes(String(st.status_kind || ''))) return true;
      await new Promise((r) => setTimeout(r, 450));
    }
    return false;
  }

  private async poll(
    iid: string,
    op: string,
    timeoutSec: number,
    timeoutError: string,
  ): Promise<Record<string, unknown>> {
    const deadline = Date.now() + timeoutSec * 1000;
    let last: Record<string, unknown> = {};
    while (Date.now() < deadline) {
      last = iid
        ? await this.dispatch.dispatchWithInstance(iid, op, {
            _maintenance_internal: true,
          })
        : await this.dispatch.dispatch(op, { _maintenance_internal: true });
      if (!last.running) return last;
      await new Promise((r) => setTimeout(r, 1000));
    }
    return { phase: 'timeout', error: timeoutError, running: false };
  }

  private loadDoc(): {
    version: number;
    tasks: MaintenanceTask[];
    scheduler_tz: string;
  } {
    return readJsonFile(this.paths.maintenancePath, {
      version: 1,
      tasks: [],
      scheduler_tz: '',
    });
  }

  private loadReports(): Record<string, unknown>[] {
    const p = this.paths.maintenanceReportsPath;
    if (!existsSync(p)) return [];
    try {
      const raw = JSON.parse(readFileSync(p, 'utf-8'));
      if (Array.isArray(raw)) return raw as Record<string, unknown>[];
      if (
        raw &&
        typeof raw === 'object' &&
        Array.isArray((raw as { items?: unknown[] }).items)
      ) {
        return (raw as { items: Record<string, unknown>[] }).items;
      }
    } catch {
      /* ignore */
    }
    return [];
  }

  private appendReport(report: Record<string, unknown>): void {
    if (!report.event_kind && report.task_id)
      report.event_kind = 'maintenance_task';
    this.auditLog.appendMaintenanceRun(report);
  }

  private pendingSet(iid: string, runId: string): void {
    if (!iid) return;
    const data = readJsonFile<Record<string, unknown>>(
      this.paths.maintenancePendingPath,
      {},
    );
    data[iid] = { run_id: runId };
    writeJsonFile(this.paths.maintenancePendingPath, data);
    const item = this.instances.getById(iid);
    this.auditLog.beginManualSession(iid, item?.name || iid, runId);
  }

  private maintLog(text: string): void {
    const line = `[maintenance] ${text}`;
    this.log.log(text);
    if (!this.logRotation.logWriteMaintenanceEnabled()) return;
    const stamped = `${new Date().toISOString().slice(0, 19)} ${line}`;
    this.logRotation.appendLine(
      this.paths.maintenanceSchedulerLogPath(),
      stamped,
    );
  }
}
