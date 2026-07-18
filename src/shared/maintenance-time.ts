export const INSTANCE_ALL = '__all__';

export interface ScheduleLike {
  manual_only?: boolean;
  manualOnly?: boolean;
  time_hhmm?: string;
  timeHhmm?: string;
  weekdays?: number[];
}

type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekdayMon0: number;
};

export function validateIanaZone(name: string): boolean {
  const s = String(name || '').trim();
  if (!s) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: s });
    return true;
  } catch {
    return false;
  }
}

export function parseHhmm(s: string): [number, number] | null {
  const parts = String(s || '')
    .trim()
    .split(':');
  if (parts.length !== 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (
    !Number.isFinite(h) ||
    !Number.isFinite(m) ||
    h < 0 ||
    h > 23 ||
    m < 0 ||
    m > 59
  )
    return null;
  return [h, m];
}

export function zonedParts(date: Date, tz?: string): ZonedParts {
  const opts: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  };
  if (tz) opts.timeZone = tz;
  const fmt = new Intl.DateTimeFormat('en-US', opts);
  const map: Record<string, number> = {
    Mon: 0,
    Tue: 1,
    Wed: 2,
    Thu: 3,
    Fri: 4,
    Sat: 5,
    Sun: 6,
  };
  const parts = fmt.formatToParts(date);
  const pick = (type: string) =>
    parts.find((p) => p.type === type)?.value || '0';
  const wd = map[pick('weekday')] ?? (date.getDay() + 6) % 7;
  return {
    year: parseInt(pick('year'), 10),
    month: parseInt(pick('month'), 10),
    day: parseInt(pick('day'), 10),
    hour: parseInt(pick('hour'), 10),
    minute: parseInt(pick('minute'), 10),
    weekdayMon0: wd,
  };
}

export function localInZoneToUtcMs(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  tz: string,
): number {
  const zone = String(tz || '').trim();
  let guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  for (let i = 0; i < 6; i += 1) {
    const p = zonedParts(new Date(guess), zone || undefined);
    const target = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    const actual = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, 0, 0);
    const diff = target - actual;
    if (Math.abs(diff) < 1000) break;
    guess += diff;
  }
  return guess;
}

export function calendarDayInZonePlus(
  tz: string,
  now: Date,
  plusDays: number,
): ZonedParts {
  const today = zonedParts(now, tz || undefined);
  const anchor = localInZoneToUtcMs(
    today.year,
    today.month,
    today.day,
    12,
    0,
    tz,
  );
  return zonedParts(new Date(anchor + plusDays * 86400000), tz || undefined);
}

function scheduleManualOnly(schedule: ScheduleLike): boolean {
  return !!(schedule.manual_only ?? schedule.manualOnly);
}

function scheduleTimeHhmm(schedule: ScheduleLike): string {
  return String(schedule.time_hhmm ?? schedule.timeHhmm ?? '');
}

export function nextFireUtcMsForSchedule(
  schedule: ScheduleLike,
  tz: string,
  now = new Date(),
): number | null {
  if (scheduleManualOnly(schedule)) return null;
  const hhmm = parseHhmm(scheduleTimeHhmm(schedule));
  if (!hhmm) return null;
  const [h, m] = hhmm;
  const allowed = new Set(
    (schedule.weekdays || []).filter((d) => d >= 0 && d <= 6),
  );
  const nowMs = now.getTime();

  for (let offset = 0; offset < 8; offset += 1) {
    const dp = calendarDayInZonePlus(tz, now, offset);
    if (allowed.size && !allowed.has(dp.weekdayMon0)) continue;
    const cand = localInZoneToUtcMs(dp.year, dp.month, dp.day, h, m, tz);
    if (cand > nowMs) return cand;
  }

  const tomorrow = calendarDayInZonePlus(tz, now, 1);
  return localInZoneToUtcMs(
    tomorrow.year,
    tomorrow.month,
    tomorrow.day,
    h,
    m,
    tz,
  );
}

export function normalizeTaskInstanceIds(
  rawIds: unknown,
  legacySingleId?: unknown,
): string[] {
  if (Array.isArray(rawIds) && rawIds.length) {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const x of rawIds) {
      const sx = String(x || '').trim();
      if (!sx || seen.has(sx)) continue;
      seen.add(sx);
      out.push(sx);
    }
    if (seen.has(INSTANCE_ALL)) return [INSTANCE_ALL];
    return out;
  }
  const legacy = String(legacySingleId ?? '').trim();
  return legacy ? [legacy] : [];
}
