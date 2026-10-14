import {
  terminalColumns,
  centerLine,
  centerBlock,
} from './console-center.util';

describe('console-center.util', () => {
  describe('terminalColumns', () => {
    it('returns positive finite columns or fallback to 80', () => {
      const cols = terminalColumns();
      expect(typeof cols).toBe('number');
      expect(cols).toBeGreaterThan(0);
    });
  });

  describe('centerLine', () => {
    it('centers text with calculated padding', () => {
      const text = 'Hello';
      const width = 11; // (11 - 5) / 2 = 3 spaces padding
      const result = centerLine(text, width);
      expect(result).toBe('   Hello');
    });

    it('returns text as-is if width is smaller than or equal to text length', () => {
      expect(centerLine('Longer text here', 5)).toBe('Longer text here');
      expect(centerLine('Exact', 5)).toBe('Exact');
    });

    it('handles empty or falsy line', () => {
      // @ts-expect-error testing null / undefined input
      expect(centerLine(null, 10)).toBe('     ');
    });
  });

  describe('centerBlock', () => {
    it('centers multi-line strings line by line', () => {
      const block = 'Line 1\nLonger line 2\n3';
      const width = 20;
      const centered = centerBlock(block, width);
      const lines = centered.split('\n');

      expect(lines).toHaveLength(3);
      expect(lines[0]).toBe(centerLine('Line 1', width));
      expect(lines[1]).toBe(centerLine('Longer line 2', width));
      expect(lines[2]).toBe(centerLine('3', width));
    });

    it('handles empty string cleanly', () => {
      expect(centerBlock('', 20)).toBe('          ');
    });
  });
});
