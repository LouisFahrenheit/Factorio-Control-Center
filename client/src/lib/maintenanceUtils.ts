import type { InstanceItem } from '../types/instance';
import type { MaintenanceTask, MaintenanceReport } from '../types/maintenance';
import { INSTANCE_ALL } from '@fcc/shared/maintenance-time';
import { getBrowserTimezone, hhmmForBrowserInput, taskTimezone } from './maintenanceSchedule';
import { formatPanelDateTime } from './datetimeUtils';

const TZ_FALLBACK = ['UTC', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Los_Angeles', 'Asia/Tokyo'];

export function getAllTimezones(): string[] {
  try {
    const intl = Intl as typeof Intl & { supportedValuesOf?: (key: string) => string[] };
    if (typeof intl.supportedValuesOf === 'function') {
      const z = intl.supportedValuesOf('timeZone');
      if (z?.length) return z.slice().sort();
    }
  } catch {
    /* ignore */
  }
  return TZ_FALLBACK.slice().sort();
}

function maintUiLocale(): string {
  try {
    return document.documentElement.lang || navigator.language || 'en';
  } catch {
    return 'en';
  }
}

export function formatHhmmForDisplay(hhmm: string | undefined): string {
  const parts = String(hhmm || '')
    .trim()
    .split(':');
  if (parts.length !== 2) return String(hhmm || '—').trim() || '—';
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return String(hhmm || '—');
  const d = new Date(2000, 0, 1, h, m, 0, 0);
  try {
    return new Intl.DateTimeFormat(maintUiLocale(), { hour: 'numeric', minute: '2-digit' }).format(d);
  } catch {
    return String(hhmm);
  }
}

export function formatTaskScheduleTime(task: MaintenanceTask): string {
  const browserTz = getBrowserTimezone();
  const storedTz = taskTimezone(task);
  const hhmm = hhmmForBrowserInput(String(task.time_hhmm || ''), storedTz, browserTz);
  return formatHhmmForDisplay(hhmm);
}

export { getBrowserTimezone };

export function taskScheduleSummaryLine(
  task: MaintenanceTask,
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  if (task?.manual_only) return t('maintenance_card_schedule_manual');
  const wd = Array.isArray(task?.weekdays) ? task.weekdays : [];
  const rep = task?.repeat_weekly !== false;
  const repS = rep ? t('maintenance_card_repeat_weekly_short') : t('maintenance_card_repeat_once_short');
  if (wd.length === 7) return t('maintenance_card_wd_every_day') + ' · ' + repS;
  if (wd.length === 0) return t('maintenance_card_wd_once') + ' · ' + repS;
  const labels = wd.map((d) => t('maintenance_wd_' + d)).join(', ');
  return (labels || '—') + ' · ' + repS;
}

export function instanceLabel(
  task: MaintenanceTask,
  instances: InstanceItem[],
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  const ids = Array.isArray(task?.instance_ids)
    ? task.instance_ids.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  if (!ids.length) return '—';
  if (ids.length === 1 && ids[0] === INSTANCE_ALL) return t('maintenance_instance_all');
  if (ids.length === 1) {
    const row = instances.find((x) => String(x.id || '') === ids[0]);
    return row ? String(row.name || ids[0]).trim() || ids[0] : ids[0];
  }
  const names = ids.map((iid) => {
    const row = instances.find((x) => String(x.id || '') === iid);
    return row ? String(row.name || iid).trim() || iid : iid;
  });
  let joined = names.join(', ');
  if (joined.length > 80) joined = joined.slice(0, 77) + '...';
  return t('maintenance_editor_instance_multi')
    .replace(/\{n\}/g, String(ids.length))
    .replace(/\{names\}/g, joined);
}

function parseNextFireMs(iso: string | undefined): number {
  if (iso == null || iso === '') return NaN;
  let s = String(iso).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s)) s = s.replace(' ', 'T');
  return Date.parse(s);
}

export function formatNextFireAbsolute(iso: string | undefined): string {
  if (!iso) return '—';
  const ms = parseNextFireMs(iso);
  if (!Number.isFinite(ms)) return String(iso).trim().replace('T', ' ');
  try {
    return new Intl.DateTimeFormat(maintUiLocale(), { dateStyle: 'short', timeStyle: 'short' }).format(new Date(ms));
  } catch {
    return String(iso).trim().replace('T', ' ');
  }
}

