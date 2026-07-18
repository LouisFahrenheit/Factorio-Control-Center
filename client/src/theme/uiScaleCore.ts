export type FccUiScalePreference = 'auto' | '1' | '1.25' | '1.5' | '1.75' | '2';

export const UI_SCALE_STORAGE_KEY = 'fcc_ui_scale';

export const UI_SCALE_PREFERENCES: readonly FccUiScalePreference[] = [
  'auto',
  '1',
  '1.25',
  '1.5',
  '1.75',
  '2',
];

/** Auto tiers: both viewport axes must meet minimums (avoids ultrawide-only triggers). */
export const UI_SCALE_AUTO_TIERS: ReadonlyArray<{ minW: number; minH: number; scale: number }> = [
  { minW: 3840, minH: 2160, scale: 2 },
  { minW: 3200, minH: 1800, scale: 1.75 },
  { minW: 2600, minH: 1460, scale: 1.5 },
  { minW: 2200, minH: 1250, scale: 1.25 },
];

export function computeAutoUiScale(viewportW: number, viewportH: number): number {
  for (const tier of UI_SCALE_AUTO_TIERS) {
    if (viewportW >= tier.minW && viewportH >= tier.minH) return tier.scale;
  }
  return 1;
}

export function resolveEffectiveUiScale(
  preference: string,
  viewportW: number,
  viewportH: number,
): number {
  if (preference === 'auto') return computeAutoUiScale(viewportW, viewportH);
  const n = Number.parseFloat(preference);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

export function applyUiScaleToDocument(
  preference: string,
  viewportW = window.innerWidth,
  viewportH = window.innerHeight,
): void {
  const scale = resolveEffectiveUiScale(preference, viewportW, viewportH);
  const root = document.documentElement;
  root.dataset.uiScale = preference;
  root.style.setProperty('--ui-scale', String(scale));
}

export function readStoredUiScalePreference(): FccUiScalePreference {
  try {
    const raw = localStorage.getItem(UI_SCALE_STORAGE_KEY) || 'auto';
    if (UI_SCALE_PREFERENCES.includes(raw as FccUiScalePreference)) {
      return raw as FccUiScalePreference;
    }
  } catch {
    /* ignore */
  }
  return 'auto';
}
