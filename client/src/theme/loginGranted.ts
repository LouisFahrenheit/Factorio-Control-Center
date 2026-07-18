import { normalizeThemeId, type FccThemeId } from './themes';
import { webEffectsReduced } from './webEffects';

interface LoginGrantConfig {
  grantHoldMs: number;
  leaveHoldMs: number;
}

const NOW_ENTERING_KEY = 'web_login_now_entering';
const NOW_ENTERING_FALLBACK = 'NOW ENTERING SYSTEM';

const LOGIN_GRANT: Record<FccThemeId, LoginGrantConfig> = {
  fcc_classic: {
    grantHoldMs: 1100,
    leaveHoldMs: 550,
  },
  dark_space: {
    grantHoldMs: 1250,
    leaveHoldMs: 620,
  },
  ion_storm: {
    grantHoldMs: 1400,
    leaveHoldMs: 680,
  },
  vulcanus: {
    grantHoldMs: 1300,
    leaveHoldMs: 650,
  },
  cryogenics: {
    grantHoldMs: 1300,
    leaveHoldMs: 650,
  },
};

function grantClass(theme: FccThemeId): string {
  return `login-granted--${theme}`;
}

function leavingClass(theme: FccThemeId): string {
  if (theme === 'fcc_classic') return 'login-leaving--classic';
  return `login-leaving--${theme}`;
}

function nowEnteringLabel(t: (key: string) => string): string {
  const line = t(NOW_ENTERING_KEY);
  return line !== NOW_ENTERING_KEY ? line : NOW_ENTERING_FALLBACK;
}

export async function playAccessGrantedAnimation(
  panel: HTMLElement | null,
  screen: HTMLElement | null,
  t: (key: string) => string,
): Promise<void> {
  if (!panel || !screen) return;

  const theme = normalizeThemeId(document.documentElement.getAttribute('data-theme'));
  const cfg = LOGIN_GRANT[theme];

  const titleEl = panel.querySelector('.panel__title');
  if (titleEl) titleEl.textContent = nowEnteringLabel(t);

  panel.classList.add('is-success');
  screen.classList.add('is-success', grantClass(theme));

  if (webEffectsReduced()) return;

  await new Promise((r) => setTimeout(r, cfg.grantHoldMs));
  screen.classList.add('is-leaving', leavingClass(theme));
  await new Promise((r) => setTimeout(r, cfg.leaveHoldMs));
}
