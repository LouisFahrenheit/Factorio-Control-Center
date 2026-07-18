import { MAP_GEN_PLANETS, type MapGenPlanetDef } from './catalog';
import {
  MAP_GEN_NAMED_MULTIPLIERS,
  MAP_GEN_SLIDER_MAX,
  MAP_GEN_SLIDER_NORMAL,
  asteroidPercentAt,
  asteroidSliderToMultiplier,
  autoplaceFieldPercent,
  biasSliderToValue,
  biasValueToSlider,
  clampAutoplaceSliderIndex,
  multiplierToSlider,
  percentToAsteroidSliderIndex,
  percentToAutoplaceSliderIndex,
  propertyFrequencyToScaleSlider,
  sizeNameToSlider,
  sliderToAutoplaceValue,
  sliderToMultiplier,
  sliderToBaselineValue,
} from './sliderScale';
import {
  EVOLUTION_DEFAULTS,
  EXPANSION_DEFAULTS,
  EVO_DESTROY_SCALE,
  EVO_POLLUTION_SCALE,
  EVO_TIME_SCALE,
  EXPANSION_COOLDOWN_TICKS_PER_MINUTE,
  evolutionDestroyToDisplay,
  ASTEROIDS_DEFAULTS,
  POLLUTION_DEFAULTS,
  SPOILING_DEFAULTS,
  evolutionPollutionToDisplay,
  evolutionTimeToDisplay,
  expansionCooldownToMinutes,
  EVOLUTION_FIELD_SPECS,
  EXPANSION_FIELD_SPECS,
  clampNumeric,
  normalizeSettlerGroupSizes,
  percentFromMultiplier,
  percentToMultiplier,
} from './mapSettingsNumeric';
import {
  STARTING_AREA_DEFAULT_MULT,
  TERRAIN_DEFAULT_MULT,
  applyMapGenPresetToUi,
  terrainSliderFromMultiplier,
} from './presets';
import {
  type ControlUi,
  type MapGenMapType,
  type MapGenPresetId,
  type MapGenSettingsJson,
  type MapGenUiState,
  type MapSettingsJson,
} from './types';

export { MAP_GEN_SLIDER_MAX };

function defaultControl(): ControlUi {
  return { enabled: true, frequency: 5, size: 5, richness: 5 };
}

function defaultPollution() {
  return {
    enabled: true,
    absorptionModifierPercent: POLLUTION_DEFAULTS.absorptionModifierPercent,
    attackCostModifierPercent: POLLUTION_DEFAULTS.attackCostModifierPercent,
    minPollutionToDamageTrees: POLLUTION_DEFAULTS.minPollutionToDamageTrees,
    pollutionAbsorbedPerTree: POLLUTION_DEFAULTS.pollutionAbsorbedPerTree,
    diffusionRatioPercent: POLLUTION_DEFAULTS.diffusionRatioPercent,
  };
}

function defaultEvolution() {
  return {
    enabled: true,
    timeFactor: EVOLUTION_DEFAULTS.timeFactor,
    destroyFactor: EVOLUTION_DEFAULTS.destroyFactor,
    pollutionFactor: EVOLUTION_DEFAULTS.pollutionFactor,
  };
}

function defaultExpansion() {
  return {
    enabled: true,
    maxExpansionDistance: EXPANSION_DEFAULTS.maxExpansionDistance,
    settlerGroupMin: EXPANSION_DEFAULTS.settlerGroupMin,
    settlerGroupMax: EXPANSION_DEFAULTS.settlerGroupMax,
    minCooldownMinutes: EXPANSION_DEFAULTS.minCooldownMinutes,
    maxCooldownMinutes: EXPANSION_DEFAULTS.maxCooldownMinutes,
  };
}

