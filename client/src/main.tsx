import './uiScaleEarlyBoot';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';
import '@mantine/nprogress/styles.css';
import App from './App.tsx';
import { applyEffectiveTheme } from './theme/themes';
import { initDynamicFavicon } from './theme/dynamicFavicon';
import '../../public/app.css';
import './styles/global.css';
import './styles/toast.css';
import './styles/cryo-snow.css';
import './styles/login.css';
import './styles/login-granted.css';
import './styles/mod-settings.css';
import './styles/mobile.css';
import './styles/upload-progress.css';
import './styles/access-users.css';
import './styles/maintenance.css';
import './styles/monitoring.css';
import './styles/public-tab.css';
import './styles/settings-tab.css';
import './styles/mods-tab.css';
import './styles/circuit-wire.css';
import './styles/panel-buttons.css';

applyEffectiveTheme();
initDynamicFavicon();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
