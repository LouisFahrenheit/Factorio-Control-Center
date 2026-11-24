import { useCallback, useState } from 'react';
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

export type ProgramLogKind = 'web' | 'maintenance' | 'audit';

function programLogTitleKey(kind: ProgramLogKind): string {
  if (kind === 'web') return 'program_log_web_history_title';
  if (kind === 'maintenance') return 'program_log_maintenance_history_title';
  return 'program_log_audit_history_title';
}

function programLogDisabledKey(kind: ProgramLogKind): string {
  if (kind === 'web') return 'program_log_web_history_disabled';
  if (kind === 'maintenance') return 'program_log_maintenance_history_disabled';
  return 'program_log_audit_history_disabled';
}

export function useProgramLogHistory(
  t: (key: string, ...args: (string | number)[]) => string,
) {
  const [kind, setKind] = useState<ProgramLogKind>('web');
  const core = useLogHistoryCore(t, true);
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

  const modalTitle = t(programLogTitleKey(kind));

  const close = useCallback(() => {
    setOpen(false);
    resetAllState();
  }, [resetAllState, setOpen]);

  const applyHistoryResponse = useCallback(
    (logKind: ProgramLogKind, j: LogHistoryApiResponse, fullLoad: boolean) => {
      const disabledKey = programLogDisabledKey(logKind);
      const metaHint: string[] = [];
      if (j.program_log_disabled) {
        metaHint.push(t(disabledKey));
        setRawLines([]);
        setCanLoadFull(false);
      } else {
        const lines = Array.isArray(j.lines) ? j.lines.map(String) : [];
        if (j.file_missing) metaHint.push(t('program_log_history_missing'));
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
    async (logKind: ProgramLogKind, full: boolean) => {
      const qs = new URLSearchParams({
        kind: logKind,
        tail: String(LOG_HISTORY_TAIL_LINES),
      });
      if (full) qs.set('full', '1');
      const j = await api<LogHistoryApiResponse>(`/api/logs/program?${qs}`);
      if (j.ok === false) {
        if (j.error === 'log_file_too_large') {
          throw new Error(`log_file_too_large:${j.file_bytes || 0}`);
        }
        throw new Error(j.error || 'error');
      }
      return j;
    },
    [],
  );

  const openDialog = useCallback(
    async (logKind: ProgramLogKind) => {
      resetAllState();
      setKind(logKind);
      setOpen(true);
      setLoading(true);
      const titleKey = programLogTitleKey(logKind);
      try {
        const j = await fetchHistory(logKind, false);
        applyHistoryResponse(logKind, j, false);
      } catch (e: unknown) {
        const msg = inlineApiErrorMessage(e, t, t(titleKey));
        setErrorText(msg);
        setLoadOk(false);
      } finally {
        setLoading(false);
      }
    },
    [
      applyHistoryResponse,
      fetchHistory,
      resetAllState,
      setErrorText,
      setLoadOk,
      setLoading,
      setOpen,
      t,
    ],
  );

  const loadFullFile = useCallback(async () => {
    if (!loadOk || loadFullBusy) return;
    setLoadFullBusy(true);
    resetFindSession();
    const titleKey = programLogTitleKey(kind);
    try {
      const j = await fetchHistory(kind, true);
      applyHistoryResponse(kind, j, true);
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
      setHint(inlineApiErrorMessage(e, t, t(titleKey)));
    } finally {
      setLoadFullBusy(false);
    }
  }, [
    applyHistoryResponse,
    fetchHistory,
    kind,
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
    modalTitle,
    openDialog,
    close,
    scheduleFilterRefresh,
    runFindStep,
    resetFindSession,
  };
}

export type ProgramLogHistoryApi = ReturnType<typeof useProgramLogHistory>;
