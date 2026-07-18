import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useInstances } from '../hooks/useInstances';
import { useLocale, useT } from '../i18n/LocaleProvider';
import { resolveStatusKind, type PanelStatus } from '../types/panel';
import { syncThemeBackdrop } from './themeBackdrop';

export function ThemeBackdropSync() {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const { ready } = useLocale();
  const t = useT();

  const isLogin = pathname === '/login' || pathname === '/mobile/login';
  const isInstances = pathname === '/';
  const isPanel = pathname === '/panel' || pathname.startsWith('/panel/');
  const isMobile = pathname === '/mobile' || pathname.startsWith('/mobile/');
  const loggedIn = !!user && !isLogin;

  const instances = useInstances(ready && loggedIn && (isInstances || isPanel || isMobile), t);

  const panelStatusQ = useQuery({
    queryKey: ['panel', 'status'],
    queryFn: () => api<PanelStatus>('/api/status'),
    enabled: ready && loggedIn && isPanel && !!instances.selectedId,
    refetchInterval: ready && loggedIn && isPanel && !!instances.selectedId ? 2000 : false,
  });

  const ctx = useMemo(() => {
    const instanceStatuses = instances.rows.map(
      (row) => instances.getEffectiveStatus(row) || String(row.status || 'stopped'),
    );

    let statusKind = 'stopped';
    let serverRunning = false;

    if ((isInstances || isMobile) && instanceStatuses.length) {
      serverRunning = instanceStatuses.some((s) => s === 'running');
      statusKind = serverRunning
        ? 'running'
        : instanceStatuses.some((s) => s === 'starting')
          ? 'starting'
          : instanceStatuses.some((s) => s === 'stopping')
            ? 'stopping'
            : 'stopped';
    } else if (isPanel && panelStatusQ.data) {
      statusKind = resolveStatusKind(panelStatusQ.data);
      serverRunning = statusKind === 'running';
    }

    return {
      loggedIn,
      instancesDashboard: isInstances || isMobile,
      panelMode: isPanel && !!instances.selectedId,
      statusKind,
      serverRunning,
      instanceStatuses,
    };
  }, [
    loggedIn,
    isInstances,
    isMobile,
    isPanel,
    instances.rows,
    instances.getEffectiveStatus,
    instances.selectedId,
    panelStatusQ.data,
  ]);

  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;

  useEffect(() => {
    syncThemeBackdrop(ctx);
  }, [ctx]);

  useEffect(() => {
    const onTheme = () => syncThemeBackdrop(ctxRef.current);
    window.addEventListener('fcc-theme-applied', onTheme);
    return () => window.removeEventListener('fcc-theme-applied', onTheme);
  }, []);

  // Tab switch replaces direct children of .tab-panels — not status/log DOM updates.
  useEffect(() => {
    if (!ctx.loggedIn || !ctx.panelMode) return;

    let raf = 0;
    const resync = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() =>
        syncThemeBackdrop(ctxRef.current, { cryoInstantFreeze: true }),
      );
    };

    const tabPanels = document.querySelector('.tab-panels');
    if (!tabPanels) return;

    const observer = new MutationObserver(resync);
    observer.observe(tabPanels, { childList: true, subtree: false });

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [ctx.loggedIn, ctx.panelMode]);

  return null;
}
