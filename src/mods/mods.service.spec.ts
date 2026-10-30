import { ModsService } from './mods.service';
import { PathManager } from '../ops/path-manager';
import * as fs from 'fs';
import * as jsonStore from '../common/json-store';

jest.mock('fs', () => ({
  ...jest.requireActual<Record<string, unknown>>('fs'),
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
}));

jest.mock('../common/json-store', () => ({
  readJsonFile: jest.fn(),
}));

describe('ModsService', () => {
  let service: ModsService;
  const mockFs = jest.mocked(fs);
  const mockJsonStore = jest.mocked(jsonStore);

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ModsService();
    mockFs.existsSync.mockReturnValue(false);
  });

  it('returns no_instance error if PathManager is null', () => {
    const res = service.list(null);
    expect(res).toEqual({ ok: false, error: 'no_instance' });
  });

  it('returns empty lists when modList and modsDir do not exist', () => {
    const pm = new PathManager('/factorio/server1');
    mockFs.existsSync.mockReturnValue(false);

    const res = service.list(pm);
    expect(res).toEqual({
      ok: true,
      mods: [],
      mod_list: { mods: [] },
    });
  });

  it('reads mod-list.json and scans modsDir for zip files', () => {
    const pm = new PathManager('/factorio/server1');

    mockFs.existsSync.mockImplementation((p: fs.PathLike) => {
      const s = String(p);
      return s.includes('mod-list.json') || s.includes('mods');
    });

    mockJsonStore.readJsonFile.mockReturnValue({
      mods: [
        { name: 'flib', enabled: false },
        { name: 'space-age', enabled: true },
      ],
    });

    (mockFs.readdirSync as unknown as jest.Mock).mockReturnValue([
      'flib_0.14.0.zip',
      'space-age_2.0.0.zip',
      'unlisted-mod.zip',
      'notes.txt',
    ]);

    const res = service.list(pm);
    expect(res.ok).toBe(true);
    expect(res['mods']).toEqual([
      {
        name: 'flib',
        filename: 'flib_0.14.0.zip',
        enabled: false,
      },
      {
        name: 'space-age',
        filename: 'space-age_2.0.0.zip',
        enabled: true,
      },
      {
        name: 'unlisted-mod',
        filename: 'unlisted-mod.zip',
        enabled: true,
      },
    ]);
  });

  it('handles corrupted or empty modList without mods array', () => {
    const pm = new PathManager('/factorio/server1');

    mockFs.existsSync.mockReturnValue(true);
    mockJsonStore.readJsonFile.mockReturnValue({});
    (mockFs.readdirSync as unknown as jest.Mock).mockReturnValue([
      'simple_1.0.0.zip',
    ]);

    const res = service.list(pm);
    expect(res.ok).toBe(true);
    expect(res['mods']).toEqual([
      {
        name: 'simple',
        filename: 'simple_1.0.0.zip',
        enabled: true,
      },
    ]);
  });
});
