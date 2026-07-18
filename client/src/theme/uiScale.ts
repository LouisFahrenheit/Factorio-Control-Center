import {
  applyUiScaleToDocument,
  computeAutoUiScale,
  readStoredUiScalePreference,
  resolveEffectiveUiScale,
  UI_SCALE_PREFERENCES,
  UI_SCALE_STORAGE_KEY,
} from './uiScaleCore';

export type FccUiScale = (typeof UI_SCALE_PREFERENCES)[number];

export { computeAutoUiScale, resolveEffectiveUiScale, UI_SCALE_PREFERENCES };

let listenersBound = false;
let resizeRaf = 0;

export function getStoredUiScale(): FccUiScale {
  return readStoredUiScalePreference();
}

function refreshAutoScale(): void {
  if (getStoredUiScale() !== 'auto') return;
  const scale = computeAutoUiScale(window.innerWidth, window.innerHeight);
  document.documentElement.style.setProperty('--ui-scale', String(scale));
}

export function bindUiScaleListeners(): void {
  if (listenersBound || typeof window === 'undefined') return;
  listenersBound = true;

  const onViewportChange = () => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      resizeRaf = 0;
      refreshAutoScale();
    });
  };

  window.addEventListener('resize', onViewportChange, { passive: true });
  window.addEventListener('orientationchange', onViewportChange, { passive: true });
}

export function applyUiScale(scale: FccUiScale): void {
  applyUiScaleToDocument(scale);
  try {
    localStorage.setItem(UI_SCALE_STORAGE_KEY, scale);
  } catch {
    /* ignore */
  }
}

export function initUiScaleFromStorage(): void {
  applyUiScale(getStoredUiScale());
  bindUiScaleListeners();
}
