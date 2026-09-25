import {
  buildPlayerStatsFromStore,
  formatPlayerDuration,
  parseDateMs,
} from './player-stats.util';

describe('Player Stats Util', () => {
  describe('formatPlayerDuration', () => {
    it('formats seconds, minutes, hours, and days', () => {
      expect(formatPlayerDuration(0)).toBe('0s');
      expect(formatPlayerDuration(45)).toBe('45s');
      expect(formatPlayerDuration(75)).toBe('1m 15s');
      expect(formatPlayerDuration(3600)).toBe('1h 0m 0s');
      expect(formatPlayerDuration(3665)).toBe('1h 1m 5s');
      expect(formatPlayerDuration(86400 + 3600 * 2 + 180)).toBe('1d 2h 3m');
    });
  });

  describe('parseDateMs', () => {
    it('parses panelTimestamp format', () => {
      const ms = parseDateMs('2026-09-18 20:00:00');
      expect(ms).toBeGreaterThan(0);
      expect(new Date(ms).getUTCFullYear()).toBe(2026);
    });

    it('parses ISO format', () => {
      const iso = new Date().toISOString();
      const ms = parseDateMs(iso);
      expect(ms).toBeGreaterThan(0);
    });
  });

  describe('buildPlayerStatsFromStore', () => {
    it('builds rows directly from accumulated persistent stats', () => {
      const statsMap = {
        Alice: {
          sessions: 3,
          total_seconds: 5400, // 1h 30m
          last_leave: '2026-09-18 22:15:30',
        },
        Bob: {
          sessions: 1,
          total_seconds: 1800, // 30m
          last_leave: '2026-09-18 21:00:00',
        },
      };

      const rows = buildPlayerStatsFromStore(statsMap, {});

      expect(rows).toHaveLength(2);
      const alice = rows.find((r) => r.player === 'Alice');
      expect(alice).toBeDefined();
      expect(alice?.sessions).toBe(3);
      expect(alice?.total_time).toBe('1h 30m 0s');
      expect(alice?.last_leave).toBe('2026-09-18 22:15:30');
      expect(alice?.current_session).toBe('—');
      expect(alice?.online).toBe(false);

      const bob = rows.find((r) => r.player === 'Bob');
      expect(bob).toBeDefined();
      expect(bob?.sessions).toBe(1);
      expect(bob?.total_time).toBe('30m 0s');
      expect(bob?.last_leave).toBe('2026-09-18 21:00:00');
      expect(bob?.online).toBe(false);
    });

    it('calculates active session duration and unflushed time for online players', () => {
      const now = Date.now();
      const joinTime = new Date(now - 45 * 60 * 1000).toISOString(); // joined 45m ago
      const lastTickMs = now - 15 * 1000; // last flushed 15s ago

      const statsMap = {
        Charlie: {
          sessions: 2,
          total_seconds: 3600, // already accumulated 1h
          last_leave: '2026-09-18 19:00:00',
        },
      };

      const rows = buildPlayerStatsFromStore(
        statsMap,
        { Charlie: joinTime },
        { Charlie: lastTickMs },
        now,
      );

      expect(rows).toHaveLength(1);
      const charlie = rows[0];
      expect(charlie.player).toBe('Charlie');
      expect(charlie.online).toBe(true);
      expect(charlie.sessions).toBe(2);
      expect(charlie.current_session).toBe('45m 0s');
      // 3600s + 15s unflushed = 3615s = 1h 0m 15s
      expect(charlie.total_time).toBe('1h 0m 15s');
    });

    it('handles online player not yet recorded in persistent store', () => {
      const now = Date.now();
      const joinTime = new Date(now - 10 * 60 * 1000).toISOString(); // 10m ago

      const rows = buildPlayerStatsFromStore(
        {},
        { Dave: joinTime },
        {},
        now,
      );

      expect(rows).toHaveLength(1);
      const dave = rows[0];
      expect(dave.player).toBe('Dave');
      expect(dave.online).toBe(true);
      expect(dave.sessions).toBe(1);
      expect(dave.current_session).toBe('10m 0s');
      expect(dave.total_time).toBe('10m 0s');
      expect(dave.last_leave).toBe('—');
    });
  });
});
