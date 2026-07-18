import { markExplicitServersNav } from './navFlags';
import { navigateWorkspace } from './workspaceNav';

export function goToServers(): void {
  markExplicitServersNav();
  navigateWorkspace('/');
}
