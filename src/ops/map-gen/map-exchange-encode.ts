import { crc32, deflateSync } from 'zlib';
import exchangeDefaults from './map-exchange-defaults.json';

/** Factorio 2.0.x map exchange format version. */
export const MAP_EXCHANGE_VERSION = [2, 0, 75, 0] as const;

/** Unlimited map width/height in exchange strings (Factorio GUI «без ограничений»). */
export const FACTORIO_UNLIMITED_MAP_SIZE = 2_000_000;

/** Autoplace control order in Factorio 2.0 Space Age exchange strings. */
const AUTOPLACE_CONTROL_ORDER = [
  'aquilo_crude_oil',
  'calcite',
  'coal',
  'copper-ore',
  'crude-oil',
  'enemy-base',
  'fluorine_vent',
  'fulgora_cliff',
  'fulgora_islands',
  'gleba_cliff',
  'gleba_enemy_base',
  'gleba_plants',
  'gleba_stone',
  'gleba_water',
  'iron-ore',
  'lithium_brine',
  'nauvis_cliff',
  'rocks',
  'scrap',
  'starting_area_moisture',
  'stone',
  'sulfuric_acid_geyser',
  'trees',
  'tungsten_ore',
  'uranium-ore',
  'vulcanus_coal',
  'vulcanus_volcanism',
  'water',
] as const;

const DEFAULT_PROPERTY_EXPRESSIONS: Record<string, string> = {
  'control:moisture:frequency': '1',
  'control:moisture:bias': '0',
  'control:aux:frequency': '1',
  'control:aux:bias': '0',
};

const NAMED_MULTIPLIERS: Record<string, number> = {
  none: 0,
  'very-low': 0.5,
  'very-small': 0.5,
  'very-poor': 0.5,
  low: 1 / Math.SQRT2,
  small: 1 / Math.SQRT2,
  poor: 1 / Math.SQRT2,
  normal: 1,
  medium: 1,
  regular: 1,
  high: Math.SQRT2,
  big: Math.SQRT2,
  good: Math.SQRT2,
  'very-high': 2,
  'very-big': 2,
  'very-good': 2,
};

const DEFAULT_AREA = {
  left_top: { x: -224, y: -224 },
  right_bottom: { x: 224, y: 224 },
  orientation: { x: 0, y: -32767 },
};

const DEFAULT_CLIFF = {
  name: '',
  _unknown: 0,
  cliff_elevation_0: 10,
  cliff_elevation_interval: 40,
  richness: 1,
  cliff_smoothing: 1,
};

class Writer {
  private readonly chunks: Buffer[] = [];
  lastPosition = { x: 0, y: 0 };

  private push(buf: Buffer): void {
    this.chunks.push(buf);
  }

  toBuffer(): Buffer {
    return Buffer.concat(this.chunks);
  }

  writeUint8(v: number): void {
    const b = Buffer.alloc(1);
    b.writeUInt8(v, 0);
    this.push(b);
  }

  writeUint16(v: number): void {
    const b = Buffer.alloc(2);
    b.writeUInt16LE(Math.max(0, Math.floor(v)) & 0xffff, 0);
    this.push(b);
  }

  writeInt16(v: number): void {
    const b = Buffer.alloc(2);
    b.writeInt16LE(v, 0);
    this.push(b);
  }

  writeInt32(v: number): void {
    const b = Buffer.alloc(4);
    b.writeInt32LE(v, 0);
    this.push(b);
  }

  writeUint32(v: number): void {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(v >>> 0, 0);
    this.push(b);
  }

  writeUint32so(v: number): void {
    const n = Math.max(0, Math.floor(v));
    if (n < 0xff) this.writeUint8(n);
    else {
      this.writeUint8(0xff);
      this.writeUint32(n);
    }
  }

  writeFloat(v: number): void {
    const b = Buffer.alloc(4);
    b.writeFloatLE(Number(v) || 0, 0);
    this.push(b);
  }

  writeDouble(v: number): void {
    const b = Buffer.alloc(8);
    b.writeDoubleLE(Number(v) || 0, 0);
    this.push(b);
  }

  writeBool(v: boolean): void {
    this.writeUint8(v ? 1 : 0);
  }

  writeString(s: string): void {
    const data = Buffer.from(String(s ?? ''), 'utf-8');
    this.writeUint32so(data.length);
    this.push(data);
  }

