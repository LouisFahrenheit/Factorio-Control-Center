/** Client mirror of server map-gen-catalog (keep in sync). */
export type MapGenControlDef = {
  id: string;
  richness: boolean;
  category: 'resource' | 'terrain' | 'enemy' | 'cliff' | 'special';
};

export type MapGenPlanetDef = {
  id: string;
  previewId: string;
  spaceAge: boolean;
  controls: MapGenControlDef[];
};

export const MAP_GEN_PLANETS: MapGenPlanetDef[] = [
  {
    id: 'nauvis',
    previewId: 'nauvis',
    spaceAge: false,
    controls: [
      { id: 'iron-ore', richness: true, category: 'resource' },
      { id: 'copper-ore', richness: true, category: 'resource' },
      { id: 'stone', richness: true, category: 'resource' },
      { id: 'coal', richness: true, category: 'resource' },
      { id: 'crude-oil', richness: true, category: 'resource' },
      { id: 'uranium-ore', richness: true, category: 'resource' },
      { id: 'water', richness: false, category: 'terrain' },
      { id: 'trees', richness: false, category: 'terrain' },
      { id: 'rocks', richness: false, category: 'terrain' },
      { id: 'enemy-base', richness: false, category: 'enemy' },
      { id: 'starting_area_moisture', richness: false, category: 'special' },
      { id: 'nauvis_cliff', richness: false, category: 'cliff' },
    ],
  },
  {
    id: 'vulcanus',
    previewId: 'vulcanus',
    spaceAge: true,
    controls: [
      { id: 'vulcanus_coal', richness: true, category: 'resource' },
      { id: 'calcite', richness: true, category: 'resource' },
      { id: 'sulfuric_acid_geyser', richness: true, category: 'resource' },
      { id: 'tungsten_ore', richness: true, category: 'resource' },
      { id: 'vulcanus_volcanism', richness: false, category: 'terrain' },
    ],
  },
  {
    id: 'gleba',
    previewId: 'gleba',
    spaceAge: true,
    controls: [
      { id: 'gleba_stone', richness: true, category: 'resource' },
      { id: 'gleba_water', richness: false, category: 'terrain' },
      { id: 'gleba_plants', richness: false, category: 'terrain' },
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
      { id: 'aquilo_crude_oil', richness: true, category: 'resource' },
      { id: 'lithium_brine', richness: true, category: 'resource' },
      { id: 'fluorine_vent', richness: true, category: 'resource' },
    ],
  },
];

export function controlLabelKey(controlId: string): string {
  return `map_gen_control_${controlId.replace(/-/g, '_')}`;
}

export function planetLabelKey(planetId: string): string {
  return `map_gen_planet_${planetId}`;
}

export type MapGenTabId = 'resources' | 'terrain' | 'enemy' | 'advanced';

export type MapGenControlRow = {
  planetId: string;
  planet: MapGenPlanetDef;
  control: MapGenControlDef;
};

export function planetsVisible(spaceAge: boolean): MapGenPlanetDef[] {
  return MAP_GEN_PLANETS.filter((p) => !p.spaceAge || spaceAge);
}

export function controlRows(
  spaceAge: boolean,
  category: MapGenControlDef['category'] | MapGenControlDef['category'][],
): MapGenControlRow[] {
  const cats = Array.isArray(category) ? category : [category];
  const rows: MapGenControlRow[] = [];
  for (const planet of planetsVisible(spaceAge)) {
    for (const control of planet.controls) {
      if (cats.includes(control.category)) rows.push({ planetId: planet.id, planet, control });
    }
  }
  return rows;
}
