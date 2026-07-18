const SUPPRESS_AUTO_PANEL = 'fcc_suppress_auto_panel';
const FRESH_LOGIN = 'fcc_fresh_login';

export function markFreshLogin(): void {
  try {
    sessionStorage.setItem(FRESH_LOGIN, '1');
  } catch {
    /* ignore */
  }
}

export function markExplicitServersNav(): void {
  try {
    sessionStorage.removeItem(FRESH_LOGIN);
    sessionStorage.setItem(SUPPRESS_AUTO_PANEL, '1');
  } catch {
    /* ignore */
  }
}

export function shouldAutoEnterPanel(): boolean {
  try {
    if (sessionStorage.getItem(SUPPRESS_AUTO_PANEL) === '1') {
      sessionStorage.removeItem(SUPPRESS_AUTO_PANEL);
      return false;
    }
    if (sessionStorage.getItem(FRESH_LOGIN) !== '1') return false;
    sessionStorage.removeItem(FRESH_LOGIN);
    return true;
  } catch {
    return false;
  }
}

export function clearNavFlags(): void {
  try {
    sessionStorage.removeItem(FRESH_LOGIN);
    sessionStorage.removeItem(SUPPRESS_AUTO_PANEL);
  } catch {
    /* ignore */
  }
}