  writeOptional<T>(
    value: T | null | undefined,
    writeValue: (w: Writer, v: T) => void,
  ): void {
    if (value === null || value === undefined) {
      this.writeUint8(0);
      return;
    }
    this.writeUint8(1);
    writeValue(this, value);
  }

  writeArray<T>(items: T[], writeItem: (w: Writer, item: T) => void): void {
    this.writeUint32so(items.length);
    for (const item of items) writeItem(this, item);
  }

  writeDict<K extends string, V>(
    map: Record<K, V>,
    writeKey: (w: Writer, key: K) => void,
    writeValue: (w: Writer, value: V) => void,
    keyOrder?: readonly string[],
  ): void {
    const keys = orderDictKeys(map, keyOrder) as K[];
    this.writeUint32so(keys.length);
    for (const key of keys) {
      writeKey(this, key);
      writeValue(this, map[key]);
    }
  }
}

function orderDictKeys<V>(
  map: Record<string, V>,
  preferred?: readonly string[],
): string[] {
  const keys = Object.keys(map);
  if (!preferred?.length) return keys;
  const out: string[] = [];
  const seen = new Set<string>();
  for (const k of preferred) {
    if (Object.prototype.hasOwnProperty.call(map, k)) {
      out.push(k);
      seen.add(k);
    }
  }
  for (const k of keys) {
    if (!seen.has(k)) out.push(k);
  }
  return out;
}

function encodeMapDimension(value: unknown): number {
  const n = Math.floor(Number(value) || 0);
  if (n <= 0 || n >= FACTORIO_UNLIMITED_MAP_SIZE)
    return FACTORIO_UNLIMITED_MAP_SIZE;
  return n;
}

function stripDefaultPropertyExpressions(
  props: Record<string, string> | undefined,
): Record<string, string> {
  if (!props) return {};
  const out: Record<string, string> = { ...props };
  for (const [key, val] of Object.entries(DEFAULT_PROPERTY_EXPRESSIONS)) {
    if (out[key] === val) delete out[key];
  }
  return out;
}

function autoplaceFieldToFloat(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') return NAMED_MULTIPLIERS[v] ?? 1;
  return 1;
}

function writeVersion(w: Writer, version: readonly number[]): void {
  for (let i = 0; i < 4; i++) {
    w.writeUint16(Math.max(0, Math.floor(version[i] ?? 0)));
  }
}

function writeMapPosition(w: Writer, pos: { x: number; y: number }): void {
  const dx = pos.x - w.lastPosition.x;
  const dy = pos.y - w.lastPosition.y;
  const xDiff = Math.round(dx * 256);
  const yDiff = Math.round(dy * 256);
  if (xDiff > 0x7ffe || xDiff < -0x7fff || yDiff > 0x7ffe || yDiff < -0x7fff) {
    w.writeInt16(0x7fff);
    w.writeInt32(Math.round(pos.x * 256));
    w.writeInt32(Math.round(pos.y * 256));
  } else {
    w.writeInt16(xDiff);
    w.writeInt16(yDiff);
  }
  w.lastPosition = { x: pos.x, y: pos.y };
}

function writeBoundingBox(w: Writer, box: Record<string, unknown>): void {
  const lt = (box.left_top || { x: 0, y: 0 }) as { x: number; y: number };
  const rb = (box.right_bottom || { x: 0, y: 0 }) as { x: number; y: number };
  const ori = (box.orientation || { x: 0, y: -32767 }) as {
    x: number;
    y: number;
  };
  writeMapPosition(w, lt);
  writeMapPosition(w, rb);
  w.writeInt16(Math.round(ori.x));
  w.writeInt16(Math.round(ori.y));
}

function writeTriple(w: Writer, triple: Record<string, unknown>): void {
  w.writeFloat(autoplaceFieldToFloat(triple.frequency));
  w.writeFloat(autoplaceFieldToFloat(triple.size));
  w.writeFloat(autoplaceFieldToFloat(triple.richness));
}

function writeAutoplaceSetting(
  w: Writer,
  setting: Record<string, unknown>,
): void {
  w.writeBool(!!setting.treat_missing_as_default);
  const settings = (setting.settings || {}) as Record<
    string,
    Record<string, unknown>
  >;
  w.writeDict(
    settings,
    (ww, k) => ww.writeString(k),
    (ww, v) => writeTriple(ww, v),
  );
}

