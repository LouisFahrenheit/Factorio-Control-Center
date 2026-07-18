import type { MaintenanceReport, MaintenanceReportStep } from '../types/maintenance';
import { formatPanelActorDisplay } from './actorUtils';
import { formatPanelClock } from './datetimeUtils';

function reportClockFromTs(iso: string | undefined): string {
  return formatPanelClock(iso);
}

function reportStepTitle(kind: string, t: (key: string) => string): string {
  const id = String(kind || 'unknown').trim() || 'unknown';
  const key = 'maintenance_report_step_' + id;
  const tr = t(key);
  return tr !== key ? tr : id;
}

function parseDetail(detail: unknown): Record<string, unknown> | null {
  if (detail == null) return null;
  if (typeof detail === 'object' && !Array.isArray(detail)) return detail as Record<string, unknown>;
  if (typeof detail === 'string') {
    try {
      const j = JSON.parse(detail);
      if (j && typeof j === 'object') return j as Record<string, unknown>;
    } catch {
      /* ignore */
    }
    return { _raw: detail };
  }
  return { _raw: String(detail) };
}

function reportStopHuman(step: MaintenanceReportStep, t: (key: string) => string): string {
  if (step?.ok === false) {
    const se = step.error != null ? String(step.error) : '';
    if (se.toLowerCase() === 'not_running') return t('maintenance_report_stop_already_stopped');
    return se ? t(se) : t('maintenance_report_fail');
  }
  const d = parseDetail(step?.detail);
  if (!d) return t('maintenance_report_stop_command_sent');
  if (d._raw != null && /not_running/i.test(String(d._raw))) {
    return t('maintenance_report_stop_already_stopped');
  }
  if (String(d.process_state || '').toLowerCase() === 'not_running') {
    return t('maintenance_report_stop_already_stopped');
  }
  if (d.ok === false && d.error != null) {
    const err = String(d.error);
    if (err.toLowerCase() === 'not_running') return t('maintenance_report_stop_already_stopped');
    return t(err);
  }
  return t('maintenance_report_stop_command_sent');
}

function appendModsSummaryLines(
  summary: Record<string, unknown> | null,
  lines: string[],
  t: (key: string, ...args: (string | number)[]) => string,
): void {
  if (!summary) return;
  const installed = Array.isArray(summary.installed) ? summary.installed : [];
  const updated = Array.isArray(summary.updated) ? summary.updated : [];
  const skipped = Array.isArray(summary.skipped) ? summary.skipped : [];
  const failed = Array.isArray(summary.failed) ? summary.failed : [];
  const skippedRequiresGame = skipped.filter(
    (m) => m && typeof m === 'object' && String((m as Record<string, unknown>).reason_key || '') === 'mod_skip_requires_newer_factorio',
  );
  const reportableCount = installed.length + updated.length + skippedRequiresGame.length + failed.length;

  if (!reportableCount) {
    lines.push(t('mod_job_log_nothing'));
    return;
  }

  lines.push(
    t('maintenance_report_mods_totals')
      .replace(/\{u\}/g, String(updated.length))
      .replace(/\{s\}/g, String(skippedRequiresGame.length))
      .replace(/\{f\}/g, String(failed.length)),
  );

  updated.forEach((m: unknown) => {
    const row = m as Record<string, unknown>;
    lines.push(
      t('maintenance_report_diff_mod_version')
        .replace(/\{name\}/g, String(row?.name || ''))
        .replace(/\{from\}/g, String(row?.from_version || row?.from || '—'))
        .replace(/\{to\}/g, String(row?.version || row?.to || '')),
    );
  });

  installed.forEach((m: unknown) => {
    const row = m as Record<string, unknown>;
    lines.push(
      t('maintenance_report_diff_mod_added')
        .replace(/\{name\}/g, String(row?.name || ''))
        .replace(/\{v\}/g, String(row?.version || '')),
    );
  });

  if (skippedRequiresGame.length) {
    lines.push(t('maintenance_report_mods_skipped_requires_game_heading'));
    skippedRequiresGame.forEach((m: unknown) => {
      const row = m as Record<string, unknown>;
      lines.push(
        t('maintenance_report_mod_skip_requires_game', String(row?.name || ''), String(row?.required_factorio || ''), String(row?.current_factorio || '')),
      );
    });
  }

  failed.forEach((m: unknown) => {
    const row = m as Record<string, unknown>;
    const name = String(row?.name || '');
    const error = String(row?.error || t('maintenance_report_fail'));
    if (name) lines.push(t('mod_job_log_failed', name, error));
  });
}

