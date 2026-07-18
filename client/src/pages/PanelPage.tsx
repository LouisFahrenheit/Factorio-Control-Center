import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { AppLoadingShell } from '../components/AppLoadingShell';
import { AppStatusBar } from '../components/AppStatusBar';
import { AboutModal } from '../components/modals/AboutModal';
import { UserSettingsModal } from '../components/modals/UserSettingsModal';
import { AnnouncementsModal } from '../components/panel/AnnouncementsModal';
import { CommandEditorModal } from '../components/panel/CommandEditorModal';
import { CommandsTab } from '../components/panel/CommandsTab';
import { ControlTab } from '../components/panel/ControlTab';
import { ModJobModal } from '../components/panel/ModJobModal';
import { CreateSaveModal } from '../components/panel/CreateSaveModal';
import { ModpacksTab } from '../components/panel/ModpacksTab';
import { HistoryTab } from '../components/panel/HistoryTab';
import { ModsTab } from '../components/panel/ModsTab';
import { PanelTabBar } from '../components/panel/PanelTabBar';
import { TabPanelsTransition } from '../components/TabPanelsTransition';
import { SavesTab } from '../components/panel/SavesTab';
import { ServerSettingsTab } from '../components/panel/ServerSettingsTab';
import { StatsTab } from '../components/panel/StatsTab';
import { isAdmin, useAuth, userHasTab } from '../hooks/useAuth';
import { useAppShellReveal } from '../hooks/useAppShellReveal';
import { useAnnouncements } from '../hooks/useAnnouncements';
import { useCommandEditor } from '../hooks/useCommandEditor';
import { useCommands } from '../hooks/useCommands';
import { useFactorioUpdate } from '../hooks/useFactorioUpdate';
import { useServerLogHistory } from '../hooks/useServerLogHistory';
import { useInstances } from '../hooks/useInstances';
import { useModJob } from '../hooks/useModJob';
import { useMissingStartupDeps } from '../hooks/useMissingStartupDeps';
import { useModpacks } from '../hooks/useModpacks';
import { useMods } from '../hooks/useMods';
import { usePanelStatus } from '../hooks/usePanelStatus';
import { usePlayers } from '../hooks/usePlayers';
import { useSaves } from '../hooks/useSaves';
import { useServerControl } from '../hooks/useServerControl';
import { useServerSettings } from '../hooks/useServerSettings';
import { goToServers } from '../lib/goToServers';
import { allowedPanelTabs, type PanelTabKey } from '../lib/permissions';
import { resolveStatusKind } from '../types/panel';
import { useLocale, useT } from '../i18n/LocaleProvider';
import type { ProgramSettings } from '../types/programSettings';

