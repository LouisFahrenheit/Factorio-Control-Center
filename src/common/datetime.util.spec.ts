import { panelTimestamp, panelLogLineTimestamp } from './datetime.util';

describe('datetime.util', () => {
  it('formats panelTimestamp as YYYY-MM-DD HH:mm:ss in UTC', () => {
    const fixed = new Date('2026-10-30T15:23:45.123Z');
    expect(panelTimestamp(fixed)).toBe('2026-10-30 15:23:45');
  });

  it('uses current date as default in panelTimestamp', () => {
    const res = panelTimestamp();
    expect(res).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  });

  it('formats panelLogLineTimestamp with milliseconds', () => {
    const d = new Date(2026, 9, 30, 20, 15, 30, 45); // Month is 0-indexed: 9 = October
    const res = panelLogLineTimestamp(d);
    expect(res).toBe('2026-10-30 20:15:30.045');
  });

  it('uses current date as default in panelLogLineTimestamp', () => {
    const res = panelLogLineTimestamp();
    expect(res).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3}$/);
  });
});
