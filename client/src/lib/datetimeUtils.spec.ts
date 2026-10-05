import { describe, it, expect } from 'vitest';
import {
  parsePanelDateTime,
  formatPanelDateOnly,
  formatPanelClock,
} from './datetimeUtils';

describe('datetimeUtils lib', () => {
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
