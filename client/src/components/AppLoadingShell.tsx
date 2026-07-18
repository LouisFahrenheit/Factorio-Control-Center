import { useAppShellReveal } from '../hooks/useAppShellReveal';

/** Minimal app chrome while auth/locale bootstrap — avoids blank body background. */
export function AppLoadingShell({ instanceMode = false }: { instanceMode?: boolean }) {
  useAppShellReveal();

  return (
    <div className="app" id="appShell" aria-busy="true">
      <div className="workspace">
        <section className="status-bar status-bar--top" aria-hidden="true" />
        <main
          className={
            'workspace__main' + (instanceMode ? ' instance-view-servers' : '')
          }
        />
      </div>
    </div>
  );
}
