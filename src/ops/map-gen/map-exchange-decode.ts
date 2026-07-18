import { inflateSync } from 'zlib';

/** Parsed map exchange payload (map gen + optional map settings). */
export interface MapExchangeDecoded {
  version: number[];
  map_gen_settings: Record<string, unknown>;
  map_settings?: Record<string, unknown>;
}

class Parser {
  pos = 0;
  lastPosition = { x: 0, y: 0 };
  constructor(readonly buf: Buffer) {}
}

function readUint8(p: Parser): number {
  const v = p.buf.readUInt8(p.pos);
  p.pos += 1;
  return v;
}

function readInt16(p: Parser): number {
  const v = p.buf.readInt16LE(p.pos);
  p.pos += 2;
  return v;
}

function readInt32(p: Parser): number {
  const v = p.buf.readInt32LE(p.pos);
  p.pos += 4;
  return v;
}

function readUint32(p: Parser): number {
  const v = p.buf.readUInt32LE(p.pos);
  p.pos += 4;
  return v;
}

function readUint32so(p: Parser): number {
  const v = readUint8(p);
  if (v === 0xff) return readUint32(p);
  return v;
}

function readFloat(p: Parser): number {
  const v = p.buf.readFloatLE(p.pos);
  p.pos += 4;
  return v;
}

function readDouble(p: Parser): number {
  const v = p.buf.readDoubleLE(p.pos);
  p.pos += 8;
  return v;
}

function readBool(p: Parser): boolean {
  return readUint8(p) !== 0;
}

function ensureBytes(p: Parser, n: number): void {
  if (p.pos + n > p.buf.length) {
    throw new Error('map_exchange_decode_failed');
  }
}

function readString(p: Parser): string {
  const size = readUint32so(p);
  if (size < 0 || size > 10_000_000)
    throw new Error('map_exchange_decode_failed');
  ensureBytes(p, size);
  const data = p.buf.slice(p.pos, p.pos + size).toString('utf-8');
  p.pos += size;
  return data;
}

function readOptional<T>(
  p: Parser,
  readValue: (parser: Parser) => T,
): T | null {
  if (readUint8(p) === 0) return null;
  return readValue(p);
}

function readArray<T>(p: Parser, readItem: (parser: Parser) => T): T[] {
  const size = readUint32so(p);
  const out: T[] = [];
  for (let i = 0; i < size; i++) out.push(readItem(p));
  return out;
}

function readDict<K, V>(
  p: Parser,
  readKey: (parser: Parser) => K,
  readValue: (parser: Parser) => V,
): Map<K, V> {
  const size = readUint32so(p);
  const map = new Map<K, V>();
  for (let i = 0; i < size; i++) map.set(readKey(p), readValue(p));
  return map;
}

function mapToObject<K extends string | number | symbol, V>(
  map: Map<K, V>,
): Record<string, V> {
  const obj: Record<string, V> = {};
  for (const [k, v] of map) obj[String(k)] = v;
  return obj;
}

function readVersion(p: Parser): number[] {
  return [readUint16(p), readUint16(p), readUint16(p), readUint16(p)];
}

function readUint16(p: Parser): number {
  const v = p.buf.readUInt16LE(p.pos);
  p.pos += 2;
  return v;
}

function readFrequencySizeRichness(p: Parser) {
  return {
    frequency: readFloat(p),
    size: readFloat(p),
    richness: readFloat(p),
  };
}

function readAutoplaceSetting(p: Parser) {
  return {
    treat_missing_as_default: readBool(p),
    settings: mapToObject(readDict(p, readString, readFrequencySizeRichness)),
  };
}

function readMapPosition(p: Parser) {
  const xDiff = readInt16(p) / 256;
  let x: number;
  let y: number;
  if (xDiff === 0x7fff / 256) {
    x = readInt32(p) / 256;
    y = readInt32(p) / 256;
  } else {
    const yDiff = readInt16(p) / 256;
    x = p.lastPosition.x + xDiff;
    y = p.lastPosition.y + yDiff;
  }
  p.lastPosition.x = x;
  p.lastPosition.y = y;
  return { x, y };
}

function readBoundingBox(p: Parser) {
  return {
    left_top: readMapPosition(p),
    right_bottom: readMapPosition(p),
    orientation: { x: readInt16(p), y: readInt16(p) },
  };
}

function readCliffSettings(p: Parser, atLeastV2: boolean) {
  const out: Record<string, unknown> = {
    name: readString(p),
  };
  if (atLeastV2) {
    out._unknown = readUint8(p);
  }
  out.cliff_elevation_0 = readFloat(p);
  out.cliff_elevation_interval = readFloat(p);
  out.richness = readFloat(p);
  if (atLeastV2) {
    out.cliff_smoothing = readFloat(p);
  }
  return out;
}

function readTerritorySettings(p: Parser) {
  return {
    units: readArray(p, readString),
    territory_index_expression: readString(p),
    territory_variation_expresion: readString(p),
    minimum_territory_size: readUint32(p),
  };
}

