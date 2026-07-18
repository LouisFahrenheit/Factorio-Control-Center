/**
 * Factorio map generator slider scales (MapGenSize API 2.0).
 * Autoplace F/S/R: index 0 = disabled (checkbox only); active range 1–10 → 1/6…6 (17%…600%).
 * Asteroids spawning_rate: 1–10 → 0.1…6 (10%…600%).
 */

export const MAP_GEN_SLIDER_MAX = 10;

/** First active step for autoplace / MapGenSize (17%). */
export const MAP_GEN_AUTOPLACE_MIN_INDEX = 1;

/** Asteroids «Частота появления» — minimum step (10%). */
export const MAP_GEN_ASTEROID_MIN_INDEX = 1;

export const MAP_GEN_PERCENT_MIN = 17;
export const MAP_GEN_PERCENT_MAX = 600;

export const MAP_GEN_ASTEROID_PERCENT_MIN = 10;
export const MAP_GEN_ASTEROID_PERCENT_MAX = 600;

/**
 * Factorio MapGenSize string → multiplier (runtime API 2.0).
 * "very-good" = 2 (200%), not 6 (600%).
 */
export const MAP_GEN_NAMED_MULTIPLIERS: Record<string, number> = {
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

/**
 * Autoplace slider index → multiplier (Factorio GUI 17%…600%).
 */
const AUTOPLACE_MULT: number[] = [
  0,
  1 / 6,
  1 / 3,
  0.5,
  1 / Math.SQRT2,
  1,
  Math.SQRT2,
  1.5,
  2,
  3,
  6,
];

/**
 * Asteroids spawning_rate steps (Factorio advanced, 10%…600%).
 * Extra low step 0.1; then same progression as autoplace from 1/6 upward.
 */
const ASTEROID_SPAWNING_MULT: number[] = [
  0,
  0.1,
  1 / 6,
  1 / 3,
  0.5,
  1 / Math.SQRT2,
  1,
  Math.SQRT2,
  2,
  3,
  6,
];

export const MAP_GEN_SLIDER_NORMAL = 5;

const NAMED_MULT_EPS = 0.02;

/** Slider index → canonical Factorio size name when multiplier matches a named tier. */
const SLIDER_INDEX_CANONICAL_NAME: Record<number, string> = (() => {
  const out: Record<number, string> = {};
  for (let i = MAP_GEN_AUTOPLACE_MIN_INDEX; i <= MAP_GEN_SLIDER_MAX; i++) {
    for (const [name, mult] of Object.entries(MAP_GEN_NAMED_MULTIPLIERS)) {
      if (name === 'none') continue;
      if (Math.abs(AUTOPLACE_MULT[i] - mult) < NAMED_MULT_EPS) {
        out[i] = name;
        break;
      }
    }
  }
  return out;
})();

export function clampAutoplaceSliderIndex(index: number): number {
  const i = Math.round(Number(index) || 0);
  if (i < MAP_GEN_AUTOPLACE_MIN_INDEX) return MAP_GEN_AUTOPLACE_MIN_INDEX;
  return Math.min(MAP_GEN_SLIDER_MAX, i);
}

export function clampAsteroidSliderIndex(index: number): number {
  const i = Math.round(Number(index) || 0);
  if (i < MAP_GEN_ASTEROID_MIN_INDEX) return MAP_GEN_ASTEROID_MIN_INDEX;
  return Math.min(MAP_GEN_SLIDER_MAX, i);
}

export function sliderToMultiplier(index: number): number {
  const i = Math.max(0, Math.min(MAP_GEN_SLIDER_MAX, Math.round(Number(index) || 0)));
  return AUTOPLACE_MULT[i] ?? 1;
}

export function asteroidSliderToMultiplier(index: number): number {
  const i = Math.max(0, Math.min(MAP_GEN_SLIDER_MAX, Math.round(Number(index) || 0)));
  return ASTEROID_SPAWNING_MULT[i] ?? 1;
}

export function asteroidPercentAt(index: number): number {
  if (index < MAP_GEN_ASTEROID_MIN_INDEX) return 0;
  return Math.round(asteroidSliderToMultiplier(index) * 100);
}

/** Raw autoplace multiplier at slider index (number or named size). */
export function autoplaceMultiplierAt(index: number): number {
  if (index < MAP_GEN_AUTOPLACE_MIN_INDEX) return 0;
  const raw = sliderToAutoplaceValue(index);
  if (typeof raw === 'string') return MAP_GEN_NAMED_MULTIPLIERS[raw] ?? 1;
  return raw;
}

/**
 * Factorio GUI % for autoplace controls.
 * Terrain features: frequency column shows 100/mult (game «масштаб»); size shows mult×100 («покрытие»).
 * Resources / enemies / cliffs: both columns use mult×100.
 */
export function autoplaceFieldPercent(
  index: number,
  field: 'frequency' | 'size',
  options?: { terrainFeature?: boolean },
): number {
  if (index < MAP_GEN_AUTOPLACE_MIN_INDEX) return 0;
  const m = autoplaceMultiplierAt(index);
  if (field === 'frequency' && options?.terrainFeature) {
    return Math.round(100 / m);
  }
  return Math.round(m * 100);
}

export function formatAutoplaceFieldPercent(
  index: number,
  field: 'frequency' | 'size',
  options?: { terrainFeature?: boolean },
): string {
  if (index < MAP_GEN_AUTOPLACE_MIN_INDEX) return '—';
  return `${autoplaceFieldPercent(index, field, options)}%`;
}

function closestIndexForMult(table: number[], relative: number, minIndex: number): number {
  let best = MAP_GEN_SLIDER_NORMAL;
  let bestDist = Infinity;
  for (let i = minIndex; i <= MAP_GEN_SLIDER_MAX; i++) {
    const d = Math.abs(table[i] - relative);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

/** Map absolute multiplier → autoplace slider index (1/6…6). Returns 0 only for disable/none. */
export function multiplierToSlider(mult: unknown, baseline = 1): number {
  const m = Number(mult);
  if (!Number.isFinite(m) || m <= 0) return 0;
  if (mult === 'none') return 0;
  const base = Number(baseline);
  const relative = m / (Number.isFinite(base) && base > 0 ? base : 1);
  return closestIndexForMult(AUTOPLACE_MULT, relative, MAP_GEN_AUTOPLACE_MIN_INDEX);
}

export function percentToAutoplaceSliderIndex(percent: number): number {
  return clampAutoplaceSliderIndex(multiplierToSlider(percent / 100));
}

export function percentToAsteroidSliderIndex(percent: number): number {
  const m = Number(percent) / 100;
  if (!Number.isFinite(m) || m <= 0) return MAP_GEN_ASTEROID_MIN_INDEX;
  return clampAsteroidSliderIndex(closestIndexForMult(ASTEROID_SPAWNING_MULT, m, MAP_GEN_ASTEROID_MIN_INDEX));
}

export function sizeNameToSlider(name: unknown): number {
  const s = String(name || 'normal').toLowerCase();
  const mult = MAP_GEN_NAMED_MULTIPLIERS[s];
  if (mult != null && mult > 0) return multiplierToSlider(mult);
  return MAP_GEN_SLIDER_NORMAL;
}

export function sliderToAutoplaceValue(index: number): number | 'none' | string {
  const i = Math.max(0, Math.min(MAP_GEN_SLIDER_MAX, Math.round(Number(index) || 0)));
  if (i <= 0) return 'none';
  const named = SLIDER_INDEX_CANONICAL_NAME[i];
  if (named) return named;
  return Number(AUTOPLACE_MULT[i].toFixed(4));
}

export function sliderToBaselineValue(index: number, baseline: number): number {
  const i = Math.max(0, Math.min(MAP_GEN_SLIDER_MAX, Math.round(Number(index) || 0)));
  if (i === 0) return 0;
  const base = Number(baseline);
  if (!Number.isFinite(base) || base <= 0) return sliderToMultiplier(i);
  return base * sliderToMultiplier(i);
}

/** Climate bias slider: 0…20 → −0.50…+0.50, step 0.05 (Factorio moisture / terrain-type «Значение»). */
export const BIAS_SLIDER_MIN = 0;
export const BIAS_SLIDER_MAX = 20;
export const BIAS_SLIDER_CENTER = 10;
export const BIAS_VALUE_MIN = -0.5;
export const BIAS_VALUE_MAX = 0.5;
export const BIAS_VALUE_STEP = 0.05;

export function clampBiasSliderIndex(index: number): number {
  const i = Math.round(Number(index) || 0);
  return Math.max(BIAS_SLIDER_MIN, Math.min(BIAS_SLIDER_MAX, i));
}

/** Factorio `control:*:bias` from slider index. */
export function biasSliderToValue(index: number): number {
  const i = clampBiasSliderIndex(index);
  return Number((BIAS_VALUE_MIN + i * BIAS_VALUE_STEP).toFixed(2));
}

/** GUI decimal label for moisture / terrain-type bias. */
export function formatBiasValue(index: number): string {
  return biasSliderToValue(index).toFixed(2);
}

export function biasValueToSlider(bias: unknown): number {
  const b = Number(bias);
  if (!Number.isFinite(b)) return BIAS_SLIDER_CENTER;
  return clampBiasSliderIndex(Math.round((b - BIAS_VALUE_MIN) / BIAS_VALUE_STEP));
}

/**
 * Terrain «масштаб» / frequency column: stored mult index is inverse of displayed %.
 * UI slider left = 17%, right = 600%.
 */
export function invertAutoplaceSliderIndex(index: number): number {
  const i = clampAutoplaceSliderIndex(index);
  return MAP_GEN_AUTOPLACE_MIN_INDEX + MAP_GEN_SLIDER_MAX - i;
}

export function isTerrainFrequencyInverted(
  terrainFeature?: boolean,
  field?: 'frequency' | 'size',
): boolean {
  return !!terrainFeature && field === 'frequency';
}

/** `control:*:frequency` string (inverse of scale mult) → scale slider index. */
export function propertyFrequencyToScaleSlider(freqStr: unknown): number {
  const f = Number(freqStr);
  if (!Number.isFinite(f) || f <= 0) return MAP_GEN_SLIDER_NORMAL;
  return clampAutoplaceSliderIndex(multiplierToSlider(1 / f));
}

/** Random seed in Factorio uint32 range. */
export function randomMapSeed(): string {
  const max = 0xffffffff;
  return String(Math.floor(Math.random() * (max + 1)));
}
