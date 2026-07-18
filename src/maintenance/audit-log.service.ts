import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { writeFileSync } from 'fs';
import { readJsonFile, writeJsonFile } from '../common/json-store';
import { PathsService } from '../config/paths.service';
import { LogRotationService } from '../logging/log-rotation.service';
import { panelActorLogLabel } from '../shared/panel-actor';

export type AuditTrigger = 'manual' | 'scheduled' | 'system';
export type ReportKind = 'manual_session' | 'maintenance_run';

export interface AuditRecordOptions {
  event_kind: string;
  instance_id?: string;
  instance_name?: string;
  actor?: string;
  trigger?: AuditTrigger;
  success?: boolean;
  error?: string;
  message_key?: string;
  message_args?: unknown[];
  detail?: Record<string, unknown>;
  started_at?: string;
  finished_at?: string;
}

const MAX_STEPS_PER_REPORT = 500;
const MAX_REPORTS = 200;

interface OpenSessionRow {
  run_id: string;
  started_at: string;
}

@Injectable()
export class AuditLogService {
  constructor(
    private readonly paths: PathsService,
    private readonly logRotation: LogRotationService,
  ) {}

  record(opts: AuditRecordOptions): void {
    const instId = String(opts.instance_id || '').trim();
    if (!instId) return;

    const finished =
      String(opts.finished_at || this.nowIso()).trim() || this.nowIso();
    const detail: Record<string, unknown> = {
      ...(opts.detail || {}),
      event_kind: opts.event_kind,
    };
    if (opts.message_key) detail.message_key = opts.message_key;
    if (opts.message_args?.length) detail.message_args = opts.message_args;

    const step = {
      kind: 'audit_event',
      t: finished,
      ok: opts.success !== false,
      error: opts.error,
      web_actor: opts.actor || undefined,
      run_trigger: opts.trigger || (opts.actor ? 'manual' : 'system'),
      detail,
    };

    const openManual = this.getOpenManualSession(instId);
    if (openManual) {
      this.appendStepToReport(openManual.run_id, step, opts.success !== false);
    }
    this.appendAuditFile(opts, finished);
  }

  beginManualSession(
    instanceId: string,
    instanceName: string,
    linkedRunId?: string,
  ): void {
    const iid = String(instanceId || '').trim();
    if (!iid) return;
    const existing = this.getOpenManualSession(iid);
    if (existing) return;

    const now = this.nowIso();
    const runId = `manual-${iid}-${Date.now()}-${randomBytes(3).toString('hex')}`;
    const sessions = this.loadOpenSessions();
    sessions[iid] = { run_id: runId, started_at: now };
    this.saveOpenSessions(sessions);

    const data = this.loadReports();
    data.unshift({
      run_id: runId,
      report_kind: 'manual_session',
      event_kind: 'manual_session',
      instance_id: iid,
      instance_name: instanceName || iid,
      started_at: now,
      finished_at: now,
      success: true,
      open: true,
      linked_run_id: linkedRunId || undefined,
      steps: [
        {
          kind: 'session_start',
          t: now,
          ok: true,
          detail: { message_key: 'audit_session_manual_started' },
        },
      ],
    });
    this.saveReports(data);
  }

  appendManualResumeStep(instanceId: string, actor?: string): void {
    const iid = String(instanceId || '').trim();
    if (!iid) return;
    const row = this.getOpenManualSession(iid);
    if (!row) return;
    const now = this.nowIso();
    this.appendStepToReport(
      row.run_id,
      {
        kind: 'maintenance_manual_resume',
        t: now,
        ok: true,
        web_actor: actor || undefined,
      },
      true,
    );
  }

  endManualSession(instanceId: string, actor?: string): void {
    const iid = String(instanceId || '').trim();
    if (!iid) return;
    const sessions = this.loadOpenSessions();
    const row = sessions[iid];
    if (!row) return;
    delete sessions[iid];
    this.saveOpenSessions(sessions);

    const now = this.nowIso();
    this.appendStepToReport(
      row.run_id,
      {
        kind: 'session_end',
        t: now,
        ok: true,
        web_actor: actor || undefined,
        detail: { message_key: 'audit_session_manual_ended' },
      },
      true,
    );
    const data = this.loadReports();
    const idx = data.findIndex((r) => String(r.run_id || '') === row.run_id);
    if (idx >= 0) {
      const rep = { ...data[idx] };
      rep.finished_at = now;
      rep.open = false;
      data.splice(idx, 1);
      data.unshift(rep);
      this.saveReports(data);
    }
  }

  appendMaintenanceRun(report: Record<string, unknown>): void {
    const instId = String(report.instance_id || '').trim();
    if (!instId) {
      this.prependReport(report);
      return;
    }

    const trigger = String(report.run_trigger || '').trim() || 'scheduled';
    const runId = String(
      report.run_id || `maint-${instId}-${Date.now()}`,
    ).trim();
    const steps = Array.isArray(report.steps) ? report.steps : [];

    const entry: Record<string, unknown> = {
      run_id: runId,
      report_kind: 'maintenance_run',
      event_kind: 'maintenance_run',
      instance_id: instId,
      instance_name: String(report.instance_name || instId),
      started_at: report.started_at || this.nowIso(),
      finished_at: report.finished_at || this.nowIso(),
      success: report.success !== false,
      error: report.error || undefined,
      run_trigger: trigger,
      task_id: report.task_id,
      task_options: report.task_options,
      web_actor: report.web_actor || undefined,
      steps,
    };

    const data = this.loadReports();
    const idx = data.findIndex(
      (r) =>
        String(r.run_id || '') === runId &&
        String(r.report_kind || r.event_kind || '') === 'maintenance_run',
    );
    if (idx >= 0) {
      const updated = { ...data[idx], ...entry };
      data.splice(idx, 1);
      data.unshift(updated);
    } else {
      data.unshift(entry);
    }
    this.saveReports(data);
  }