function writeCliffSettings(
  w: Writer,
  cliff: Record<string, unknown>,
  atLeastV2: boolean,
): void {
  w.writeString(String(cliff.name ?? ''));
  if (atLeastV2) w.writeUint8(Number(cliff._unknown ?? 0) & 0xff);
  w.writeFloat(Number(cliff.cliff_elevation_0 ?? 10));
  w.writeFloat(Number(cliff.cliff_elevation_interval ?? 40));
  w.writeFloat(Number(cliff.richness ?? 1));
  if (atLeastV2) w.writeFloat(Number(cliff.cliff_smoothing ?? 1));
}

function writeTerritorySettings(
  w: Writer,
  territory: Record<string, unknown>,
): void {
  const units = Array.isArray(territory.units)
    ? (territory.units as string[])
    : [];
  w.writeArray(units, (ww, u) => ww.writeString(u));
  w.writeString(String(territory.territory_index_expression ?? ''));
  w.writeString(String(territory.territory_variation_expresion ?? ''));
  w.writeUint32(Number(territory.minimum_territory_size ?? 0) >>> 0);
}

function writeMapGenSettings(
  w: Writer,
  gen: Record<string, unknown>,
  atLeastV2: boolean,
): void {
  if (!atLeastV2) {
    w.writeFloat(Number(gen.terrain_segmentation ?? 0.5));
    w.writeFloat(Number(gen.water ?? 0.5));
  }

  const controls = (gen.autoplace_controls || {}) as Record<
    string,
    Record<string, unknown>
  >;
  w.writeDict(
    controls,
    (ww, k) => ww.writeString(k),
    (ww, v) => writeTriple(ww, v),
    AUTOPLACE_CONTROL_ORDER,
  );

  const apSettings = (gen.autoplace_settings || {}) as Record<
    string,
    Record<string, unknown>
  >;
  w.writeDict(
    apSettings,
    (ww, k) => ww.writeString(k),
    (ww, v) => writeAutoplaceSetting(ww, v),
  );

  w.writeBool(gen.default_enable_all_autoplace_controls !== false);
  const seed = gen.seed;
  w.writeUint32(
    typeof seed === 'number' && Number.isFinite(seed)
      ? Math.floor(seed) >>> 0
      : 0,
  );
  w.writeUint32(encodeMapDimension(gen.width) >>> 0);
  w.writeUint32(encodeMapDimension(gen.height) >>> 0);
  writeBoundingBox(
    w,
    (gen.area_to_generate_at_start || DEFAULT_AREA) as Record<string, unknown>,
  );
  w.writeFloat(Number(gen.starting_area ?? 1));
  w.writeBool(!!gen.peaceful_mode);
  if (atLeastV2) w.writeBool(!!gen.no_enemies_mode);

  const points = Array.isArray(gen.starting_points)
    ? (gen.starting_points as { x: number; y: number }[])
    : [{ x: 0, y: 0 }];
  w.writeArray(points, (ww, p) => writeMapPosition(ww, p));

  const props = stripDefaultPropertyExpressions(
    (gen.property_expression_names || {}) as Record<string, string>,
  );
  w.writeDict(
    props,
    (ww, k) => ww.writeString(k),
    (ww, v) => ww.writeString(String(v)),
  );

  writeCliffSettings(
    w,
    (gen.cliff_settings || DEFAULT_CLIFF) as Record<string, unknown>,
    atLeastV2,
  );

  if (atLeastV2) {
    const territory = gen.territory_settings as
      | Record<string, unknown>
      | undefined;
    w.writeOptional(territory ?? null, (ww, t) =>
      writeTerritorySettings(ww, t),
    );
  }
}

function writeOptionalFields(
  w: Writer,
  obj: Record<string, unknown>,
  fields: { key: string; write: (ww: Writer, v: unknown) => void }[],
): void {
  for (const { key, write } of fields) {
    w.writeOptional(obj[key], (ww, v) => write(ww, v));
  }
}

