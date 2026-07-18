import { useLayoutEffect } from 'react';
import { applyAppShellReveal } from '../lib/appShellReveal';

export { hasPendingAppReveal, isFreshLoginReveal } from '../lib/appShellReveal';

/** Theme-aware fade / ash reveal for #appShell after login. */
export function useAppShellReveal(): void {
  useLayoutEffect(() => {
    return applyAppShellReveal(document.getElementById('appShell')) ?? undefined;
  }, []);
}
