import { useLocation } from 'react-router-dom';
import { WorkspaceNavRegistrar } from '../components/WorkspaceNavRegistrar';
import { WorkspaceViewTransition } from '../components/WorkspaceViewTransition';
import InstancesPage from '../pages/InstancesPage';
import PanelPage from '../pages/PanelPage';
import ModSettingsPage from '../pages/ModSettingsPage';
import { RequireAuth } from './guards';

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
        {isPanel ? (
          <RequireAuth>
            <PanelRouteSwitch />
          </RequireAuth>
        ) : (
          <RequireAuth instanceMode>
            <InstancesPage />
          </RequireAuth>
        )}
      </WorkspaceViewTransition>
    </>
  );
}