export function defaultMapGenUiState(spaceAge = false): MapGenUiState {
  const planets: MapGenUiState['planets'] = {};
  for (const p of MAP_GEN_PLANETS) {
    if (p.spaceAge && !spaceAge) continue;
    planets[p.id] = {};
    for (const c of p.controls) planets[p.id][c.id] = defaultControl();
  }
  return {
    preset: 'default',
    seed: '',
    previewPlanet: 'nauvis',
    planets,
    peacefulMode: false,
    noEnemiesMode: false,
    mapWidth: 0,
    mapHeight: 0,
    terrainSegmentation: terrainSliderFromMultiplier(TERRAIN_DEFAULT_MULT),
    water: terrainSliderFromMultiplier(TERRAIN_DEFAULT_MULT),
    moistureScale: 5,
    moistureBias: 10,
    auxScale: 5,
    auxBias: 10,
    mapType: 'nauvis',
    startingArea: terrainSliderFromMultiplier(
      STARTING_AREA_DEFAULT_MULT,
      STARTING_AREA_DEFAULT_MULT,
    ),
    technologyPriceMultiplier: 1,
    asteroidsSpawningRatePercent: ASTEROIDS_DEFAULTS.spawningRatePercent,
    spoilingRatePercent: SPOILING_DEFAULTS.ratePercent,
    pollution: defaultPollution(),
    enemyEvolution: defaultEvolution(),
    enemyExpansion: defaultExpansion(),
  };
}

function startingAreaToJson(index: number): number | string {
  const mult = sliderToBaselineValue(index, STARTING_AREA_DEFAULT_MULT);
  if (Math.abs(mult - MAP_GEN_NAMED_MULTIPLIERS.small) < 0.02) return 'small';
  return mult;
}

function controlToJson(ctrl: ControlUi, withRichness: boolean): Record<string, unknown> {
  if (!ctrl.enabled) {
    return withRichness
      ? { frequency: 'none', size: 'none', richness: 'none' }
      : { frequency: 'none', size: 'none' };
  }
  const out: Record<string, unknown> = {
    frequency: sliderToAutoplaceValue(clampAutoplaceSliderIndex(ctrl.frequency)),
    size: sliderToAutoplaceValue(clampAutoplaceSliderIndex(ctrl.size)),
  };
  if (withRichness) {
    out.richness = sliderToAutoplaceValue(clampAutoplaceSliderIndex(ctrl.richness));
  }
  return out;
}

function scaleToPropertyString(sliderIndex: number): string {
  const m = sliderToMultiplier(sliderIndex);
  if (m <= 0) return '0.001';
  return String(Number((1 / m).toFixed(4)));
}

function biasToPropertyString(sliderIndex: number): string {
  return String(biasSliderToValue(sliderIndex));
}

function activePlanets(spaceAge: boolean): MapGenPlanetDef[] {
  return MAP_GEN_PLANETS.filter((p) => !p.spaceAge || spaceAge);
}

export function buildMapGenSettingsFromUi(state: MapGenUiState, spaceAge = false): MapGenSettingsJson {
  const autoplace_controls: Record<string, unknown> = {};
  for (const planet of activePlanets(spaceAge)) {
    const planetUi = state.planets[planet.id];
    if (!planetUi) continue;
    for (const def of planet.controls) {
      const ctrl = planetUi[def.id] ?? defaultControl();
      autoplace_controls[def.id] = controlToJson(ctrl, def.richness);
    }
  }

  const seedRaw = String(state.seed || '').trim();
  const seed = seedRaw ? Number.parseInt(seedRaw, 10) : null;

  const property_expression_names: Record<string, string> = {
    'control:moisture:frequency': scaleToPropertyString(state.moistureScale),
    'control:moisture:bias': biasToPropertyString(state.moistureBias),
    'control:aux:frequency': scaleToPropertyString(state.auxScale),
    'control:aux:bias': biasToPropertyString(state.auxBias),
  };
  if (state.preset === 'ribbon-world') {
    property_expression_names.elevation = 'elevation_lakes';
    property_expression_names['trees_forest_path_cutout'] = '1';
  } else if (state.mapType === 'island') {
    property_expression_names.elevation = 'elevation_island';
    property_expression_names.moisture = 'moisture_basic';
    property_expression_names.aux = 'aux_basic';
    property_expression_names.cliffiness = 'cliffiness_basic';
    property_expression_names.cliff_elevation = 'cliff_elevation_from_elevation';
    property_expression_names.trees_forest_path_cutout = '1';
  } else if (state.mapType === 'lakes') {
    property_expression_names.elevation = 'elevation_lakes';
    property_expression_names.moisture = 'moisture_basic';
    property_expression_names.aux = 'aux_basic';
    property_expression_names.cliffiness = 'cliffiness_basic';
    property_expression_names.cliff_elevation = 'cliff_elevation_from_elevation';
    property_expression_names.trees_forest_path_cutout = '1';
  }

  const gen: MapGenSettingsJson = {
    terrain_segmentation: sliderToBaselineValue(state.terrainSegmentation, TERRAIN_DEFAULT_MULT),
    water: sliderToBaselineValue(state.water, TERRAIN_DEFAULT_MULT),
    starting_area: startingAreaToJson(state.startingArea),
    peaceful_mode: state.peacefulMode,
    no_enemies_mode: state.noEnemiesMode,
    seed: Number.isFinite(seed) ? seed : null,
    autoplace_controls,
    property_expression_names,
  };

  const w = Math.max(0, Math.floor(state.mapWidth)) * 32;
  const h = Math.max(0, Math.floor(state.mapHeight)) * 32;
  if (w > 0) gen.width = w;
  if (h > 0) gen.height = h;

  if (state.mapType === 'lakes' || state.mapType === 'island') {
    gen.cliff_settings = { cliff_smoothing: 1 };
  }

  return gen;
}

