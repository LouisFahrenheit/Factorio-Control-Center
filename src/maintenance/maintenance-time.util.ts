import {
  INSTANCE_ALL,
  normalizeTaskInstanceIds,
  nextFireUtcMsForSchedule,
  validateIanaZone,
} from '../shared/maintenance-time';

export {
  INSTANCE_ALL,
  parseHhmm,
  validateIanaZone,
} from '../shared/maintenance-time';
export { normalizeTaskInstanceIds } from '../shared/maintenance-time';

export interface MaintTaskLike {
  active?: boolean;
  manual_only?: boolean;
  time_hhmm?: string;
  weekdays?: number[];
  repeat_weekly?: boolean;
  instance_ids?: string[];
  /** Legacy single-target field; normalized away on save. */
  instance_id?: string;
  timezone?: string;
}

export function effectiveSchedulerTz(stored: string): string {
  const s = String(stored || '').trim();
  if (s) return s;
  return String(
    process.env.FCC_MAINTENANCE_TZ || process.env.MAINTENANCE_TZ || '',
  ).trim();
}

export function effectiveTaskTz(
  task: MaintTaskLike,
  docSchedulerTz: string,
): string {
  const taskTz = String(task.timezone || '').trim();
  if (taskTz && validateIanaZone(taskTz)) return taskTz;
  return effectiveSchedulerTz(docSchedulerTz);
}

/** Next scheduled fire as real UTC epoch ms. */
export function nextFireUtcMs(
  task: MaintTaskLike,
  tz: string,
  now = new Date(),
): number | null {
  return nextFireUtcMsForSchedule(task, tz, now);
}

export function fireIsoFromMs(ms: number): string {
  return new Date(ms).toISOString();
}

export function taskTargetInstanceIds(task: MaintTaskLike): string[] {
  return normalizeTaskInstanceIds(task.instance_ids, task.instance_id);
}
