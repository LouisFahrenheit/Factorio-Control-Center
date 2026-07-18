/** Factorio map generator GUI scale (display ↔ map-settings.json raw). */
export const EVO_TIME_SCALE = 1e-7;
export const EVO_DESTROY_SCALE = 1e-5;
export const EVO_POLLUTION_SCALE = 1e-7;
export const EXPANSION_COOLDOWN_TICKS_PER_MINUTE = 3600;

export const EVOLUTION_DEFAULTS = {
  timeFactor: 40,
  destroyFactor: 200,
  pollutionFactor: 9,
} as const;

export const EXPANSION_DEFAULTS = {
  maxExpansionDistance: 7,
  settlerGroupMin: 5,
  settlerGroupMax: 20,
  minCooldownMinutes: 4,
  maxCooldownMinutes: 60,
} as const;

export type NumericFieldSpec = {
  min: number;
  max: number;
  step: number;
  integer?: boolean;
};

/** Factorio map generator GUI limits (enemy tab). */
export const EVOLUTION_FIELD_SPECS = {
  timeFactor: { min: 0, max: 1000, step: 1, integer: true },
  destroyFactor: { min: 0, max: 1000, step: 1, integer: true },
  pollutionFactor: { min: 0, max: 1000, step: 1, integer: true },
} as const satisfies Record<string, NumericFieldSpec>;

export const EXPANSION_FIELD_SPECS = {
  maxExpansionDistance: { min: 2, max: 20, step: 1, integer: true },
  settlerGroupMin: { min: 1, max: 20, step: 1, integer: true },
  settlerGroupMax: { min: 1, max: 50, step: 1, integer: true },
  minCooldownMinutes: { min: 1, max: 60, step: 1, integer: true },
  maxCooldownMinutes: { min: 1, max: 60, step: 1, integer: true },
} as const satisfies Record<string, NumericFieldSpec>;

export function clampNumeric(value: number, spec: NumericFieldSpec): number {
  let v = Math.min(spec.max, Math.max(spec.min, value));
  if (spec.integer) v = Math.round(v);
  return v;
}

/** Factorio: max group size ≥ min; if not, lower min down to max (min 1–1). */
export function normalizeSettlerGroupSizes(
  min: number,
  max: number,
): { settlerGroupMin: number; settlerGroupMax: number } {
  let settlerGroupMin = clampNumeric(min, EXPANSION_FIELD_SPECS.settlerGroupMin);
  let settlerGroupMax = clampNumeric(max, EXPANSION_FIELD_SPECS.settlerGroupMax);
  if (settlerGroupMax < settlerGroupMin) {
    settlerGroupMin = settlerGroupMax;
  }
  return { settlerGroupMin, settlerGroupMax };
}

export function sliderIndexForValue(value: number, spec: NumericFieldSpec, sliderMax: number): number {
  if (spec.max <= spec.min) return 0;
  const t = (value - spec.min) / (spec.max - spec.min);
  return Math.round(t * sliderMax);
}

export function valueForSliderIndex(index: number, spec: NumericFieldSpec, sliderMax: number): number {
  const t = Math.max(0, Math.min(1, index / sliderMax));
  const raw = spec.min + t * (spec.max - spec.min);
  return clampNumeric(raw, spec);
}

/** Raw map-settings time_factor → GUI integer. */
export function evolutionTimeToDisplay(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return EVOLUTION_DEFAULTS.timeFactor;
  if (n >= 1) return Math.round(n);
  return Math.round(n / EVO_TIME_SCALE);
}

export function evolutionDestroyToDisplay(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return EVOLUTION_DEFAULTS.destroyFactor;
  if (n >= 0.1) return Math.round(n);
  return Math.round(n / EVO_DESTROY_SCALE);
}

export function evolutionPollutionToDisplay(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return EVOLUTION_DEFAULTS.pollutionFactor;
  if (n >= 0.01) return Math.round(n);
  return Math.round(n / EVO_POLLUTION_SCALE);
}

export function expansionCooldownToMinutes(ticks: unknown): number {
  const t = Number(ticks);
  if (!Number.isFinite(t) || t <= 0) return EXPANSION_DEFAULTS.minCooldownMinutes;
  return Math.max(1, Math.round(t / EXPANSION_COOLDOWN_TICKS_PER_MINUTE));
}

export const POLLUTION_DEFAULTS = {
  absorptionModifierPercent: 100,
  attackCostModifierPercent: 100,
  minPollutionToDamageTrees: 60,
  pollutionAbsorbedPerTree: 10,
  diffusionRatioPercent: 2,
} as const;

export const ASTEROIDS_DEFAULTS = { spawningRatePercent: 100 } as const;
export const SPOILING_DEFAULTS = { ratePercent: 100 } as const;

/** Linear 0–600% fields (pollution modifiers, etc.). */
export const MAP_SETTINGS_PERCENT_LINEAR_SPECS = {
  min: 0,
  max: 600,
  step: 1,
  integer: true,
} as const satisfies NumericFieldSpec;

export const POLLUTION_FIELD_SPECS = {
  absorptionModifierPercent: MAP_SETTINGS_PERCENT_LINEAR_SPECS,
  attackCostModifierPercent: MAP_SETTINGS_PERCENT_LINEAR_SPECS,
  minPollutionToDamageTrees: { min: 1, max: 500, step: 1, integer: true },
  pollutionAbsorbedPerTree: { min: 1, max: 200, step: 1, integer: true },
  diffusionRatioPercent: { min: 0, max: 100, step: 1, integer: false },
} as const satisfies Record<string, NumericFieldSpec>;

/** Discrete MapGenSize steps 17%–600% (spoiling rate). */
export const SPOILING_FIELD_SPECS = {
  ratePercent: { min: 17, max: 600, step: 1, integer: true },
} as const satisfies Record<string, NumericFieldSpec>;

export function percentFromMultiplier(raw: unknown, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n * 100);
}

export function percentToMultiplier(percent: number): number {
  return percent / 100;
}