export function relativeToNextFire(iso: string | undefined): string {
  const ms = parseNextFireMs(iso);
  if (!Number.isFinite(ms)) return '';
  const sec = Math.round((ms - Date.now()) / 1000);
  const loc = maintUiLocale();
  try {
    const rtf = new Intl.RelativeTimeFormat(loc, { numeric: 'auto' });
    const a = Math.abs(sec);
    if (a < 45) return rtf.format(sec, 'second');
    const min = Math.round(sec / 60);
    if (Math.abs(min) < 60) return rtf.format(min, 'minute');
    const hr = Math.round(sec / 3600);
    if (Math.abs(hr) < 36) return rtf.format(hr, 'hour');
    const day = Math.round(sec / 86400);
    if (Math.abs(day) < 21) return rtf.format(day, 'day');
    const week = Math.round(sec / 604800);
    return rtf.format(week, 'week');
  } catch {
    return '';
  }
}

export function nextFireCardLabel(iso: string | undefined): string {
  const abs = formatNextFireAbsolute(iso);
  if (abs === '—') return abs;
  const rel = relativeToNextFire(iso);
  return rel ? abs + ' (' + rel + ')' : abs;
}

export function taskOptionsSummary(
  task: MaintenanceTask,
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  const o = task?.options && typeof task.options === 'object' ? task.options : {};
  const maintenance = !!o.maintenance;
  const mods = !!o.update_mods && !maintenance;
  const server = !!o.update_factorio && !maintenance;
  const parts: string[] = [];
  if (server) parts.push(t('maintenance_card_tag_server'));
  if (mods) parts.push(t('maintenance_card_tag_mods'));
  if (maintenance) parts.push(t('maintenance_card_tag_maintenance'));
  return parts.length ? parts.join(' · ') : t('maintenance_card_tag_none');
}

export function sortTasksForDisplay(tasks: MaintenanceTask[]): MaintenanceTask[] {
  return tasks.slice().sort((a, b) => {
    const aa = !!a?.active;
    const bb = !!b?.active;
    if (aa !== bb) return aa ? -1 : 1;
    return 0;
  });
}

export function reportSelectionKey(rep: {
  started_at?: string;
  task_id?: string;
  run_id?: string;
  instance_id?: string;
  report_kind?: string;
  event_kind?: string;
}): string {
  const kind = String(rep.report_kind || rep.event_kind || '');
  const runId = String(rep.run_id || '').trim();
  if (runId) return `${kind}|${runId}`;
  return [kind, rep.instance_id, rep.started_at, rep.task_id].map((x) => String(x || '')).join('|');
}

export type ReportKindFilter = '' | 'manual_session' | 'maintenance_run';
export type EventKindFilter = '' | 'mod' | 'server_settings' | 'save' | 'modpack' | 'factorio_update';

function stepEventKind(step: { kind?: string; detail?: unknown } | undefined): string {
  const d = step?.detail;
  if (d && typeof d === 'object' && !Array.isArray(d)) {
    const ek = String((d as Record<string, unknown>).event_kind || '').trim();
    if (ek) return ek;
  }
  const kind = String(step?.kind || '');
  if (kind === 'factorio_update' || kind === 'mods_update' || kind === 'mods_job_start') return 'factorio_update';
  if (kind.startsWith('mod')) return 'mod';
  return '';
}

function reportContainsEventKind(rep: MaintenanceReport, filter: EventKindFilter): boolean {
  if (!filter) return true;
  const kind = String(rep.report_kind || rep.event_kind || '');
  if (filter === 'factorio_update' && kind === 'maintenance_run') {
    const steps = Array.isArray(rep.steps) ? rep.steps : [];
    return steps.some((s) => {
      const k = String(s?.kind || '');
      return k.includes('factorio') || k.includes('mods');
    });
  }
  const steps = Array.isArray(rep.steps) ? rep.steps : [];
  for (const s of steps) {
    const ek = stepEventKind(s);
    if (filter === 'mod' && (ek.startsWith('mod_') || ek === 'mod_install' || ek === 'mod_remove' || ek === 'mod_update')) return true;
    if (filter === 'server_settings' && (ek === 'server_settings' || ek === 'server_config' || ek === 'mod_settings')) return true;
    if (filter === 'save' && ek.startsWith('save_')) return true;
    if (filter === 'modpack' && ek.startsWith('modpack_')) return true;
    if (filter === 'factorio_update' && ek === 'factorio_update') return true;
    const subs = Array.isArray(s?.sub_steps) ? s.sub_steps : [];
    for (const sub of subs) {
      const sk = String(sub?.kind || '');
      if (filter === 'factorio_update' && sk.includes('factorio')) return true;
      if (filter === 'mod' && (sk.includes('mod') || sk.includes('mods'))) return true;
    }
  }
  return false;
}

