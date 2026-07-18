/** Autoplace control metadata (from Factorio base + Space Age planet-map-gen). */
export type MapGenControlDef = {
  id: string;
  /** i18n key suffix: map_gen_control_{id} with dashes → underscores */
  richness: boolean;
  category: 'resource' | 'terrain' | 'enemy' | 'cliff' | 'special';
};

export type MapGenPlanetDef = {
  id: string;
  /** Preview CLI value for --map-preview-planet */
  previewId: string;
  spaceAge: boolean;
  controls: MapGenControlDef[];
};

const nauvisControls: MapGenControlDef[] = [
  { id: 'coal', richness: true, category: 'resource' },
  { id: 'copper-ore', richness: true, category: 'resource' },
  { id: 'iron-ore', richness: true, category: 'resource' },
  { id: 'stone', richness: true, category: 'resource' },
  { id: 'uranium-ore', richness: true, category: 'resource' },
  { id: 'crude-oil', richness: true, category: 'resource' },
  { id: 'water', richness: false, category: 'terrain' },
  { id: 'trees', richness: false, category: 'terrain' },
  { id: 'rocks', richness: false, category: 'terrain' },
  { id: 'enemy-base', richness: false, category: 'enemy' },
  { id: 'starting_area_moisture', richness: false, category: 'special' },
  { id: 'nauvis_cliff', richness: false, category: 'cliff' },
];

export const MAP_GEN_PLANETS: MapGenPlanetDef[] = [
  {
    id: 'nauvis',
    previewId: 'nauvis',
    spaceAge: false,
    controls: nauvisControls,
  },
  {
    id: 'vulcanus',
    previewId: 'vulcanus',
    spaceAge: true,
    controls: [
      { id: 'vulcanus_coal', richness: true, category: 'resource' },
      { id: 'tungsten_ore', richness: true, category: 'resource' },
      { id: 'calcite', richness: true, category: 'resource' },
      { id: 'sulfuric_acid_geyser', richness: true, category: 'resource' },
      { id: 'vulcanus_volcanism', richness: false, category: 'terrain' },
    ],
  },
  {
    id: 'gleba',
    previewId: 'gleba',
    spaceAge: true,
    controls: [
      { id: 'gleba_stone', richness: true, category: 'resource' },
      { id: 'gleba_plants', richness: false, category: 'terrain' },
      { id: 'gleba_water', richness: false, category: 'terrain' },
      { id: 'gleba_enemy_base', richness: false, category: 'enemy' },
      { id: 'gleba_cliff', richness: false, category: 'cliff' },
    ],
  },
  {
    id: 'fulgora',
    previewId: 'fulgora',
    spaceAge: true,
    controls: [
      { id: 'scrap', richness: true, category: 'resource' },
      { id: 'fulgora_islands', richness: false, category: 'terrain' },
      { id: 'fulgora_cliff', richness: false, category: 'cliff' },
    ],
  },
  {
    id: 'aquilo',
    previewId: 'aquilo',
    spaceAge: true,
    controls: [
      { id: 'lithium_brine', richness: true, category: 'resource' },
      { id: 'fluorine_vent', richness: true, category: 'resource' },
      { id: 'aquilo_crude_oil', richness: true, category: 'resource' },
    ],
  },
];

export function planetsForServer(spaceAge: boolean): MapGenPlanetDef[] {
  return spaceAge
    ? MAP_GEN_PLANETS
    : MAP_GEN_PLANETS.filter((p) => !p.spaceAge);
}

export function mapGenSchema(spaceAge: boolean): {
  space_age: boolean;
  planets: MapGenPlanetDef[];
  slider_steps: number;
} {
  return {
    space_age: spaceAge,
    planets: planetsForServer(spaceAge),
    slider_steps: 10,
  };
}
