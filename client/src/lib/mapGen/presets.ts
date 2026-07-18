/**
 * Map generator presets aligned with data/base/prototypes/map-gen-presets.lua
 * and map-settings.example.json / map-settings.json defaults.
 */
import type { MapGenPresetId, MapGenUiState, ControlUi } from './types';
import {
  ASTEROIDS_DEFAULTS,
  EVOLUTION_DEFAULTS,
  EXPANSION_DEFAULTS,
  POLLUTION_DEFAULTS,
  SPOILING_DEFAULTS,
  evolutionPollutionToDisplay,
  evolutionTimeToDisplay,
} from './mapSettingsNumeric';
import { MAP_GEN_NAMED_MULTIPLIERS, multiplierToSlider, sizeNameToSlider } from './sliderScale';

/** Factorio death-world presets: starting_area = "small" (MapGenSize). */
const STARTING_AREA_SMALL_MULT = MAP_GEN_NAMED_MULTIPLIERS.small;

/** Factorio default terrain/water/starting_area multipliers (map-gen-settings). */
export const TERRAIN_DEFAULT_MULT = 0.5;
export const STARTING_AREA_DEFAULT_MULT = 1;

export function terrainSliderFromMultiplier(
  mult: number,
  baseline: number = TERRAIN_DEFAULT_MULT,
): number {
  return multiplierToSlider(mult, baseline);
}

function ctrl(freq: number | string, size: number | string, richness: number | string = 1): ControlUi {
  const frequency =
    typeof freq === 'number' ? multiplierToSlider(freq) : sizeNameToSlider(freq);
  const sizeIdx = typeof size === 'number' ? multiplierToSlider(size) : sizeNameToSlider(size);
  const richnessIdx =
    typeof richness === 'number' ? multiplierToSlider(richness) : sizeNameToSlider(richness);
  return {
    enabled: true,
    frequency,
    size: sizeIdx,
    richness: richnessIdx,
  };
}

function setNauvisControl(ui: MapGenUiState, id: string, patch: ControlUi): void {
  if (!ui.planets.nauvis) return;
  ui.planets.nauvis[id] = patch;
}

function setResourceRichness(ui: MapGenUiState, richness: string): void {
  const r = sizeNameToSlider(richness);
  const ids = ['coal', 'copper-ore', 'iron-ore', 'stone', 'uranium-ore', 'crude-oil'] as const;
  for (const id of ids) {
    const c = ui.planets.nauvis?.[id];
    if (c) ui.planets.nauvis![id] = { ...c, richness: r };
  }
}

/** Apply preset on top of fresh default UI (keeps seed / previewPlanet from caller). */
export function applyMapGenPresetToUi(
  state: MapGenUiState,
  preset: MapGenPresetId,
  spaceAge: boolean,
  createDefault: (spaceAge: boolean) => MapGenUiState,
): MapGenUiState {
  const next = createDefault(spaceAge);
  next.preset = preset;
  next.seed = state.seed;
  next.previewPlanet = state.previewPlanet;

  next.terrainSegmentation = terrainSliderFromMultiplier(TERRAIN_DEFAULT_MULT);
  next.water = terrainSliderFromMultiplier(TERRAIN_DEFAULT_MULT);
  next.startingArea = terrainSliderFromMultiplier(
    STARTING_AREA_DEFAULT_MULT,
    STARTING_AREA_DEFAULT_MULT,
  );

  switch (preset) {
    case 'rich-resources':
      setResourceRichness(next, 'very-good');
      break;

    case 'marathon':
      next.technologyPriceMultiplier = 4;
      break;

    case 'death-world':
      setNauvisControl(next, 'enemy-base', ctrl('very-high', 'very-big'));
      next.startingArea = terrainSliderFromMultiplier(
        STARTING_AREA_SMALL_MULT,
        STARTING_AREA_DEFAULT_MULT,
      );
      next.pollution.absorptionModifierPercent = 50;
      next.pollution.attackCostModifierPercent = 50;
      next.enemyEvolution.timeFactor = evolutionTimeToDisplay(0.00002);
      next.enemyEvolution.pollutionFactor = evolutionPollutionToDisplay(0.0000012);
      break;

    case 'death-world-marathon':
      setNauvisControl(next, 'enemy-base', ctrl('very-high', 'very-big'));
      next.startingArea = terrainSliderFromMultiplier(
        STARTING_AREA_SMALL_MULT,
        STARTING_AREA_DEFAULT_MULT,
      );
      next.technologyPriceMultiplier = 4;
      next.pollution.absorptionModifierPercent = 50;
      next.pollution.attackCostModifierPercent = 80;
      next.enemyEvolution.timeFactor = evolutionTimeToDisplay(0.000015);
      next.enemyEvolution.pollutionFactor = evolutionPollutionToDisplay(0.000001);
      break;

    case 'rail-world': {
      const railRes = [
        'coal',
        'copper-ore',
        'crude-oil',
        'uranium-ore',
        'iron-ore',
        'stone',
      ] as const;
      for (const id of railRes) {
        setNauvisControl(next, id, ctrl(1 / 3, 3));
      }
      setNauvisControl(next, 'water', ctrl(0.5, 1.5));
      next.enemyEvolution.timeFactor = evolutionTimeToDisplay(0.000002);
      next.enemyExpansion.enabled = false;
      break;
    }

    case 'ribbon-world': {
      next.mapHeight = 128 / 32;
      const ribbonRes = [
        'coal',
        'copper-ore',
        'crude-oil',
        'uranium-ore',
        'iron-ore',
        'stone',
      ] as const;
      for (const id of ribbonRes) {
        setNauvisControl(next, id, ctrl(3, 0.5, 2));
      }
      setNauvisControl(next, 'water', ctrl(4, 0.25, 1));
      if (next.planets.nauvis?.nauvis_cliff) {
        setNauvisControl(next, 'nauvis_cliff', ctrl(0.25, 0.75, 1));
      }
      next.startingArea = terrainSliderFromMultiplier(3, STARTING_AREA_DEFAULT_MULT);
      break;
    }

    case 'lakes':
      next.mapType = 'lakes';
      setNauvisControl(next, 'trees', ctrl(1, 0.5, 1));
      break;

    case 'island':
      next.mapType = 'island';
      setNauvisControl(next, 'trees', ctrl(1, 0.5, 1));
      break;

    default:
      break;
  }

  return next;
}

/** Re-export defaults for tests / UI labels. */
export const MAP_GEN_DEFAULTS = {
  pollution: POLLUTION_DEFAULTS,
  evolution: EVOLUTION_DEFAULTS,
  expansion: EXPANSION_DEFAULTS,
  asteroids: ASTEROIDS_DEFAULTS,
  spoiling: SPOILING_DEFAULTS,
  terrainMult: TERRAIN_DEFAULT_MULT,
  startingAreaMult: STARTING_AREA_DEFAULT_MULT,
} as const;
