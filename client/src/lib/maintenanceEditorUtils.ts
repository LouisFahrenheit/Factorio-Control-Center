import type { InstanceItem } from '../types/instance';
import type { MaintenanceModsGameVersionPolicy, MaintenanceTask } from '../types/maintenance';
import { INSTANCE_ALL } from '@fcc/shared/maintenance-time';
import { formatNextFireAbsolute, relativeToNextFire } from './maintenanceUtils';
import { getBrowserTimezone, hhmmForBrowserInput, nextFireUtcMsFromForm, taskTimezone } from './maintenanceSchedule';

export interface InstancePickState {
  all: boolean;
  ids: string[];
}

export interface MaintenanceEditorForm {
  taskId: string;
  manualOnly: boolean;
  timeHhmm: string;
  weekdays: number[];
  repeatWeekly: boolean;
  optMods: boolean;
  optFactorio: boolean;
  optMaintenance: boolean;
  optModsGameVersionPolicy: MaintenanceModsGameVersionPolicy;
  instancePick: InstancePickState;
}

function readModsGameVersionPolicy(
  opts: Record<string, unknown>,
): MaintenanceModsGameVersionPolicy {
  const raw = String(opts.mods_game_version_policy || '').trim();
  if (raw === 'cancel' || raw === 'skip' || raw === 'force') return raw;
  return opts.update_factorio ? 'force' : 'skip';
}