export default function PanelPage() {
  const qc = useQueryClient();
  const t = useT();
  const { ready, strings } = useLocale();
  const { user, logout } = useAuth();
  useAppShellReveal();
  const instances = useInstances(ready, t);
  const [activeTab, setActiveTab] = useState<PanelTabKey>('main');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const tabs = useMemo(() => allowedPanelTabs(user), [user]);
  const selectedId = String(instances.selectedId || '');
  const selectedInstance = useMemo(
    () => instances.rows.find((x) => String(x.id) === selectedId),
    [instances.rows, selectedId],
  );
  const blockUpdates = !!selectedInstance?.blockUpdates;
  const experimentalUpdates = !!selectedInstance?.experimentalUpdates;
  const canMods = userHasTab(user, 'mods');
  const canModpacks = userHasTab(user, 'modpacks');

  const statusQuery = usePanelStatus(ready && !!selectedId, activeTab, selectedId);
  const status = statusQuery.data;
  const panelKind = resolveStatusKind(status);
  const panelServerBusy =
    panelKind === 'running' ||
    panelKind === 'starting' ||
    panelKind === 'stopping' ||
    panelKind === 'maintenance';

  const programSettingsQuery = useQuery({
    queryKey: ['program', 'settings'],
    queryFn: () => api<ProgramSettings>('/api/config/program'),
    enabled: ready,
    staleTime: 60_000,
  });
  const reformatLogTimestamps = programSettingsQuery.data?.log_reformat_timestamps !== false;

  const onModJobComplete = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['mods'] });
    void qc.invalidateQueries({ queryKey: ['modpacks'] });
    void qc.invalidateQueries({ queryKey: ['panel', 'status'] });
    void qc.invalidateQueries({ queryKey: ['instances'] });
  }, [qc]);
  const modJob = useModJob(onModJobComplete, t);

  const control = useServerControl(
    activeTab === 'main' && !!selectedId,
    statusQuery.data,
    instances.rows,
    selectedId,
    t,
  );
  const factorioUpdate = useFactorioUpdate(
    activeTab === 'main' && !!selectedId,
    control.busy,
    blockUpdates,
    experimentalUpdates,
    selectedId,
    t,
  );
  const logHistory = useServerLogHistory(selectedId, t);
  const saves = useSaves(activeTab === 'saves' && !!selectedId, selectedId, statusQuery.data, t);
  const commands = useCommands(activeTab === 'commands' && !!selectedId, statusQuery.data, t);
  const reloadCommandsCatalog = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['commands', 'catalog'] });
    void qc.invalidateQueries({ queryKey: ['players'] });
  }, [qc]);
  const commandEditor = useCommandEditor(
    activeTab === 'commands' && !!selectedId,
    reloadCommandsCatalog,
    t,
  );
  const serverSettings = useServerSettings(
    activeTab === 'serverSettings' && !!selectedId,
    statusQuery.data,
    t,
    strings,
  );
  const mods = useMods(
    !!selectedId && (canMods || canModpacks),
    status,
    blockUpdates,
    selectedId,
    String(selectedInstance?.name || ''),
    t,
    modJob,
  );
  const modsUserRows = useMemo(
    () => mods.rawRows.filter((m) => !m.is_builtin),
    [mods.rawRows],
  );
  const modpacks = useModpacks(
    activeTab === 'modpacks' && !!selectedId,
    panelServerBusy,
    String(status?.game_version || ''),
    modsUserRows,
    activeTab === 'mods' ? mods.removeOldZips : true,
    modJob,
    t,
  );
  const players = usePlayers(
    (activeTab === 'stats' || activeTab === 'history') && !!selectedId,
    user,
    t,
    { historyOnly: activeTab === 'history' },
  );

  useMissingStartupDeps(
    ready && !!selectedId,
    status,
    panelServerBusy,
    modJob,
    activeTab === 'mods' ? mods.removeOldZips : true,
    t,
  );

  const serverRunning = panelKind === 'running';
  const maintenanceLocked = panelKind === 'maintenance';
  const onlineCount = Array.isArray(status?.online_players) ? status.online_players.length : 0;
  const announcements = useAnnouncements(!!selectedId, selectedId, serverRunning, onlineCount, t);

  useEffect(() => {
    document.body.classList.remove('instance-mode');
  }, []);

  useEffect(() => {
    const tab = sessionStorage.getItem('fcc_open_panel_tab');
    if (!tab) return;
    sessionStorage.removeItem('fcc_open_panel_tab');
    if (tabs.some((x) => x.key === tab)) {
      setActiveTab(tab as PanelTabKey);
    }
  }, [tabs]);

  useEffect(() => {
    if (!tabs.length) return;
    if (!tabs.some((tab) => tab.key === activeTab)) {
      setActiveTab(tabs[0].key);
    }
  }, [tabs, activeTab]);

  if (!selectedId) {
    if (instances.loading) return <AppLoadingShell />;
    return <Navigate to="/" replace />;
  }

  return (
    <div className="app" id="appShell">
      <div className="workspace">
        <AppStatusBar
          mode="panel"
          user={user}
          status={statusQuery.data}
          serverName={String(selectedInstance?.name || selectedId || '')}
          onLogout={() => void logout()}
          onServers={() => goToServers()}
          onAbout={() => setAboutOpen(true)}
          onUserSettings={() => setSettingsOpen(true)}
          t={t}
        />
        <main className="workspace__main workspace__main--panel">
          <div className="panel-shell">
            <PanelTabBar user={user} active={activeTab} onChange={setActiveTab} t={t} />
            <TabPanelsTransition activeKey={activeTab} className="tab-panels">
            {activeTab === 'main' && (
              <ControlTab
                control={control}
                factorioUpdate={factorioUpdate}
                logHistory={logHistory}
                reformatLogTimestamps={reformatLogTimestamps}
                blockUpdates={blockUpdates}
                canCommands={userHasTab(user, 'commands')}
                t={t}
              />
            )}
            {activeTab === 'serverSettings' && (
              <ServerSettingsTab settings={serverSettings} canRevealSecrets={isAdmin(user)} t={t} />
            )}
            {activeTab === 'saves' && <SavesTab saves={saves} t={t} />}
            {activeTab === 'commands' && (
              <CommandsTab commands={commands} commandEditor={commandEditor} t={t} />
            )}
            {activeTab === 'mods' && <ModsTab mods={mods} t={t} />}
            {activeTab === 'modpacks' && <ModpacksTab modpacks={modpacks} t={t} />}
            {activeTab === 'stats' && (
              <StatsTab
                players={players}
                announcements={announcements}
                canAnnounce={userHasTab(user, 'players')}
                announceDisabled={maintenanceLocked}
                serverRunning={serverRunning}
                maintenanceLocked={maintenanceLocked}
                t={t}
              />
            )}
            {activeTab === 'history' && <HistoryTab players={players} t={t} />}
            </TabPanelsTransition>
          </div>
        </main>
      </div>
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} t={t} />
      <UserSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} t={t} />
      <CreateSaveModal createSave={saves.createSaveDialog} t={t} />
      <AnnouncementsModal announcements={announcements} t={t} />
      <ModJobModal modJob={modJob} t={t} />
      {(activeTab === 'commands' || commandEditor.open) && (
        <CommandEditorModal editor={commandEditor} t={t} />
      )}
    </div>
  );
}
