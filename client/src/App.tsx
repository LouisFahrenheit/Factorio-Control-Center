import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouteProgress } from './components/RouteProgress';
import { LocaleProvider } from './i18n/LocaleProvider';
import { LoginGate, RequireAuth } from './routes/guards';
import LoginPage from './pages/LoginPage';
import { WorkspaceAnimatedRoutes } from './routes/WorkspaceAnimatedRoutes';
import MobilePage from './pages/MobilePage';
import MobileLoginPage from './pages/MobileLoginPage';
import { ThemeBackdropSync } from './theme/ThemeBackdropSync';
import { ThemeProvider } from './theme/ThemeProvider';
import { ThemeVisualEffects } from './theme/ThemeVisualEffects';

const qc = new QueryClient();

function AppRoutes() {
  return (
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
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
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
