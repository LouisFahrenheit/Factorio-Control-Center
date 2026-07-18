import {
  localInZoneToUtcMs,
  nextFireUtcMsForSchedule,
  parseHhmm,
  zonedParts,
} from '@fcc/shared/maintenance-time';
import type { MaintenanceTask } from '../types/maintenance';

export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export interface ScheduleFormLike {
  manualOnly: boolean;
  timeHhmm: string;
  weekdays: number[];
  repeatWeekly: boolean;
}

export function nextFireUtcMsFromForm(form: ScheduleFormLike, tz: string, now = new Date()): number | null {
  return nextFireUtcMsForSchedule(
    { manualOnly: form.manualOnly, timeHhmm: form.timeHhmm, weekdays: form.weekdays },
    tz,
    now,
  );
}

export function hhmmForBrowserInput(hhmm: string, fromTz: string, toTz = getBrowserTimezone()): string {
  const parsed = parseHhmm(hhmm);
  if (!parsed) return '04:00';
  const [h, m] = parsed;
  const from = String(fromTz || '').trim() || toTz;
  if (from === toTz) {
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  const today = zonedParts(new Date(), from);
  const utc = localInZoneToUtcMs(today.year, today.month, today.day, h, m, from);
  const p = zonedParts(new Date(utc), toTz);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
}

export function taskTimezone(task: MaintenanceTask): string {
  const tz = String(task.timezone || '').trim();
  return tz || getBrowserTimezone();
}
