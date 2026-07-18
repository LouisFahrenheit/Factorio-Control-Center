export const MAP_GEN_PRESET_IDS = [
  'default',
  'rich-resources',
  'marathon',
  'death-world',
  'death-world-marathon',
  'rail-world',
  'ribbon-world',
  'lakes',
  'island',
] as const;

export type MapGenPresetId = (typeof MAP_GEN_PRESET_IDS)[number];

/** Nauvis landscape map type (Factorio map generator). */
export type MapGenMapType = 'nauvis' | 'lakes' | 'island';

export const MAP_GEN_MAP_TYPES: MapGenMapType[] = ['nauvis', 'lakes', 'island'];

export type ControlUi = {
  enabled: boolean;
  frequency: number;
  size: number;
  richness: number;
};

export type PollutionUi = {
  enabled: boolean;
  /** GUI % → map-settings `ageing`. */
  absorptionModifierPercent: number;
  /** GUI % → `enemy_attack_pollution_consumption_modifier`. */
  attackCostModifierPercent: number;
  minPollutionToDamageTrees: number;
  pollutionAbsorbedPerTree: number;
  /** GUI % → `diffusion_ratio` (2 = 2%). */
  diffusionRatioPercent: number;
};

export type EnemyEvolutionUi = {
  enabled: boolean;
  timeFactor: number;
  destroyFactor: number;
  pollutionFactor: number;
};

export type EnemyExpansionUi = {
  enabled: boolean;
  maxExpansionDistance: number;
  settlerGroupMin: number;
  settlerGroupMax: number;
  /** Cooldown in minutes (Factorio GUI). */
  minCooldownMinutes: number;
  maxCooldownMinutes: number;
};

export type MapGenUiState = {
  preset: MapGenPresetId;
  seed: string;
  previewPlanet: string;
  /** Per-planet autoplace controls */
  planets: Record<string, Record<string, ControlUi>>;
  peacefulMode: boolean;
  noEnemiesMode: boolean;
  startingArea: number;
  mapWidth: number;
  mapHeight: number;
  terrainSegmentation: number;
  water: number;
  moistureScale: number;
  moistureBias: number;
  auxScale: number;
  auxBias: number;
  mapType: MapGenMapType;
  technologyPriceMultiplier: number;
  /** GUI % → `asteroids.spawning_rate`. */
  asteroidsSpawningRatePercent: number;
  /** GUI % → `difficulty_settings.spoil_time_modifier`. */
  spoilingRatePercent: number;
  pollution: PollutionUi;
  enemyEvolution: EnemyEvolutionUi;
  enemyExpansion: EnemyExpansionUi;
};

export type MapGenSettingsJson = Record<string, unknown>;
export type MapSettingsJson = Record<string, unknown>;
