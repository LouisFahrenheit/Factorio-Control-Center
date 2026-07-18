/** Factorio 2D sprites (© Wube Software) — 120×64 icon sheets at /assets/map-gen/ */

const PLANET_ICONS: Record<string, string> = {
  nauvis: '/assets/map-gen/planets/nauvis.png',
  vulcanus: '/assets/map-gen/planets/vulcanus.png',
  gleba: '/assets/map-gen/planets/gleba.png',
  fulgora: '/assets/map-gen/planets/fulgora.png',
  aquilo: '/assets/map-gen/planets/aquilo.png',
};

/** Autoplace control id → resource icon (map generator resources tab). */
const RESOURCE_ICONS: Record<string, string> = {
  coal: '/assets/map-gen/resources/coal.png',
  'copper-ore': '/assets/map-gen/resources/copper-ore.png',
  'iron-ore': '/assets/map-gen/resources/iron-ore.png',
  stone: '/assets/map-gen/resources/stone.png',
  'uranium-ore': '/assets/map-gen/resources/uranium-ore.png',
  'crude-oil': '/assets/map-gen/resources/crude-oil.png',
  vulcanus_coal: '/assets/map-gen/resources/vulcanus_coal.png',
  tungsten_ore: '/assets/map-gen/resources/tungsten_ore.png',
  calcite: '/assets/map-gen/resources/calcite.png',
  sulfuric_acid_geyser: '/assets/map-gen/resources/sulfuric_acid_geyser.png',
  gleba_stone: '/assets/map-gen/resources/gleba_stone.png',
  scrap: '/assets/map-gen/resources/scrap.png',
  lithium_brine: '/assets/map-gen/resources/lithium_brine.png',
  fluorine_vent: '/assets/map-gen/resources/fluorine_vent.png',
  aquilo_crude_oil: '/assets/map-gen/resources/aquilo_crude_oil.png',
};

export function mapGenPlanetIconUrl(planetId: string): string | undefined {
  return PLANET_ICONS[planetId];
}

export function mapGenResourceIconUrl(controlId: string): string | undefined {
  return RESOURCE_ICONS[controlId];
}
