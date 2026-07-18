import { webEffectsReduced } from './webEffects';

export { webEffectsReduced } from './webEffects';

export interface ThemeBackdropContext {
  loggedIn: boolean;
  instancesDashboard: boolean;
  panelMode: boolean;
  statusKind: string;
  serverRunning: boolean;
  instanceStatuses: string[];
}

let darkSpaceFadeTimer: ReturnType<typeof setTimeout> | null = null;

type CryoPanelPhase = 'none' | 'frozen' | 'thawing' | 'active';
let cryoPanelPhase: CryoPanelPhase = 'none';
let cryoFrozenSettled = false;
let cryoFrozenSettleTimer: ReturnType<typeof setTimeout> | null = null;

/** Matches --cryo-freeze-duration in public/app.css */
const CRYO_FREEZE_SETTLE_MS = 4600;

/** Panel shell, instances screen, and top status dashboard (see cryo freeze rules in app.css). */
export const CRYO_FREEZE_PANEL_SELECTOR =
  '.panel-shell, #instanceScreen.instance-screen, .status-bar--panel, .status-bar--instances';

function clearCryoFrozenSettleTimer(): void {
  if (cryoFrozenSettleTimer) {
    clearTimeout(cryoFrozenSettleTimer);
    cryoFrozenSettleTimer = null;
  }
}

function resetCryoPanelVisualState(): void {
  cryoPanelPhase = 'none';
  cryoFrozenSettled = false;
  clearCryoFrozenSettleTimer();
}

function applyCryoClassesToPanels(
  panels: HTMLElement[],
  phase: CryoPanelPhase,
  frozenSettled: boolean,
): void {
  panels.forEach((el) => {
    el.classList.toggle('cryo-active', phase === 'active');
    el.classList.toggle('cryo-thawing', phase === 'thawing');
    el.classList.toggle('cryo-frozen', phase === 'frozen');
    el.classList.toggle('cryo-frozen-settled', phase === 'frozen' && frozenSettled);
  });
}

function markCryoPanelsFrozenSettled(): void {
  cryoFrozenSettled = true;
  getCryoFreezePanels().forEach((el) => {
    if (el.classList.contains('cryo-frozen')) {
      el.classList.add('cryo-frozen-settled');
    }
  });
}

function scheduleCryoFreezeSettle(): void {
  clearCryoFrozenSettleTimer();
  cryoFrozenSettleTimer = setTimeout(() => {
    cryoFrozenSettleTimer = null;
    if (cryoPanelPhase === 'frozen') markCryoPanelsFrozenSettled();
  }, CRYO_FREEZE_SETTLE_MS);
}

function getCryoFreezePanels(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(CRYO_FREEZE_PANEL_SELECTOR));
}

function clearCryoPanelClasses(): void {
  document.querySelectorAll<HTMLElement>(CRYO_FREEZE_PANEL_SELECTOR).forEach((el) => {
    el.classList.remove('cryo-frozen', 'cryo-frozen-settled', 'cryo-thawing', 'cryo-active');
  });
}

function setDarkSpaceAscending(active: boolean): void {
  const body = document.body;
  if (!body) return;
  const want = !!active;
  const have = body.classList.contains('dark-space-ascending');
  if (want === have) return;
  const isDarkSpace = document.documentElement.getAttribute('data-theme') === 'dark_space';
  if (!isDarkSpace || webEffectsReduced()) {
    body.classList.toggle('dark-space-ascending', want);
    return;
  }
  if (darkSpaceFadeTimer) {
    clearTimeout(darkSpaceFadeTimer);
    darkSpaceFadeTimer = null;
  }
  body.classList.add('dark-space-fading');
  darkSpaceFadeTimer = setTimeout(() => {
    body.classList.toggle('dark-space-ascending', want);
    body.classList.remove('dark-space-fading');
    darkSpaceFadeTimer = null;
  }, 420);
}

function syncDarkSpaceBackdrop(loggedIn: boolean, serverRunning: boolean): void {
  const body = document.body;
  if (!body) return;
  const theme = document.documentElement.getAttribute('data-theme') || 'fcc_classic';
  if (theme !== 'dark_space' || webEffectsReduced()) {
    body.classList.remove(
      'dark-space-cruise',
      'dark-space-warp-jump',
      'dark-space-ascending',
      'dark-space-fading',
    );
    if (darkSpaceFadeTimer) {
      clearTimeout(darkSpaceFadeTimer);
      darkSpaceFadeTimer = null;
    }
    return;
  }
  if (loggedIn) {
    body.classList.remove('dark-space-warp-jump', 'ion-storm-warp');
  }
  body.classList.toggle('dark-space-cruise', loggedIn);
  if (!loggedIn) {
    body.classList.remove('dark-space-ascending', 'dark-space-fading');
    if (darkSpaceFadeTimer) {
      clearTimeout(darkSpaceFadeTimer);
      darkSpaceFadeTimer = null;
    }
  } else {
    setDarkSpaceAscending(serverRunning);
  }
}

