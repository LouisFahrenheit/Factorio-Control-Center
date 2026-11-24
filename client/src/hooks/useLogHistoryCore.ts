import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  findLogHistoryMatches,
  prepareLogHistoryEntries,
  type LogHistorySearchResult,
  type PreparedLogEntry,
} from '../lib/logUtils';

export interface LogScrollTarget {
  seq: number;
  mode: 'bottom' | 'line';
  lineIndex?: number;
}

const EMPTY_SEARCH: LogHistorySearchResult = {
  query: '',
  matches: [],
  lineRanges: new Map(),
};

export function useLogHistoryCore(
  t: (key: string, ...args: (string | number)[]) => string,
  colorize: boolean,
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
  const [debouncedFilter, setDebouncedFilter] = useState('');
  const [find, setFind] = useState('');
  const [searchResult, setSearchResult] =
    useState<LogHistorySearchResult>(EMPTY_SEARCH);
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1);
  const [scrollTarget, setScrollTarget] = useState<LogScrollTarget>({
    seq: 0,
    mode: 'bottom',
  });

  const filterTimerRef = useRef<number | null>(null);
  const scrollSeqRef = useRef(0);
  const lastSearchEntriesRef = useRef<ReadonlyArray<PreparedLogEntry> | null>(
    null,
  );

  const requestScroll = useCallback(
    (mode: 'bottom' | 'line', lineIndex?: number) => {
      scrollSeqRef.current += 1;
      setScrollTarget({ seq: scrollSeqRef.current, mode, lineIndex });
    },
    [],
  );

  const resetFindSession = useCallback(() => {
    lastSearchEntriesRef.current = null;
    setSearchResult(EMPTY_SEARCH);
    setActiveMatchIndex(-1);
  }, []);

  const preparedEntries = useMemo(
    () => prepareLogHistoryEntries(rawLines, colorize),
    [colorize, rawLines],
  );

  const filteredEntries = useMemo(() => {
    const fq = debouncedFilter.trim();
    if (!fq) return preparedEntries;
    const fql = fq.toLowerCase();
    return preparedEntries.filter((entry) => entry.rawLower.includes(fql));
  }, [debouncedFilter, preparedEntries]);

  const searchMeta = useMemo(() => {
    if (!loadOk) return '';
    const total = rawLines.length;
    const fq = debouncedFilter.trim();
    if (!fq) return t('server_log_history_filter_all', total);
    if (!filteredEntries.length) return t('server_log_history_filter_none');
    return t(
      'server_log_history_filter_showing',
      filteredEntries.length,
      total,
    );
  }, [debouncedFilter, filteredEntries.length, loadOk, rawLines.length, t]);

  const scheduleFilterRefresh = useCallback(() => {
    if (filterTimerRef.current) window.clearTimeout(filterTimerRef.current);
    filterTimerRef.current = window.setTimeout(() => {
      filterTimerRef.current = null;
      setFilter((current) => {
        setDebouncedFilter(current);
        return current;
      });
      resetFindSession();
      requestScroll('bottom');
    }, 140);
  }, [requestScroll, resetFindSession]);

  const updateFilter = useCallback(
    (value: string) => {
      setFilter(value);
      if (!value.trim()) {
        if (filterTimerRef.current) {
          window.clearTimeout(filterTimerRef.current);
          filterTimerRef.current = null;
        }
        setDebouncedFilter('');
        resetFindSession();
        requestScroll('bottom');
      }
    },
    [requestScroll, resetFindSession],
  );

  const runFindStep = useCallback(
    (delta = 1) => {
      if (!loadOk) return;
      const q = find.trim();
      if (!q) {
        resetFindSession();
        requestScroll('bottom');
        return;
      }

      const canReuse =
        lastSearchEntriesRef.current === filteredEntries &&
        searchResult.query === q;

      let result = searchResult;
      let nextIdx = 0;

      if (!canReuse) {
        result = findLogHistoryMatches(filteredEntries, q);
        lastSearchEntriesRef.current = filteredEntries;
        setSearchResult(result);
        if (result.matches.length === 0) {
          setActiveMatchIndex(-1);
          return;
        }
        nextIdx = delta < 0 ? result.matches.length - 1 : 0;
      } else {
        const count = result.matches.length;
        if (count === 0) {
          setActiveMatchIndex(-1);
          return;
        }
        if (activeMatchIndex < 0 || activeMatchIndex >= count) {
          nextIdx = delta < 0 ? count - 1 : 0;
        } else {
          nextIdx = (activeMatchIndex + delta + count) % count;
        }
      }

      setActiveMatchIndex(nextIdx);
      const target = result.matches[nextIdx];
      if (target) {
        requestScroll('line', target.lineIndex);
      }
    },
    [
      activeMatchIndex,
      filteredEntries,
      find,
      loadOk,
      requestScroll,
      resetFindSession,
      searchResult,
    ],
  );

  const resetAllState = useCallback(() => {
    if (filterTimerRef.current) {
      window.clearTimeout(filterTimerRef.current);
      filterTimerRef.current = null;
    }
    setLoading(false);
    setLoadFullBusy(false);
    setLoadOk(false);
    setCanLoadFull(false);
    setRawLines([]);
    setHint('');
    setErrorText('');
    setFilter('');
    setDebouncedFilter('');
    setFind('');
    resetFindSession();
  }, [resetFindSession]);

  useEffect(() => {
    return () => {
      if (filterTimerRef.current) window.clearTimeout(filterTimerRef.current);
    };
  }, []);

  const trimmedFind = find.trim();
  const isCurrentFindActive = Boolean(
    trimmedFind && searchResult.query === trimmedFind,
  );
  const matchCount = isCurrentFindActive ? searchResult.matches.length : 0;

  let findButtonLabel = t('server_log_history_find_btn');
  if (isCurrentFindActive) {
    if (matchCount > 0 && activeMatchIndex >= 0) {
      findButtonLabel = t(
        'server_log_history_find_next_match',
        activeMatchIndex + 1,
        matchCount,
      );
    } else if (matchCount === 0) {
      findButtonLabel = `${t('server_log_history_find_btn')} (0)`;
    }
  }

  return {
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
    rawLines,
    setRawLines,
    hint,
    setHint,
    errorText,
    setErrorText,
    filter,
    setFilter: updateFilter,
    find,
    setFind,
    searchMeta,
    filteredEntries,
    lineRanges: isCurrentFindActive ? searchResult.lineRanges : undefined,
    activeMatchGlobalIndex: isCurrentFindActive ? activeMatchIndex : -1,
    scrollTarget,
    requestScroll,
    findButtonLabel,
    scheduleFilterRefresh,
    runFindStep,
    resetFindSession,
    resetAllState,
  };
}