export function applyMapTypeToUi(state: MapGenUiState, mapType: MapGenMapType): MapGenUiState {
  const next: MapGenUiState = { ...state, mapType };
  if ((mapType === 'lakes' || mapType === 'island') && next.planets.nauvis?.trees) {
    const planets = { ...next.planets };
    const nauvis = { ...planets.nauvis! };
    nauvis.trees = { enabled: true, frequency: multiplierToSlider(1), size: multiplierToSlider(0.5), richness: 5 };
    planets.nauvis = nauvis;
    next.planets = planets;
  }
  return next;
}

/** True when map_settings differ from a fresh default UI (for create-save). */
export function mapSettingsDifferFromDefault(state: MapGenUiState, spaceAge = false): boolean {
  const a = buildMapSettingsFromUi(state, spaceAge);
  const b = buildMapSettingsFromUi(defaultMapGenUiState(spaceAge), spaceAge);
  return JSON.stringify(a) !== JSON.stringify(b);
}

export function buildMapSettingsFromUi(state: MapGenUiState, spaceAge = false): MapSettingsJson {
  const p = state.pollution;
  const ev = state.enemyEvolution;
  const ex = state.enemyExpansion;
  const groups = normalizeSettlerGroupSizes(ex.settlerGroupMin, ex.settlerGroupMax);
  const settings: MapSettingsJson = {
    pollution: {
      enabled: p.enabled,
      ageing: percentToMultiplier(p.absorptionModifierPercent),
      enemy_attack_pollution_consumption_modifier: percentToMultiplier(p.attackCostModifierPercent),
      min_pollution_to_damage_trees: Math.round(p.minPollutionToDamageTrees),
      pollution_restored_per_tree_damage: Math.round(p.pollutionAbsorbedPerTree),
      diffusion_ratio: percentToMultiplier(p.diffusionRatioPercent),
    },
    enemy_evolution: {
      enabled: ev.enabled,
      time_factor: ev.timeFactor * EVO_TIME_SCALE,
      destroy_factor: ev.destroyFactor * EVO_DESTROY_SCALE,
      pollution_factor: ev.pollutionFactor * EVO_POLLUTION_SCALE,
    },
    enemy_expansion: {
      enabled: ex.enabled,
      max_expansion_distance: Math.round(ex.maxExpansionDistance),
      settler_group_min_size: Math.round(groups.settlerGroupMin),
      settler_group_max_size: Math.round(groups.settlerGroupMax),
      min_expansion_cooldown: Math.round(ex.minCooldownMinutes * EXPANSION_COOLDOWN_TICKS_PER_MINUTE),
      max_expansion_cooldown: Math.round(ex.maxCooldownMinutes * EXPANSION_COOLDOWN_TICKS_PER_MINUTE),
    },
    difficulty_settings: {
      technology_price_multiplier: state.technologyPriceMultiplier,
      spoil_time_modifier: sliderToMultiplier(
        percentToAutoplaceSliderIndex(state.spoilingRatePercent),
      ),
    },
  };

  if (spaceAge) {
    settings.asteroids = {
      spawning_rate: asteroidSliderToMultiplier(
        percentToAsteroidSliderIndex(state.asteroidsSpawningRatePercent),
      ),
    };
  }

  return settings;
}

