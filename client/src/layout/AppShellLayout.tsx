import {
  AppShell,
  Burger,
  Button,
  Group,
  Stack,
  Text,
  Title,
  UnstyledButton,
} from '@mantine/core';
import { useDisclosure, useMediaQuery } from '@mantine/hooks';
import { IconArrowLeft, IconLogout } from '@tabler/icons-react';
import { type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { setToken } from '../api/client';
import { ThemeSwitcher } from '../components/ThemeSwitcher';

interface AppShellLayoutProps {
  title: string;
  subtitle?: string;
  backTo?: string;
  backLabel?: string;
  headerExtra?: ReactNode;
  navbar?: ReactNode;
  children: ReactNode;
}

export function AppShellLayout({
  title,
  subtitle,
  backTo,
  backLabel = 'Back',
  headerExtra,
  navbar,
  children,
}: AppShellLayoutProps) {
  const nav = useNavigate();
  const [opened, { toggle }] = useDisclosure();
  const isMobile = useMediaQuery('(max-width: 48em)');

  function logout() {
    setToken(null);
    nav('/login');
  }

  return (
    <AppShell
      className="fcc-app-shell"
      header={{ height: 56 }}
      navbar={
        navbar
          ? { width: 220, breakpoint: 'sm', collapsed: { mobile: !opened } }
          : undefined
      }
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap" style={{ minWidth: 0, flex: 1 }}>
            {navbar && isMobile && <Burger opened={opened} onClick={toggle} size="sm" />}
            {backTo && (
              <UnstyledButton component={Link} to={backTo} className="fcc-back-link">
                <Group gap={4} wrap="nowrap">
                  <IconArrowLeft size={16} stroke={1.5} />
                  <Text span size="sm">
                    {backLabel}
                  </Text>
                </Group>
              </UnstyledButton>
            )}
            <Stack gap={0} style={{ minWidth: 0 }}>
              <Title order={4} lineClamp={1}>
                {title}
              </Title>
              {subtitle && (
                <Text size="xs" c="dimmed" lineClamp={1}>
                  {subtitle}
                </Text>
              )}
            </Stack>
          </Group>
          <Group gap="sm" wrap="nowrap">
            {headerExtra}
            <ThemeSwitcher />
            <Button
              variant="subtle"
              color="gray"
              size="compact-sm"
              leftSection={<IconLogout size={16} stroke={1.5} />}
              onClick={logout}
            >
              Logout
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      {navbar && (
        <AppShell.Navbar p="md" className="fcc-navbar">
          {navbar}
        </AppShell.Navbar>
      )}

      <AppShell.Main className="fcc-main">{children}</AppShell.Main>
    </AppShell>
  );
}
