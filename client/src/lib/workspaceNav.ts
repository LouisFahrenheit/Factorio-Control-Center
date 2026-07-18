import { hardNavigate } from './hardNavigate';

type WorkspaceNavigate = (path: string, options?: { replace?: boolean }) => void;

let workspaceNavigate: WorkspaceNavigate | null = null;

export function registerWorkspaceNavigate(fn: WorkspaceNavigate | null): void {
  workspaceNavigate = fn;
}

/** SPA navigation between `/` and `/panel` (falls back to full reload if router not ready). */
export function navigateWorkspace(path: string, options?: { replace?: boolean }): void {
  if (workspaceNavigate) {
    workspaceNavigate(path, options);
    return;
  }
  hardNavigate(path);
}