function writePollution(w: Writer, pollution: Record<string, unknown>): void {
  writeOptionalFields(w, pollution, [
    { key: 'enabled', write: (ww, v) => ww.writeBool(!!v) },
    { key: 'diffusion_ratio', write: (ww, v) => ww.writeDouble(Number(v)) },
    { key: 'min_to_diffuse', write: (ww, v) => ww.writeDouble(Number(v)) },
    { key: 'ageing', write: (ww, v) => ww.writeDouble(Number(v)) },
    {
      key: 'expected_max_per_chunk',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'min_to_show_per_chunk',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'min_pollution_to_damage_trees',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'pollution_with_max_forest_damage',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'pollution_per_tree_damage',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'pollution_restored_per_tree_damage',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'max_pollution_to_restore_trees',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'enemy_attack_pollution_consumption_modifier',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
  ]);
}

function writeRealSteering(w: Writer, steering: Record<string, unknown>): void {
  writeOptionalFields(w, steering, [
    { key: 'radius', write: (ww, v) => ww.writeDouble(Number(v)) },
    { key: 'separation_factor', write: (ww, v) => ww.writeDouble(Number(v)) },
    { key: 'separation_force', write: (ww, v) => ww.writeDouble(Number(v)) },
    {
      key: 'force_unit_fuzzy_goto_behavior',
      write: (ww, v) => ww.writeBool(!!v),
    },
  ]);
}

function writeSteering(w: Writer, steering: Record<string, unknown>): void {
  writeRealSteering(w, (steering.default || {}) as Record<string, unknown>);
  writeRealSteering(w, (steering.moving || {}) as Record<string, unknown>);
}

function writeEnemyEvolution(w: Writer, evo: Record<string, unknown>): void {
  writeOptionalFields(w, evo, [
    { key: 'enabled', write: (ww, v) => ww.writeBool(!!v) },
    { key: 'time_factor', write: (ww, v) => ww.writeDouble(Number(v)) },
    { key: 'destroy_factor', write: (ww, v) => ww.writeDouble(Number(v)) },
    { key: 'pollution_factor', write: (ww, v) => ww.writeDouble(Number(v)) },
  ]);
}

function writeEnemyExpansion(w: Writer, exp: Record<string, unknown>): void {
  writeOptionalFields(w, exp, [
    { key: 'enabled', write: (ww, v) => ww.writeBool(!!v) },
    {
      key: 'max_expansion_distance',
      write: (ww, v) => ww.writeUint32(Number(v)),
    },
    {
      key: 'friendly_base_influence_radius',
      write: (ww, v) => ww.writeUint32(Number(v)),
    },
    {
      key: 'enemy_building_influence_radius',
      write: (ww, v) => ww.writeUint32(Number(v)),
    },
    {
      key: 'building_coefficient',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'other_base_coefficient',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'neighbouring_chunk_coefficient',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'neighbouring_base_chunk_coefficient',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'max_colliding_tiles_coefficient',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'settler_group_min_size',
      write: (ww, v) => ww.writeUint32(Number(v)),
    },
    {
      key: 'settler_group_max_size',
      write: (ww, v) => ww.writeUint32(Number(v)),
    },
    {
      key: 'min_expansion_cooldown',
      write: (ww, v) => ww.writeUint32(Number(v)),
    },
    {
      key: 'max_expansion_cooldown',
      write: (ww, v) => ww.writeUint32(Number(v)),
    },
  ]);
}

function writeUnitGroup(w: Writer, ug: Record<string, unknown>): void {
  writeOptionalFields(w, ug, [
    {
      key: 'min_group_gathering_time',
      write: (ww, v) => ww.writeUint32(Number(v)),
    },
    {
      key: 'max_group_gathering_time',
      write: (ww, v) => ww.writeUint32(Number(v)),
    },
    {
      key: 'max_wait_time_for_late_members',
      write: (ww, v) => ww.writeUint32(Number(v)),
    },
    { key: 'max_group_radius', write: (ww, v) => ww.writeDouble(Number(v)) },
    { key: 'min_group_radius', write: (ww, v) => ww.writeDouble(Number(v)) },
    {
      key: 'max_member_speedup_when_behind',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'max_member_slowdown_when_ahead',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'max_group_slowdown_factor',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'max_group_member_fallback_factor',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'member_disown_distance',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'tick_tolerance_when_member_arrives',
      write: (ww, v) => ww.writeUint32(Number(v)),
    },
    {
      key: 'max_gathering_unit_groups',
      write: (ww, v) => ww.writeUint32(Number(v)),
    },
    { key: 'max_unit_group_size', write: (ww, v) => ww.writeUint32(Number(v)) },
  ]);
}

function writePathFinder(w: Writer, pf: Record<string, unknown>): void {
  writeOptionalFields(w, pf, [
    { key: 'fwd2bwd_ratio', write: (ww, v) => ww.writeInt32(Number(v)) },
    { key: 'goal_pressure_ratio', write: (ww, v) => ww.writeDouble(Number(v)) },
    { key: 'use_path_cache', write: (ww, v) => ww.writeBool(!!v) },
    {
      key: 'max_steps_worked_per_tick',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'max_work_done_per_tick',
      write: (ww, v) => ww.writeUint32(Number(v)),
    },
    { key: 'short_cache_size', write: (ww, v) => ww.writeUint32(Number(v)) },
    { key: 'long_cache_size', write: (ww, v) => ww.writeUint32(Number(v)) },
    {
      key: 'short_cache_min_cacheable_distance',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'short_cache_min_algo_steps_to_cache',
      write: (ww, v) => ww.writeUint32(Number(v)),
    },
    {
      key: 'long_cache_min_cacheable_distance',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'cache_max_connect_to_cache_steps_multiplier',
      write: (ww, v) => ww.writeUint32(Number(v)),
    },
    {
      key: 'cache_accept_path_start_distance_ratio',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'cache_accept_path_end_distance_ratio',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'negative_cache_accept_path_start_distance_ratio',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'negative_cache_accept_path_end_distance_ratio',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'cache_path_start_distance_rating_multiplier',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'cache_path_end_distance_rating_multiplier',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'stale_enemy_with_same_destination_collision_penalty',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'ignore_moving_enemy_collision_distance',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'enemy_with_different_destination_collision_penalty',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'general_entity_collision_penalty',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'general_entity_subsequent_collision_penalty',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'extended_collision_penalty',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'max_clients_to_accept_any_new_request',
      write: (ww, v) => ww.writeUint32(Number(v)),
    },
    {
      key: 'max_clients_to_accept_short_new_request',
      write: (ww, v) => ww.writeUint32(Number(v)),
    },
    {
      key: 'direct_distance_to_consider_short_request',
      write: (ww, v) => ww.writeUint32(Number(v)),
    },
    {
      key: 'short_request_max_steps',
      write: (ww, v) => ww.writeUint32(Number(v)),
    },
    { key: 'short_request_ratio', write: (ww, v) => ww.writeDouble(Number(v)) },
    {
      key: 'min_steps_to_check_path_find_termination',
      write: (ww, v) => ww.writeUint32(Number(v)),
    },
    {
      key: 'start_to_goal_cost_multiplier_to_terminate_path_find',
      write: (ww, v) => ww.writeDouble(Number(v)),
    },
    {
      key: 'overload_levels',
      write: (ww, v) =>
        ww.writeArray(v as number[], (www, n) => www.writeUint32(Number(n))),
    },
    {
      key: 'overload_multipliers',
      write: (ww, v) =>
        ww.writeArray(v as number[], (www, n) => www.writeDouble(Number(n))),
    },
    {
      key: 'negative_path_cache_delay_interval',
      write: (ww, v) => ww.writeUint32(Number(v)),
    },
  ]);
}

function writeDifficultySettings(
  w: Writer,
  diff: Record<string, unknown>,
  atLeastV2: boolean,
): void {
  if (atLeastV2) {
    w.writeDouble(Number(diff.technology_price_multiplier ?? 1));
    w.writeDouble(Number(diff.spoil_time_modifier ?? 1));
    return;
  }
  w.writeUint8(Number(diff.recipe_difficulty ?? 0) & 0xff);
  w.writeUint8(Number(diff.technology_difficulty ?? 0) & 0xff);
  w.writeDouble(Number(diff.technology_price_multiplier ?? 1));
  const rq = String(diff.research_queue_setting ?? 'always');
  const rqIdx = ['always', 'after-victory', 'never'].indexOf(rq);
  w.writeUint8(rqIdx >= 0 ? rqIdx : 0);
}

function writeAsteroidsSettings(
  w: Writer,
  asteroids: Record<string, unknown>,
): void {
  w.writeOptional(asteroids.spawning_rate, (ww, v) =>
    ww.writeDouble(Number(v)),
  );
  w.writeOptional(asteroids.max_ray_portals_expanded_per_tick, (ww, v) =>
    ww.writeUint32(Number(v)),
  );
}

function writeMapSettings(
  w: Writer,
  settings: Record<string, unknown>,
  atLeastV2: boolean,
): void {
  writePollution(w, (settings.pollution || {}) as Record<string, unknown>);
  writeSteering(w, (settings.steering || {}) as Record<string, unknown>);
  writeEnemyEvolution(
    w,
    (settings.enemy_evolution || {}) as Record<string, unknown>,
  );
  writeEnemyExpansion(
    w,
    (settings.enemy_expansion || {}) as Record<string, unknown>,
  );
  writeUnitGroup(w, (settings.unit_group || {}) as Record<string, unknown>);
  writePathFinder(w, (settings.path_finder || {}) as Record<string, unknown>);
  w.writeUint32(Number(settings.max_failed_behavior_count ?? 3) >>> 0);
  writeDifficultySettings(
    w,
    (settings.difficulty_settings || {}) as Record<string, unknown>,
    atLeastV2,
  );
  if (atLeastV2) {
    writeAsteroidsSettings(
      w,
      (settings.asteroids || {}) as Record<string, unknown>,
    );
  }
}

function deepMerge(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue;
    const b = out[k];
    if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      b &&
      typeof b === 'object' &&
      !Array.isArray(b)
    ) {
      out[k] = deepMerge(
        b as Record<string, unknown>,
        v as Record<string, unknown>,
      );
    } else {
      out[k] = v;
    }
  }
  return out;
}