export function applyPresetToUi(state: MapGenUiState, preset: MapGenPresetId): MapGenUiState {
  const spaceAge = Object.keys(state.planets).length > 1;
  if (preset === 'default') {
    const next = defaultMapGenUiState(spaceAge);
    next.seed = state.seed;
    next.previewPlanet = state.previewPlanet;
    return next;
  }
  return applyMapGenPresetToUi(state, preset, spaceAge, defaultMapGenUiState);
}

function readTriple(raw: unknown, withRichness: boolean): ControlUi {
  const t = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const freq = t.frequency;
  const enabled = freq !== 'none' && freq !== 0 && t.size !== 'none';
  const freqIdx =
    typeof freq === 'number'
      ? multiplierToSlider(freq)
      : enabled
        ? sizeNameToSlider(freq)
        : MAP_GEN_SLIDER_NORMAL;
  const sizeIdx =
    typeof t.size === 'number'
      ? multiplierToSlider(t.size)
      : enabled
        ? sizeNameToSlider(t.size)
        : MAP_GEN_SLIDER_NORMAL;
  return {
    enabled,
    frequency: enabled ? clampAutoplaceSliderIndex(freqIdx) : freqIdx || MAP_GEN_SLIDER_NORMAL,
    size: enabled ? clampAutoplaceSliderIndex(sizeIdx) : sizeIdx || MAP_GEN_SLIDER_NORMAL,
    richness:
      withRichness && t.richness != null
        ? clampAutoplaceSliderIndex(
            typeof t.richness === 'number'
              ? multiplierToSlider(t.richness)
              : sizeNameToSlider(t.richness),
          )
        : MAP_GEN_SLIDER_NORMAL,
  };
}

