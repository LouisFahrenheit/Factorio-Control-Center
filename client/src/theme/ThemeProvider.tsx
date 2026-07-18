import { MantineProvider } from '@mantine/core';
import { ModalsProvider } from '@mantine/modals';
import { Notifications } from '@mantine/notifications';
import { NavigationProgress } from '@mantine/nprogress';
import { useEffect, type ReactNode } from 'react';
import { fccMantineTheme } from './theme';
import { applyEffectiveTheme } from './themes';
export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    applyEffectiveTheme();
  }, []);

  return (
    <MantineProvider theme={fccMantineTheme} defaultColorScheme="dark" forceColorScheme="dark">
      <ModalsProvider
        modalProps={{
          classNames: { content: 'fcc-modal' },
          overlayProps: { backgroundOpacity: 0.65, blur: 7 },
          transitionProps: { transition: 'pop', duration: 280 },
          zIndex: 10100,
        }}
      >
        <Notifications
          position="top-right"
          zIndex={12100}
          containerWidth={440}
          classNames={{ root: 'fcc-notifications' }}
        />
        <NavigationProgress />
        {children}
      </ModalsProvider>
    </MantineProvider>
  );
}
