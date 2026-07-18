import { modals } from '@mantine/modals';
import { setToken } from '../api/client';
import { CRYO_FREEZE_PANEL_SELECTOR } from '../theme/themeBackdrop';
import { clearNavFlags } from './navFlags';

export function clearShellAnimations(): void {
  document.body.classList.remove(
    'instance-mode',
    'dark-space-cruise',
    'dark-space-warp-jump',
    'dark-space-ascending',
    'dark-space-fading',
    'ion-storm-warp',
    'ion-storm-login',
    'ion-storm-cruise',
    'ion-storm-plasma',
    'vulcanus-login-granted',
  );
  document.querySelectorAll(CRYO_FREEZE_PANEL_SELECTOR).forEach((el) => {
    el.classList.remove('cryo-frozen', 'cryo-frozen-settled', 'cryo-thawing', 'cryo-active');
  });
}

function closeLegacyModals(): void {
  document.querySelectorAll('.fu-modal-backdrop').forEach((el) => {
    el.classList.add('hidden');
  });
}

/** Drop overlays/portals that would block the login form. */
export function clearLoginBlockers(): void {
  closeLegacyModals();
  modals.closeAll();
}

/** Reset shell/animation state when returning to the login screen. */
export function resetAuthUiState(): void {
  setToken(null);
  clearShellAnimations();
  clearNavFlags();
  clearLoginBlockers();
}