function syncIonStormBackdrop(loggedIn: boolean, serverRunning: boolean): void {
  const body = document.body;
  const root = document.documentElement;
  if (!body) return;
  const theme = root.getAttribute('data-theme') || 'fcc_classic';
  const clearIonVars = () => {
    try {
      root.style.removeProperty('--ion-orbit-period');
      root.style.removeProperty('--ion-aurora-period');
      root.style.removeProperty('--ion-radial-period');
    } catch {
      /* ignore */
    }
  };
  if (theme !== 'ion_storm') {
    body.classList.remove('ion-storm-login', 'ion-storm-cruise', 'ion-storm-plasma', 'ion-storm-warp');
    clearIonVars();
    return;
  }
  if (webEffectsReduced()) {
    body.classList.remove('ion-storm-login', 'ion-storm-cruise', 'ion-storm-plasma', 'ion-storm-warp');
    clearIonVars();
    return;
  }
  body.classList.toggle('ion-storm-login', !loggedIn);
  body.classList.toggle('ion-storm-cruise', loggedIn);
  body.classList.toggle('ion-storm-plasma', loggedIn && serverRunning);
  if (loggedIn) {
    body.classList.remove('ion-storm-warp');
  }

  let orbit = '80s';
  let aurora = '38s';
  let radial = '28s';
  if (body.classList.contains('ion-storm-warp')) {
    orbit = '24s';
    aurora = '6s';
    radial = '5s';
  } else if (body.classList.contains('ion-storm-plasma')) {
    orbit = '34s';
    aurora = '13s';
    radial = '12s';
  } else if (body.classList.contains('ion-storm-login')) {
    orbit = '64s';
    aurora = '30s';
    radial = '22s';
  } else if (body.classList.contains('ion-storm-cruise')) {
    orbit = '92s';
    aurora = '44s';
    radial = '32s';
  }
  try {
    root.style.setProperty('--ion-orbit-period', orbit);
    root.style.setProperty('--ion-aurora-period', aurora);
    root.style.setProperty('--ion-radial-period', radial);
  } catch {
    /* ignore */
  }
}

function syncCryogenicsBackdrop(ctx: ThemeBackdropContext): void {
  const body = document.body;
  const root = document.documentElement;
  if (!body) return;

  const theme = root.getAttribute('data-theme') || 'fcc_classic';
  const clearPanelCryo = () => {
    resetCryoPanelVisualState();
    clearCryoPanelClasses();
  };

  if (theme !== 'cryogenics' || webEffectsReduced()) {
    body.classList.remove('cryo-login');
    clearPanelCryo();
    return;
  }

  body.classList.toggle('cryo-login', !ctx.loggedIn);
  if (!ctx.loggedIn) {
    clearPanelCryo();
    return;
  }

  if (!ctx.panelMode && !ctx.instancesDashboard) {
    if (cryoPanelPhase === 'frozen') {
      cryoFrozenSettled = true;
      clearCryoFrozenSettleTimer();
    }
    clearCryoPanelClasses();
    return;
  }

  const cryoPanels = getCryoFreezePanels();
  const kind = ctx.statusKind || 'stopped';
  const isThawing = kind === 'starting';
  const isStopping = kind === 'stopping';
  const isRunning = kind === 'running' || ctx.serverRunning;
  const isFrozen =
    !isRunning &&
    !isThawing &&
    (kind === 'stopped' ||
      kind === 'error' ||
      kind === 'maintenance' ||
      kind === 'maintenance_manual' ||
      isStopping);

  let phase: CryoPanelPhase = 'none';
  if (isRunning) phase = 'active';
  else if (isThawing) phase = 'thawing';
  else if (isFrozen) phase = 'frozen';

  const prevPhase = cryoPanelPhase;
  const enteredFrozen = phase === 'frozen' && prevPhase !== 'frozen';

  if (phase !== 'frozen') {
    cryoFrozenSettled = false;
    clearCryoFrozenSettleTimer();
  } else if (enteredFrozen) {
    cryoFrozenSettled = false;
    scheduleCryoFreezeSettle();
  } else if (cryoFrozenSettled) {
    clearCryoFrozenSettleTimer();
  } else if (cryoApplyInstant && prevPhase === 'frozen') {
    // Tab switch while already frozen — keep frost visible without replaying animation.
    cryoFrozenSettled = true;
    clearCryoFrozenSettleTimer();
  }

  cryoPanelPhase = phase;
  applyCryoClassesToPanels(cryoPanels, phase, phase === 'frozen' && cryoFrozenSettled);
}

let cryoApplyInstant = false;

export function syncThemeBackdrop(
  ctx: ThemeBackdropContext,
  opts?: { cryoInstantFreeze?: boolean },
): void {
  cryoApplyInstant = !!opts?.cryoInstantFreeze;
  syncDarkSpaceBackdrop(ctx.loggedIn, ctx.serverRunning);
  syncIonStormBackdrop(ctx.loggedIn, ctx.serverRunning);
  syncCryogenicsBackdrop(ctx);
  cryoApplyInstant = false;
}