  listReports(): Record<string, unknown>[] {
    return this.loadReports()
      .filter((r) => {
        const kind = String(r.report_kind || r.event_kind || '');
        return kind === 'manual_session' || kind === 'maintenance_run';
      })
      .slice(0, MAX_REPORTS);
  }

  purgeInstance(instanceId: string): void {
    const iid = String(instanceId || '').trim();
    if (!iid) return;

    const sessions = this.loadOpenSessions();
    if (sessions[iid]) {
      delete sessions[iid];
      this.saveOpenSessions(sessions);
    }

    const data = this.loadReports();
    const filtered = data.filter((r) => String(r.instance_id || '') !== iid);
    if (filtered.length !== data.length) this.saveReports(filtered);
  }

  hasOpenManualSession(instanceId: string): boolean {
    return !!this.getOpenManualSession(String(instanceId || '').trim());
  }

  private getOpenManualSession(instanceId: string): OpenSessionRow | null {
    if (!instanceId) return null;
    const sessions = this.loadOpenSessions();
    const row = sessions[instanceId];
    return row && row.run_id ? row : null;
  }

  private appendStepToReport(
    runId: string,
    step: Record<string, unknown>,
    success: boolean,
  ): void {
    const data = this.loadReports();
    const idx = data.findIndex((r) => String(r.run_id || '') === runId);
    if (idx < 0) return;

    const report = { ...data[idx] };
    const steps = Array.isArray(report.steps)
      ? [...(report.steps as unknown[])]
      : [];
    steps.push(step);
    if (steps.length > MAX_STEPS_PER_REPORT) {
      steps.splice(0, steps.length - MAX_STEPS_PER_REPORT);
    }
    report.steps = steps;
    report.finished_at = String(step.t || this.nowIso());
    if (!success) report.success = false;
    data.splice(idx, 1);
    data.unshift(report);
    this.saveReports(data);
  }

  private prependReport(report: Record<string, unknown>): void {
    const data = this.loadReports();
    data.unshift(report);
    this.saveReports(data.slice(0, MAX_REPORTS));
  }

  private loadOpenSessions(): Record<string, OpenSessionRow> {
    return readJsonFile<Record<string, OpenSessionRow>>(
      this.paths.auditOpenSessionsPath,
      {},
    );
  }

  private saveOpenSessions(data: Record<string, OpenSessionRow>): void {
    writeJsonFile(this.paths.auditOpenSessionsPath, data);
  }

  private loadReports(): Record<string, unknown>[] {
    try {
      const raw = readJsonFile<unknown>(this.paths.maintenanceReportsPath, []);
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

  private saveReports(data: Record<string, unknown>[]): void {
    const cleaned = data.filter(
      (r) => String(r.report_kind || r.event_kind || '') !== 'daily',
    );
    writeFileSync(
      this.paths.maintenanceReportsPath,
      JSON.stringify(cleaned.slice(0, MAX_REPORTS), null, 2) + '\n',
      'utf-8',
    );
  }

  private nowIso(): string {
    return new Date().toISOString().slice(0, 19).replace('T', ' ');
  }

  private appendAuditFile(opts: AuditRecordOptions, finishedAt: string): void {
    if (!this.logRotation.logWriteAuditEnabled()) return;
    const actor = panelActorLogLabel(String(opts.actor || ''), 'system');
    const inst =
      String(opts.instance_name || opts.instance_id || '?').trim() || '?';
    const kind = String(opts.event_kind || 'event').trim() || 'event';
    const status = opts.success !== false ? 'ok' : 'failed';
    const err =
      opts.success === false && opts.error ? ` — ${String(opts.error)}` : '';
    const detail = this.auditFileDetail(opts.detail);
    const line = `[${finishedAt}] [${kind}] ${actor} @ ${inst}: ${status}${err}${detail}`;
    this.logRotation.appendLine(this.paths.auditLogPath(), line);
  }

  private auditFileDetail(detail?: Record<string, unknown>): string {
    if (!detail || !Object.keys(detail).length) return '';
    const parts: string[] = [];
    const name = detail.name != null ? String(detail.name) : '';
    const newName = detail.new_name != null ? String(detail.new_name) : '';
    const modName = detail.name != null ? String(detail.name) : '';
    if (name && newName) parts.push(`${name} → ${newName}`);
    else if (name) parts.push(name);
    else if (modName && detail.enabled != null)
      parts.push(`${modName}=${detail.enabled ? 'on' : 'off'}`);
    const changes = detail.changes;
    if (Array.isArray(changes) && changes.length) {
      parts.push(`${changes.length} change(s)`);
    }
    return parts.length ? ` (${parts.join(', ')})` : '';
  }
}
