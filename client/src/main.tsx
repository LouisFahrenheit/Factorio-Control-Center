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
import './styles/cryo-snow.css';
import './styles/login.css';
import './styles/login-granted.css';
import './styles/mod-settings.css';
import './styles/mobile.css';

applyEffectiveTheme();
initDynamicFavicon();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
