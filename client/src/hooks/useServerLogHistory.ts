import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { inlineApiErrorMessage } from '../lib/networkErrors';
import {
  LOG_HISTORY_TAIL_LINES,
  logHistoryCanLoadFull,
  logHistoryFileSizeMb,
  parseLogFileTooLargeError,
  type LogHistoryApiResponse,
} from '../lib/logHistoryUtils';
import { escapeHtmlText, formatManagerLogHtml, highlightLogFindInElement } from '../lib/logUtils';

export function useServerLogHistory(
  instanceId: string,
  t: (key: string, ...args: (string | number)[]) => string,
) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadOk, setLoadOk] = useState(false);
  const [loadFullBusy, setLoadFullBusy] = useState(false);
  const [canLoadFull, setCanLoadFull] = useState(false);
  const [rawLines, setRawLines] = useState<string[]>([]);
  const [hint, setHint] = useState('');
  const [errorText, setErrorText] = useState('');
  const [filter, setFilter] = useState('');
  const [find, setFind] = useState('');
  const [findSessionQuery, setFindSessionQuery] = useState('');
  const [findMarkIndex, setFindMarkIndex] = useState(0);
  const [findMarkCount, setFindMarkCount] = useState(0);
  const filterTimerRef = useRef<number | null>(null);
  const preRef = useRef<HTMLPreElement | null>(null);
  const findSessionRef = useRef({ query: '', index: 0 });

  const filteredLines = useMemo(() => {
    const fq = filter.trim();
    if (!fq) return rawLines;
    const fql = fq.toLowerCase();
    return rawLines.filter((ln) => String(ln).toLowerCase().includes(fql));
  }, [filter, rawLines]);

  const logFormatOptions = useMemo(() => ({ reformatTimestamps: false }), []);

  const bodyHtml = useMemo(() => {
    if (!loadOk) return escapeHtmlText(loading ? t('server_log_history_loading') : errorText);
    return formatManagerLogHtml(filteredLines, logFormatOptions);
  }, [errorText, filteredLines, loadOk, loading, logFormatOptions, t]);

  const searchMeta = useMemo(() => {
    if (!loadOk) return '';
    const total = rawLines.length;
    const fq = filter.trim();
    if (!fq) return t('server_log_history_filter_all', total);
    if (!filteredLines.length) return t('server_log_history_filter_none');
    return t('server_log_history_filter_showing', filteredLines.length, total);
  }, [filter, filteredLines.length, loadOk, rawLines.length, t]);

  const resetFindSession = useCallback(() => {
    findSessionRef.current = { query: '', index: 0 };
    setFindSessionQuery('');
    setFindMarkIndex(0);
    setFindMarkCount(0);
  }, []);

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
        } else {
          if (j.truncated || j.line_capped) metaHint.push(t('server_log_history_truncated_hint'));
        }
        setRawLines(lines);
        setCanLoadFull(logHistoryCanLoadFull(j));
      }
      setHint(metaHint.join(' '));
      setLoadOk(true);
      setErrorText('');
    },
    [t],
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
    setLoading(false);
    setLoadFullBusy(false);
    setLoadOk(false);
    setCanLoadFull(false);
    setRawLines([]);
    setHint('');
    setErrorText('');
    setFilter('');
    setFind('');
    resetFindSession();
  }, [resetFindSession]);

  const openDialog = useCallback(async () => {
    setOpen(true);
    setLoading(true);
    setLoadOk(false);
    setLoadFullBusy(false);
    setCanLoadFull(false);
    setRawLines([]);
    setHint('');
    setErrorText('');
    setFilter('');
    setFind('');
    resetFindSession();
    try {
      const j = await fetchHistory(false);
      applyHistoryResponse(j, false);
    } catch (e) {
      const msg = inlineApiErrorMessage(e, t, t('server_log_history_title'));
      setErrorText(msg);
      setLoadOk(false);
    } finally {
      setLoading(false);
    }
  }, [applyHistoryResponse, fetchHistory, resetFindSession, t]);

  const loadFullFile = useCallback(async () => {
    if (!loadOk || loadFullBusy) return;
    setLoadFullBusy(true);
    resetFindSession();
    try {
      const j = await fetchHistory(true);
      applyHistoryResponse(j, true);
    } catch (e) {
      const tooLargeBytes = parseLogFileTooLargeError(e);
      if (tooLargeBytes != null) {
        setHint(t('server_log_history_load_full_too_large', logHistoryFileSizeMb(tooLargeBytes)));
        return;
      }
      setHint(inlineApiErrorMessage(e, t, t('server_log_history_title')));
    } finally {
      setLoadFullBusy(false);
    }
  }, [applyHistoryResponse, fetchHistory, loadFullBusy, loadOk, resetFindSession, t]);

  const scheduleFilterRefresh = useCallback(() => {
    if (filterTimerRef.current) window.clearTimeout(filterTimerRef.current);
    filterTimerRef.current = window.setTimeout(() => {
      filterTimerRef.current = null;
      resetFindSession();
    }, 120);
  }, [resetFindSession]);

  const runFindStep = useCallback(() => {
    const pre = preRef.current;
    if (!pre || !loadOk) return;
    const q = find.trim();
    if (!q) {
      resetFindSession();
      pre.scrollTop = pre.scrollHeight;
      return;
    }
    pre.innerHTML = formatManagerLogHtml(filteredLines, logFormatOptions);
    highlightLogFindInElement(pre, q);
    const marks = pre.querySelectorAll('.log-search-highlight');
    const count = marks.length;
    if (!count) {
      resetFindSession();
      pre.scrollTop = pre.scrollHeight;
      return;
    }
    const session = findSessionRef.current;
    if (session.query !== q || session.index >= count) {
      session.query = q;
      session.index = 0;
    } else {
      session.index = (session.index + 1) % count;
    }
    setFindSessionQuery(q);
    setFindMarkIndex(session.index);
    setFindMarkCount(count);
    const el = marks[session.index] as HTMLElement;
    el?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }, [filteredLines, find, loadOk, logFormatOptions, resetFindSession]);

  useEffect(() => {
    if (!open || !loadOk) return;
    const pre = preRef.current;
    if (!pre) return;
    pre.innerHTML = bodyHtml;
    if (!find.trim()) {
      pre.scrollTop = pre.scrollHeight;
    }
  }, [bodyHtml, find, loadOk, open]);

  useEffect(() => {
    return () => {
      if (filterTimerRef.current) window.clearTimeout(filterTimerRef.current);
    };
  }, []);

  const findButtonLabel =
    findSessionQuery && find.trim() === findSessionQuery && findMarkCount > 0
      ? t('server_log_history_find_next_match', findMarkIndex + 1, findMarkCount)
      : t('server_log_history_find_btn');

  return {
    open,
    loading,
    loadOk,
    loadFullBusy,
    canLoadFull,
    loadFullFile,
    hint,
    filter,
    setFilter,
    find,
    setFind,
    searchMeta,
    bodyHtml,
    preRef,
    findButtonLabel,
    openDialog,
    close,
    scheduleFilterRefresh,
    runFindStep,
    resetFindSession,
  };
}

export type ServerLogHistoryApi = ReturnType<typeof useServerLogHistory>;
