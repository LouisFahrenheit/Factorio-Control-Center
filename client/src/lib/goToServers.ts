import { markExplicitServersNav } from './navFlags';
import { navigateWorkspace } from './workspaceNav';

export function goToServers(): void {
  markExplicitServersNav();
  navigateWorkspace('/');
}

export function goToInstanceSettings(instanceId: string): void {
  try {
    sessionStorage.setItem('fcc_open_edit_instance', instanceId);
  } catch {
    /* ignore */
  }
  markExplicitServersNav();
  navigateWorkspace('/');
}
