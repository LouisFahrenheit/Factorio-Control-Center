import { lazy, Suspense } from 'react';
import { useLocation } from 'react-router';
import { WorkspaceNavRegistrar } from '../components/WorkspaceNavRegistrar';
import { WorkspaceViewTransition } from '../components/WorkspaceViewTransition';
import { RequireAuth } from './guards';

const InstancesPage   = lazy(() => import('../pages/InstancesPage'));
const PanelPage       = lazy(() => import('../pages/PanelPage'));
const ModSettingsPage = lazy(() => import('../pages/ModSettingsPage'));

function PanelRouteSwitch() {
  const { pathname } = useLocation();
  if (pathname.startsWith('/panel/mod-settings')) {
    return <ModSettingsPage />;
  }
  return <PanelPage />;
}

/** Animated switch between server list (`/`) and server panel (`/panel/*`). */
export function WorkspaceAnimatedRoutes() {
  const location = useLocation();
  const isPanel = location.pathname.startsWith('/panel');
  const view = isPanel ? 'panel' : 'servers';

  return (
    <>
      <WorkspaceNavRegistrar />
      <WorkspaceViewTransition view={view}>
        <Suspense fallback={null}>
          {isPanel ? (
            <RequireAuth>
              <PanelRouteSwitch />
            </RequireAuth>
          ) : (
            <RequireAuth instanceMode>
              <InstancesPage />
            </RequireAuth>
          )}
        </Suspense>
      </WorkspaceViewTransition>
    </>
  );
}
