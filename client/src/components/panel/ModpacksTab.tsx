import type { ModpacksApi } from '../../hooks/useModpacks';
import { ModpacksPanel } from './ModpacksPanel';

interface ModpacksTabProps {
  modpacks: ModpacksApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function ModpacksTab({ modpacks, t }: ModpacksTabProps) {
  return (
    <div
      id="tabPanelModpacks"
      className="tab-panel tab-panel--active modpacks-tab"
      role="tabpanel"
      aria-labelledby="tabBtnModpacks"
    >
      <section className="panel modpacks-tab__panel">
        <div className="panel__body modpacks-tab__body">
          <ModpacksPanel modpacks={modpacks} t={t} />
        </div>
      </section>
    </div>
  );
}
