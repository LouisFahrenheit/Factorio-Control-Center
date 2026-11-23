import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  firstPlanItemRequiringNewerGame,
  gameBelowModFactorioReq,
  installedBaseSpaceAgeVersions,
} from './mod-game-req';

describe('mod-game-req', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-mod-game-req-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  function writeDataModInfo(
    modFolder: string,
    content: Record<string, unknown> | string,
  ): void {
    const dir = path.join(tempDir, 'data', modFolder);
    fs.mkdirSync(dir, { recursive: true });
    const raw =
      typeof content === 'string' ? content : JSON.stringify(content, null, 2);
    fs.writeFileSync(path.join(dir, 'info.json'), raw, 'utf-8');
  }

  describe('installedBaseSpaceAgeVersions', () => {
    it('returns empty strings when data directories do not exist', () => {
      expect(installedBaseSpaceAgeVersions(tempDir)).toEqual({
        base: '',
        spaceAge: '',
      });
    });

    it('reads base and space-age versions and tolerates malformed JSON', () => {
      writeDataModInfo('base', { name: 'base', version: ' 2.0.32 ' });
      writeDataModInfo('space-age', '{invalid-json');

      expect(installedBaseSpaceAgeVersions(tempDir)).toEqual({
        base: '2.0.32',
        spaceAge: '',
      });

      writeDataModInfo('space-age', { name: 'space-age', version: '2.0.32' });
      expect(installedBaseSpaceAgeVersions(tempDir)).toEqual({
        base: '2.0.32',
        spaceAge: '2.0.32',
      });
    });
  });

  describe('gameBelowModFactorioReq', () => {
    it('returns not below when release specifies no engine bounds', () => {
      writeDataModInfo('base', { version: '2.0.15' });

      expect(gameBelowModFactorioReq(tempDir, {})).toEqual({
        below: false,
        current: '',
        required: '',
      });
      expect(
        gameBelowModFactorioReq(tempDir, { info_json: '{bad-json' }),
      ).toEqual({
        below: false,
        current: '',
        required: '',
      });
    });

    it.each([
      {
        label: 'meets >= requirement with padded tuple',
        baseVer: '2.0.0',
        release: { info_json: { factorio_version: '2.0' } },
        expectedBelow: false,
      },
      {
        label: 'fails >= requirement when patch version is older',
        baseVer: '2.0.14',
        release: {
          info_json: JSON.stringify({
            factorio_version: { base: '2.0' },
            dependencies: ['base >= 2.0.28'],
          }),
        },
        expectedBelow: true,
      },
      {
        label: 'enforces load-order ~ prefix as required engine bound',
        baseVer: '2.0.20',
        release: {
          info_json: {
            dependencies: ['~ base >= 2.0.25'],
          },
        },
        expectedBelow: true,
      },
      {
        label: 'supports strict > and exact = operators',
        baseVer: '2.0.20',
        release: {
          info_json: {
            dependencies: ['base > 2.0.20'],
          },
        },
        expectedBelow: true,
      },
      {
        label: 'passes exact = operator with trailing zero padding',
        baseVer: '2.0.0',
        release: {
          info_json: {
            dependencies: ['base = 2.0'],
          },
        },
        expectedBelow: false,
      },
      {
        label: 'handles range spec and SA suffix in version string',
        baseVer: '2.0.10',
        release: {
          info_json: {
            dependencies: ['base >= 2.0.15-2.0.99 SA'],
          },
        },
        expectedBelow: true,
      },
      {
        label: 'ignores optional and incompatible (!) engine markers',
        baseVer: '2.0.10',
        release: {
          info_json: {
            factorio_version: '2.0',
            dependencies: [
              '? base >= 2.0.99',
              '(?) space-age >= 2.0.99',
              '(optional) base >= 2.0.99',
              '! base >= 2.0.99',
              'some-other-mod >= 9.9.9',
            ],
          },
        },
        expectedBelow: false,
      },
    ])('$label', ({ baseVer, release, expectedBelow }) => {
      writeDataModInfo('base', { version: baseVer });
      const res = gameBelowModFactorioReq(tempDir, release);
      expect(res.below).toBe(expectedBelow);
    });

    it('checks space-age version only when Space Age is installed on server', () => {
      writeDataModInfo('base', { version: '2.0.32' });
      const release = {
        info_json: {
          factorio_version: '2.0',
          dependencies: ['base >= 2.0.10', 'space-age >= 2.0.30'],
        },
      };

      // Vanilla server (no data/space-age/info.json): space-age bound is not enforced here
      const vanillaRes = gameBelowModFactorioReq(tempDir, release);
      expect(vanillaRes.below).toBe(false);

      // Space Age server with outdated space-age build
      writeDataModInfo('space-age', { version: '2.0.20' });
      const outdatedSa = gameBelowModFactorioReq(tempDir, release);
      expect(outdatedSa.below).toBe(true);
      expect(outdatedSa.current).toContain('space-age 2.0.20');
      expect(outdatedSa.required).toContain('space-age ≥ 2.0.30');

      // Space Age server with up-to-date space-age build
      writeDataModInfo('space-age', { version: '2.0.32' });
      expect(gameBelowModFactorioReq(tempDir, release).below).toBe(false);
    });
  });

  describe('firstPlanItemRequiringNewerGame', () => {
    it('returns null when all plan items satisfy installed Factorio build', () => {
      writeDataModInfo('base', { version: '2.0.32' });
      const res = firstPlanItemRequiringNewerGame(tempDir, [
        { name: 'flib', release: { info_json: { factorio_version: '2.0' } } },
        {
          name: 'krastorio2',
          release: { info_json: { dependencies: ['base >= 2.0.30'] } },
        },
      ]);
      expect(res).toBeNull();
    });

    it('returns the first incompatible mod with formatted versions', () => {
      writeDataModInfo('base', { version: '2.0.20' });
      const res = firstPlanItemRequiringNewerGame(tempDir, [
        { name: 'flib', release: { info_json: { factorio_version: '2.0' } } },
        {
          name: 'quality-plus',
          release: { info_json: { dependencies: ['base >= 2.0.28'] } },
        },
        {
          name: 'later-mod',
          release: { info_json: { dependencies: ['base >= 2.0.40'] } },
        },
      ]);
      expect(res).toEqual({
        mod: 'quality-plus',
        current: 'base 2.0.20',
        required: 'base ≥ 2.0.28',
      });
    });
  });
});
