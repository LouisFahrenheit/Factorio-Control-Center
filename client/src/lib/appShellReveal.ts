import { normalizeThemeId, type FccThemeId } from '../theme/themes';
import { webEffectsReduced } from '../theme/webEffects';

export const APP_REVEAL_KEY = 'fcc_app_reveal';
const REVEAL_PENDING = '1';
const REVEAL_ACTIVE = 'active';

const FADE_CLASS = 'is-reveal-fade-in';
const ASH_CLASS = 'is-reveal-from-ash';
const VISIBLE_CLASS = 'is-visible';

const REVEAL_DURATION_MS: Record<FccThemeId, number> = {
  fcc_classic: 450,
  dark_space: 1100,
  ion_storm: 1100,
  vulcanus: 950,
  cryogenics: 1250,
};

function currentTheme(): FccThemeId {
  return normalizeThemeId(document.documentElement.getAttribute('data-theme'));
}

function revealClassForTheme(theme: FccThemeId): string {
  return theme === 'fcc_classic' ? FADE_CLASS : ASH_CLASS;
}

function readRevealState(): string | null {
  try {
    return sessionStorage.getItem(APP_REVEAL_KEY);
  } catch {
    return null;
  }
}

/** Post-login shell reveal is pending — defer workspace slide-in on first paint. */
export function hasPendingAppReveal(): boolean {
  if (webEffectsReduced()) return false;
  const state = readRevealState();
  return state === REVEAL_PENDING || state === REVEAL_ACTIVE;
}

/** True only on the first paint after login (before reveal hook runs). */
export function isFreshLoginReveal(): boolean {
  if (webEffectsReduced()) return false;
  return readRevealState() === REVEAL_PENDING;
}

export function applyAppShellReveal(shell: HTMLElement | null): (() => void) | undefined {
  if (!shell || webEffectsReduced()) return undefined;

  const state = readRevealState();
  if (state !== REVEAL_PENDING && state !== REVEAL_ACTIVE) return undefined;

  const theme = currentTheme();
  const revealClass = revealClassForTheme(theme);
  const durationMs = REVEAL_DURATION_MS[theme];
  const continuing = state === REVEAL_ACTIVE && shell.classList.contains(revealClass);

  if (!continuing) {
    document.body.classList.remove(
      'dark-space-warp-jump',
      'ion-storm-warp',
      'vulcanus-login-granted',
    );
    shell.classList.remove(FADE_CLASS, ASH_CLASS, VISIBLE_CLASS);
    shell.classList.add(revealClass);
    try {
      sessionStorage.setItem(APP_REVEAL_KEY, REVEAL_ACTIVE);
    } catch {
      /* ignore */
    }
    void shell.offsetHeight;
  }

  const raf = requestAnimationFrame(() => {
    shell.classList.add(VISIBLE_CLASS);
  });

  const timer = window.setTimeout(() => {
    shell.classList.remove(revealClass, VISIBLE_CLASS);
    try {
      sessionStorage.removeItem(APP_REVEAL_KEY);
    } catch {
      /* ignore */
    }
  }, durationMs);

  return () => {
    cancelAnimationFrame(raf);
    window.clearTimeout(timer);
    if (readRevealState() !== REVEAL_ACTIVE) {
      shell.classList.remove(revealClass, VISIBLE_CLASS);
    }
  };
}
