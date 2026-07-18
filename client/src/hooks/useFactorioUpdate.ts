import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { modConfirm } from '../lib/modErrorUtils';
import { buildPickVersionList, collectReleaseVersions, fuLocalizeError } from '../lib/factorioUpdateUtils';
import { notifyApiError } from '../lib/networkErrors';
import { notifyErr, notifyOk } from '../lib/notify';
import type { FactorioPickState, FactorioUpdateCheck, FactorioUpdateStatus } from '../types/factorioUpdate';

type FuMode = 'closed' | 'pick' | 'progress';

const GAME_UPDATE_CHECK_ALL_LAST_TS_KEY = 'fcc_game_update_check_all_last_ts';
const GAME_UPDATE_CHECK_ALL_PERIOD_MS = 24 * 60 * 60 * 1000;

function gameUpdateDailyCheckDue(): boolean {
  try {
    const raw = String(localStorage.getItem(GAME_UPDATE_CHECK_ALL_LAST_TS_KEY) || '').trim();
    const last = parseInt(raw, 10);
    if (!Number.isFinite(last) || last <= 0) return true;
    return Date.now() - last >= GAME_UPDATE_CHECK_ALL_PERIOD_MS;
  } catch {
    return true;
  }
}

function gameUpdateDailyCheckMarkNow(): void {
  try {
    localStorage.setItem(GAME_UPDATE_CHECK_ALL_LAST_TS_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function useFactorioUpdate(
  enabled: boolean,
  serverBusy: boolean,
  blockUpdates: boolean,
  experimentalUpdates: boolean,
  instanceId: string,
  t: (key: string, ...args: (string | number)[]) => string,
) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<FuMode>('closed');
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<FactorioUpdateStatus | null>(null);
  const [pickState, setPickState] = useState<FactorioPickState | null>(null);
  const [showExperimental, setShowExperimental] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const pollRef = useRef<number | null>(null);
  const dailyCheckRunningRef = useRef(false);

  const clearPoll = useCallback(() => {
    if (pollRef.current) {
      window.clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    setMode('closed');
    setStatus(null);
    setPickState(null);
    setShowExperimental(false);
    clearPoll();
    setChecking(false);
  }, [clearPoll]);

  const refreshAvailability = useCallback(async () => {
    if (!enabled || !instanceId || blockUpdates) {
      setUpdateAvailable(false);
      return;
    }
    try {
      const chk = await api<FactorioUpdateCheck>('/api/factorio/update/check');
      const updates = Array.isArray(chk?.updates) ? chk.updates : [];
      setUpdateAvailable(!!chk?.ok && updates.length > 0);
    } catch {
      setUpdateAvailable(false);
    }
  }, [blockUpdates, enabled, instanceId]);

  useEffect(() => {
    if (!enabled) return;
    void refreshAvailability();
  }, [enabled, instanceId, blockUpdates, refreshAvailability]);

  useEffect(() => {
    if (!enabled || !instanceId || blockUpdates) return;
    if (dailyCheckRunningRef.current || !gameUpdateDailyCheckDue()) return;
    dailyCheckRunningRef.current = true;
    void (async () => {
      try {
        const j = await api<{ ok?: boolean; items?: { id?: string; ok?: boolean; has_updates?: boolean }[] }>(
          '/api/factorio/update/check-all',
        );
        if (j?.ok !== false) {
          const rows = Array.isArray(j?.items) ? j.items : [];
          const row = rows.find((r) => String(r?.id || '').trim() === instanceId);
          if (row?.ok && row.has_updates) setUpdateAvailable(true);
          else if (row) setUpdateAvailable(false);
          gameUpdateDailyCheckMarkNow();
        }
      } catch {
        /* ignore */
      } finally {
        dailyCheckRunningRef.current = false;
      }
    })();
  }, [blockUpdates, enabled, instanceId]);

  const poll = useCallback(async () => {
    try {
      const s = await api<FactorioUpdateStatus>('/api/factorio/update/status');
      setStatus(s);
      if (!s?.running) {
        clearPoll();
        void qc.invalidateQueries({ queryKey: ['panel', 'status'] });
        void qc.invalidateQueries({ queryKey: ['instances'] });
        void qc.invalidateQueries({ queryKey: ['players'] });
        void refreshAvailability();
      }
    } catch {
      /* keep polling */
    }
  }, [clearPoll, qc, refreshAvailability]);

  const startPoll = useCallback(() => {
    clearPoll();
    pollRef.current = window.setInterval(() => {
      void poll();
    }, 700);
    void poll();
  }, [clearPoll, poll]);

  const startUpdate = useCallback(
    async (targetVersion: string) => {
      setMode('progress');
      setStatus({ running: true, phase: 'preparing' });
      try {
        const body: Record<string, unknown> = targetVersion ? { target_version: targetVersion } : {};
        if (showExperimental) {
          body.experimental = true;
        }
        const j = await api<{ ok?: boolean; error?: string }>('/api/factorio/update', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        if (!j?.ok) {
          setStatus({
            running: false,
            phase: 'error',
            error: fuLocalizeError('', undefined, String(j?.error || ''), t),
          });
          return;
        }
        startPoll();
      } catch (e) {
        setStatus({
          running: false,
          phase: 'error',
          error: e instanceof Error ? e.message : String(e),
        });
      }
    },
    [showExperimental, startPoll, t],
  );

  const stopUpdate = useCallback(async () => {
    if (!(await modConfirm(t('about_factorio_update_stop_confirm_msg'), t))) return;
    try {
      await api('/api/factorio/update/stop', { method: 'POST' });
    } catch {
      /* ignore */
    }
  }, [t]);

  const openUpdateFlow = useCallback(async () => {
    const title = t('about_check_factorio_updates');
    if (serverBusy) {
      notifyErr(title, t('about_factorio_update_stop_server'));
      return;
    }
    if (blockUpdates) {
      notifyErr(title, t('updates_blocked_by_instance_setting'));
      return;
    }
    setChecking(true);
    try {
      const statusFirst = await api<FactorioUpdateStatus>('/api/factorio/update/status');
      if (statusFirst?.running) {
        setMode('progress');
        setStatus(statusFirst);
        startPoll();
        return;
      }
      const chk = await api<FactorioUpdateCheck>('/api/factorio/update/check');
      if (!chk?.ok) {
        notifyErr(title, fuLocalizeError('', undefined, String(chk?.error || ''), t));
        return;
      }
      const updates = Array.isArray(chk.updates) ? chk.updates : [];
      if (!updates.length) {
        setUpdateAvailable(false);
        notifyOk(title, t('about_factorio_update_no_updates', chk.current || '?', chk.latest_stable || '?'));
        return;
      }
      setUpdateAvailable(true);
      const stableTargets = updates.map((u) => String(u.to || '')).filter(Boolean);
      let releases = { stable: [] as string[], experimental: [] as string[] };
      try {
        const rel = await api<{ ok?: boolean; releases?: unknown }>('/api/factorio/releases');
        if (rel?.ok) releases = collectReleaseVersions(rel.releases);
      } catch {
        /* optional */
      }
      const pick: FactorioPickState = {
        current: String(chk.current || ''),
        stableTargets,
        releases,
      };
      setPickState(pick);
      setShowExperimental(experimentalUpdates);
      const { versions } = buildPickVersionList(pick, experimentalUpdates);
      setSelectedVersion(versions[0] || stableTargets[0] || '');
      setMode('pick');
    } catch (e) {
      notifyApiError(title, e, t);
    } finally {
      setChecking(false);
    }
  }, [blockUpdates, experimentalUpdates, serverBusy, startPoll, t]);

  useEffect(() => {
    if (mode !== 'pick' || !pickState) return;
    const { versions } = buildPickVersionList(pickState, showExperimental);
    setSelectedVersion((prev) => (versions.includes(prev) ? prev : versions[0] || ''));
  }, [mode, pickState, showExperimental]);

  useEffect(() => {
    return () => clearPoll();
  }, [clearPoll]);

  const versionOptions = buildPickVersionList(pickState, showExperimental);

  return {
    open: mode !== 'closed',
    mode,
    checking,
    status,
    pickState,
    showExperimental,
    setShowExperimental,
    selectedVersion,
    setSelectedVersion,
    versionOptions,
    updateAvailable,
    openUpdateFlow,
    startUpdate,
    stopUpdate,
    close,
  };
}

export type FactorioUpdateApi = ReturnType<typeof useFactorioUpdate>;
