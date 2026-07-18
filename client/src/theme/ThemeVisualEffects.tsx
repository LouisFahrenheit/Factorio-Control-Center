import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { CryoSnowOverlay } from './CryoSnowOverlay';
import { useEffectiveTheme } from './useEffectiveTheme';
import { webEffectsReduced } from './webEffects';

/** Declarative theme overlays (snow, etc.). Body-class backdrops stay in themeBackdrop. */
export function ThemeVisualEffects() {
  const theme = useEffectiveTheme();
  const { user } = useAuth();
  const { pathname } = useLocation();

  const isLogin = pathname === '/login';
  const loggedIn = !!user && !isLogin;

  if (webEffectsReduced() || theme !== 'cryogenics') return null;
  if (!loggedIn) return null;

  return <CryoSnowOverlay portal />;
}
