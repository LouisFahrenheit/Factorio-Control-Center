/** Slider index 0–5 → Factorio autoplace size name. */
export const MAP_GEN_SIZE_NAMES = [
  'none',
  'very-low',
  'low',
  'normal',
  'high',
  'very-high',
  'very-big',
  'very-good',
] as const;

export type MapGenSizeName = (typeof MAP_GEN_SIZE_NAMES)[number];

export type AutoplaceTriple = {
  frequency: MapGenSizeName | number;
  size: MapGenSizeName | number;
  richness: MapGenSizeName | number;
};

export type MapGenSettingsJson = {
  terrain_segmentation?: number | string;
  water?: number | string;
  width?: number;
  height?: number;
  starting_area?: number | string;
  peaceful_mode?: boolean;
  no_enemies_mode?: boolean;
  seed?: number | null;
  autoplace_controls?: Record<string, AutoplaceTriple>;
  property_expression_names?: Record<string, string>;
  cliff_settings?: Record<string, unknown>;
  default_enable_all_autoplace_controls?: boolean;
};

export type MapSettingsJson = {
  pollution?: Record<string, unknown>;
  enemy_evolution?: Record<string, unknown>;
  enemy_expansion?: Record<string, unknown>;
  asteroids?: Record<string, unknown>;
  difficulty_settings?: {
    technology_price_multiplier?: number;
    spoil_time_modifier?: number;
    recipe_difficulty?: number;
    technology_difficulty?: number;
  };
};

const VANILLA_RESOURCES = [
  'coal',
  'copper-ore',
  'crude-oil',
  'enemy-base',
  'iron-ore',
  'stone',
  'uranium-ore',
] as const;

const TERRAIN_DEFAULT = 0.5;
const STARTING_DEFAULT = 1;

function triple(
  frequency: MapGenSizeName | number = 'normal',
  size: MapGenSizeName | number = 'normal',
  richness: MapGenSizeName | number = 'normal',
): AutoplaceTriple {
  return { frequency, size, richness };
}

function defaultAutoplace(): Record<string, AutoplaceTriple> {
  const controls: Record<string, AutoplaceTriple> = {};
  for (const name of VANILLA_RESOURCES) controls[name] = triple();
  return controls;
}

/** Default Nauvis map gen (Factorio map-gen-settings.example.json). */
export function defaultMapGenSettings(seed?: number): MapGenSettingsJson {
  return {
    terrain_segmentation: TERRAIN_DEFAULT,
    water: TERRAIN_DEFAULT,
    width: 0,
    height: 0,
    starting_area: STARTING_DEFAULT,
    peaceful_mode: false,
    no_enemies_mode: false,
    seed: seed ?? null,
    autoplace_controls: defaultAutoplace(),
    default_enable_all_autoplace_controls: true,
  };
}

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

export interface MapGenPresetBundle {
  map_gen_settings: MapGenSettingsJson;
  map_settings?: MapSettingsJson;
}

/** GUI display → map-settings.json raw (Factorio map generator scale). */
const EVO_TIME_SCALE = 1e-7;
const EVO_POLLUTION_SCALE = 1e-7;

/** Built-in presets from data/base/prototypes/map-gen-presets.lua */
export function mapGenPresetBundle(
  preset: string,
  seed?: number,
): MapGenPresetBundle {
  const base = defaultMapGenSettings(seed);
  const ap = { ...defaultAutoplace() };

  const setAllRichness = (r: MapGenSizeName) => {
    for (const k of VANILLA_RESOURCES) {
      if (k === 'enemy-base') continue;
      ap[k] = { ...ap[k], richness: r };
    }
  };

  let map_settings: MapSettingsJson | undefined;

  switch (preset) {
    case 'rich-resources':
      setAllRichness('very-good');
      break;
    case 'marathon':
      map_settings = {
        difficulty_settings: { technology_price_multiplier: 4 },
      };
      break;
    case 'death-world':
      ap['enemy-base'] = triple('very-high', 'very-big', 'normal');
      base.starting_area = 'small';
      map_settings = {
        pollution: {
          ageing: 0.5,
          enemy_attack_pollution_consumption_modifier: 0.5,
        },
        enemy_evolution: { time_factor: 0.00002, pollution_factor: 0.0000012 },
      };
      break;
    case 'death-world-marathon':
      ap['enemy-base'] = triple('very-high', 'very-big', 'normal');
      base.starting_area = 'small';
      map_settings = {
        difficulty_settings: { technology_price_multiplier: 4 },
        pollution: {
          ageing: 0.5,
          enemy_attack_pollution_consumption_modifier: 0.8,
        },
        enemy_evolution: { time_factor: 0.000015, pollution_factor: 0.000001 },
      };
      break;
    case 'rail-world':
      for (const k of [
        'coal',
        'copper-ore',
        'crude-oil',
        'uranium-ore',
        'iron-ore',
        'stone',
      ] as const) {
        ap[k] = triple(1 / 3, 3);
      }
      ap['enemy-base'] = { ...ap['enemy-base'], size: 1 };
      ap.water = triple(0.5, 1.5);
      map_settings = {
        enemy_evolution: { time_factor: 0.000002 },
        enemy_expansion: { enabled: false },
      };
      break;
    case 'ribbon-world':
      base.height = 128;
      base.property_expression_names = {
        elevation: 'elevation_lakes',
        trees_forest_path_cutout: '1',
      };
      for (const k of [
        'coal',
        'copper-ore',
        'crude-oil',
        'uranium-ore',
        'iron-ore',
        'stone',
      ] as const) {
        ap[k] = triple(3, 0.5, 2);
      }
      ap.water = triple(4, 0.25);
      ap.nauvis_cliff = triple(0.25, 0.75);
      base.starting_area = 3;
      break;
    case 'lakes':
      base.property_expression_names = {
        elevation: 'elevation_lakes',
        moisture: 'moisture_basic',
        aux: 'aux_basic',
      };
      base.cliff_settings = { cliff_smoothing: 1 };
      ap.trees = triple(1, 0.5);
      break;
    case 'island':
      base.property_expression_names = {
        elevation: 'elevation_island',
        moisture: 'moisture_basic',
        aux: 'aux_basic',
      };
      base.cliff_settings = { cliff_smoothing: 1 };
      ap.trees = triple(1, 0.5);
      break;
    default:
      break;
  }

  return {
    map_gen_settings: { ...base, autoplace_controls: ap },
    map_settings,
  };
}