function appendDiffLines(diff: Record<string, unknown>, lines: string[], t: (key: string, ...args: (string | number)[]) => string) {
  if (diff.unchanged === true) {
    lines.push(t('maintenance_report_diff_unchanged'));
    return;
  }
  if (diff.unchanged !== false) return;
  if (diff.game_version_changed) {
    lines.push(
      t('maintenance_report_diff_game')
        .replace(/\{from\}/g, String(diff.game_version_from || ''))
        .replace(/\{to\}/g, String(diff.game_version_to || '')),
    );
  }
  (Array.isArray(diff.mods_added) ? diff.mods_added : []).forEach((m: unknown) => {
    const row = m as Record<string, unknown>;
    lines.push(
      t('maintenance_report_diff_mod_added')
        .replace(/\{name\}/g, String(row?.name || ''))
        .replace(/\{v\}/g, String(row?.version || '')),
    );
  });
  (Array.isArray(diff.mods_removed) ? diff.mods_removed : []).forEach((m: unknown) => {
    const row = m as Record<string, unknown>;
    lines.push(
      t('maintenance_report_diff_mod_removed')
        .replace(/\{name\}/g, String(row?.name || ''))
        .replace(/\{v\}/g, String(row?.version || '')),
    );
  });
  (Array.isArray(diff.mods_version_changed) ? diff.mods_version_changed : []).forEach((m: unknown) => {
    const row = m as Record<string, unknown>;
    lines.push(
      t('maintenance_report_diff_mod_version')
        .replace(/\{name\}/g, String(row?.name || ''))
        .replace(/\{from\}/g, String(row?.from || ''))
        .replace(/\{to\}/g, String(row?.to || '')),
    );
  });
}

export function formatAuditActorDisplay(raw: string | undefined): string {
  return formatPanelActorDisplay(raw);
}

function appendSettingsChangeLines(
  changes: unknown[],
  lines: string[],
  t: (key: string, ...args: (string | number)[]) => string,
): void {
  changes.forEach((row) => {
    if (!row || typeof row !== 'object') return;
    const c = row as Record<string, unknown>;
    const key = String(c.key || '').trim();
    if (!key) return;
    lines.push(
      t('audit_settings_field_line', key, String(c.from ?? '—'), String(c.to ?? '—')),
    );
  });
}

function formatAuditDetail(d: Record<string, unknown>, t: (key: string, ...args: (string | number)[]) => string): string {
  const mk = String(d.message_key || '').trim();
  if (!mk) return '';
  const enriched = { ...d };
  if (enriched.enabled === true) enriched.state = t('audit_mod_state_enabled');
  else if (enriched.enabled === false) enriched.state = t('audit_mod_state_disabled');
  let msg = t(mk);
  if (msg === mk) return mk;
  const args = Array.isArray(enriched.message_args) ? enriched.message_args : [];
  args.forEach((a, i) => {
    msg = msg.split(`{${i}}`).join(String(a));
  });
  Object.keys(enriched).forEach((k) => {
    if (k === 'message_key' || k === 'message_args' || k === 'installed_items' || k === 'updated_items') return;
    const v = enriched[k];
    if (v != null && typeof v !== 'object') {
      msg = msg.split(`{${k}}`).join(String(v));
    }
  });
  return msg;
}

function formatRunInitiatedMain(
  step: MaintenanceReportStep,
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  const d = parseDetail(step?.detail);
  const who = formatAuditActorDisplay(String(d?.actor || step?.web_actor || ''));
  const mk = String(d?.message_key || '').trim();
  if (mk) {
    const msg = who !== '—' ? t(mk, who) : t(mk, '—');
    if (msg !== mk) return msg;
  }
  if (who !== '—') return t('maintenance_report_run_initiated_manual', who);
  return reportStepTitle('run_initiated', t);
}

