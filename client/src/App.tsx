import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouteProgress } from './components/RouteProgress';
import { LocaleProvider, useLocale } from './i18n/LocaleProvider';
import { LoginGate, RequireAuth } from './routes/guards';
import { WorkspaceAnimatedRoutes } from './routes/WorkspaceAnimatedRoutes';
import { ThemeBackdropSync } from './theme/ThemeBackdropSync';
import { ThemeProvider } from './theme/ThemeProvider';
import { ThemeVisualEffects } from './theme/ThemeVisualEffects';

// Динамический импорт страниц — каждая страница попадает в отдельный JS‑чанк.
// Это разрезает единый 743 KB "index" на несколько маленьких файлов, которые
// браузер загружает только при переходе на соответствующий маршрут.
const LoginPage         = lazy(() => import('./pages/LoginPage'));
const MobilePage        = lazy(() => import('./pages/MobilePage'));
const MobileLoginPage   = lazy(() => import('./pages/MobileLoginPage'));
const PublicServersPage = lazy(() => import('./pages/PublicServersPage'));
const NotFoundPage      = lazy(() => import('./pages/NotFoundPage'));

const qc = new QueryClient();

function AppRoutes() {
  const { publicPageEnabled, publicPageRoute, ready } = useLocale();

  if (!ready) return null;

  return (
    <Suspense fallback={null}>
      <Routes>
        <Route
          path="/login"
          element={
            <LoginGate>
              <LoginPage />
            </LoginGate>
          }
        />
        <Route path="/" element={<WorkspaceAnimatedRoutes />} />
        <Route path="/panel/*" element={<WorkspaceAnimatedRoutes />} />
        <Route
          path="/mobile/login"
          element={
            <LoginGate redirectTo="/mobile">
              <MobileLoginPage />
            </LoginGate>
          }
        />
        <Route
          path="/mobile"
          element={
            <RequireAuth loginPath="/mobile/login">
              <MobilePage />
            </RequireAuth>
          }
        />
        {publicPageEnabled && publicPageRoute ? (
          <Route path={publicPageRoute} element={<PublicServersPage />} />
        ) : publicPageRoute ? (
          <Route path={publicPageRoute} element={<NotFoundPage />} />
        ) : null}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LocaleProvider>
        <QueryClientProvider client={qc}>
          <BrowserRouter>
            <RouteProgress />
            <ThemeBackdropSync />
            <ThemeVisualEffects />
            <AppRoutes />
          </BrowserRouter>
        </QueryClientProvider>
      </LocaleProvider>
    </ThemeProvider>
  );
}
