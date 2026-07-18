import { Navigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { getToken, setToken } from '../api/client';
import { AppLoadingShell } from '../components/AppLoadingShell';
import { useAuth } from '../hooks/useAuth';
import { useLocale } from '../i18n/LocaleProvider';

export function LoginGate({
  children,
  redirectTo = '/',
}: {
  children: ReactNode;
  redirectTo?: string;
}) {
  if (getToken()) return <Navigate to={redirectTo} replace />;
  return <>{children}</>;
}

interface RequireAuthProps {
  children: ReactNode;
  instanceMode?: boolean;
  loginPath?: string;
}

/** Waits for locale + auth, clears broken sessions, never leaves a blank screen. */
export function RequireAuth({ children, instanceMode = false, loginPath = '/login' }: RequireAuthProps) {
  const token = getToken();
  const { ready } = useLocale();
  const { loading, error } = useAuth();

  if (!token) return <Navigate to={loginPath} replace />;

  if (error) {
    if (getToken()) setToken(null);
    return <Navigate to={loginPath} replace />;
  }

  if (!ready || loading) return <AppLoadingShell instanceMode={instanceMode} />;

  return <>{children}</>;
}
