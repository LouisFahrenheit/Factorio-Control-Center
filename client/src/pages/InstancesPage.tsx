import { useEffect, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import { AppStatusBar } from '../components/AppStatusBar';

import { AboutModal } from '../components/modals/AboutModal';

import { UserSettingsModal } from '../components/modals/UserSettingsModal';

import { InstanceScreen } from '../components/instances/InstanceScreen';

import { useAuth } from '../hooks/useAuth';

import { isFreshLoginReveal, useAppShellReveal } from '../hooks/useAppShellReveal';

import { useInstances } from '../hooks/useInstances';

import { shouldAutoEnterPanel } from '../lib/navFlags';
import { navigateWorkspace } from '../lib/workspaceNav';

import { useLocale, useT } from '../i18n/LocaleProvider';

import type { InstanceItem } from '../types/instance';



export default function InstancesPage() {

  const nav = useNavigate();

  const t = useT();

  const { ready } = useLocale();

  const { user, logout } = useAuth();

  const instances = useInstances(ready, t);
  const freshLoginReveal = isFreshLoginReveal();
  useAppShellReveal();

  const [aboutOpen, setAboutOpen] = useState(false);

  const [settingsOpen, setSettingsOpen] = useState(false);



  useEffect(() => {

    document.body.classList.add('instance-mode');

    return () => document.body.classList.remove('instance-mode');

  }, []);



  useEffect(() => {

    if (!ready || !user || instances.loading) return;

    if (!shouldAutoEnterPanel()) return;

    const auto = instances.rows.find((x) => x.autoEnterPanel);

    if (!auto?.id) return;

    void (async () => {

      try {

        await instances.selectInstance(String(auto.id));

        navigateWorkspace('/panel', { replace: true });

      } catch (e) {

        instances.handleError(e);

      }

    })();

  }, [ready, user, instances.loading, instances.rows, instances.selectInstance, instances.handleError, nav]);



  async function openPanel(item: InstanceItem) {

    try {

      await instances.selectInstance(String(item.id));

      navigateWorkspace('/panel');

    } catch (e) {

      instances.handleError(e);

    }

  }



  return (

    <div className="app" id="appShell">

      <div className="workspace">

        <AppStatusBar

          mode="instances"

          user={user}

          dashboard={instances.dashboard}

          onLogout={() => void logout()}

          onAbout={() => setAboutOpen(true)}

          onUserSettings={() => setSettingsOpen(true)}

          t={t}

        />

        <main className="workspace__main instance-view-servers">

          <InstanceScreen
            user={user}
            instances={instances}
            onOpenPanel={openPanel}
            listEnterDelay={freshLoginReveal ? 0.16 : 0}
            t={t}
          />

        </main>

      </div>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} t={t} />

      <UserSettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} t={t} />

    </div>

  );

}