export function mapGenSettingsToUi(
  gen: MapGenSettingsJson,
  settings?: MapSettingsJson | null,
  spaceAge = false,
): MapGenUiState {
  const ui = defaultMapGenUiState(spaceAge);
  const ap = (gen.autoplace_controls || {}) as Record<string, unknown>;
  for (const planet of MAP_GEN_PLANETS) {
    if (planet.spaceAge && !spaceAge) continue;
    for (const def of planet.controls) {
      if (ap[def.id]) ui.planets[planet.id][def.id] = readTriple(ap[def.id], def.richness);
    }
  }
  ui.terrainSegmentation = terrainSliderFromMultiplier(
    Number(gen.terrain_segmentation) || TERRAIN_DEFAULT_MULT,
    TERRAIN_DEFAULT_MULT,
  );
  ui.water = terrainSliderFromMultiplier(Number(gen.water) || TERRAIN_DEFAULT_MULT, TERRAIN_DEFAULT_MULT);
  ui.peacefulMode = !!gen.peaceful_mode;
  ui.noEnemiesMode = !!gen.no_enemies_mode;
  const sa = gen.starting_area;
  if (sa === 'small') {
    ui.startingArea = terrainSliderFromMultiplier(
      MAP_GEN_NAMED_MULTIPLIERS.small,
      STARTING_AREA_DEFAULT_MULT,
    );
  } else {
    ui.startingArea = terrainSliderFromMultiplier(
      Number(sa) || STARTING_AREA_DEFAULT_MULT,
      STARTING_AREA_DEFAULT_MULT,
    );
  }
  const rawW = Number(gen.width || 0);
  const rawH = Number(gen.height || 0);
  ui.mapWidth =
    rawW <= 0 || rawW >= 2_000_000 ? 0 : Math.floor(rawW / 32) || 0;
  ui.mapHeight =
    rawH <= 0 || rawH >= 2_000_000 ? 0 : Math.floor(rawH / 32) || 0;
  if (gen.seed != null) ui.seed = String(gen.seed);
  const pe = (gen.property_expression_names || {}) as Record<string, string>;
  if (pe.elevation === 'elevation_island') ui.mapType = 'island';
  else if (pe.elevation === 'elevation_lakes' || pe.moisture === 'moisture_basic') ui.mapType = 'lakes';

  if (pe['control:moisture:frequency'] != null) {
    ui.moistureScale = propertyFrequencyToScaleSlider(pe['control:moisture:frequency']);
  }
  if (pe['control:moisture:bias'] != null) {
    ui.moistureBias = biasValueToSlider(pe['control:moisture:bias']);
  }
  if (pe['control:aux:frequency'] != null) {
    ui.auxScale = propertyFrequencyToScaleSlider(pe['control:aux:frequency']);
  }
  if (pe['control:aux:bias'] != null) {
    ui.auxBias = biasValueToSlider(pe['control:aux:bias']);
  }

  if (settings?.pollution) {
    const pol = settings.pollution as Record<string, unknown>;
    ui.pollution = {
      enabled: pol.enabled !== false,
      absorptionModifierPercent: percentFromMultiplier(
        pol.ageing,
        POLLUTION_DEFAULTS.absorptionModifierPercent,
      ),
      attackCostModifierPercent: percentFromMultiplier(
        pol.enemy_attack_pollution_consumption_modifier,
        POLLUTION_DEFAULTS.attackCostModifierPercent,
      ),
      minPollutionToDamageTrees:
        Number(pol.min_pollution_to_damage_trees) || POLLUTION_DEFAULTS.minPollutionToDamageTrees,
      pollutionAbsorbedPerTree:
        Number(pol.pollution_restored_per_tree_damage) || POLLUTION_DEFAULTS.pollutionAbsorbedPerTree,
      diffusionRatioPercent: percentFromMultiplier(
        pol.diffusion_ratio,
        POLLUTION_DEFAULTS.diffusionRatioPercent,
      ),
    };
  }

  if (settings?.asteroids) {
    const ast = settings.asteroids as Record<string, unknown>;
    ui.asteroidsSpawningRatePercent = asteroidPercentAt(
      percentToAsteroidSliderIndex(
        percentFromMultiplier(ast.spawning_rate, ASTEROIDS_DEFAULTS.spawningRatePercent),
      ),
    );
  }

  if (settings?.difficulty_settings) {
    const ds = settings.difficulty_settings as Record<string, unknown>;
    if (ds.technology_price_multiplier != null) {
      ui.technologyPriceMultiplier = Number(ds.technology_price_multiplier) || 1;
    }
    if (ds.spoil_time_modifier != null) {
      ui.spoilingRatePercent = autoplaceFieldPercent(
        percentToAutoplaceSliderIndex(
          percentFromMultiplier(ds.spoil_time_modifier, SPOILING_DEFAULTS.ratePercent),
        ),
        'size',
      );
    }
  }

  if (settings?.enemy_evolution) {
    const ev = settings.enemy_evolution as Record<string, unknown>;
    ui.enemyEvolution = {
      enabled: ev.enabled !== false,
      timeFactor: clampNumeric(
        evolutionTimeToDisplay(ev.time_factor),
        EVOLUTION_FIELD_SPECS.timeFactor,
      ),
      destroyFactor: clampNumeric(
        evolutionDestroyToDisplay(ev.destroy_factor),
        EVOLUTION_FIELD_SPECS.destroyFactor,
      ),
      pollutionFactor: clampNumeric(
        evolutionPollutionToDisplay(ev.pollution_factor),
        EVOLUTION_FIELD_SPECS.pollutionFactor,
      ),
    };
  }

  if (settings?.enemy_expansion) {
    const ex = settings.enemy_expansion as Record<string, unknown>;
    ui.enemyExpansion = {
      enabled: ex.enabled !== false,
      maxExpansionDistance: clampNumeric(
        Number(ex.max_expansion_distance) || EXPANSION_DEFAULTS.maxExpansionDistance,
        EXPANSION_FIELD_SPECS.maxExpansionDistance,
      ),
      ...normalizeSettlerGroupSizes(
        Number(ex.settler_group_min_size) || EXPANSION_DEFAULTS.settlerGroupMin,
        Number(ex.settler_group_max_size) || EXPANSION_DEFAULTS.settlerGroupMax,
      ),
      minCooldownMinutes: clampNumeric(
        expansionCooldownToMinutes(ex.min_expansion_cooldown),
        EXPANSION_FIELD_SPECS.minCooldownMinutes,
      ),
      maxCooldownMinutes: clampNumeric(
        expansionCooldownToMinutes(ex.max_expansion_cooldown),
        EXPANSION_FIELD_SPECS.maxCooldownMinutes,
      ),
    };
  }

  return ui;
}
