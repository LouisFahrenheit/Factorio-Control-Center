import * as path from 'path';
import * as fs from 'fs';
import { resolveTlsPath, tlsFilesExist } from './tls-path.util';

jest.mock('fs', () => ({
  ...jest.requireActual<Record<string, unknown>>('fs'),
  existsSync: jest.fn(),
}));

describe('tls-path.util', () => {
  const mockExistsSync = fs.existsSync as unknown as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('resolveTlsPath', () => {
    it('returns empty string if raw path is falsy or whitespace', () => {
      expect(resolveTlsPath('', '/root')).toBe('');
      expect(resolveTlsPath('   ', '/root')).toBe('');
    });

    it('resolves relative path against rootDir', () => {
      const resolved = resolveTlsPath('certs/cert.pem', '/app/root');
      expect(resolved).toBe(path.resolve('/app/root', 'certs/cert.pem'));
    });

    it('returns resolved absolute path if already absolute', () => {
      const absPath = path.resolve('/var/ssl/cert.pem');
      expect(resolveTlsPath(absPath, '/app/root')).toBe(absPath);
    });
  });

  describe('tlsFilesExist', () => {
    it('returns false if certPath or keyPath is empty', () => {
      expect(tlsFilesExist('', 'key.pem', '/root')).toBe(false);
      expect(tlsFilesExist('cert.pem', '', '/root')).toBe(false);
    });

    it('returns true when both cert and key files exist on disk', () => {
      mockExistsSync.mockReturnValue(true);
      expect(tlsFilesExist('cert.pem', 'key.pem', '/root')).toBe(true);
      expect(mockExistsSync).toHaveBeenCalledTimes(2);
    });

    it('returns false if either cert or key file does not exist', () => {
      mockExistsSync.mockImplementation((p: unknown) => {
        return String(p).includes('cert.pem');
      });
      expect(tlsFilesExist('cert.pem', 'key.pem', '/root')).toBe(false);
    });
  });
});
