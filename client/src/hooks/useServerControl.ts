import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { isGamePortBusyByAnotherInstance, localizeInstanceError } from '../lib/instanceUtils';
import {
  isNetworkConfigValid,
  resolveGameBindIp,
  validateGameBindIp,
  validateGamePort,
} from '../lib/networkValidation';
import { feedbackMsg } from '../lib/apiFeedback';
import { modConfirm } from '../lib/modErrorUtils';
import { notifyApiError, notifyNetworkFetchError } from '../lib/networkErrors';
import { notifyErr, notifyOk, notifyWarn } from '../lib/notify';
import { resolveStatusKind, type PanelStatus } from '../types/panel';
import type { InstanceItem } from '../types/instance';
import { useSocketLogLines } from './useSocket';
import { isSocketConnected } from '../api/socket';

interface SaveRow {
  name?: string;
}

export function useServerControl(
  enabled: boolean,
  status: PanelStatus | null | undefined,
  instances: InstanceItem[],
  selectedId: string,
  t: (key: string, ...args: (string | number)[]) => string,
) {
  const qc = useQueryClient();
  const [ip, setIp] = useState('0.0.0.0');
  const [port, setPort] = useState('34197');
  const [save, setSave] = useState('latest');
  const [logLines, setLogLines] = useState<string[]>([]);
  const saveTimerRef = useRef<number | null>(null);
  const logSeqRef = useRef(0);
  const statusStableSinceRef = useRef(Date.now());
  const prevKindRef = useRef<string>('');

  const lastLoadedIdRef = useRef<string>('');

  const configQuery = useQuery({
    queryKey: ['config', 'server', selectedId],
    queryFn: () => {
      const qs = selectedId ? `?instance_id=${encodeURIComponent(selectedId)}` : '';
      return api<{ ip?: string; port?: string; save?: string; latest_label?: string }>(`/api/config/server${qs}`);
    },
    enabled: enabled && !!selectedId,
  });

  const savesQuery = useQuery({
    queryKey: ['saves', selectedId],
    queryFn: async () => {
      try {
        const qs = selectedId ? `?instance_id=${encodeURIComponent(selectedId)}` : '';
        return await api<{ saves?: SaveRow[]; ok?: boolean; error?: string }>(`/api/saves${qs}`);
      } catch {
        return { saves: [] as SaveRow[] };
      }
    },
    enabled: enabled && !!selectedId,
  });

  const latestLabel = configQuery.data?.latest_label || 'latest';
  const saves = savesQuery.data?.saves || [];
  const kind = resolveStatusKind(status);
  const running = kind === 'running';
  const busy = running || kind === 'starting' || kind === 'stopping';
  const maintLocked = kind === 'maintenance';
  const modJobRunning = !!status?.mod_job_running;

  useEffect(() => {
    if (prevKindRef.current !== kind) {
      prevKindRef.current = kind;
      statusStableSinceRef.current = Date.now();
    }
  }, [kind]);

  const inst = instances.find((x) => String(x.id) === selectedId);
  const cfg = configQuery.data;

  // Keep launch save in sync when instances or config query updates
  const currentLaunchSave = inst?.launchSave || cfg?.save || latestLabel;
  useEffect(() => {
    if (currentLaunchSave) {
      setSave(String(currentLaunchSave));
    }
  }, [currentLaunchSave]);

  useEffect(() => {
    if (!selectedId) return;

    // Re-initialize network state only on instance change or initial data load
    if (lastLoadedIdRef.current !== selectedId || (!ip && !port)) {
      if (cfg || inst) {
        lastLoadedIdRef.current = selectedId;
        const nextIp = cfg?.ip ? String(cfg.ip).trim() : inst?.ip ? String(inst.ip).trim() : '0.0.0.0';
        const nextPort = cfg?.port ? String(cfg.port).trim() : inst?.port ? String(inst.port).trim() : '34197';
        setIp(nextIp || '0.0.0.0');
        setPort(nextPort || '34197');
      }
    }
  }, [cfg, inst, selectedId, ip, port]);

  const refreshLogs = useCallback(async () => {
    if (!enabled || !selectedId) return;
    const seq = ++logSeqRef.current;
    try {
      const qs = new URLSearchParams({ tail: '500', instance_id: selectedId });
      const j = await api<{ lines?: string[]; instance_log_disabled?: boolean }>(`/api/logs?${qs}`);
      if (seq !== logSeqRef.current) return;
      if (j.instance_log_disabled) {
        setLogLines([t('server_log_live_disabled')]);
        return;
      }
      setLogLines(Array.isArray(j.lines) ? j.lines.map(String) : []);
    } catch (e) {
      if (seq !== logSeqRef.current) return;
      if (notifyNetworkFetchError(t('console_label'), e, t)) return;
      setLogLines([String(e instanceof Error ? e.message : e)]);
    }
  }, [enabled, selectedId, t]);

  // Append a single log line received via WebSocket
  const appendWsLogLine = useCallback((line: string) => {
    setLogLines((prev) => {
      const next = [...prev, line];
      // Keep only last 500 lines to avoid memory bloat
      return next.length > 500 ? next.slice(-500) : next;
    });
  }, []);

  // Subscribe to WS log_line events
  useSocketLogLines(enabled, appendWsLogLine);

  // Initial load + fallback polling (reduced rate when WS is active)
  useEffect(() => {
    if (!enabled) return;
    void refreshLogs();

    const logPollMs = (): number => {
      // If WebSocket is connected, poll much less frequently (just as a safety net)
      if (isSocketConnected()) return 30_000;
      // Original polling logic when WS is not available
      if (kind === 'starting' || kind === 'stopping') return 450;
      if (kind === 'stopped' || kind === 'error' || kind === 'maintenance' || kind === 'maintenance_manual') {
        return 10_000;
      }
      if (kind === 'running') {
        return Date.now() - statusStableSinceRef.current >= 5000 ? 10_000 : 450;
      }
      return 10_000;
    };

    let timer: number | undefined;
    const schedule = () => {
      timer = window.setTimeout(() => {
        void refreshLogs().finally(schedule);
      }, logPollMs());
    };
    schedule();
    return () => {
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [enabled, kind, refreshLogs]);

  const saveNetworkConfig = useCallback(
    async (targetIp?: string, targetPort?: string) => {
      const curIp = targetIp !== undefined ? targetIp : ip;
      const curPort = targetPort !== undefined ? targetPort : port;
      if (!isNetworkConfigValid(curIp, curPort)) return;
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      try {
        const j = await api<{ ok?: boolean; error?: string }>('/api/config/server', {
          method: 'PUT',
          body: JSON.stringify({
            instance_id: selectedId || undefined,
            ip: resolveGameBindIp(curIp),
            port: curPort.trim(),
          }),
        });
        if (j?.ok === false) {
          notifyErr(t('save_btn'), localizeInstanceError(j.error || 'error', t));
        } else {
          await Promise.all([
            qc.invalidateQueries({ queryKey: ['instances'] }),
            qc.invalidateQueries({ queryKey: ['config', 'server', selectedId] }),
          ]);
        }
      } catch (e) {
        notifyApiError(t('save_btn'), e, t);
      }
    },
    [ip, port, selectedId, qc, t],
  );

  const scheduleNetworkSave = useCallback(
    (targetIp?: string, targetPort?: string) => {
      const curIp = targetIp !== undefined ? targetIp : ip;
      const curPort = targetPort !== undefined ? targetPort : port;
      if (!isNetworkConfigValid(curIp, curPort)) return;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        void saveNetworkConfig(curIp, curPort);
      }, 1000);
    },
    [ip, port, saveNetworkConfig],
  );

  const saveStartupConfig = useCallback(
    async (targetIp?: string, targetPort?: string, targetSave?: string) => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      const curIp = targetIp !== undefined ? targetIp : ip;
      const curPort = targetPort !== undefined ? targetPort : port;
      const curSave = targetSave !== undefined ? targetSave : save;
      const res = await api<{ ok?: boolean; error?: string }>('/api/config/server', {
        method: 'PUT',
        body: JSON.stringify({
          instance_id: selectedId || undefined,
          ip: resolveGameBindIp(curIp),
          port: curPort.trim(),
          save: curSave,
        }),
      });
      if (res?.ok !== false) {
        await Promise.all([
          qc.invalidateQueries({ queryKey: ['instances'] }),
          qc.invalidateQueries({ queryKey: ['config', 'server', selectedId] }),
        ]);
      }
      return res;
    },
    [ip, port, save, selectedId, qc],
  );

  const getEffectiveStatus = useCallback((item: InstanceItem) => String(item.status || ''), []);

  const instanceName = useMemo(() => {
    const inst = instances.find((x) => String(x.id) === selectedId);
    return String(inst?.name || selectedId || '').trim();
  }, [instances, selectedId]);

  const start = useCallback(async () => {
    const ipErr = validateGameBindIp(ip);
    const portErr = validateGamePort(port);
    if (ipErr || portErr) {
      const msg =
        ipErr === 'invalid_ip'
          ? t('control_invalid_ip')
          : t('instances_error_invalid_port');
      notifyErr(t('start_btn'), msg);
      return;
    }
    if (isGamePortBusyByAnotherInstance(instances, selectedId, port, getEffectiveStatus)) {
      notifyErr(t('start_btn'), localizeInstanceError('port_in_use', t));
      return;
    }
    if (modJobRunning) {
      notifyWarn(t('start_btn'), t('mod_job_running_block_start'));
      return;
    }
    if (!saves.length && (save === latestLabel || save === 'latest')) {
      notifyWarn(t('cannot_start_no_save'));
      return;
    }
    const cfgResp = await saveStartupConfig();
    if (cfgResp?.ok === false) throw new Error(localizeInstanceError(cfgResp.error || 'save_failed', t));
    const r = await api<{ ok?: boolean; error?: string }>('/api/server/start', {
      method: 'POST',
      body: JSON.stringify({ instance_id: selectedId || undefined }),
    });
    if (r?.ok === false) throw new Error(String(r.error || 'start_failed'));
    notifyOk(t('start_btn'), t('instances_quick_starting', instanceName || '?'));
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['panel', 'status'] }),
      qc.invalidateQueries({ queryKey: ['instances'] }),
      qc.invalidateQueries({ queryKey: ['config', 'server', selectedId] }),
    ]);
  }, [instances, selectedId, ip, port, save, latestLabel, saves.length, saveStartupConfig, qc, t, getEffectiveStatus, instanceName, modJobRunning]);

  const stop = useCallback(async () => {
    const r = await api<{ ok?: boolean; error?: string }>('/api/server/stop', {
      method: 'POST',
      body: JSON.stringify({ instance_id: selectedId || undefined }),
    });
    if (r?.ok === false) throw new Error(String(r.error || 'stop_failed'));
    notifyOk(t('stop_btn'), t('instances_quick_stopping', instanceName || '?'));
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['panel', 'status'] }),
      qc.invalidateQueries({ queryKey: ['instances'] }),
      qc.invalidateQueries({ queryKey: ['config', 'server', selectedId] }),
    ]);
  }, [qc, selectedId, instanceName, t]);

  const kill = useCallback(async () => {
    if (!(await modConfirm(t('confirm_kill_msg'), t))) return;
    const r = await api<{ ok?: boolean; error?: string }>('/api/server/kill', {
      method: 'POST',
      body: JSON.stringify({ instance_id: selectedId || undefined }),
    });
    if (r?.ok === false) throw new Error(String(r.error || 'kill_failed'));
    notifyOk(t('kill_btn'), t('instances_quick_killing', instanceName || '?'));
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['panel', 'status'] }),
      qc.invalidateQueries({ queryKey: ['instances'] }),
      qc.invalidateQueries({ queryKey: ['config', 'server', selectedId] }),
    ]);
  }, [qc, selectedId, t, instanceName]);

  const saveGame = useCallback(async () => {
    const r = await api<{ ok?: boolean; error?: string }>('/api/server/save', { method: 'POST' });
    if (r?.ok === false) throw new Error(String(r.error || 'save_failed'));
    notifyOk(t('save_btn'), t('updated_successfully'));
  }, [t]);

  const backup = useCallback(async () => {
    const r = await api<{ ok?: boolean; error?: string }>('/api/server/backup', { method: 'POST' });
    if (r?.ok === false) throw new Error(String(r.error || 'backup_failed'));
    notifyOk(t('backup_btn'), t('updated_successfully'));
  }, [t]);

  const restart = useCallback(async () => {
    try {
      const cfgResp = await saveStartupConfig();
      if (cfgResp?.ok === false) throw new Error(localizeInstanceError(cfgResp.error || 'save_failed', t));
      const r = await api<{ ok?: boolean; error?: string }>('/api/server/restart', {
        method: 'POST',
        body: JSON.stringify({ instance_id: selectedId || undefined }),
      });
      if (r?.ok === false) throw new Error(String(r.error || 'restart_failed'));
      notifyOk(t('restart_server_btn'), t('restart_server_done'));
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['panel', 'status'] }),
        qc.invalidateQueries({ queryKey: ['instances'] }),
        qc.invalidateQueries({ queryKey: ['config', 'server', selectedId] }),
      ]);
    } catch (e) {
      notifyApiError(t('restart_server_btn'), e, t);
    }
  }, [qc, selectedId, saveStartupConfig, t]);

  const sendRcon = useCallback(
    async (command: string) => {
      const rconTitle = t('console_label');
      if (!running) {
        feedbackMsg(rconTitle, t('server_not_running_msg'), true);
        return;
      }
      const text = command.trim();
      if (!text) return;
      try {
        const r = await api<{ ok?: boolean; error?: string; response?: string; output?: string }>('/api/rcon', {
          method: 'POST',
          body: JSON.stringify({ command: text, source: 'console' }),
        });
        void qc.invalidateQueries({ queryKey: ['players'] });
        if (r?.ok === false) {
          feedbackMsg(rconTitle, `${t('error_title')}: ${r.error || 'rcon_failed'}`, true);
        } else {
          feedbackMsg(rconTitle, r.response || r.output || 'OK');
        }
      } catch (e) {
        feedbackMsg(rconTitle, e instanceof Error ? e.message : String(e), true, false, t);
      }
    },
    [running, t, qc],
  );

  const startStopLabel = running || kind === 'stopping' ? t('stop_btn') : t('start_btn');
  const showStopAction = running || kind === 'stopping';
  const startStopDisabled =
    maintLocked ||
    kind === 'starting' ||
    kind === 'stopping' ||
    (!showStopAction && modJobRunning) ||
    (!showStopAction && !isNetworkConfigValid(ip, port));

  const ipError = validateGameBindIp(ip);
  const portError = validateGamePort(port);
  const networkValid = ipError === null && portError === null;

  const toggleStartStop = useCallback(async () => {
    try {
      if (running || kind === 'stopping') await stop();
      else await start();
    } catch (e) {
      notifyApiError(startStopLabel, e, t);
    }
  }, [running, kind, stop, start, startStopLabel]);

  return {
    ip,
    setIp,
    port,
    setPort,
    ipError,
    portError,
    networkValid,
    save,
    setSave,
    saves,
    latestLabel,
    busy,
    running,
    maintLocked,
    modJobRunning,
    kind,
    startStopLabel,
    startStopDisabled,
    logLines,
    scheduleNetworkSave,
    saveNetworkConfig,
    saveStartupConfig,
    toggleStartStop,
    kill,
    saveGame,
    backup,
    restart,
    sendRcon,
    reloadSaves: () => savesQuery.refetch(),
  };
}
