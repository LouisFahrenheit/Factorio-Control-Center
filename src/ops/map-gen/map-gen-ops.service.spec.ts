import {
  MapGenOpsService,
  CreateSaveOptions,
  FCC_PREVIEW_UI_SIZE,
} from './map-gen-ops.service';
import { InstancesService } from '../../instances/instances.service';
import { InstanceItem } from '../../common/types';
import * as opsUtils from '../ops-utils';
import * as factorioExecModule from '../factorio-exec';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

jest.mock('../factorio-exec', () => ({
  execFactorio: jest.fn(),
}));

describe('MapGenOpsService', () => {
  let service: MapGenOpsService;
  let mockInstances: Partial<InstancesService>;
  let tempDir: string;
  let serverDir: string;
  let factorioExePath: string;

  const mockExecFactorio =
    factorioExecModule.execFactorio as jest.MockedFunction<
      typeof factorioExecModule.execFactorio
    >;

  const defaultInstance: InstanceItem = {
    id: 'test-inst',
    name: 'Test Instance',
    serverPath: '',
    ip: '127.0.0.1',
    port: '34197',
    rconPort: 27015,
    rconPassword: 'secret',
    autostartServer: false,
    autoEnterPanel: false,
    launchSave: 'latest',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-map-gen-test-'));
    serverDir = path.join(tempDir, 'server');
    fs.mkdirSync(serverDir, { recursive: true });

    const binDir = path.join(serverDir, 'bin', 'x64');
    fs.mkdirSync(binDir, { recursive: true });
    factorioExePath = path.join(
      binDir,
      process.platform === 'win32' ? 'factorio.exe' : 'factorio',
    );
    fs.writeFileSync(factorioExePath, 'mock-binary');

    defaultInstance.serverPath = serverDir;

    mockInstances = {
      getSelected: jest.fn().mockReturnValue({ ...defaultInstance }),
    };

    service = new MapGenOpsService(mockInstances as InstancesService);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe('getSchema', () => {
    it('returns error when no instance is selected', () => {
      (mockInstances.getSelected as jest.Mock).mockReturnValue(null);
      const res = service.getSchema();
      expect(res).toEqual({ ok: false, error: 'instance_not_found' });
    });

    it('returns schema for selected instance', () => {
      const res = service.getSchema();
      expect(res.ok).toBe(true);
      expect(res).toHaveProperty('planets');
      expect(res).toHaveProperty('slider_steps');
      expect(res).toHaveProperty('space_age');
    });
  });

  describe('parseExchangeString and exportExchangeString', () => {
    it('exports a valid exchange string from map gen settings', () => {
      const res = service.exportExchangeString(
        { seed: 42, width: 1000, height: 1000 },
        { difficulty_settings: { technology_price_multiplier: 1 } },
        false,
      );

      expect(res.ok).toBe(true);
      expect(typeof res.map_exchange_string).toBe('string');
      const exchangeStr = String(res.map_exchange_string);
      expect(exchangeStr.startsWith('>>>')).toBe(true);
      expect(exchangeStr.endsWith('<<<')).toBe(true);
    });

    it('parses an exported map exchange string roundtrip', () => {
      const exported = service.exportExchangeString(
        { seed: 12345, width: 2000 },
        undefined,
        false,
      );
      expect(exported.ok).toBe(true);

      const parsed = service.parseExchangeString(
        String(exported.map_exchange_string),
      );
      expect(parsed.ok).toBe(true);
      expect(parsed.factorio_version).toBeDefined();
      const gen = parsed.map_gen_settings as Record<string, unknown>;
      expect(gen).toBeDefined();
      expect(gen.seed).toBe(12345);
    });

    it('returns error when parsing invalid exchange string', () => {
      const res = service.parseExchangeString('not-a-valid-string');
      expect(res.ok).toBe(false);
      expect(res.error).toBeDefined();
    });

    it('handles export errors gracefully', () => {
      // Symbol conversion to number throws TypeError in writer
      const invalidSettings = {
        difficulty_settings: {
          technology_price_multiplier: Symbol('fail') as unknown as number,
        },
      };
      const res = service.exportExchangeString({}, invalidSettings);
      expect(res.ok).toBe(false);
      expect(res.error).toBeDefined();
    });
  });

  describe('resolveCreatePayload', () => {
    it('decodes exchange string when mode is exchange', () => {
      const exported = service.exportExchangeString({ seed: 777 });
      const opts: CreateSaveOptions = {
        name: 'test-exchange',
        mode: 'exchange',
        map_exchange_string: String(exported.map_exchange_string),
        seed: 777,
      };

      const payload = service.resolveCreatePayload(opts);
      expect(payload.mapGen).toBeDefined();
      expect(payload.mapGen?.seed).toBe(777);
      expect(payload.preset).toBeUndefined();
    });

    it('uses custom map_gen_settings when mode is custom', () => {
      const opts: CreateSaveOptions = {
        name: 'test-custom',
        mode: 'custom',
        map_gen_settings: { seed: 999, width: 500 },
        map_settings: {
          difficulty_settings: { technology_price_multiplier: 2 },
        },
        seed: 999,
      };

      const payload = service.resolveCreatePayload(opts);
      expect(payload.mapGen).toEqual({ seed: 999, width: 500 });
      expect(payload.mapSettings).toEqual({
        difficulty_settings: { technology_price_multiplier: 2 },
      });
      expect(payload.preset).toBeUndefined();
    });

    it('loads preset bundle when preset is specified and not default', () => {
      const opts: CreateSaveOptions = {
        name: 'test-preset',
        preset: 'rail-world',
        seed: 123,
      };

      const payload = service.resolveCreatePayload(opts);
      expect(payload.preset).toBe('rail-world');
      expect(payload.mapGen).toBeDefined();
      expect(payload.seed).toBe(123);
    });

    it('falls back to defaultMapGenSettings when mode is custom without settings', () => {
      const opts: CreateSaveOptions = {
        name: 'test-custom-fallback',
        mode: 'custom',
        seed: 456,
      };

      const payload = service.resolveCreatePayload(opts);
      expect(payload.mapGen).toBeDefined();
      expect(payload.mapGen?.seed).toBe(456);
      expect(payload.preset).toBeUndefined();
    });

    it('returns null mapGen for default mode without preset', () => {
      const opts: CreateSaveOptions = {
        name: 'test-default',
        mode: 'default',
        seed: 111,
      };

      const payload = service.resolveCreatePayload(opts);
      expect(payload.mapGen).toBeNull();
      expect(payload.mapSettings).toBeUndefined();
      expect(payload.preset).toBeUndefined();
      expect(payload.seed).toBe(111);
    });
  });

  describe('prepareCreateFiles and cleanupWorkDir', () => {
    it('returns presetOnly when mapGen is null', () => {
      const resWithPreset = service.prepareCreateFiles(
        serverDir,
        null,
        undefined,
        'rail-world',
      );
      expect(resWithPreset).toEqual({ presetOnly: 'rail-world' });

      const resDefault = service.prepareCreateFiles(serverDir, null);
      expect(resDefault).toEqual({ presetOnly: 'default' });
    });

    it('creates files and returns args when mapGen is provided', () => {
      const mapGen = { seed: 100, width: 1000 };
      const mapSettings = {
        difficulty_settings: { technology_price_multiplier: 2 },
      };

      const res = service.prepareCreateFiles(serverDir, mapGen, mapSettings);
      expect('workDir' in res).toBe(true);

      if ('workDir' in res) {
        expect(fs.existsSync(res.workDir)).toBe(true);
        const genFile = path.join(res.workDir, 'map-gen-settings.json');
        const settingsFile = path.join(res.workDir, 'map-settings.json');
        expect(fs.existsSync(genFile)).toBe(true);
        expect(fs.existsSync(settingsFile)).toBe(true);

        const genContent = JSON.parse(
          fs.readFileSync(genFile, 'utf-8'),
        ) as Record<string, unknown>;
        expect(genContent.seed).toBe(100);

        expect(res.args).toContain('--map-gen-settings');
        expect(res.args).toContain(genFile);
        expect(res.args).toContain('--map-settings');
        expect(res.args).toContain(settingsFile);

        service.cleanupWorkDir(res.workDir);
        expect(fs.existsSync(res.workDir)).toBe(false);
      }
    });

    it('safely handles cleanup of non-existent directory', () => {
      expect(() => {
        service.cleanupWorkDir(path.join(tempDir, 'non-existent-dir'));
      }).not.toThrow();
    });
  });

  describe('generatePreview', () => {
    it('returns error when no instance is selected', async () => {
      (mockInstances.getSelected as jest.Mock).mockReturnValue(null);
      const res = await service.generatePreview({ seed: 123 });
      expect(res).toEqual({ ok: false, error: 'instance_not_found' });
    });

    it('returns no_factorio_exe when binary does not exist', async () => {
      fs.rmSync(factorioExePath, { force: true });
      const res = await service.generatePreview({ seed: 123 });
      expect(res).toEqual({ ok: false, error: 'no_factorio_exe' });
    });

    it('executes factorio preview and returns base64 png', async () => {
      mockExecFactorio.mockImplementation(
        (_exe: string, args: string[], _cwd: string, _timeout: number) => {
          const previewIdx = args.indexOf('--generate-map-preview');
          expect(previewIdx).toBeGreaterThanOrEqual(0);
          const previewFile = args[previewIdx + 1];
          fs.writeFileSync(previewFile, Buffer.from('mock-png-data'));
          return Promise.resolve();
        },
      );

      const res = await service.generatePreview(
        { seed: 333 },
        333,
        undefined,
        'nauvis',
        { previewSize: 1024 },
      );

      expect(res.ok).toBe(true);
      expect(res.preview_size).toBe(1024);
      expect(res.preview_png_base64).toBe(
        Buffer.from('mock-png-data').toString('base64'),
      );
      expect(mockExecFactorio).toHaveBeenCalledTimes(1);
    });

    it('returns cached preview on subsequent call with same parameters', async () => {
      mockExecFactorio.mockImplementation(
        (_exe: string, args: string[], _cwd: string, _timeout: number) => {
          const previewIdx = args.indexOf('--generate-map-preview');
          const previewFile = args[previewIdx + 1];
          fs.writeFileSync(previewFile, Buffer.from('cached-preview-data'));
          return Promise.resolve();
        },
      );

      const res1 = await service.generatePreview({ seed: 444 }, 444);
      expect(res1.ok).toBe(true);
      expect(res1.cached).toBeUndefined();

      const res2 = await service.generatePreview({ seed: 444 }, 444);
      expect(res2.ok).toBe(true);
      expect(res2.cached).toBe(true);
      expect(mockExecFactorio).toHaveBeenCalledTimes(1);
    });

    it('returns error when preview image is not created by factorio', async () => {
      mockExecFactorio.mockResolvedValue(undefined); // does not write preview.png

      const res = await service.generatePreview({ seed: 555 }, 555);
      expect(res.ok).toBe(false);
      expect(res.error).toBe('preview_not_created');
    });

    it('returns error when execFactorio rejects', async () => {
      mockExecFactorio.mockRejectedValue(new Error('Factorio crash'));

      const res = await service.generatePreview({ seed: 666 }, 666);
      expect(res.ok).toBe(false);
      expect(res.error).toBe('Factorio crash');
    });

    it('supersedes pending previews when multiple are queued', async () => {
      let resolveFirst: () => void = () => {};
      const firstRunning = new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });

      mockExecFactorio.mockImplementationOnce(
        async (_exe: string, args: string[]) => {
          await firstRunning;
          const previewIdx = args.indexOf('--generate-map-preview');
          fs.writeFileSync(args[previewIdx + 1], Buffer.from('first-png'));
        },
      );

      mockExecFactorio.mockImplementationOnce(
        (_exe: string, args: string[]) => {
          const previewIdx = args.indexOf('--generate-map-preview');
          fs.writeFileSync(args[previewIdx + 1], Buffer.from('third-png'));
          return Promise.resolve();
        },
      );

      // Start job 1
      const p1 = service.generatePreview({ seed: 1 }, 1);

      // Queue job 2 and job 3 while job 1 is in-flight
      const p2 = service.generatePreview({ seed: 2 }, 2);
      const p3 = service.generatePreview({ seed: 3 }, 3);

      // Let job 1 finish
      resolveFirst();

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);

      expect(r1.ok).toBe(true);
      expect(r2).toEqual({ ok: false, error: 'preview_superseded' });
      expect(r3.ok).toBe(true);
    });
  });

  describe('generatePreviewProgressive', () => {
    it('fires onFrame callback when preview succeeds', async () => {
      mockExecFactorio.mockImplementation((_exe: string, args: string[]) => {
        const previewIdx = args.indexOf('--generate-map-preview');
        fs.writeFileSync(args[previewIdx + 1], Buffer.from('prog-png'));
        return Promise.resolve();
      });

      const frames: opsUtils.OpResult[] = [];
      const res = await service.generatePreviewProgressive(
        { seed: 888 },
        888,
        'nauvis',
        (frame) => frames.push(frame),
      );

      expect(res.ok).toBe(true);
      expect(frames.length).toBe(1);
      expect(frames[0].preview_size).toBe(FCC_PREVIEW_UI_SIZE);
      expect(frames[0].final).toBe(true);
      expect(frames[0].preview_png_base64).toBe(
        Buffer.from('prog-png').toString('base64'),
      );
    });
  });
});
