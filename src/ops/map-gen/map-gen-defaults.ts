import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { planetsForServer } from './map-gen-catalog';
import type {
  AutoplaceTriple,
  MapGenSettingsJson,
  MapSettingsJson,
} from './map-gen-presets';
import { hasSpaceAge } from '../ops-utils';

function readJsonFile(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export function loadDefaultMapSettings(
  serverPath: string,
): MapSettingsJson | null {
  const candidates = [
    join(serverPath, 'data', 'map-settings.example.json'),
    join(serverPath, 'map-settings.example.json'),
  ];
  for (const p of candidates) {
    const raw = readJsonFile(p);
    if (raw) return raw;
  }
  return null;
}

export function loadDefaultMapGenSettings(
  serverPath: string,
): MapGenSettingsJson | null {
  const candidates = [
    join(serverPath, 'data', 'map-gen-settings.example.json'),
    join(serverPath, 'map-gen-settings.example.json'),
  ];
  for (const p of candidates) {
    const raw = readJsonFile(p);
    if (raw) return raw;
  }
  return null;
}

function shallowSectionMerge<T extends Record<string, unknown>>(
  base: T | undefined,
  patch: T | undefined,
): T | undefined {
  if (!patch || !Object.keys(patch).length) return base;
  if (!base) return patch;
  return { ...base, ...patch };
}

/** Merge UI map_settings patches onto the full example file Factorio expects. */
export function mergeMapSettingsForFactorio(
  base: MapSettingsJson,
  patch?: MapSettingsJson,
): MapSettingsJson {
  if (!patch) return base;
  const out = { ...base };
  if (patch.difficulty_settings) {
    out.difficulty_settings = {
      ...(base.difficulty_settings as Record<string, unknown>),
      ...patch.difficulty_settings,
    };
  }
  if (patch.pollution) {
    out.pollution = shallowSectionMerge(
      base.pollution as Record<string, unknown>,
      patch.pollution,
    );
  }
  if (patch.enemy_evolution) {
    out.enemy_evolution = shallowSectionMerge(
      base.enemy_evolution as Record<string, unknown>,
      patch.enemy_evolution,
    );
  }
  if (patch.enemy_expansion) {
    out.enemy_expansion = shallowSectionMerge(
      base.enemy_expansion as Record<string, unknown>,
      patch.enemy_expansion,
    );
  }
  if (patch.asteroids) {
    out.asteroids = shallowSectionMerge(
      base.asteroids as Record<string, unknown>,
      patch.asteroids,
    );
  }
  return out;
}

export function allowedAutoplaceControlIds(serverPath: string): Set<string> {
  const ids = new Set<string>();
  for (const planet of planetsForServer(hasSpaceAge(serverPath))) {
    for (const c of planet.controls) ids.add(c.id);
  }
  return ids;
}

/** Drop autoplace controls that do not exist on this server install (e.g. SA on base-only). */
export function sanitizeMapGenSettings(
  serverPath: string,
  gen: MapGenSettingsJson,
): MapGenSettingsJson {
  const allowed = allowedAutoplaceControlIds(serverPath);
  const ap = gen.autoplace_controls || {};
  const filtered: Record<string, AutoplaceTriple> = {};
  for (const [k, v] of Object.entries(ap)) {
    if (allowed.has(k)) filtered[k] = v;
  }
  return { ...gen, autoplace_controls: filtered };
}

/** UI payload only — no merge with map-gen-settings.example.json. */
export function prepareMapGenSettings(
  serverPath: string,
  gen: MapGenSettingsJson,
): MapGenSettingsJson {
  return sanitizeMapGenSettings(serverPath, gen);
}

const MAP_SETTINGS_SECTIONS = [
  'difficulty_settings',
  'pollution',
  'enemy_evolution',
  'enemy_expansion',
  'asteroids',
] as const;

/** Merge UI patch onto full map-settings.example.json (Factorio --create needs the full tree). */
export function prepareMapSettings(
  serverPath: string,
  patch?: MapSettingsJson,
): MapSettingsJson | undefined {
  if (!patch || !Object.keys(patch).length) return undefined;
  const base = loadDefaultMapSettings(serverPath);
  if (base) return mergeMapSettingsForFactorio(base, patch);
  const out: MapSettingsJson = {};
  for (const key of MAP_SETTINGS_SECTIONS) {
    const section = patch[key];
    if (!section || !Object.keys(section).length) continue;
    out[key] = section;
  }
  return Object.keys(out).length ? out : undefined;
}
