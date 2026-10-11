import {
  validateIanaZone,
  parseHhmm,
  zonedParts,
  localInZoneToUtcMs,
  calendarDayInZonePlus,
  nextFireUtcMsForSchedule,
  normalizeTaskInstanceIds,
  INSTANCE_ALL,
  type ScheduleLike,
} from './maintenance-time';

describe('maintenance-time shared utility', () => {
  describe('validateIanaZone', () => {
    it('returns true for valid IANA timezones', () => {
      expect(validateIanaZone('UTC')).toBe(true);
      expect(validateIanaZone('Europe/Moscow')).toBe(true);
      expect(validateIanaZone('America/New_York')).toBe(true);
      expect(validateIanaZone('Asia/Tokyo')).toBe(true);
    });

    it('returns false for invalid timezones or empty strings', () => {
      expect(validateIanaZone('')).toBe(false);
      expect(validateIanaZone('   ')).toBe(false);
      expect(validateIanaZone('Invalid/Zone_Name_123')).toBe(false);
      expect(validateIanaZone('Mars/Phobos')).toBe(false);
    });
  });

  describe('parseHhmm', () => {
    it('parses valid HH:mm strings', () => {
      expect(parseHhmm('00:00')).toEqual([0, 0]);
      expect(parseHhmm('04:30')).toEqual([4, 30]);
      expect(parseHhmm('23:59')).toEqual([23, 59]);
      expect(parseHhmm(' 12:05 ')).toEqual([12, 5]);
    });

    it('returns null for invalid hours, minutes or formats', () => {
      expect(parseHhmm('')).toBeNull();
      expect(parseHhmm('24:00')).toBeNull();
      expect(parseHhmm('12:60')).toBeNull();
      expect(parseHhmm('-01:00')).toBeNull();
      expect(parseHhmm('12')).toBeNull();
      expect(parseHhmm('12:30:15')).toBeNull();
      expect(parseHhmm('abc:def')).toBeNull();
    });
  });

  describe('zonedParts', () => {
    it('breaks down date into parts with 0-indexed Monday', () => {
      // 2026-10-12 is a Monday
      const d = new Date('2026-10-12T15:30:00Z');
      const parts = zonedParts(d, 'UTC');

      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(10);
      expect(parts.day).toBe(12);
      expect(parts.hour).toBe(15);
      expect(parts.minute).toBe(30);
      expect(parts.weekdayMon0).toBe(0); // Monday
    });

    it('calculates parts properly across timezones', () => {
      // 2026-10-12 22:30 UTC -> 2026-10-13 01:30 in Europe/Moscow (+3)
      const d = new Date('2026-10-12T22:30:00Z');
      const parts = zonedParts(d, 'Europe/Moscow');

      expect(parts.year).toBe(2026);
      expect(parts.month).toBe(10);
      expect(parts.day).toBe(13);
      expect(parts.hour).toBe(1);
      expect(parts.minute).toBe(30);
      expect(parts.weekdayMon0).toBe(1); // Tuesday
    });
  });

  describe('localInZoneToUtcMs', () => {
    it('accurately converts local wall time in timezone to UTC milliseconds', () => {
      // 2026-10-12 04:00 in UTC is 2026-10-12T04:00:00.000Z
      const msUtc = localInZoneToUtcMs(2026, 10, 12, 4, 0, 'UTC');
      expect(new Date(msUtc).toISOString()).toBe('2026-10-12T04:00:00.000Z');

      // 2026-10-12 04:00 in Europe/Moscow (+3) is 2026-10-12T01:00:00.000Z
      const msMoscow = localInZoneToUtcMs(2026, 10, 12, 4, 0, 'Europe/Moscow');
      expect(new Date(msMoscow).toISOString()).toBe('2026-10-12T01:00:00.000Z');
    });
  });

  describe('calendarDayInZonePlus', () => {
    it('shifts days forward in specified timezone', () => {
      const now = new Date('2026-10-12T10:00:00Z');
      const plus3 = calendarDayInZonePlus('UTC', now, 3);
      expect(plus3.day).toBe(15);
      expect(plus3.weekdayMon0).toBe(3); // Thursday
    });
  });

  describe('nextFireUtcMsForSchedule', () => {
    it('returns null for manual_only schedules', () => {
      const sched1: ScheduleLike = { manual_only: true, time_hhmm: '04:00' };
      expect(nextFireUtcMsForSchedule(sched1, 'UTC')).toBeNull();

      const sched2: ScheduleLike = { manualOnly: true, timeHhmm: '04:00' };
      expect(nextFireUtcMsForSchedule(sched2, 'UTC')).toBeNull();
    });

    it('returns null if time format is invalid', () => {
      const sched: ScheduleLike = { time_hhmm: 'invalid' };
      expect(nextFireUtcMsForSchedule(sched, 'UTC')).toBeNull();
    });

    it('returns today fire time if scheduled time has not arrived yet', () => {
      // Current time is 10:00 UTC, scheduled for 14:00 UTC today
      const now = new Date('2026-10-12T10:00:00Z');
      const sched: ScheduleLike = { time_hhmm: '14:00' };

      const nextMs = nextFireUtcMsForSchedule(sched, 'UTC', now);
      expect(nextMs).not.toBeNull();
      expect(new Date(nextMs!).toISOString()).toBe('2026-10-12T14:00:00.000Z');
    });

    it('returns next day if scheduled time for today has already passed', () => {
      // Current time is 15:00 UTC, scheduled for 04:00 UTC
      const now = new Date('2026-10-12T15:00:00Z');
      const sched: ScheduleLike = { time_hhmm: '04:00' };

      const nextMs = nextFireUtcMsForSchedule(sched, 'UTC', now);
      expect(nextMs).not.toBeNull();
      expect(new Date(nextMs!).toISOString()).toBe('2026-10-13T04:00:00.000Z');
    });

    it('respects allowed weekdays filter', () => {
      // 2026-10-12 is Monday (weekdayMon0 = 0). Scheduled for Wednesday (2) and Friday (4).
      const now = new Date('2026-10-12T08:00:00Z');
      const sched: ScheduleLike = {
        time_hhmm: '10:00',
        weekdays: [2, 4], // Wednesday and Friday
      };

      const nextMs = nextFireUtcMsForSchedule(sched, 'UTC', now);
      expect(nextMs).not.toBeNull();
      // Next fire should be Wednesday 2026-10-14 10:00 UTC
      expect(new Date(nextMs!).toISOString()).toBe('2026-10-14T10:00:00.000Z');
    });
  });

  describe('normalizeTaskInstanceIds', () => {
    it('returns __all__ if INSTANCE_ALL is present in array', () => {
      const ids = ['inst-1', INSTANCE_ALL, 'inst-2'];
      expect(normalizeTaskInstanceIds(ids)).toEqual([INSTANCE_ALL]);
    });

    it('trims and deduplicates array of instance IDs', () => {
      const ids = ['inst-1', ' inst-2 ', 'inst-1', '', 'inst-3'];
      expect(normalizeTaskInstanceIds(ids)).toEqual([
        'inst-1',
        'inst-2',
        'inst-3',
      ]);
    });

    it('falls back to legacySingleId if array is empty or not provided', () => {
      expect(normalizeTaskInstanceIds([], 'legacy-inst')).toEqual([
        'legacy-inst',
      ]);
      expect(normalizeTaskInstanceIds(null, 'legacy-inst')).toEqual([
        'legacy-inst',
      ]);
      expect(normalizeTaskInstanceIds(undefined, 42)).toEqual(['42']);
    });

    it('returns empty array if no IDs or fallback are provided', () => {
      expect(normalizeTaskInstanceIds([])).toEqual([]);
      expect(normalizeTaskInstanceIds(null)).toEqual([]);
    });
  });
});
