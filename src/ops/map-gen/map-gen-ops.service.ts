import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { availableParallelism, cpus, tmpdir } from 'os';
import { createHash, randomBytes } from 'crypto';
import { InstancesService } from '../../instances/instances.service';
import { OpResult } from '../ops-utils';
import { decodeMapExchangeString } from './map-exchange-decode';
import {
  encodeMapExchangeString,
  prepareMapGenForExchange,
  prepareMapSettingsForExchange,
} from './map-exchange-encode';
import {
  MapGenSettingsJson,
  MapSettingsJson,
  defaultMapGenSettings,
  mapGenPresetBundle,
} from './map-gen-presets';
import { mapGenSchema } from './map-gen-catalog';
import { hasSpaceAge, isErrorResult, selectedInstance } from '../ops-utils';
import { prepareMapGenSettings, prepareMapSettings } from './map-gen-defaults';
import { execFactorio } from '../factorio-exec';

type PreviewWaiter = {
  run: () => Promise<OpResult>;
  resolve: (r: OpResult) => void;
};

type PreviewQueue = {
  running: boolean;
  waiters: PreviewWaiter[];
};

export interface CreateSaveOptions {
  name: string;
  mode?: 'default' | 'custom' | 'exchange';
  preset?: string;
  seed?: number;
  map_gen_settings?: MapGenSettingsJson;
  map_settings?: MapSettingsJson;
  map_exchange_string?: string;
}

/** Live UI preview size (in-game default). */
export const FCC_PREVIEW_UI_SIZE = 2048;

export type PreviewStreamFrame = {
  preview_size: number;
  preview_png_base64: string;
  final: boolean;
};

const ALLOWED_PREVIEW_SIZES = [1024, 2048, 4096, 8192, 16384] as const;

function normalizePreviewSize(size?: number): number {
  const n = Math.round(Number(size) || FCC_PREVIEW_UI_SIZE);
  return (ALLOWED_PREVIEW_SIZES as readonly number[]).includes(n)
    ? n
    : FCC_PREVIEW_UI_SIZE;
}

const PREVIEW_CACHE_MAX = 64;
const PREVIEW_CACHE_TTL_MS = 15 * 60 * 1000;

/** Factorio `--threads` for map preview (uses all logical CPUs, capped). */
function factorioPreviewThreadCount(): number {
  const fromEnv = Number(process.env.FCC_MAP_PREVIEW_THREADS);
  if (Number.isFinite(fromEnv) && fromEnv >= 1) {
    return Math.min(32, Math.floor(fromEnv));
  }
  const n =
    typeof availableParallelism === 'function'
      ? availableParallelism()
      : cpus().length;
  return Math.max(2, Math.min(16, n || 4));
}

function factorioThreadArgs(): string[] {
  return ['--threads', String(factorioPreviewThreadCount())];
}

@Injectable()
export class MapGenOpsService {
  private readonly previewCache = new Map<
    string,
    { png: Buffer; at: number }
  >();
  /** One Factorio preview at a time per server — parallel runs corrupt each other. */
  private readonly previewQueues = new Map<string, PreviewQueue>();

  constructor(private readonly instances: InstancesService) {}

  private getPreviewQueue(serverPath: string): PreviewQueue {
    let q = this.previewQueues.get(serverPath);
    if (!q) {
      q = { running: false, waiters: [] };
      this.previewQueues.set(serverPath, q);
    }
    return q;
  }

  private enqueuePreview(
    serverPath: string,
    run: () => Promise<OpResult>,
  ): Promise<OpResult> {
    return new Promise((resolve) => {
      const q = this.getPreviewQueue(serverPath);
      q.waiters.push({ run, resolve });
      void this.pumpPreviewQueue(serverPath);
    });
  }

  private async pumpPreviewQueue(serverPath: string): Promise<void> {
    const q = this.getPreviewQueue(serverPath);
    if (q.running) return;
    q.running = true;
    try {
      while (q.waiters.length > 0) {
        const batch = q.waiters.splice(0);
        const job = batch[batch.length - 1];
        for (let i = 0; i < batch.length - 1; i++) {
          batch[i].resolve({ ok: false, error: 'preview_superseded' });
        }
        try {
          job.resolve(await job.run());
        } catch (e) {
          job.resolve({
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    } finally {
      q.running = false;
      if (q.waiters.length > 0) void this.pumpPreviewQueue(serverPath);
    }
  }

  private previewCacheKey(
    serverPath: string,
    gen: MapGenSettingsJson,
    seed: number | undefined,
    planet: string,
    previewSize: number,
    withMapSettings: boolean,
    mapSettings?: MapSettingsJson,
  ): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          serverPath,
          gen,
          seed: seed ?? null,
          planet,
          size: previewSize,
          mapSettings: withMapSettings ? mapSettings : null,
        }),
      )
      .digest('hex');
  }