function isManualMaintenanceRun(rep: MaintenanceReport): boolean {
  return (
    String(rep.report_kind || rep.event_kind || '') === 'maintenance_run' &&
    (String(rep.run_trigger || '') === 'manual' || String(rep.run_id || '').includes('-manual'))
  );
}

function reportStepActor(step: MaintenanceReportStep, kind: string): string {
  if (kind === 'run_initiated') {
    return formatAuditActorDisplay(String(parseDetail(step?.detail)?.actor || step?.web_actor || ''));
  }
  if (
    kind === 'audit_event' ||
    kind === 'session_start' ||
    kind === 'session_end' ||
    kind === 'maintenance_manual_resume' ||
    kind === 'maintenance_manual_dismissed'
  ) {
    return formatAuditActorDisplay(String(step?.web_actor || ''));
  }
  return '—';
}

function describeStep(
  step: MaintenanceReportStep,
  t: (key: string, ...args: (string | number)[]) => string,
): { main: string; extra: string[]; actor: string } {
  const kind = String(step?.kind || '');
  const title = reportStepTitle(kind, t);
  const ok = step?.ok !== false;
  const extra: string[] = [];
  const actor = reportStepActor(step, kind);
  const pushMain = (suffix: string) => title + (suffix ? ' — ' + suffix : '');

  switch (kind) {
    case 'run_initiated':
      return { main: formatRunInitiatedMain(step, t), extra, actor };
    case 'instance_ready': {
      const iid = step?.instance_id != null ? String(step.instance_id).trim() : '';
      const short = iid && iid.length > 14 ? iid.slice(0, 6) + '…' + iid.slice(-4) : iid;
      return { main: short ? title + ' (' + short + ')' : title, extra, actor };
    }
    case 'stop_request':
      return { main: pushMain(reportStopHuman(step, t)), extra, actor };
    case 'wait_stopped':
    case 'wait_running':
      return { main: pushMain(ok ? t('maintenance_report_step_state_ok') : t('maintenance_report_fail')), extra, actor };
    case 'maintenance_lock':
      return { main: pushMain(ok ? t('maintenance_report_step_state_ok') : t('maintenance_report_fail')), extra, actor };
    case 'maintenance': {
      const det = step?.detail;
      if (typeof det === 'string') return { main: pushMain(t(det)), extra, actor };
      if (det && typeof det === 'object' && !Array.isArray(det)) {
        const d = det as Record<string, unknown>;
        const mk = String(d.message_key || '').trim();
        const summary = mk ? t(mk) : t('maintenance_report_stopped_mode');
        const lines: string[] = [];
        if (d.baseline_error) {
          lines.push(t('maintenance_report_after_snapshot_failed').replace(/\{err\}/g, String(d.baseline_error)));
        }
        return { main: pushMain(summary), extra: lines, actor };
      }
      return { main: title, extra, actor };
    }
    case 'maintenance_manual_resume':
    case 'maintenance_manual_dismissed': {
      const lines: string[] = [];
      if (kind === 'maintenance_manual_dismissed') {
        lines.push(t('maintenance_report_manual_dismissed_planned'));
      }
      if (step?.after_error) {
        lines.push(t('maintenance_report_after_snapshot_failed').replace(/\{err\}/g, String(step.after_error)));
        return { main: reportStepTitle(kind, t), extra: lines, actor };
      }
      const diff = step?.diff;
      if (diff && typeof diff === 'object') appendDiffLines(diff as Record<string, unknown>, lines, t);
      return { main: reportStepTitle(kind, t), extra: lines, actor };
    }
    case 'exception':
      return { main: title + ' — ' + String(step?.error || t('maintenance_report_fail')), extra, actor };
    case 'maintenance_run': {
      const d = parseDetail(step?.detail);
      const mk = String(d?.message_key || 'audit_event_maintenance_run').trim();
      let main = t(mk);
      const taskId = String(step?.task_id || '').trim();
      if (taskId) {
        main += ' — ' + t('maintenance_report_task_ref').replace(/\{id\}/g, taskId);
      }
      const trig = String(step?.run_trigger || '').trim();
      if (trig === 'manual') main += ' · ' + t('maintenance_report_type_manual');
      else if (trig === 'scheduled') main += ' · ' + t('maintenance_report_type_scheduled');
      const lines: string[] = [];
      const subSteps = Array.isArray(step?.sub_steps) ? step.sub_steps : [];
      subSteps.forEach((ss) => {
        const sub = describeStep(ss as MaintenanceReportStep, t);
        lines.push('· ' + sub.main);
        sub.extra.forEach((ln) => lines.push('  ' + ln));
      });
      if (step?.error) lines.push(String(step.error));
      return { main, extra: lines, actor };
    }
    case 'session_start':
    case 'session_end': {
      const d = parseDetail(step?.detail);
      const mk = String(d?.message_key || kind).trim();
      const main = t(mk) !== mk ? t(mk) : title;
      return { main, extra, actor };
    }
    case 'mods_update_skipped_game_version': {
      const d = parseDetail(step?.detail);
      const mk = String(d?.message_key || 'maintenance_report_mods_cancelled_game_version').trim();
      const count = Number(d?.count || 0);
      const mods = Array.isArray(d?.mods) ? d!.mods : [];
      const lines: string[] = [];
      if (count > 0) {
        lines.push(t(mk).replace(/\{0\}/g, String(count)));
      } else if (mk) {
        lines.push(t(mk));
      }
      mods.forEach((m: unknown) => {
        const row = m as Record<string, unknown>;
        const name = String(row?.name || '').trim();
        if (!name) return;
        lines.push(
          t('maintenance_report_mod_skip_requires_game', name, String(row?.required_factorio || ''), String(row?.current_factorio || '')),
        );
      });
      return { main: title, extra: lines, actor };
    }
    case 'mods_update': {
      const summary =
        step?.summary && typeof step.summary === 'object' && !Array.isArray(step.summary)
          ? (step.summary as Record<string, unknown>)
          : null;
      const lines: string[] = [];
      appendModsSummaryLines(summary, lines, t);
      if (!ok) {
        const phase = String(step?.phase || '').trim();
        const errRaw = String(step?.error || '').trim();
        let errLabel = '';
        if (phase === 'cancelled') errLabel = t('mod_job_phase_cancelled');
        else if (errRaw) errLabel = t(errRaw) !== errRaw ? t(errRaw) : errRaw;
        else if (phase && phase !== 'done') errLabel = t('mod_job_phase_error');
        return {
          main: errLabel ? title + ' — ' + errLabel : title + ' — ' + t('maintenance_report_fail'),
          extra: lines,
          actor,
        };
      }
      return { main: title, extra: lines, actor };
    }
    case 'factorio_update': {
      const lines: string[] = [];
      if (String(step?.note || '') === 'already_latest') {
        return {
          main: pushMain(t('maintenance_report_factorio_up_to_date').replace(/\{v\}/g, '—')),
          extra: lines,
          actor,
        };
      }
      const d = parseDetail(step?.detail);
      const from = String(d?.current || d?.from || '').trim();
      const to = String(d?.final_to || d?.to || '').trim();
      if (from && to) {
        lines.push(t('maintenance_report_factorio_from_to').replace(/\{f\}/g, from).replace(/\{t\}/g, to));
      } else if (from && ok) {
        lines.push(t('maintenance_report_factorio_up_to_date').replace(/\{v\}/g, from));
      }
      if (!ok) {
        const errRaw = String(d?.error || d?.error_key || step?.error || step?.phase || '').trim();
        const errLabel = errRaw && t(errRaw) !== errRaw ? t(errRaw) : errRaw || t('maintenance_report_fail');
        return { main: title + ' — ' + errLabel, extra: lines, actor };
      }
      return { main: title, extra: lines, actor };
    }
    case 'audit_event': {
      const d = parseDetail(step?.detail);
      if (!d) return { main: title, extra: [], actor };
      const changes = Array.isArray(d.changes) ? d.changes : [];
      const eventKind = String(d.event_kind || '').trim();
      let main = '';
      const lines: string[] = [];
      if (changes.length) {
        main =
          eventKind === 'server_config'
            ? t('audit_event_server_config_changed')
            : t('audit_event_server_settings_changed');
        appendSettingsChangeLines(changes, lines, t);
      } else {
        main = formatAuditDetail(d, t) || title;
      }
      const installed = Array.isArray(d.installed_items) ? d.installed_items : [];
      const updated = Array.isArray(d.updated_items) ? d.updated_items : [];
      installed.forEach((m: unknown) => {
        const row = m as Record<string, unknown>;
        lines.push(
          t('maintenance_report_diff_mod_added')
            .replace(/\{name\}/g, String(row?.name || ''))
            .replace(/\{v\}/g, String(row?.version || '')),
        );
      });
      updated.forEach((m: unknown) => {
        const row = m as Record<string, unknown>;
        lines.push(
          t('maintenance_report_diff_mod_version')
            .replace(/\{name\}/g, String(row?.name || ''))
            .replace(/\{from\}/g, String(row?.from_version || row?.from || ''))
            .replace(/\{to\}/g, String(row?.to || row?.version || '')),
        );
      });
      return { main, extra: lines, actor };
    }
    default: {
      const bits: string[] = [];
      if (step && typeof step === 'object') {
        Object.keys(step).forEach((k) => {
          if (k === 't' || k === 'kind' || k === 'web_actor') return;
          const v = step[k];
          if (v != null && v !== '' && typeof v !== 'object') bits.push(k + '=' + String(v));
        });
      }
      return { main: bits.length ? title + ' — ' + bits.join(', ') : title, extra, actor };
    }
  }
}