/** Fill map-gen fields required by the exchange binary but omitted from UI JSON. */
export function prepareMapGenForExchange(
  gen: Record<string, unknown>,
): Record<string, unknown> {
  const cliff = deepMerge(
    { ...DEFAULT_CLIFF },
    (gen.cliff_settings || {}) as Record<string, unknown>,
  );
  if (cliff.name === 'cliff') cliff.name = '';
  const property_expression_names = stripDefaultPropertyExpressions(
    (gen.property_expression_names || {}) as Record<string, string>,
  );
  return {
    default_enable_all_autoplace_controls: true,
    peaceful_mode: false,
    no_enemies_mode: false,
    starting_area: 1,
    ...gen,
    width: encodeMapDimension(gen.width),
    height: encodeMapDimension(gen.height),
    cliff_settings: cliff,
    autoplace_controls: gen.autoplace_controls || {},
    autoplace_settings: gen.autoplace_settings || {},
    property_expression_names,
    area_to_generate_at_start: gen.area_to_generate_at_start || DEFAULT_AREA,
    starting_points:
      Array.isArray(gen.starting_points) && gen.starting_points.length > 0
        ? gen.starting_points
        : [{ x: 0, y: 0 }],
  };
}

/** Merge partial map_settings from UI with Factorio defaults for exchange export. */
export function prepareMapSettingsForExchange(
  settings: Record<string, unknown> | null | undefined,
  spaceAge: boolean,
): Record<string, unknown> {
  const base = {
    ...(exchangeDefaults.map_settings as Record<string, unknown>),
  };
  if (!spaceAge) delete base.asteroids;
  if (!settings || !Object.keys(settings).length) return base;
  return deepMerge(base, settings);
}

/** Encode map gen + map settings to a Factorio map exchange string. */
export function encodeMapExchangeString(
  mapGenSettings: Record<string, unknown>,
  mapSettings?: Record<string, unknown> | null,
  version: readonly number[] = MAP_EXCHANGE_VERSION,
): string {
  const atLeastV2 = version[0] >= 2;
  const gen = prepareMapGenForExchange(mapGenSettings);
  const settings = mapSettings || exchangeDefaults.map_settings;

  const w = new Writer();
  writeVersion(w, version);
  w.writeUint8(0);
  writeMapGenSettings(w, gen, atLeastV2);
  writeMapSettings(w, settings, atLeastV2);

  let body = w.toBuffer();
  const checksum = crc32(body) >>> 0;
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32LE(checksum, 0);
  body = Buffer.concat([body, crcBuf]);

  const compressed = deflateSync(body);
  return `>>>${compressed.toString('base64')}<<<`;
}
