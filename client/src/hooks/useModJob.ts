import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { mjLocalizeError } from '../lib/modErrorUtils';
import { notifyWarn } from '../lib/notify';
import type { ModJobStatus } from '../types/modJob';

export function useModJob(
  onComplete: () => void,
  t: (key: string, ...args: (string | number)[]) => string,
) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<ModJobStatus | null>(null);
  const [stopRequested, setStopRequested] = useState(false);
  const pollTimerRef = useRef<number | null>(null);
  const logCountRef = useRef(0);
  const cancelledToastRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const clearPoll = useCallback(() => {
    if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    clearPoll();
    setStatus(null);
    setStopRequested(false);
    cancelledToastRef.current = false;
    logCountRef.current = 0;
    onCompleteRef.current();
  }, [clearPoll]);

  const poll = useCallback(async () => {
    try {
      const s = await api<ModJobStatus>('/api/mods/job/status');
      setStatus(s);
      if (s?.phase === 'cancelled' && !cancelledToastRef.current) {
        cancelledToastRef.current = true;
        notifyWarn(t('mods_btn'), t('mod_job_stopped'));
      }
      if (!s?.running) clearPoll();
    } catch {
      /* keep polling */
    }
  }, [clearPoll, t]);

  const startPoll = useCallback(() => {
    clearPoll();
    pollTimerRef.current = window.setInterval(() => {
      void poll();
    }, 600);
    void poll();
  }, [clearPoll, poll]);

  const showError = useCallback(
    (msg: string) => {
      setStatus({
        running: false,
        phase: 'error',
        error: msg,
        log: [{ ts: Date.now() / 1000, level: 'error', text: msg }],
      });
    },
    [],
  );

  const openPreparing = useCallback(() => {
    clearPoll();
    setOpen(true);
    setStatus({ running: true, phase: 'preparing' });
    setStopRequested(false);
    cancelledToastRef.current = false;
    logCountRef.current = 0;
  }, [clearPoll]);

  const fail = useCallback(
    (msg: string) => {
      clearPoll();
      setOpen(true);
      showError(msg);
    },
    [clearPoll, showError],
  );

  const start = useCallback(
    async (endpoint: string, body: Record<string, unknown>) => {
      setOpen(true);
      setStatus((prev) =>
        prev?.running ? { ...prev, phase: 'preparing' } : { running: true, phase: 'preparing' },
      );
      setStopRequested(false);
      cancelledToastRef.current = false;
      logCountRef.current = 0;
      try {
        const j = await api<{ ok?: boolean; error?: string }>(endpoint, {
          method: 'POST',
          body: JSON.stringify(body || {}),
        });
        if (!j || !j.ok) {
          const raw = String(j?.error || '');
          if (raw === 'mod_job_already_running') {
            startPoll();
            return;
          }
          showError(mjLocalizeError('', undefined, raw, t));
          return;
        }
        startPoll();
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        showError(mjLocalizeError('', undefined, raw, t));
      }
    },
    [showError, startPoll, t],
  );

  const stop = useCallback(async () => {
    if (stopRequested) return;
    setStopRequested(true);
    try {
      await api('/api/mods/job/stop', { method: 'POST' });
    } catch {
      setStopRequested(false);
    }
  }, [stopRequested]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const s = await api<ModJobStatus>('/api/mods/job/status');
        if (cancelled || !s?.running) return;
        setOpen(true);
        setStatus(s);
        startPoll();
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [startPoll]);

  useEffect(() => {
    return () => clearPoll();
  }, [clearPoll]);

  return {
    open,
    status,
    stopRequested,
    logCountRef,
    openPreparing,
    fail,
    start,
    stop,
    close,
  };
}

export type ModJobApi = ReturnType<typeof useModJob>;