export interface MaintenanceReportEventRow {
  time: string;
  action: string;
  details: string[];
  actor: string;
  ok?: boolean;
}

const HIDDEN_MAINTENANCE_STEP_KINDS = new Set(['instance_ready']);

function visibleReportSteps(steps: MaintenanceReportStep[] | undefined): MaintenanceReportStep[] {
  if (!Array.isArray(steps)) return [];
  return steps.filter((s) => !HIDDEN_MAINTENANCE_STEP_KINDS.has(String(s?.kind || '')));
}

export function buildReportEventRows(
  rep: MaintenanceReport | null | undefined,
  t: (key: string, ...args: (string | number)[]) => string,
): MaintenanceReportEventRow[] {
  if (!rep || !Array.isArray(rep.steps)) return [];
  return visibleReportSteps(rep.steps).map((step) => {
    const d = describeStep(step, t);
    return {
      time: reportClockFromTs(step?.t),
      action: d.main,
      details: d.extra,
      actor: d.actor,
      ok: step?.ok !== false,
    };
  });
}

export function formatMaintenanceReportSummary(
  rep: MaintenanceReport | null | undefined,
  t: (key: string, ...args: (string | number)[]) => string,
  durationBetween: (a?: string, b?: string) => string,
): { title: string; meta: string[] } {
  if (!rep) return { title: '', meta: [] };
  const meta: string[] = [];
  if (isManualMaintenanceRun(rep)) {
    const who = formatAuditActorDisplay(String(rep.web_actor || ''));
    if (who !== '—') meta.push(t('maintenance_report_initiated_by', who));
  }
  const inst = String(rep.instance_name || rep.instance_id || '').trim();
  if (inst) meta.push(t('maintenance_report_hdr_instance') + ': ' + inst);
  const dur = durationBetween(rep.started_at, rep.finished_at);
  if (dur) meta.push(dur);
  if (Array.isArray(rep.steps)) meta.push(t('server_log_events_count', visibleReportSteps(rep.steps).length));
  return {
    title: reportKindHeadline(rep, t),
    meta,
  };
}

function reportKindHeadline(
  rep: MaintenanceReport,
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  const kind = String(rep.report_kind || rep.event_kind || '');
  const status = rep.success !== false ? t('maintenance_report_ok') : t('maintenance_report_fail');
  if (kind === 'manual_session') return t('audit_report_kind_manual_session') + ' · ' + status;
  if (kind === 'maintenance_run') return t('audit_report_kind_maintenance_run') + ' · ' + status;
  return status;
}
