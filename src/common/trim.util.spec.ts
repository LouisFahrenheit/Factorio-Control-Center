import { trimPath, trimHost, trimPort, safeStr, safeTrim } from './trim.util';

describe('trim.util', () => {
  describe('trimPath', () => {
    it('trims whitespace and strips trailing slashes', () => {
      expect(trimPath('  /var/log/factorio/  ')).toBe('/var/log/factorio');
      expect(trimPath('C:\\factorio\\data\\\\')).toBe('C:\\factorio\\data');
    });

    it('returns fallback for null, undefined or empty string', () => {
      expect(trimPath(null, '/default')).toBe('/default');
      expect(trimPath(undefined, '/default')).toBe('/default');
      expect(trimPath('   ', '/default')).toBe('/default');
      expect(trimPath('', '/default')).toBe('/default');
    });

    it('returns fallback if path consists only of slashes and resolves to empty', () => {
      expect(trimPath('///', '/fallback')).toBe('/fallback');
      expect(trimPath('\\\\\\', '/fallback')).toBe('/fallback');
    });
  });

  describe('trimHost', () => {
    it('trims host string', () => {
      expect(trimHost('  192.168.1.100  ')).toBe('192.168.1.100');
      expect(trimHost('  localhost  ')).toBe('localhost');
    });

    it('falls back to default 127.0.0.1 or custom fallback', () => {
      expect(trimHost(null)).toBe('127.0.0.1');
      expect(trimHost(undefined)).toBe('127.0.0.1');
      expect(trimHost('', '0.0.0.0')).toBe('0.0.0.0');
    });
  });

  describe('trimPort', () => {
    it('parses valid numeric ports', () => {
      expect(trimPort('8080')).toBe(8080);
      expect(trimPort(34197)).toBe(34197);
      expect(trimPort('  1  ')).toBe(1);
      expect(trimPort('65535')).toBe(65535);
    });

    it('falls back to default 8080 or custom fallback on invalid port', () => {
      expect(trimPort('invalid')).toBe(8080);
      expect(trimPort(0, 3000)).toBe(3000);
      expect(trimPort(70000, 3000)).toBe(3000);
      expect(trimPort(-5, 3000)).toBe(3000);
      expect(trimPort(null, 3000)).toBe(3000);
      expect(trimPort(undefined, 3000)).toBe(3000);
    });
  });

  describe('safeStr', () => {
    it('converts primitives to string', () => {
      expect(safeStr('hello')).toBe('hello');
      expect(safeStr(123)).toBe('123');
      expect(safeStr(true)).toBe('true');
      expect(safeStr(BigInt(999))).toBe('999');
    });

    it('returns error message for Error instances', () => {
      expect(safeStr(new Error('something broke'))).toBe('something broke');
    });

    it('returns fallback for null, undefined or unsupported objects', () => {
      expect(safeStr(null, 'default')).toBe('default');
      expect(safeStr(undefined, 'default')).toBe('default');
      expect(safeStr({}, 'default')).toBe('default');
      expect(safeStr([], 'default')).toBe('default');
    });
  });

  describe('safeTrim', () => {
    it('trims string result', () => {
      expect(safeTrim('   spaced   ')).toBe('spaced');
      expect(safeTrim(42)).toBe('42');
      expect(safeTrim(null, '  fallback  ')).toBe('fallback');
    });
  });
});