export function filterPeriodReports(
  reports: MaintenanceReport[],
  instanceId?: string,
  reportKind?: ReportKindFilter,
  eventKind?: EventKindFilter,
): MaintenanceReport[] {
  let out = reports.filter((r) => {
    const k = String(r.report_kind || r.event_kind || '');
    return k === 'manual_session' || k === 'maintenance_run';
  });
  const iid = String(instanceId || '').trim();
  if (iid) out = out.filter((r) => String(r.instance_id || '') === iid);
  if (reportKind) out = out.filter((r) => String(r.report_kind || r.event_kind || '') === reportKind);
  if (eventKind) out = out.filter((r) => reportContainsEventKind(r, eventKind));
  return out;
}

export function reportActionCount(rep: { steps?: unknown[] } | null | undefined): number {
  return Array.isArray(rep?.steps) ? rep.steps.length : 0;
}

export function reportPeriodLabel(
  rep: { report_kind?: string; event_kind?: string; period_label?: string; started_at?: string },
): string {
  return reportListDateTime(rep.started_at);
}

export function reportOptionsFromRep(
  rep: {
    task_options?: MaintenanceTask['options'];
    event_kind?: string;
    report_kind?: string;
    period_label?: string;
    started_at?: string;
    web_actor?: string;
    steps?: { kind?: string; detail?: unknown }[];
    open?: boolean;
  },
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  const kind = String(rep.report_kind || rep.event_kind || '');
  const n = reportActionCount(rep);
  const countLabel = t('server_log_events_count', n);
  if (kind === 'manual_session') {
    const open = rep.open ? t('audit_report_open') : '';
    return [countLabel, open].filter(Boolean).join(' · ');
  }
  if (kind === 'maintenance_run') {
    return countLabel;
  }
  return countLabel;
}

export function reportRunTypeLabel(
  rep: {
    run_trigger?: string;
    run_id?: string;
    event_kind?: string;
    report_kind?: string;
    task_id?: string;
    open?: boolean;
  },
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  const kind = String(rep.report_kind || rep.event_kind || '').trim();
  if (kind === 'manual_session') {
    return rep.open ? t('audit_report_kind_manual_session_open') : t('audit_report_kind_manual_session');
  }
  if (kind === 'maintenance_run') {
    return String(rep.run_trigger || '') === 'manual' || String(rep.run_id || '').includes('-manual')
      ? t('maintenance_report_type_manual')
      : t('maintenance_report_type_scheduled');
  }
  if (kind === 'server_log') return t('audit_report_kind_server_log');
  if (kind && kind !== 'maintenance_task') {
    const key = 'audit_report_kind_' + kind;
    const tr = t(key);
    const kindLabel = tr !== key ? tr : kind;
    let trig = rep?.run_trigger;
    if (!trig && rep?.run_id != null && String(rep.run_id).indexOf('-manual') >= 0) trig = 'manual';
    const trigLabel =
      String(trig || '') === 'manual'
        ? t('maintenance_report_type_manual')
        : String(trig || '') === 'scheduled'
          ? t('maintenance_report_type_scheduled')
          : '';
    return trigLabel ? kindLabel + ' · ' + trigLabel : kindLabel;
  }
  let trig = rep?.run_trigger;
  if (!trig && rep?.run_id != null && String(rep.run_id).indexOf('-manual') >= 0) {
    trig = 'manual';
  }
  if (String(trig || '') === 'manual') return t('maintenance_report_type_manual');
  if (rep?.task_id) return t('maintenance_report_type_scheduled');
  return t('audit_report_kind_maintenance_task');
}

export function reportListDateTime(iso: string | undefined): string {
  return formatPanelDateTime(iso);
}

export function reportDurationBetween(
  startedAt: string | undefined,
  finishedAt: string | undefined,
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  const a = Date.parse(String(startedAt || '').replace(/-/g, '/').replace(' ', 'T'));
  const b = Date.parse(String(finishedAt || '').replace(/-/g, '/').replace(' ', 'T'));
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return '';
  let sec = Math.round((b - a) / 1000);
  const h = Math.floor(sec / 3600);
  sec -= h * 3600;
  const mi = Math.floor(sec / 60);
  const se = sec % 60;
  if (h > 0) {
    return t('maintenance_report_duration_h_m').replace(/\{h\}/g, String(h)).replace(/\{m\}/g, String(mi));
  }
  if (mi > 0) {
    return t('maintenance_report_duration_m_s').replace(/\{m\}/g, String(mi)).replace(/\{s\}/g, String(se));
  }
  return t('maintenance_report_duration_s').replace(/\{s\}/g, String(se));
}
