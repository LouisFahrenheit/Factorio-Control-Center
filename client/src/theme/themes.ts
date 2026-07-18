export type FccThemeId = 'fcc_classic' | 'dark_space' | 'vulcanus' | 'ion_storm' | 'cryogenics';

export const FCC_THEMES: { id: FccThemeId; label: string }[] = [
  { id: 'fcc_classic', label: 'Classic' },
  { id: 'dark_space', label: 'Dark Space' },
  { id: 'vulcanus', label: 'Vulcanus' },
  { id: 'ion_storm', label: 'Ion Storm' },
  { id: 'cryogenics', label: 'Cryogenics' },
];

const USER_THEME_KEY = 'fcc_user_theme';

let programDefaultTheme: FccThemeId = 'fcc_classic';

export function normalizeThemeId(raw: string | undefined | null): FccThemeId {
  const id = String(raw || '').trim();
  if (FCC_THEMES.some((t) => t.id === id)) return id as FccThemeId;
  return 'fcc_classic';
}

export function setProgramDefaultTheme(raw: string | undefined | null): void {
  programDefaultTheme = normalizeThemeId(raw);
}

export function getProgramDefaultTheme(): FccThemeId {
  return programDefaultTheme;
}

export function getLocalThemeOverride(): FccThemeId | '' {
  try {
    const user = String(localStorage.getItem(USER_THEME_KEY) || '').trim();
    if (user && FCC_THEMES.some((t) => t.id === user)) return user as FccThemeId;
  } catch {
    /* ignore */
  }
  return '';
}

export function setLocalThemeOverride(code: string): void {
  try {
    const v = String(code || '').trim();
    if (v && FCC_THEMES.some((t) => t.id === v)) {
      localStorage.setItem(USER_THEME_KEY, v);
    } else {
      localStorage.removeItem(USER_THEME_KEY);
    }
  } catch {
    /* ignore */
  }
}

export function resolveEffectiveTheme(programDefault?: string | null): FccThemeId {
  const override = getLocalThemeOverride();
  if (override) return override;
  if (programDefault != null && String(programDefault).trim()) {
    return normalizeThemeId(programDefault);
  }
  return programDefaultTheme;
}

export function applyTheme(id: FccThemeId | string, opts?: { persist?: 'user' | 'none' }): void {
  const theme = normalizeThemeId(id);
  document.documentElement.dataset.theme = theme;
  const persist = opts?.persist ?? 'none';
  if (persist === 'user') {
    setLocalThemeOverride(theme);
  }
  window.dispatchEvent(new CustomEvent('fcc-theme-applied', { detail: { theme } }));
}

export function applyEffectiveTheme(programDefault?: string | null): FccThemeId {
  if (programDefault != null) setProgramDefaultTheme(programDefault);
  const theme = resolveEffectiveTheme(programDefault);
  applyTheme(theme, { persist: 'none' });
  return theme;
}
