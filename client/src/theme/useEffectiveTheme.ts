import { useEffect, useState } from 'react';
import { resolveEffectiveTheme, type FccThemeId } from './themes';

export function useEffectiveTheme(): FccThemeId {
  const [theme, setTheme] = useState<FccThemeId>(() => resolveEffectiveTheme());

  useEffect(() => {
    const sync = () => setTheme(resolveEffectiveTheme());
    sync();
    window.addEventListener('fcc-theme-applied', sync);
    return () => window.removeEventListener('fcc-theme-applied', sync);
  }, []);

  return theme;
}