function toTimeInputValue(hhmm: string): string {
  const parts = String(hhmm || '04:00').trim().split(':');
  if (parts.length !== 2) return '04:00';
  const h = Math.min(23, Math.max(0, parseInt(parts[0], 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(parts[1], 10) || 0));
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

export function emptyEditorForm(defaultInstanceId = ''): MaintenanceEditorForm {
  const ids = defaultInstanceId.trim() ? [defaultInstanceId.trim()] : [];
  return {
    taskId: '',
    manualOnly: false,
    timeHhmm: '04:00',
    weekdays: [],
    repeatWeekly: false,
    optMods: false,
    optFactorio: false,
    optMaintenance: false,
    optModsGameVersionPolicy: 'skip',
    instancePick: { all: false, ids },
  };
}

export function editorFormFromTask(task: MaintenanceTask): MaintenanceEditorForm {
  const opts = task.options && typeof task.options === 'object' ? task.options : {};
  const ids = Array.isArray(task.instance_ids)
    ? task.instance_ids.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  let instancePick: InstancePickState = { all: false, ids: [] };
  if (ids.length === 1 && ids[0] === INSTANCE_ALL) instancePick = { all: true, ids: [] };
  else if (ids.length) instancePick = { all: false, ids };
  const timeHhmm = toTimeInputValue(
    hhmmForBrowserInput(String(task.time_hhmm || '04:00'), taskTimezone(task), getBrowserTimezone()),
  );
  return {
    taskId: String(task.id || ''),
    manualOnly: !!task.manual_only,
    timeHhmm,
    weekdays: Array.isArray(task.weekdays) ? task.weekdays.slice().sort((a, b) => a - b) : [],
    repeatWeekly: task.repeat_weekly !== false,
    optMods: !!opts.update_mods,
    optFactorio: !!opts.update_factorio,
    optMaintenance: !!opts.maintenance,
    optModsGameVersionPolicy: readModsGameVersionPolicy(opts as Record<string, unknown>),
    instancePick,
  };
}

export function resolvedInstanceIds(pick: InstancePickState): string[] {
  if (pick.all) return [INSTANCE_ALL];
  const seen = new Set<string>();
  const out: string[] = [];
  (pick.ids || []).forEach((id) => {
    const sx = String(id || '').trim();
    if (!sx || seen.has(sx)) return;
    seen.add(sx);
    out.push(sx);
  });
  return out;
}

export function instancePickSummary(
  pick: InstancePickState,
  instances: InstanceItem[],
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  const ids = resolvedInstanceIds(pick);
  if (pick.all || (ids.length === 1 && ids[0] === INSTANCE_ALL)) return t('maintenance_instance_all');
  if (!ids.length) return t('maintenance_editor_instance_none');
  if (ids.length === 1) {
    const row = instances.find((x) => String(x.id || '') === ids[0]);
    return row ? String(row.name || ids[0]).trim() || ids[0] : ids[0];
  }
  const names = ids.map((iid) => {
    const row = instances.find((x) => String(x.id || '') === iid);
    return row ? String(row.name || iid).trim() || iid : iid;
  });
  let joined = names.join(', ');
  if (joined.length > 120) joined = joined.slice(0, 117) + '...';
  return t('maintenance_editor_instance_multi')
    .replace(/\{n\}/g, String(ids.length))
    .replace(/\{names\}/g, joined);
}

export function nextFireFromForm(form: MaintenanceEditorForm): Date | null {
  const ms = nextFireUtcMsFromForm(form, getBrowserTimezone());
  return ms != null ? new Date(ms) : null;
}

export function nextFirePreviewLabel(
  form: MaintenanceEditorForm,
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  if (form.manualOnly) return t('maintenance_editor_next_manual');
  const next = nextFireFromForm(form);
  if (!next) return '—';
  const iso = next.toISOString();
  const rel = relativeToNextFire(iso);
  const abs = formatNextFireAbsolute(iso);
  if (rel) return rel + ' · ' + abs;
  return abs;
}

export function syncScheduleDerived(form: MaintenanceEditorForm, patch: Partial<MaintenanceEditorForm>): MaintenanceEditorForm {
  const next = { ...form, ...patch };
  if (next.manualOnly) {
    next.weekdays = [];
    next.repeatWeekly = false;
  } else if (!next.weekdays.length) {
    next.repeatWeekly = false;
  }
  if (next.optMaintenance) {
    next.optMods = false;
    next.optFactorio = false;
  }
  return next;
}

export function collectTaskFromForm(
  form: MaintenanceEditorForm,
  existingTasks: MaintenanceTask[],
): MaintenanceTask {
  const id = String(form.taskId || '').trim();
  const maintenance = !!form.optMaintenance;
  let weekdays = form.weekdays.slice().sort((a, b) => a - b);
  let repeatWeekly = !!form.repeatWeekly;
  if (form.manualOnly) {
    weekdays = [];
    repeatWeekly = false;
  } else if (!weekdays.length) {
    repeatWeekly = false;
  }
  const ids = resolvedInstanceIds(form.instancePick);
  if (!ids.length) {
    const err = new Error('maintenance_editor_instance_required');
    (err as Error & { fccMaintenanceInstanceToast?: boolean }).fccMaintenanceInstanceToast = true;
    throw err;
  }
  const existing = existingTasks.find((x) => String(x.id) === id);
  const active = existing ? !!existing.active : true;
  const task: MaintenanceTask = {
    id: id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
    active,
    manual_only: form.manualOnly,
    time_hhmm: String(form.timeHhmm || '04:00').trim() || '04:00',
    timezone: getBrowserTimezone(),
    weekdays,
    repeat_weekly: repeatWeekly,
    options: {
      update_mods: !!form.optMods && !maintenance,
      update_factorio: !!form.optFactorio && !maintenance,
      maintenance,
      ...(form.optMods && !maintenance && !form.optFactorio
        ? { mods_game_version_policy: form.optModsGameVersionPolicy }
        : {}),
    },
    instance_ids: ids.slice(),
  };
  return task;
}

export function filterPickerIdsForUpdates(
  ids: string[],
  instances: InstanceItem[],
  wantUpdates: boolean,
): string[] {
  if (!wantUpdates) return ids;
  return ids.filter((xid) => {
    const row = instances.find((r) => String(r.id || '') === String(xid));
    return row && !row.blockUpdates;
  });
}
