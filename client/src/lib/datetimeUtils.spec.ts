import { describe, it, expect } from 'vitest';
import {
  parsePanelDateTime,
  formatPanelDateOnly,
  formatPanelClock,
  formatRelativeAge,
} from './datetimeUtils';

describe('datetimeUtils lib', () => {
  describe('formatRelativeAge', () => {
    const now = Date.parse('2026-05-10T12:00:00Z');

    it('returns placeholder for empty or invalid input', () => {
      expect(formatRelativeAge('', '—', now)).toBe('—');
      expect(formatRelativeAge('not-a-date', 'N/A', now)).toBe('N/A');
    });

    it('picks the largest fitting unit', () => {
      expect(formatRelativeAge('2026-05-10T10:00:00Z', '—', now)).toMatch(/2/);
      expect(formatRelativeAge('2026-05-07T12:00:00Z', '—', now)).toMatch(/3/);
    });

    it('does not throw for timestamps in the future or within a minute', () => {
      expect(formatRelativeAge('2026-05-10T12:00:20Z', '—', now)).not.toBe('—');
      expect(formatRelativeAge('2026-05-11T12:00:00Z', '—', now)).not.toBe('—');
    });
  });

  describe('parsePanelDateTime', () => {
    it('should return null for empty or null inputs', () => {
      expect(parsePanelDateTime('')).toBeNull();
      expect(parsePanelDateTime(null)).toBeNull();
      expect(parsePanelDateTime(undefined)).toBeNull();
    });

    it('should parse ISO strings', () => {
      const iso = '2026-05-10T14:30:00.000Z';
      expect(parsePanelDateTime(iso)).toBe(Date.parse(iso));
    });

    it('should parse bracketed timestamps', () => {
      const stamp = '[2026-05-10T14:30:00.000Z]';
      expect(parsePanelDateTime(stamp)).toBe(Date.parse('2026-05-10T14:30:00.000Z'));
    });

    it('should parse YYYY-MM-DD HH:mm:ss without timezone as UTC', () => {
      const raw = '2026-05-10 14:30:00';
      expect(parsePanelDateTime(raw)).toBe(Date.parse('2026-05-10T14:30:00Z'));
    });
  });

  describe('formatPanelDateOnly', () => {
    it('should return placeholder for empty inputs', () => {
      expect(formatPanelDateOnly('')).toBe('—');
      expect(formatPanelDateOnly(null, 'N/A')).toBe('N/A');
    });

    it('should format date string', () => {
      const formatted = formatPanelDateOnly('2026-10-05T12:00:00Z');
      expect(formatted).not.toBe('—');
      expect(formatted).toMatch(/2026/);
    });
  });

  describe('formatPanelClock', () => {
    it('should return placeholder for empty inputs', () => {
      expect(formatPanelClock('')).toBe('—');
      expect(formatPanelClock(null)).toBe('—');
    });

    it('should extract or format clock string', () => {
      const res = formatPanelClock('2026-05-10 14:30:00');
      expect(res).toMatch(/\d{2}:\d{2}:\d{2}/);
    });
  });
});