function readMapGenSettings(
  p: Parser,
  atLeastV2: boolean,
): Record<string, unknown> {
  const terrain_segmentation = atLeastV2 ? 0 : readFloat(p);
  const water = atLeastV2 ? 0 : readFloat(p);
  const settings: Record<string, unknown> = {
    autoplace_controls: mapToObject(
      readDict(p, readString, readFrequencySizeRichness),
    ),
    autoplace_settings: mapToObject(
      readDict(p, readString, readAutoplaceSetting),
    ),
    default_enable_all_autoplace_controls: readBool(p),
    seed: readUint32(p),
    width: readUint32(p),
    height: readUint32(p),
    area_to_generate_at_start: readBoundingBox(p),
    starting_area: readFloat(p),
    peaceful_mode: readBool(p),
  };
  if (atLeastV2) {
    settings.no_enemies_mode = readBool(p);
  }
  settings.starting_points = readArray(p, readMapPosition);
  settings.property_expression_names = mapToObject(
    readDict(p, readString, readString),
  );
  settings.cliff_settings = readCliffSettings(p, atLeastV2);
  if (!atLeastV2) {
    settings.terrain_segmentation = terrain_segmentation;
    settings.water = water;
  }
  if (atLeastV2) {
    const territory = readOptional(p, readTerritorySettings);
    if (territory != null) settings.territory_settings = territory;
  }
  return settings;
}

function readPollution(p: Parser) {
  return {
    enabled: readOptional(p, readBool),
    diffusion_ratio: readOptional(p, readDouble),
    min_to_diffuse: readOptional(p, readDouble),
    ageing: readOptional(p, readDouble),
    expected_max_per_chunk: readOptional(p, readDouble),
    min_to_show_per_chunk: readOptional(p, readDouble),
    min_pollution_to_damage_trees: readOptional(p, readDouble),
    pollution_with_max_forest_damage: readOptional(p, readDouble),
    pollution_per_tree_damage: readOptional(p, readDouble),
    pollution_restored_per_tree_damage: readOptional(p, readDouble),
    max_pollution_to_restore_trees: readOptional(p, readDouble),
    enemy_attack_pollution_consumption_modifier: readOptional(p, readDouble),
  };
}

function readRealSteering(p: Parser) {
  return {
    radius: readOptional(p, readDouble),
    separation_factor: readOptional(p, readDouble),
    separation_force: readOptional(p, readDouble),
    force_unit_fuzzy_goto_behavior: readOptional(p, readBool),
  };
}

function readSteering(p: Parser) {
  return { default: readRealSteering(p), moving: readRealSteering(p) };
}

function readEnemyEvolution(p: Parser) {
  return {
    enabled: readOptional(p, readBool),
    time_factor: readOptional(p, readDouble),
    destroy_factor: readOptional(p, readDouble),
    pollution_factor: readOptional(p, readDouble),
  };
}

function readEnemyExpansion(p: Parser) {
  return {
    enabled: readOptional(p, readBool),
    max_expansion_distance: readOptional(p, readUint32),
    friendly_base_influence_radius: readOptional(p, readUint32),
    enemy_building_influence_radius: readOptional(p, readUint32),
    building_coefficient: readOptional(p, readDouble),
    other_base_coefficient: readOptional(p, readDouble),
    neighbouring_chunk_coefficient: readOptional(p, readDouble),
    neighbouring_base_chunk_coefficient: readOptional(p, readDouble),
    max_colliding_tiles_coefficient: readOptional(p, readDouble),
    settler_group_min_size: readOptional(p, readUint32),
    settler_group_max_size: readOptional(p, readUint32),
    min_expansion_cooldown: readOptional(p, readUint32),
    max_expansion_cooldown: readOptional(p, readUint32),
  };
}

function readUnitGroup(p: Parser) {
  return {
    min_group_gathering_time: readOptional(p, readUint32),
    max_group_gathering_time: readOptional(p, readUint32),
    max_wait_time_for_late_members: readOptional(p, readUint32),
    max_group_radius: readOptional(p, readDouble),
    min_group_radius: readOptional(p, readDouble),
    max_member_speedup_when_behind: readOptional(p, readDouble),
    max_member_slowdown_when_ahead: readOptional(p, readDouble),
    max_group_slowdown_factor: readOptional(p, readDouble),
    max_group_member_fallback_factor: readOptional(p, readDouble),
    member_disown_distance: readOptional(p, readDouble),
    tick_tolerance_when_member_arrives: readOptional(p, readUint32),
    max_gathering_unit_groups: readOptional(p, readUint32),
    max_unit_group_size: readOptional(p, readUint32),
  };
}