  private getCachedPreview(key: string): Buffer | null {
    const hit = this.previewCache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > PREVIEW_CACHE_TTL_MS) {
      this.previewCache.delete(key);
      return null;
    }
    return hit.png;
  }

  private setCachedPreview(key: string, png: Buffer): void {
    if (this.previewCache.size >= PREVIEW_CACHE_MAX) {
      const oldest = [...this.previewCache.entries()].sort(
        (a, b) => a[1].at - b[1].at,
      )[0];
      if (oldest) this.previewCache.delete(oldest[0]);
    }
    this.previewCache.set(key, { png, at: Date.now() });
  }

  getSchema(): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    return { ok: true, ...mapGenSchema(hasSpaceAge(sel.item.serverPath)) };
  }

  parseExchangeString(raw: string): OpResult {
    try {
      const decoded = decodeMapExchangeString(raw);
      return {
        ok: true,
        map_gen_settings: decoded.map_gen_settings,
        map_settings: decoded.map_settings ?? null,
        factorio_version: decoded.version.slice(0, 3).join('.'),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  exportExchangeString(
    mapGenSettings: Record<string, unknown>,
    mapSettings?: Record<string, unknown> | null,
    spaceAge = true,
  ): OpResult {
    try {
      const gen = prepareMapGenForExchange(mapGenSettings);
      const settings = prepareMapSettingsForExchange(mapSettings, spaceAge);
      const map_exchange_string = encodeMapExchangeString(gen, settings);
      return { ok: true, map_exchange_string };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  async generatePreview(
    mapGenSettings: MapGenSettingsJson,
    seed?: number,
    mapSettings?: MapSettingsJson,
    previewPlanet?: string,
    opts?: { skipMapSettings?: boolean; previewSize?: number },
  ): Promise<OpResult> {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const exe = sel.pm.findFactorioExe();
    if (!exe) return { ok: false, error: 'no_factorio_exe' };

    const serverPath = sel.item.serverPath;
    const gen = prepareMapGenSettings(serverPath, { ...mapGenSettings });
    if (seed != null && Number.isFinite(seed)) gen.seed = Math.floor(seed);

    const useMapSettings =
      !opts?.skipMapSettings &&
      mapSettings &&
      Object.keys(mapSettings).length > 0;
    const mergedSettings = useMapSettings
      ? prepareMapSettings(serverPath, mapSettings)
      : undefined;

    const planet = String(previewPlanet || 'nauvis').trim() || 'nauvis';
    const previewSize = normalizePreviewSize(
      opts?.previewSize ?? FCC_PREVIEW_UI_SIZE,
    );
    const cacheKey = this.previewCacheKey(
      serverPath,
      gen,
      seed,
      planet,
      previewSize,
      !!mergedSettings,
      mergedSettings,
    );
    const cached = this.getCachedPreview(cacheKey);
    if (cached) {
      return {
        ok: true,
        preview_png_base64: cached.toString('base64'),
        seed: gen.seed ?? seed ?? null,
        preview_size: previewSize,
        cached: true,
      };
    }

    return this.enqueuePreview(serverPath, () =>
      this.runFactorioPreview(
        exe,
        serverPath,
        gen,
        seed,
        planet,
        previewSize,
        mergedSettings,
        cacheKey,
      ),
    );
  }

  /** One Factorio run (UI size) — stream API sends a single frame. */
  async generatePreviewProgressive(
    mapGenSettings: MapGenSettingsJson,
    seed: number | undefined,
    previewPlanet: string | undefined,
    onFrame: (frame: PreviewStreamFrame) => void,
    opts?: { skipMapSettings?: boolean },
  ): Promise<OpResult> {
    const result = await this.generatePreview(
      mapGenSettings,
      seed,
      undefined,
      previewPlanet,
      {
        skipMapSettings: opts?.skipMapSettings,
        previewSize: FCC_PREVIEW_UI_SIZE,
      },
    );
    if (result.ok && result.preview_png_base64) {
      onFrame({
        preview_size: FCC_PREVIEW_UI_SIZE,
        preview_png_base64: String(result.preview_png_base64),
        final: true,
      });
    }
    return result;
  }

  private async runFactorioPreview(
    exe: string,
    serverPath: string,
    gen: MapGenSettingsJson,
    seed: number | undefined,
    planet: string,
    previewSize: number,
    mergedSettings: MapSettingsJson | undefined,
    cacheKey: string,
  ): Promise<OpResult> {
    const workDir = join(
      tmpdir(),
      `fcc-map-preview-${randomBytes(6).toString('hex')}`,
    );
    mkdirSync(workDir, { recursive: true });
    const genPath = join(workDir, 'map-gen-settings.json');
    const settingsPath = join(workDir, 'map-settings.json');
    const previewPath = join(workDir, 'preview.png');

    try {
      writeFileSync(genPath, JSON.stringify(gen, null, 2), 'utf-8');
      const args = [
        '--generate-map-preview',
        previewPath,
        '--map-gen-settings',
        genPath,
        '--map-preview-size',
        String(previewSize),
      ];
      if (seed != null && Number.isFinite(seed)) {
        args.push('--map-gen-seed', String(Math.floor(seed)));
      }
      if (mergedSettings) {
        writeFileSync(
          settingsPath,
          JSON.stringify(mergedSettings, null, 2),
          'utf-8',
        );
        args.push('--map-settings', settingsPath);
      }
      if (planet) args.push('--map-preview-planet', planet);
      args.push(...factorioThreadArgs());

      await execFactorio(exe, args, serverPath, 120_000);

      if (!existsSync(previewPath))
        return { ok: false, error: 'preview_not_created' };
      const png = readFileSync(previewPath);
      this.setCachedPreview(cacheKey, png);
      return {
        ok: true,
        preview_png_base64: png.toString('base64'),
        seed: gen.seed ?? seed ?? null,
        preview_size: previewSize,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    } finally {
      try {
        rmSync(workDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  resolveCreatePayload(opts: CreateSaveOptions): {
    mapGen: MapGenSettingsJson | null;
    mapSettings: MapSettingsJson | undefined;
    preset: string | undefined;
    seed: number | undefined;
  } {
    const mode = opts.mode || 'default';
    if (mode === 'exchange' && opts.map_exchange_string) {
      const decoded = decodeMapExchangeString(opts.map_exchange_string);
      return {
        mapGen: decoded.map_gen_settings,
        mapSettings: decoded.map_settings,
        preset: undefined,
        seed: opts.seed,
      };
    }
    if (mode === 'custom' && opts.map_gen_settings) {
      return {
        mapGen: opts.map_gen_settings,
        mapSettings: opts.map_settings,
        preset: undefined,
        seed: opts.seed,
      };
    }
    if (opts.preset && opts.preset !== 'default') {
      const bundle = mapGenPresetBundle(opts.preset, opts.seed);
      return {
        mapGen: bundle.map_gen_settings,
        mapSettings: bundle.map_settings,
        preset: opts.preset,
        seed: opts.seed,
      };
    }
    if (mode === 'custom') {
      return {
        mapGen: defaultMapGenSettings(opts.seed),
        mapSettings: opts.map_settings,
        preset: undefined,
        seed: opts.seed,
      };
    }
    return {
      mapGen: null,
      mapSettings: undefined,
      preset: undefined,
      seed: opts.seed,
    };
  }

  /** Write temp JSON paths for factorio --create; caller must delete workDir. */
  prepareCreateFiles(
    serverPath: string,
    mapGen: MapGenSettingsJson | null,
    mapSettings?: MapSettingsJson,
    preset?: string,
  ): { workDir: string; args: string[] } | { presetOnly: string } {
    if (!mapGen && preset) return { presetOnly: preset };
    if (!mapGen) return { presetOnly: 'default' };

    const workDir = join(
      serverPath,
      '.fcc-map-create',
      randomBytes(6).toString('hex'),
    );
    mkdirSync(workDir, { recursive: true });
    const genPath = join(workDir, 'map-gen-settings.json');
    writeFileSync(genPath, JSON.stringify(mapGen, null, 2), 'utf-8');
    const args = ['--map-gen-settings', genPath];
    if (mapSettings && Object.keys(mapSettings).length) {
      const settingsPath = join(workDir, 'map-settings.json');
      writeFileSync(
        settingsPath,
        JSON.stringify(mapSettings, null, 2),
        'utf-8',
      );
      args.push('--map-settings', settingsPath);
    }
    return { workDir, args };
  }

  cleanupWorkDir(workDir: string): void {
    try {
      rmSync(workDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}
