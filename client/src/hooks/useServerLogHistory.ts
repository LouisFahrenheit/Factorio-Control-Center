import { useCallback } from 'react';
import { api } from '../api/client';
import { inlineApiErrorMessage } from '../lib/networkErrors';
import {
  LOG_HISTORY_TAIL_LINES,
  logHistoryCanLoadFull,
  logHistoryFileSizeMb,
  parseLogFileTooLargeError,
  type LogHistoryApiResponse,
} from '../lib/logHistoryUtils';
import { useLogHistoryCore } from './useLogHistoryCore';

export interface ServerLogHistoryOptions {
  colorize?: boolean;
}

export function useServerLogHistory(
  instanceId: string,
  t: (key: string, ...args: (string | number)[]) => string,
  options?: ServerLogHistoryOptions,
) {
  const core = useLogHistoryCore(t, options?.colorize !== false);
  const {
    open,
    setOpen,
    loading,
    setLoading,
    loadOk,
    setLoadOk,
    loadFullBusy,
    setLoadFullBusy,
    canLoadFull,
    setCanLoadFull,
    setRawLines,
    hint,
    setHint,
    errorText,
    setErrorText,
    filter,
    setFilter,
    find,
    setFind,
    searchMeta,
    filteredEntries,
    lineRanges,
    activeMatchGlobalIndex,
    scrollTarget,
    requestScroll,
    findButtonLabel,
    scheduleFilterRefresh,
    runFindStep,
    resetFindSession,
    resetAllState,
  } = core;

  const applyHistoryResponse = useCallback(
    (j: LogHistoryApiResponse, fullLoad: boolean) => {
      const metaHint: string[] = [];
      if (j.instance_log_disabled) {
        metaHint.push(t('server_log_history_disabled'));
        setRawLines([]);
        setCanLoadFull(false);
      } else {
        const lines = Array.isArray(j.lines) ? j.lines.map(String) : [];
        if (j.file_missing) metaHint.push(t('server_log_history_missing'));
        if (fullLoad) {
          metaHint.push(t('server_log_history_load_full_done', lines.length));
        } else if (j.truncated || j.line_capped) {
          metaHint.push(t('server_log_history_truncated_hint'));
        }
        setRawLines(lines);
        setCanLoadFull(logHistoryCanLoadFull(j));
      }
      setHint(metaHint.join(' '));
      setLoadOk(true);
      setErrorText('');
      requestScroll('bottom');
    },
    [
      requestScroll,
      setCanLoadFull,
      setErrorText,
      setHint,
      setLoadOk,
      setRawLines,
      t,
    ],
  );

  const fetchHistory = useCallback(
    async (full: boolean) => {
      const qs = new URLSearchParams({ tail: String(LOG_HISTORY_TAIL_LINES) });
      if (full) qs.set('full', '1');
      const lid = String(instanceId || '').trim();
      if (lid) qs.set('instance_id', lid);
      const j = await api<LogHistoryApiResponse>(`/api/logs/history?${qs}`);
      if (j.ok === false) {
        if (j.error === 'log_file_too_large') {
          throw new Error(`log_file_too_large:${j.file_bytes || 0}`);
        }
        throw new Error(j.error || 'error');
      }
      return j;
    },
    [instanceId],
  );

  const close = useCallback(() => {
    setOpen(false);
    resetAllState();
  }, [resetAllState, setOpen]);

  const openDialog = useCallback(async () => {
    resetAllState();
    setOpen(true);
    setLoading(true);
    try {
      const j = await fetchHistory(false);
      applyHistoryResponse(j, false);
    } catch (e: unknown) {
      const msg = inlineApiErrorMessage(e, t, t('server_log_history_title'));
      setErrorText(msg);
      setLoadOk(false);
    } finally {
      setLoading(false);
    }
  }, [
    applyHistoryResponse,
    fetchHistory,
    resetAllState,
    setErrorText,
    setLoadOk,
    setLoading,
    setOpen,
    t,
  ]);

  const loadFullFile = useCallback(async () => {
    if (!loadOk || loadFullBusy) return;
    setLoadFullBusy(true);
    resetFindSession();
    try {
      const j = await fetchHistory(true);
      applyHistoryResponse(j, true);
    } catch (e: unknown) {
      const tooLargeBytes = parseLogFileTooLargeError(e);
      if (tooLargeBytes != null) {
        setHint(
          t(
            'server_log_history_load_full_too_large',
            logHistoryFileSizeMb(tooLargeBytes),
          ),
        );
        return;
      }
      setHint(inlineApiErrorMessage(e, t, t('server_log_history_title')));
    } finally {
      setLoadFullBusy(false);
    }
  }, [
    applyHistoryResponse,
    fetchHistory,
    loadFullBusy,
    loadOk,
    resetFindSession,
    setHint,
    setLoadFullBusy,
    t,
  ]);

  return {
    open,
    loading,
    loadOk,
    loadFullBusy,
    canLoadFull,
    loadFullFile,
    hint,
    errorText,
    filter,
    setFilter,
    find,
    setFind,
    searchMeta,
    filteredEntries,
    lineRanges,
    activeMatchGlobalIndex,
    scrollTarget,
    findButtonLabel,
    openDialog,
    close,
    scheduleFilterRefresh,
    runFindStep,
    resetFindSession,
  };
}

export type ServerLogHistoryApi = ReturnType<typeof useServerLogHistory>;
