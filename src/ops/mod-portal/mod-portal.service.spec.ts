import { createHash } from 'crypto';
import { ModPortalService } from './mod-portal.service';
import { PathManager } from '../path-manager';
import * as fs from 'fs';
import * as opsUtils from '../ops-utils';
import * as modGameReq from '../mods/mod-game-req';

jest.mock('fs', () => ({
  ...jest.requireActual<Record<string, unknown>>('fs'),
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  unlinkSync: jest.fn(),
  readFileSync: jest.fn(),
  createWriteStream: jest.fn(),
}));

jest.mock('../ops-utils', () => ({
  ...jest.requireActual<Record<string, unknown>>('../ops-utils'),
  gameVersion: jest.fn(),
}));

jest.mock('../mods/mod-game-req', () => ({
  ...jest.requireActual<Record<string, unknown>>('../mods/mod-game-req'),
  gameBelowModFactorioReq: jest.fn(),
}));

describe('ModPortalService', () => {
  let service: ModPortalService;
  const mockFs = jest.mocked(fs);
  const mockOpsUtils = jest.mocked(opsUtils);
  const mockModGameReq = jest.mocked(modGameReq);

  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ModPortalService();
    mockFs.existsSync.mockReturnValue(false);
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  describe('isBuiltin()', () => {
    it('recognizes builtin mods', () => {
      expect(service.isBuiltin('base')).toBe(true);
      expect(service.isBuiltin('elevated-rails')).toBe(true);
      expect(service.isBuiltin('quality')).toBe(true);
      expect(service.isBuiltin('recycler')).toBe(true);
      expect(service.isBuiltin('space-age')).toBe(true);
      expect(service.isBuiltin('SPACE-AGE')).toBe(true);
    });

    it('returns false for external mods or empty names', () => {
      expect(service.isBuiltin('flib')).toBe(false);
      expect(service.isBuiltin('')).toBe(false);
    });
  });

  describe('versionTuple() and versionNewer()', () => {
    it('converts version string to number tuple', () => {
      expect(service.versionTuple('1.2.3')).toEqual([1, 2, 3]);
      expect(service.versionTuple('2.0')).toEqual([2, 0]);
      expect(service.versionTuple('')).toEqual([0]);
    });

    it('correctly compares version numbers', () => {
      expect(service.versionNewer('1.2.3', '1.2.2')).toBe(true);
      expect(service.versionNewer('1.2.2', '1.2.3')).toBe(false);
      expect(service.versionNewer('2.0.0', '1.9.9')).toBe(true);
      expect(service.versionNewer('1.1.0', '1.1.0')).toBe(false);
      expect(service.versionNewer('1.0', '')).toBe(true);
    });
  });

  describe('parseModInput() and isValidPortalModId()', () => {
    it('parses portal URL with version query param', () => {
      const parsed = service.parseModInput(
        'https://mods.factorio.com/mod/alien-biomes?version=0.6.8',
      );
      expect(parsed).toEqual({ modName: 'alien-biomes', version: '0.6.8' });
    });

    it('parses portal URL with encoded mod name', () => {
      const parsed = service.parseModInput(
        'https://mods.factorio.com/mod/Space%20Exploration',
      );
      expect(parsed).toEqual({
        modName: 'Space Exploration',
        version: undefined,
      });
    });

    it('parses mod names with version separators (@, :, ==, =, space)', () => {
      expect(service.parseModInput('flib@0.1.2')).toEqual({
        modName: 'flib',
        version: '0.1.2',
      });
      expect(service.parseModInput('flib:0.1.2')).toEqual({
        modName: 'flib',
        version: '0.1.2',
      });
      expect(service.parseModInput('flib==0.1.2')).toEqual({
        modName: 'flib',
        version: '0.1.2',
      });
      expect(service.parseModInput('flib=0.1.2')).toEqual({
        modName: 'flib',
        version: '0.1.2',
      });
      expect(service.parseModInput('flib 0.1.2')).toEqual({
        modName: 'flib',
        version: '0.1.2',
      });
    });

    it('parses mod file name with zip extension', () => {
      expect(service.parseModInput('aai-industry_0.6.1.zip')).toEqual({
        modName: 'aai-industry',
        version: '0.6.1',
      });
      expect(service.parseModInput('aai-industry_0.6.1')).toEqual({
        modName: 'aai-industry',
        version: '0.6.1',
      });
    });

    it('parses bare mod id', () => {
      expect(service.parseModInput('aai-industry')).toEqual({
        modName: 'aai-industry',
      });
      expect(service.parseModInput('   ')).toEqual({ modName: '' });
    });

    it('validates mod IDs with isValidPortalModId', () => {
      expect(service.isValidPortalModId('good-mod_name 123')).toBe(true);
      expect(service.isValidPortalModId('bad$mod')).toBe(false);
      expect(service.isValidPortalModId('')).toBe(false);
    });
  });

  describe('fetchFull()', () => {
    it('rejects builtin mods or empty id', async () => {
      await expect(service.fetchFull('base')).rejects.toThrow('builtin');
      await expect(service.fetchFull('')).rejects.toThrow('builtin');
    });

    it('fetches metadata from portal and caches the result', async () => {
      const mockData = {
        name: 'flib',
        title: 'Factorio Library',
        releases: [{ version: '0.14.0' }],
      };

      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue(mockData),
      });

      const res1 = await service.fetchFull('flib');
      expect(res1).toEqual(mockData);

      // Second call should return cached data without additional fetch
      const res2 = await service.fetchFull('flib');
      expect(res2).toEqual(mockData);
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('throws error when portal returns 404', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(service.fetchFull('nonexistent_mod')).rejects.toThrow(
        'http_404',
      );
    });

    it('retries on network failures up to 3 times', async () => {
      let callCount = 0;
      globalThis.fetch = jest.fn().mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.reject(new Error('Network error'));
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: jest.fn().mockResolvedValue({ name: 'flib' }),
        });
      });

      const res = await service.fetchFull('flib');
      expect(res).toEqual({ name: 'flib' });
      expect(callCount).toBe(3);
    });
  });

  describe('factorioMajorMinor() and releaseInfo()', () => {
    it('extracts major and minor version numbers', () => {
      expect(service.factorioMajorMinor('2.0.15')).toBe('2.0');
      expect(service.factorioMajorMinor('>= 1.1.80')).toBe('1.1');
      expect(service.factorioMajorMinor('invalid')).toBe('');
      expect(service.factorioMajorMinor('')).toBe('');
    });

    it('parses release info_json whether object or string', () => {
      expect(service.releaseInfo(null)).toBeNull();
      expect(
        service.releaseInfo({ info_json: '{"factorio_version":"2.0"}' }),
      ).toEqual({
        factorio_version: '2.0',
      });
      expect(
        service.releaseInfo({ info_json: { factorio_version: '1.1' } }),
      ).toEqual({ factorio_version: '1.1' });
      expect(service.releaseInfo({ info_json: '{invalid-json' })).toBeNull();
    });

    it('extracts release factorio version correctly', () => {
      expect(
        service.releaseFactorioVersion({
          info_json: { factorio_version: '2.0.10' },
        }),
      ).toBe('2.0');
      expect(
        service.releaseFactorioVersion({
          info_json: { factorio_version: { base: '1.1.0' } },
        }),
      ).toBe('1.1');
      expect(service.releaseFactorioVersion({})).toBe('');
    });
  });

  describe('resolveRelease() and lastRelease()', () => {
    const sampleMeta = {
      releases: [
        {
          version: '1.0.0',
          info_json: { factorio_version: '1.1' },
          released_at: '2023-01-01',
        },
        {
          version: '1.1.0',
          info_json: { factorio_version: '1.1' },
          released_at: '2023-06-01',
        },
        {
          version: '2.0.0',
          info_json: { factorio_version: '2.0' },
          released_at: '2024-10-01',
        },
      ],
    };

    it('resolves release by explicit version', () => {
      const rel = service.resolveRelease(sampleMeta, { version: '1.0.0' });
      expect(rel?.['version']).toBe('1.0.0');
    });

    it('resolves release matching gameVersion major.minor', () => {
      const rel = service.resolveRelease(sampleMeta, {
        gameVersion: '1.1.107',
      });
      expect(rel?.['version']).toBe('1.1.0');
    });

    it('resolves release checking compatibility with serverPath', () => {
      mockOpsUtils.gameVersion.mockReturnValue('2.0.15');
      mockModGameReq.gameBelowModFactorioReq.mockReturnValue({ below: false });

      const rel = service.resolveRelease(sampleMeta, {
        serverPath: '/factorio/server',
      });
      expect(rel?.['version']).toBe('2.0.0');
    });

    it('falls back to newest release overall if no match or empty meta', () => {
      expect(service.resolveRelease({ releases: [] })).toBeNull();
      const rel = service.resolveRelease(sampleMeta, { gameVersion: '0.18.0' });
      expect(rel?.['version']).toBe('2.0.0');
    });

    it('lastRelease delegates to resolveRelease or returns last element', () => {
      expect(
        service.lastRelease(sampleMeta, { version: '1.0.0' })?.['version'],
      ).toBe('1.0.0');
      expect(service.lastRelease(sampleMeta)?.['version']).toBe('2.0.0');
      expect(service.lastRelease({ releases: [] })).toBeNull();
    });
  });

  describe('listReleasesSummary()', () => {
    it('summarizes and sorts releases with compatibility check', () => {
      const meta = {
        releases: [
          {
            version: '1.0.0',
            info_json: { factorio_version: '1.1' },
            file_name: 'test_1.0.0.zip',
            sha1: 'abc1',
          },
          {
            version: '2.0.0',
            info_json: { factorio_version: '2.0' },
            file_name: 'test_2.0.0.zip',
            sha1: 'abc2',
          },
        ],
      };

      const list = service.listReleasesSummary(meta, undefined, '2.0.10');
      expect(list).toHaveLength(2);
      expect(list[0].version).toBe('2.0.0');
      expect(list[0].is_compatible).toBe(true);
      expect(list[1].version).toBe('1.0.0');
      expect(list[1].is_compatible).toBe(false);
    });
  });

  describe('zip file utilities', () => {
    it('listZipVersions finds versions from directory', () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readdirSync as unknown as jest.Mock).mockReturnValue([
        'my-mod_1.0.0.zip',
        'my-mod_1.2.0.zip',
        'other-mod_2.0.0.zip',
        'my-mod_not_a_version.zip',
      ]);

      const vs = service.listZipVersions('my-mod', '/factorio/mods');
      expect(vs).toEqual(['1.0.0', '1.2.0']);
    });

    it('listZipVersions returns empty array if directory does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(service.listZipVersions('my-mod', '/factorio/mods')).toEqual([]);
    });

    it('findZipPath checks existsSync for mod zip', () => {
      mockFs.existsSync.mockImplementation((p: fs.PathLike) =>
        String(p).includes('my-mod_1.0.0.zip'),
      );

      expect(
        service.findZipPath('my-mod', '/factorio/mods', '1.0.0'),
      ).toContain('my-mod_1.0.0.zip');
      expect(
        service.findZipPath('my-mod', '/factorio/mods', '2.0.0'),
      ).toBeNull();
    });

    it('installedZipVersion returns latest version or empty', () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readdirSync as unknown as jest.Mock).mockReturnValue([
        'my-mod_1.0.0.zip',
        'my-mod_1.2.0.zip',
      ]);

      expect(service.installedZipVersion('my-mod', '/factorio/mods')).toBe(
        '1.2.0',
      );
    });

    it('pruneOldZips deletes non-matching version files', () => {
      (mockFs.readdirSync as unknown as jest.Mock).mockReturnValue([
        'my-mod_1.0.0.zip',
        'my-mod_1.2.0.zip',
      ]);

      service.pruneOldZips('my-mod', '1.2.0', '/factorio/mods');
      expect(mockFs.unlinkSync).toHaveBeenCalledTimes(1);
    });
  });

  describe('downloadRelease()', () => {
    it('validates download_url and file_name', async () => {
      await expect(
        service.downloadRelease(
          { download_url: 'bad_url', file_name: 'test.zip' },
          '/mods',
          'user',
          'token',
        ),
      ).rejects.toThrow('invalid_release');

      await expect(
        service.downloadRelease(
          { download_url: '/dl/test', file_name: 'test.tar' },
          '/mods',
          'user',
          'token',
        ),
      ).rejects.toThrow('invalid_release');
    });

    it('downloads chunks, tracks progress and verifies sha1 hash', async () => {
      const chunk1 = Buffer.from('chunk-1');
      const chunk2 = Buffer.from('chunk-2');

      const mockReader = {
        read: jest
          .fn()
          .mockResolvedValueOnce({ done: false, value: chunk1 })
          .mockResolvedValueOnce({ done: false, value: chunk2 })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        cancel: jest.fn(),
      };

      const mockWriteStream = {
        write: jest.fn(),
        end: jest.fn().mockImplementation((cb: (err?: Error) => void) => cb()),
        destroy: jest.fn(),
      };
      (mockFs.createWriteStream as unknown as jest.Mock).mockReturnValue(
        mockWriteStream,
      );

      const expectedSha1 = createHash('sha1')
        .update(Buffer.concat([chunk1, chunk2]))
        .digest('hex');

      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '14' }),
        body: {
          getReader: () => mockReader,
        },
      });

      const progressSpy = jest.fn();
      const fileName = await service.downloadRelease(
        {
          download_url: '/api/download/flib',
          file_name: 'flib_0.1.0.zip',
          sha1: expectedSha1,
        },
        '/factorio/mods',
        'test_user',
        'test_token',
        progressSpy,
      );

      expect(fileName).toBe('flib_0.1.0.zip');
      expect(mockWriteStream.write).toHaveBeenCalledTimes(2);
      expect(progressSpy).toHaveBeenCalled();
    });

    it('aborts download when shouldAbort returns true', async () => {
      const mockReader = {
        read: jest
          .fn()
          .mockResolvedValue({ done: false, value: Buffer.from('chunk') }),
        cancel: jest.fn().mockResolvedValue(undefined),
      };

      const mockWriteStream = {
        write: jest.fn(),
        end: jest.fn(),
        destroy: jest.fn(),
      };
      (mockFs.createWriteStream as unknown as jest.Mock).mockReturnValue(
        mockWriteStream,
      );

      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '100' }),
        body: { getReader: () => mockReader },
      });

      await expect(
        service.downloadRelease(
          { download_url: '/api/download/mod', file_name: 'mod_1.0.0.zip' },
          '/factorio/mods',
          'user',
          'token',
          undefined,
          () => true,
        ),
      ).rejects.toThrow('cancelled');

      expect(mockWriteStream.destroy).toHaveBeenCalled();
      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });

    it('throws sha1_mismatch if digest does not match expected sha1', async () => {
      const mockReader = {
        read: jest
          .fn()
          .mockResolvedValueOnce({ done: false, value: Buffer.from('data') })
          .mockResolvedValueOnce({ done: true, value: undefined }),
        cancel: jest.fn(),
      };

      const mockWriteStream = {
        write: jest.fn(),
        end: jest.fn().mockImplementation((cb: (err?: Error) => void) => cb()),
        destroy: jest.fn(),
      };
      (mockFs.createWriteStream as unknown as jest.Mock).mockReturnValue(
        mockWriteStream,
      );

      globalThis.fetch = jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ 'content-length': '4' }),
        body: { getReader: () => mockReader },
      });

      await expect(
        service.downloadRelease(
          {
            download_url: '/api/download/mod',
            file_name: 'mod_1.0.0.zip',
            sha1: 'wrong_sha1_hash',
          },
          '/factorio/mods',
          'user',
          'token',
        ),
      ).rejects.toThrow('sha1_mismatch');

      expect(mockFs.unlinkSync).toHaveBeenCalled();
    });
  });

  describe('credentials and verification', () => {
    let mockPm: PathManager;

    beforeEach(() => {
      mockPm = new PathManager('/factorio/server');
    });

    it('resolveCredentials uses config credentials if both provided', () => {
      const res = service.resolveCredentials(mockPm, 'cfg_user', 'cfg_token');
      expect(res).toEqual({ user: 'cfg_user', token: 'cfg_token' });
    });

    it('reads credentials from server-settings.json when file exists', () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readFileSync as unknown as jest.Mock).mockReturnValue(
        JSON.stringify({
          'service-username': 'file_user',
          'service-token': 'file_token',
        }),
      );

      const res = service.resolveCredentials(mockPm);
      expect(res).toEqual({ user: 'file_user', token: 'file_token' });
    });

    it('returns null if server-settings.json is missing or invalid', () => {
      mockFs.existsSync.mockReturnValue(false);
      expect(service.resolveCredentials(mockPm)).toBeNull();

      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readFileSync as unknown as jest.Mock).mockReturnValue(
        '{bad-json',
      );
      expect(service.resolveCredentials(mockPm)).toBeNull();
    });

    it('verifyCredentials verifies credentials against bookmarks endpoint and caches result', async () => {
      globalThis.fetch = jest.fn().mockResolvedValue({
        status: 200,
      });

      const res1 = await service.verifyCredentials('user1', 'tok1');
      expect(res1).toEqual({ ok: true, username: 'user1' });

      // Cached response
      const res2 = await service.verifyCredentials('user1', 'tok1');
      expect(res2).toEqual({ ok: true, username: 'user1' });
      expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    });

    it('verifyCredentials returns false on empty credentials', async () => {
      const res = await service.verifyCredentials('', '');
      expect(res).toEqual({ ok: false, username: '' });
    });

    it('verifyCredentials handles network error and caches negative result', async () => {
      globalThis.fetch = jest
        .fn()
        .mockRejectedValue(new Error('Network offline'));

      const res = await service.verifyCredentials('user2', 'tok2');
      expect(res).toEqual({ ok: false, username: '' });
    });

    it('resolveVerifiedServerSettingsUsername returns username if verified', async () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readFileSync as unknown as jest.Mock).mockReturnValue(
        JSON.stringify({
          username: 'valid_user',
          token: 'valid_token',
        }),
      );

      globalThis.fetch = jest.fn().mockResolvedValue({
        status: 200,
      });

      const verifiedName =
        await service.resolveVerifiedServerSettingsUsername(mockPm);
      expect(verifiedName).toBe('valid_user');
    });

    it('resolveVerifiedServerSettingsUsername returns empty string if no credentials', async () => {
      mockFs.existsSync.mockReturnValue(false);
      const verifiedName =
        await service.resolveVerifiedServerSettingsUsername(mockPm);
      expect(verifiedName).toBe('');
    });
  });
});
