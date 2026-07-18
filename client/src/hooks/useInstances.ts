import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { modals } from '@mantine/modals';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  instanceMaintenanceManualMode,
  isGamePortBusyByAnotherInstance,
  localizeInstanceError,
  runningInstanceBlocked,
  syncInstancesDashboard,
} from '../lib/instanceUtils';
import { feedbackMsg } from '../lib/apiFeedback';
import { modConfirm } from '../lib/modErrorUtils';
import { notifyNetworkFetchError } from '../lib/networkErrors';
import { notifyErr, notifyWarn } from '../lib/notify';
import type { InstanceItem, InstancesListResponse } from '../types/instance';
import type { AuthUser } from '../types/instance';
import { getStoredSelectedInstance, setStoredSelectedInstance } from '../lib/selectedInstanceStorage';

type StatusOverride = { status: string; until: number };

export function useInstances(enabled: boolean, t: (key: string, ...args: (string | number)[]) => string) {
  const qc = useQueryClient();
  const overridesRef = useRef<Map<string, StatusOverride>>(new Map());
  const [, bump] = useState(0);
  const [deleteProgressOpen, setDeleteProgressOpen] = useState(false);
  const [deleteProgressName, setDeleteProgressName] = useState('');
  const burstTimerRef = useRef<number | null>(null);
  const burstLeftRef = useRef(0);
  const restoreAttemptedRef = useRef('');

  const instancesTitle = t('instances_btn');

  const notifyInstance = useCallback(
    (text: string, isErr = false) => {
      feedbackMsg(instancesTitle, text, isErr, false, t);
    },
    [instancesTitle, t],
  );

  const query = useQuery({
    queryKey: ['instances'],
    queryFn: () => api<InstancesListResponse>('/api/instances'),
    enabled,
    refetchInterval: enabled ? 3000 : false,
  });

  const rows = useMemo(() => {
    const items = query.data?.items;
    return Array.isArray(items) ? items : [];
  }, [query.data?.items]);

  const selectedId = String(query.data?.selectedId || '');

  const getEffectiveStatus = useCallback((item: InstanceItem): string => {
    const iid = String(item.id || '').trim();
    const realStatus = String(item.status || '');
    if (!iid) return realStatus;
    const ov = overridesRef.current.get(iid);
    if (!ov) return realStatus;
    if (!ov.until || ov.until <= Date.now()) {
      overridesRef.current.delete(iid);
      return realStatus;
    }
    if (realStatus === ov.status) {
      overridesRef.current.delete(iid);
      return realStatus;
    }
    if (realStatus === 'starting' || realStatus === 'stopping') return realStatus;
    return String(ov.status || realStatus);
  }, []);

  const setStatusOverride = useCallback((instanceId: string, status: string, ttlMs: number) => {
    const iid = String(instanceId || '').trim();
    const st = String(status || '').trim();
    if (!iid || !st) return;
    const ttl = Number.isFinite(ttlMs) ? Math.max(800, ttlMs) : 9000;
    overridesRef.current.set(iid, { status: st, until: Date.now() + ttl });
    bump((n) => n + 1);
  }, []);

  const setInstanceMsg = useCallback(
    (text: string, isErr = false) => {
      notifyInstance(text, isErr);
    },
    [notifyInstance],
  );

  const setInstanceMsgTimed = useCallback(
    (text: string, isErr = false, _ttlMs?: number) => {
      notifyInstance(text, isErr);
    },
    [notifyInstance],
  );

  const triggerBurstRefresh = useCallback(() => {
    if (!enabled) return;
    if (burstTimerRef.current) {
      window.clearInterval(burstTimerRef.current);
      burstTimerRef.current = null;
    }
    burstLeftRef.current = 10;
    void qc.invalidateQueries({ queryKey: ['instances'] });
    burstTimerRef.current = window.setInterval(() => {
      if (!enabled) {
        if (burstTimerRef.current) window.clearInterval(burstTimerRef.current);
        burstTimerRef.current = null;
        return;
      }
      burstLeftRef.current -= 1;
      void qc.invalidateQueries({ queryKey: ['instances'] });
      if (burstLeftRef.current <= 0 && burstTimerRef.current) {
        window.clearInterval(burstTimerRef.current);
        burstTimerRef.current = null;
      }
    }, 1000);
  }, [enabled, qc]);

  useEffect(() => {
    return () => {
      if (burstTimerRef.current) window.clearInterval(burstTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!enabled || !query.isError) return;
    notifyNetworkFetchError(instancesTitle, query.error, t);
  }, [enabled, query.isError, query.error, instancesTitle, t]);

  const dashboard = useMemo(() => syncInstancesDashboard(rows), [rows]);

  const showEndMaintenanceAll = useMemo(
    () => rows.some((it) => instanceMaintenanceManualMode(it, getEffectiveStatus)),
    [rows, getEffectiveStatus],
  );

  const reload = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['instances'] });
    return qc.fetchQuery({ queryKey: ['instances'] });
  }, [qc]);

  const selectInstance = useCallback(
    async (id: string) => {
      const j = await api<{ ok?: boolean; error?: string }>('/api/instances/select', {
        method: 'POST',
        body: JSON.stringify({ id }),
      });
      if (!j || j.ok === false) {
        throw new Error(localizeInstanceError(j?.error || 'instance_switch_failed', t));
      }
      const user = qc.getQueryData<AuthUser>(['auth', 'me']);
      if (user?.username) setStoredSelectedInstance(user.username, id);
      await reload();
    },
    [reload, t, qc],
  );

  useEffect(() => {
    if (!enabled || !query.data) return;
    const user = qc.getQueryData<AuthUser>(['auth', 'me']);
    const username = String(user?.username || '').trim();
    if (!username) return;
    if (restoreAttemptedRef.current === username) return;
    restoreAttemptedRef.current = username;
    const stored = getStoredSelectedInstance(username);
    if (!stored) return;
    const allowed = rows.map((x) => String(x.id || ''));
    if (!allowed.includes(stored)) return;
    if (stored === selectedId) return;
    void selectInstance(stored).catch(() => {
      restoreAttemptedRef.current = '';
    });
  }, [enabled, query.data, rows, selectedId, qc, selectInstance]);

  const quickAction = useCallback(
    async (instanceId: string, action: 'start' | 'stop' | 'kill') => {
      const iid = String(instanceId || '').trim();
      if (!iid) return;
      const item = rows.find((x) => String(x.id) === iid);
      const name = String(item?.name || iid);

      if (action === 'start' && item && isGamePortBusyByAnotherInstance(rows, iid, item.port, getEffectiveStatus)) {
        setInstanceMsg(localizeInstanceError('port_in_use', t), true);
        return;
      }
      if (action === 'start' && item?.modJobRunning) {
        setInstanceMsg(t('mod_job_running_block_start'), true);
        return;
      }

      if (action === 'kill' && !(await modConfirm(t('confirm_kill_msg'), t))) return;

      if (action === 'start') {
        const qs = new URLSearchParams({ instance_id: iid });
        const cfg = await api<{ save?: string; latest_label?: string }>(`/api/config/server?${qs}`);
        const savesResp = await api<{ saves?: { name?: string }[] }>(`/api/saves?${qs}`);
        const savesList = Array.isArray(savesResp?.saves) ? savesResp.saves : [];
        const latestLabel = cfg.latest_label || 'latest';
        const saveSetting = String(cfg.save || '').trim() || latestLabel;
        const wantsLatest = saveSetting === latestLabel || saveSetting.toLowerCase() === 'latest';
        if (!savesList.length) {
          notifyWarn(t('cannot_start_no_save'), undefined);
          return;
        }
        if (!wantsLatest) {
          const okName = savesList.some((r) => r && String(r.name || '') === saveSetting);
          if (!okName) {
            notifyWarn(t('cannot_start_no_save'), undefined);
            return;
          }
        }
      }

      if (action === 'start') setStatusOverride(iid, 'starting', 9000);
      if (action === 'stop') setStatusOverride(iid, 'stopping', 9000);
      if (action === 'kill') setStatusOverride(iid, 'stopping', 7000);

      const endpoint =
        action === 'start' ? '/api/server/start' : action === 'stop' ? '/api/server/stop' : '/api/server/kill';
      const r = await api<{ ok?: boolean; error?: string }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ instance_id: iid }),
      });
      if (r?.ok === false) throw new Error(String(r.error || action + '_failed'));

      const msgKey =
        action === 'start'
          ? 'instances_quick_starting'
          : action === 'stop'
            ? 'instances_quick_stopping'
            : 'instances_quick_killing';
      setInstanceMsgTimed(t(msgKey, name), false, 5000);
      await reload();
      triggerBurstRefresh();
    },
    [rows, getEffectiveStatus, setStatusOverride, reload, triggerBurstRefresh, setInstanceMsg, setInstanceMsgTimed, t],
  );

  const listStartableInstances = useCallback(() => {
    return rows.filter((it) => {
      const s = getEffectiveStatus(it);
      if (['running', 'starting', 'stopping'].includes(s)) return false;
      if (s === 'maintenance' || !!it.maintenanceLock) return false;
      if (it.modJobRunning) return false;
      return true;
    });
  }, [rows, getEffectiveStatus]);

  const canStartInstance = useCallback(async (instanceId: string): Promise<boolean> => {
    const iid = String(instanceId || '').trim();
    if (!iid) return false;
    const qs = new URLSearchParams({ instance_id: iid });
    const cfg = await api<{ save?: string; latest_label?: string }>(`/api/config/server?${qs}`);
    const savesResp = await api<{ saves?: { name?: string }[] }>(`/api/saves?${qs}`);
    const savesList = Array.isArray(savesResp?.saves) ? savesResp.saves : [];
    const latestLabel = cfg.latest_label || 'latest';
    const saveSetting = String(cfg.save || '').trim() || latestLabel;
    const wantsLatest = saveSetting === latestLabel || saveSetting.toLowerCase() === 'latest';
    if (!savesList.length) return false;
    if (!wantsLatest) {
      return savesList.some((r) => r && String(r.name || '') === saveSetting);
    }
    return true;
  }, []);

  const startAllRunning = useCallback(async () => {
    const startable = listStartableInstances();
    if (!startable.length) {
      setInstanceMsgTimed(t('instances_start_all_none'), false, 3000);
      return;
    }
    let started = 0;
    let failed = 0;
    for (const it of startable) {
      const iid = String(it.id || '');
      const nm = String(it.name || iid);
      try {
        if (isGamePortBusyByAnotherInstance(rows, iid, it.port, getEffectiveStatus)) {
          failed += 1;
          continue;
        }
        if (!(await canStartInstance(iid))) {
          failed += 1;
          continue;
        }
        setInstanceMsgTimed(t('instances_quick_starting', nm), false, 2200);
        setStatusOverride(iid, 'starting', 9000);
        const r = await api<{ ok?: boolean; error?: string }>('/api/server/start', {
          method: 'POST',
          body: JSON.stringify({ instance_id: iid }),
        });
        if (r?.ok === false) throw new Error(String(r.error || 'start_failed'));
        started += 1;
      } catch {
        failed += 1;
      }
    }
    await reload();
    triggerBurstRefresh();
    if (!failed) setInstanceMsgTimed(t('instances_start_all_done', started), false, 4000);
    else setInstanceMsgTimed(t('instances_start_all_partial', started, failed), true, 6000);
  }, [
    rows,
    listStartableInstances,
    getEffectiveStatus,
    canStartInstance,
    setStatusOverride,
    reload,
    triggerBurstRefresh,
    setInstanceMsgTimed,
    t,
  ]);

  const startAll = useCallback((): Promise<void> => {
    const startable = listStartableInstances();
    if (!startable.length) {
      return startAllRunning();
    }
    return new Promise((resolve, reject) => {
      modals.openConfirmModal({
        title: t('instances_start_all_confirm_title'),
        children: t('instances_start_all_confirm_msg', startable.length),
        labels: { confirm: t('instances_start_all_btn'), cancel: t('cancel') },
        confirmProps: { className: 'btn btn--primary' },
        onConfirm: () => {
          void startAllRunning().then(resolve).catch(reject);
        },
        onCancel: () => resolve(),
      });
    });
  }, [listStartableInstances, startAllRunning, t]);

  const stopAllRunning = useCallback(async () => {
    const running = rows.filter((it) =>
      ['running', 'starting', 'stopping'].includes(String(it.status || '')),
    );
    if (!running.length) {
      setInstanceMsgTimed(t('instances_stop_all_none'), false, 3000);
      return;
    }
    let stopped = 0;
    let failed = 0;
    for (const it of running) {
      const iid = String(it.id || '');
      const nm = String(it.name || iid);
      try {
        setInstanceMsgTimed(t('instances_quick_stopping', nm), false, 2200);
        setStatusOverride(iid, 'stopping', 9000);
        const r = await api<{ ok?: boolean; error?: string }>('/api/server/stop', {
          method: 'POST',
          body: JSON.stringify({ instance_id: iid }),
        });
        if (r?.ok === false) throw new Error(String(r.error || 'stop_failed'));
        stopped += 1;
      } catch {
        failed += 1;
      }
    }
    await reload();
    triggerBurstRefresh();
    if (!failed) setInstanceMsgTimed(t('instances_stop_all_done', stopped), false, 4000);
    else setInstanceMsgTimed(t('instances_stop_all_partial', stopped, failed), true, 6000);
  }, [rows, setStatusOverride, reload, triggerBurstRefresh, setInstanceMsgTimed, t]);

  const stopAll = useCallback((): Promise<void> => {
    const running = rows.filter((it) =>
      ['running', 'starting', 'stopping'].includes(String(it.status || '')),
    );
    if (!running.length) {
      return stopAllRunning();
    }
    return new Promise((resolve, reject) => {
      modals.openConfirmModal({
        title: t('instances_stop_all_confirm_title'),
        children: t('instances_stop_all_confirm_msg', running.length),
        labels: { confirm: t('instances_stop_all_btn'), cancel: t('cancel') },
        confirmProps: { className: 'btn btn--danger' },
        onConfirm: () => {
          void stopAllRunning().then(resolve).catch(reject);
        },
        onCancel: () => resolve(),
      });
    });
  }, [rows, stopAllRunning, t]);

  const killAllRunning = useCallback(async () => {
    const running = rows.filter((it) =>
      ['running', 'starting', 'stopping'].includes(String(it.status || '')),
    );
    if (!running.length) {
      setInstanceMsgTimed(t('instances_kill_all_none'), false, 3000);
      return;
    }
    let killed = 0;
    let failed = 0;
    for (const it of running) {
      const iid = String(it.id || '');
      const nm = String(it.name || iid);
      try {
        setInstanceMsgTimed(t('instances_quick_killing', nm), false, 2200);
        setStatusOverride(iid, 'stopping', 7000);
        const r = await api<{ ok?: boolean; error?: string }>('/api/server/kill', {
          method: 'POST',
          body: JSON.stringify({ instance_id: iid }),
        });
        if (r?.ok === false) throw new Error(String(r.error || 'kill_failed'));
        killed += 1;
      } catch {
        failed += 1;
      }
    }
    await reload();
    triggerBurstRefresh();
    if (!failed) setInstanceMsgTimed(t('instances_kill_all_done', killed), false, 4000);
    else setInstanceMsgTimed(t('instances_kill_all_partial', killed, failed), true, 6000);
  }, [rows, setStatusOverride, reload, triggerBurstRefresh, setInstanceMsgTimed, t]);

  const killAll = useCallback((): Promise<void> => {
    const running = rows.filter((it) =>
      ['running', 'starting', 'stopping'].includes(String(it.status || '')),
    );
    if (!running.length) {
      return killAllRunning();
    }
    return new Promise((resolve, reject) => {
      modals.openConfirmModal({
        title: t('instances_kill_all_confirm_title'),
        children: t('instances_kill_all_confirm_msg', running.length),
        labels: { confirm: t('instances_kill_all_btn'), cancel: t('cancel') },
        confirmProps: { className: 'btn btn--danger' },
        onConfirm: () => {
          void killAllRunning().then(resolve).catch(reject);
        },
        onCancel: () => resolve(),
      });
    });
  }, [rows, killAllRunning, t]);

  const endMaintenanceAll = useCallback(async () => {
    const r = await api<{ ok?: boolean; error?: string; cleared?: number; failed?: unknown[] }>(
      '/api/maintenance/clear-manual',
      { method: 'POST', body: JSON.stringify({ all: true }) },
    );
    if (!r || r.ok === false) throw new Error(localizeInstanceError(r?.error || 'clear_manual_failed', t));
    const cleared = Number(r.cleared || 0);
    const failed = Array.isArray(r.failed) ? r.failed.length : 0;
    if (failed) setInstanceMsgTimed(t('instances_end_maintenance_partial', cleared, failed), true, 6000);
    else setInstanceMsgTimed(t('instances_end_maintenance_all_done', cleared), false, 5000);
    await reload();
    triggerBurstRefresh();
  }, [reload, triggerBurstRefresh, setInstanceMsgTimed, t]);

  const endMaintenanceOne = useCallback(
    async (instanceId: string) => {
      const iid = String(instanceId || '').trim();
      if (!iid) return;
      const r = await api<{ ok?: boolean; error?: string }>('/api/maintenance/clear-manual', {
        method: 'POST',
        body: JSON.stringify({ instance_id: iid }),
      });
      if (!r || r.ok === false) throw new Error(localizeInstanceError(r?.error || 'clear_manual_failed', t));
      const item = rows.find((x) => String(x.id) === iid);
      const name = String(item?.name || iid);
      setInstanceMsgTimed(t('instances_end_maintenance_done', name), false, 4000);
      await reload();
      triggerBurstRefresh();
    },
    [rows, reload, triggerBurstRefresh, setInstanceMsgTimed, t],
  );

  const removeInstance = useCallback(
    async (
      item: InstanceItem,
      opts: { deleteFromDisk?: boolean; deleteData?: boolean } = {},
    ) => {
      if (runningInstanceBlocked(item, getEffectiveStatus)) {
        setInstanceMsgTimed(t('instances_error_server_running'), true, 3500);
        return;
      }
      const deleteFromDisk = !!opts.deleteFromDisk;
      const deleteData = !!opts.deleteData;
      const id = String(item.id || '');
      const name = String(item.name || id);

      if (deleteFromDisk) {
        setDeleteProgressName(name);
        setDeleteProgressOpen(true);
      }

      try {
        const params = new URLSearchParams();
        if (deleteFromDisk) params.set('deleteFromDisk', '1');
        if (deleteData) params.set('deleteData', '1');
        const q = params.toString();
        const j = await api<{ ok?: boolean; error?: string }>(
          `/api/instances/${encodeURIComponent(id)}${q ? `?${q}` : ''}`,
          { method: 'DELETE' },
        );
        if (!j || j.ok === false) throw new Error(localizeInstanceError(j?.error || 'delete_failed', t));

        let msg = t('instances_detached_ok');
        if (deleteFromDisk && deleteData) msg = t('instances_deleted_full_ok');
        else if (deleteFromDisk) msg = t('instances_deleted_disk_ok');
        else if (deleteData) msg = t('instances_deleted_data_ok');
        setInstanceMsg(msg, false);
        await reload();
      } finally {
        if (deleteFromDisk) {
          setDeleteProgressOpen(false);
          setDeleteProgressName('');
        }
      }
    },
    [getEffectiveStatus, reload, setInstanceMsg, setInstanceMsgTimed, t],
  );

  const cloneInstance = useCallback(
    async (item: InstanceItem, cloneName: string, folderName?: string) => {
      if (runningInstanceBlocked(item, getEffectiveStatus)) {
        setInstanceMsgTimed(t('instances_error_server_running'), true, 3500);
        return;
      }
      const payload: Record<string, string> = { name: cloneName };
      if (folderName?.trim()) payload.folderName = folderName.trim();
      const j = await api<{ ok?: boolean; error?: string }>(
        `/api/instances/${encodeURIComponent(String(item.id))}/clone`,
        { method: 'POST', body: JSON.stringify(payload) },
      );
      if (!j || j.ok === false) throw new Error(localizeInstanceError(j?.error || 'instance_clone_failed', t));
      setInstanceMsgTimed(t('instances_clone_done', cloneName), false, 4500);
      await reload();
    },
    [getEffectiveStatus, reload, setInstanceMsgTimed, t],
  );

  const handleError = useCallback(
    (e: unknown, sourceTitle?: string) => {
      const title = sourceTitle || instancesTitle;
      if (notifyNetworkFetchError(title, e, t)) return;
      const raw = e instanceof Error ? e.message : String(e);
      const text = localizeInstanceError(raw, t);
      notifyErr(title, text);
    },
    [instancesTitle, t],
  );

  return {
    rows,
    selectedId,
    loading: query.isLoading,
    dashboard,
    showEndMaintenanceAll,
    getEffectiveStatus,
    reload,
    selectInstance,
    quickAction,
    startAll,
    stopAll,
    killAll,
    endMaintenanceAll,
    endMaintenanceOne,
    removeInstance,
    cloneInstance,
    deleteProgressOpen,
    deleteProgressName,
    handleError,
    setInstanceMsg,
    setInstanceMsgTimed,
  };
}
