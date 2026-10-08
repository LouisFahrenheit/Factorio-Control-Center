import { ModPlanService } from './mod-plan.service';
import { ModPortalService } from '../mod-portal/mod-portal.service';
import * as opsUtils from '../ops-utils';

jest.mock('../ops-utils', () => {
  const actual = jest.requireActual<typeof opsUtils>('../ops-utils');
  return {
    ...actual,
    hasSpaceAge: jest.fn(),
    installedModVersions: jest.fn(),
    readModList: jest.fn(),
  };
});

describe('ModPlanService', () => {
  let service: ModPlanService;
  let mockPortal: jest.Mocked<Partial<ModPortalService>>;

  const mockHasSpaceAge = opsUtils.hasSpaceAge as jest.MockedFunction<
    typeof opsUtils.hasSpaceAge
  >;
  const mockInstalledModVersions =
    opsUtils.installedModVersions as jest.MockedFunction<
      typeof opsUtils.installedModVersions
    >;
  const mockReadModList = opsUtils.readModList as jest.MockedFunction<
    typeof opsUtils.readModList
  >;

  beforeEach(() => {
    jest.clearAllMocks();

    mockPortal = {
      isBuiltin: jest.fn((name: string) =>
        ['base', 'space-age', 'quality', 'elevated-rails', 'recycler'].includes(
          name.toLowerCase(),
        ),
      ),
      parseModInput: jest.fn((input: string) => ({
        modName: input.trim(),
        version: undefined,
      })),
      fetchFull: jest.fn(),
      resolveRelease: jest.fn(),
      versionNewer: jest.fn((a: string, b: string) => a > b),
      listReleasesSummary: jest.fn(() => []),
      isValidPortalModId: jest.fn(() => true),
    };

    service = new ModPlanService(mockPortal as ModPortalService);
  });

  describe('modBlockedWithoutSpaceAge', () => {
    it('returns true when server lacks Space Age and mod requires it', () => {
      mockHasSpaceAge.mockReturnValue(false);
      const release = { dependencies: ['space-age >= 2.0.0'] };

      expect(service.modBlockedWithoutSpaceAge('/mock/server', release)).toBe(
        true,
      );
    });

    it('returns false when server has Space Age', () => {
      mockHasSpaceAge.mockReturnValue(true);
      const release = { dependencies: ['space-age >= 2.0.0'] };

      expect(service.modBlockedWithoutSpaceAge('/mock/server', release)).toBe(
        false,
      );
    });

    it('returns false when mod does not require Space Age', () => {
      mockHasSpaceAge.mockReturnValue(false);
      const release = { dependencies: ['base >= 2.0.0', 'flib'] };

      expect(service.modBlockedWithoutSpaceAge('/mock/server', release)).toBe(
        false,
      );
    });
  });

  describe('portalVersionsForMod', () => {
    it('returns release and metadata when found', async () => {
      const meta = {
        title: 'Flib Library',
        releases: [{ version: '0.14.0' }],
      };
      (mockPortal.fetchFull as jest.Mock).mockResolvedValue(meta);
      (mockPortal.resolveRelease as jest.Mock).mockReturnValue({
        version: '0.14.0',
      });

      const res = await service.portalVersionsForMod('flib');
      expect(res.ok).toBe(true);
      if (res.ok) {
        expect(res.version).toBe('0.14.0');
        expect(res.title).toBe('Flib Library');
        expect(res.meta).toBe(meta);
      }
    });

    it('returns no_release error when resolveRelease returns null', async () => {
      (mockPortal.fetchFull as jest.Mock).mockResolvedValue({ releases: [] });
      (mockPortal.resolveRelease as jest.Mock).mockReturnValue(null);

      const res = await service.portalVersionsForMod('flib');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe('no_release');
      }
    });

    it('handles portal network errors gracefully', async () => {
      (mockPortal.fetchFull as jest.Mock).mockRejectedValue(
        new Error('Network timeout'),
      );

      const res = await service.portalVersionsForMod('flib');
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toBe('Network timeout');
      }
    });
  });

  describe('planInstall', () => {
    it('plans installation for uninstalled mod and its dependencies', async () => {
      mockHasSpaceAge.mockReturnValue(true);
      mockInstalledModVersions.mockReturnValue([]);

      // Root mod: my-mod requires flib
      const myModRelease = {
        version: '1.0.0',
        dependencies: ['base >= 2.0.0', 'flib >= 0.14.0'],
      };
      const flibRelease = {
        version: '0.14.0',
        dependencies: ['base >= 2.0.0'],
      };

      (mockPortal.fetchFull as jest.Mock).mockImplementation((name: string) => {
        if (name === 'my-mod') {
          return Promise.resolve({
            title: 'My Mod',
            releases: [myModRelease],
          });
        }
        if (name === 'flib') {
          return Promise.resolve({
            title: 'Flib',
            releases: [flibRelease],
          });
        }
        return Promise.reject(new Error('Unknown mod'));
      });

      (mockPortal.resolveRelease as jest.Mock).mockImplementation(
        (meta: { title?: string }) => {
          if (meta.title === 'My Mod') return myModRelease;
          if (meta.title === 'Flib') return flibRelease;
          return null;
        },
      );

      const plan = await service.planInstall(
        '/server',
        '/server/mods',
        'my-mod',
      );

      expect(plan).toHaveLength(2);
      expect(plan.map((p) => p.name)).toEqual(['my-mod', 'flib']);
      expect(plan[0].version).toBe('1.0.0');
      expect(plan[1].version).toBe('0.14.0');
    });

    it('skips mod if local version is already up to date and not requested specific version', async () => {
      mockHasSpaceAge.mockReturnValue(true);
      // Already installed with 1.0.0
      mockInstalledModVersions.mockReturnValue(['1.0.0']);

      const myModRelease = { version: '1.0.0', dependencies: [] };
      (mockPortal.fetchFull as jest.Mock).mockResolvedValue({
        releases: [myModRelease],
      });
      (mockPortal.resolveRelease as jest.Mock).mockReturnValue(myModRelease);
      (mockPortal.versionNewer as jest.Mock).mockReturnValue(false);

      const plan = await service.planInstall(
        '/server',
        '/server/mods',
        'my-mod',
      );
      expect(plan).toHaveLength(0);
    });

    it('throws error when a planned mod requires Space Age but server lacks it', async () => {
      mockHasSpaceAge.mockReturnValue(false);
      mockInstalledModVersions.mockReturnValue([]);

      const saRelease = {
        version: '1.0.0',
        dependencies: ['space-age >= 2.0.0'],
      };
      (mockPortal.fetchFull as jest.Mock).mockResolvedValue({
        releases: [saRelease],
      });
      (mockPortal.resolveRelease as jest.Mock).mockReturnValue(saRelease);

      await expect(
        service.planInstall('/server', '/server/mods', 'sa-mod'),
      ).rejects.toThrow('requires_space_age');
    });
  });

  describe('installPlanDetail', () => {
    it('generates full installation plan result with conflicts analysis', async () => {
      mockHasSpaceAge.mockReturnValue(true);
      mockInstalledModVersions.mockReturnValue([]);
      mockReadModList.mockReturnValue({
        mods: [
          { name: 'base', enabled: true },
          { name: 'conflicting-mod', enabled: true },
        ],
      });

      const rootRelease = {
        version: '1.0.0',
        dependencies: ['! conflicting-mod'],
      };

      (mockPortal.fetchFull as jest.Mock).mockResolvedValue({
        title: 'Target Mod',
        releases: [rootRelease],
      });
      (mockPortal.resolveRelease as jest.Mock).mockReturnValue(rootRelease);

      const pm = {
        serverPath: '/server',
        modsDir: '/server/mods',
      } as unknown as Parameters<typeof service.installPlanDetail>[0];

      const result = await service.installPlanDetail(pm, 'target-mod');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.mod).toBe('target-mod');
        expect(result.version).toBe('1.0.0');
        expect(result.to_install).toEqual([
          {
            name: 'target-mod',
            local_version: '',
            portal_version: '1.0.0',
          },
        ]);
        expect(result.conflicts_to_disable).toEqual(['conflicting-mod']);
        expect(result.requires_conflict_confirmation).toBe(true);
        expect(result.requires_confirmation).toBe(true);
      }
    });
  });
});