function readPathFinder(p: Parser) {
  return {
    fwd2bwd_ratio: readOptional(p, readInt32),
    goal_pressure_ratio: readOptional(p, readDouble),
    use_path_cache: readOptional(p, readBool),
    max_steps_worked_per_tick: readOptional(p, readDouble),
    max_work_done_per_tick: readOptional(p, readUint32),
    short_cache_size: readOptional(p, readUint32),
    long_cache_size: readOptional(p, readUint32),
    short_cache_min_cacheable_distance: readOptional(p, readDouble),
    short_cache_min_algo_steps_to_cache: readOptional(p, readUint32),
    long_cache_min_cacheable_distance: readOptional(p, readDouble),
    cache_max_connect_to_cache_steps_multiplier: readOptional(p, readUint32),
    cache_accept_path_start_distance_ratio: readOptional(p, readDouble),
    cache_accept_path_end_distance_ratio: readOptional(p, readDouble),
    negative_cache_accept_path_start_distance_ratio: readOptional(
      p,
      readDouble,
    ),
    negative_cache_accept_path_end_distance_ratio: readOptional(p, readDouble),
    cache_path_start_distance_rating_multiplier: readOptional(p, readDouble),
    cache_path_end_distance_rating_multiplier: readOptional(p, readDouble),
    stale_enemy_with_same_destination_collision_penalty: readOptional(
      p,
      readDouble,
    ),
    ignore_moving_enemy_collision_distance: readOptional(p, readDouble),
    enemy_with_different_destination_collision_penalty: readOptional(
      p,
      readDouble,
    ),
    general_entity_collision_penalty: readOptional(p, readDouble),
    general_entity_subsequent_collision_penalty: readOptional(p, readDouble),
    extended_collision_penalty: readOptional(p, readDouble),
    max_clients_to_accept_any_new_request: readOptional(p, readUint32),
    max_clients_to_accept_short_new_request: readOptional(p, readUint32),
    direct_distance_to_consider_short_request: readOptional(p, readUint32),
    short_request_max_steps: readOptional(p, readUint32),
    short_request_ratio: readOptional(p, readDouble),
    min_steps_to_check_path_find_termination: readOptional(p, readUint32),
    start_to_goal_cost_multiplier_to_terminate_path_find: readOptional(
      p,
      readDouble,
    ),
    overload_levels: readOptional(p, (x) => readArray(x, readUint32)),
    overload_multipliers: readOptional(p, (x) => readArray(x, readDouble)),
    negative_path_cache_delay_interval: readOptional(p, readUint32),
  };
}

function readDifficultySettings(p: Parser, atLeastV2: boolean) {
  if (atLeastV2) {
    return {
      technology_price_multiplier: readDouble(p),
      spoil_time_modifier: readDouble(p),
    };
  }
  const researchQueueSetting =
    ['always', 'after-victory', 'never'][readUint8(p)] ?? 'always';
  return {
    recipe_difficulty: readUint8(p),
    technology_difficulty: readUint8(p),
    technology_price_multiplier: readDouble(p),
    research_queue_setting: researchQueueSetting,
  };
}

function readAsteroidsSettings(p: Parser) {
  return {
    spawning_rate: readOptional(p, readDouble),
    max_ray_portals_expanded_per_tick: readOptional(p, readUint32),
  };
}

function readMapSettings(
  p: Parser,
  atLeastV2: boolean,
): Record<string, unknown> {
  const settings: Record<string, unknown> = {
    pollution: readPollution(p),
    steering: readSteering(p),
    enemy_evolution: readEnemyEvolution(p),
    enemy_expansion: readEnemyExpansion(p),
    unit_group: readUnitGroup(p),
    path_finder: readPathFinder(p),
    max_failed_behavior_count: readUint32(p),
    difficulty_settings: readDifficultySettings(p, atLeastV2),
  };
  if (atLeastV2) {
    settings.asteroids = readAsteroidsSettings(p);
  }
  return settings;
}

/** Normalize exchange string (strip whitespace, validate brackets). */
function normalizeMapExchangeString(raw: string): string {
  const s = String(raw || '').replace(/[\s\r\n]+/g, '');
  if (!/^>>>[0-9a-zA-Z+/]+={0,3}<<<$/.test(s)) {
    throw new Error('invalid_map_exchange_string');
  }
  return s;
}

/** Decode Factorio map exchange string to map_gen_settings and map_settings. */
export function decodeMapExchangeString(raw: string): MapExchangeDecoded {
  const s = normalizeMapExchangeString(raw);
  let buf: Buffer;
  try {
    buf = inflateSync(Buffer.from(s.slice(3, -3), 'base64'));
  } catch {
    throw new Error('map_exchange_decode_failed');
  }

  const parser = new Parser(buf);
  const version = readVersion(parser);
  const atLeastV2 = version[0] >= 2;
  readUint8(parser);
  const map_gen_settings = readMapGenSettings(parser, atLeastV2);
  let map_settings: Record<string, unknown> | undefined;
  if (parser.pos < buf.length - 4) {
    map_settings = readMapSettings(parser, atLeastV2);
  }
  if (parser.pos + 4 <= buf.length) {
    readUint32(parser);
  }
  if (parser.pos > buf.length) {
    throw new Error('map_exchange_decode_failed');
  }

  return { version, map_gen_settings, map_settings };
}
