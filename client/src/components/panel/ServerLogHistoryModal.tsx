import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { IconDownload, IconHistory, IconSearch } from '@tabler/icons-react';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import { AppIcon } from '../AppIcon';
import { SearchField } from '../SearchField';
import {
  ensurePreparedLogEntryHtml,
  FenwickHeightIndex,
  highlightLogHtmlRanges,
  type LogMatchRange,
  type PreparedLogEntry,
} from '../../lib/logUtils';
import type { LogScrollTarget } from '../../hooks/useLogHistoryCore';
import type { ServerLogHistoryApi } from '../../hooks/useServerLogHistory';
import type { ProgramLogHistoryApi } from '../../hooks/useProgramLogHistory';

const ESTIMATED_LINE_HEIGHT = 19;
const OVERSCAN_LINES = 30;

interface VirtualLogViewportProps {
  loadOk: boolean;
  loading: boolean;
  errorText: string;
  loadingLabel: string;
  entries: ReadonlyArray<PreparedLogEntry>;
  lineRanges?: Map<number, LogMatchRange[]>;
  activeMatchGlobalIndex: number;
  scrollTarget: LogScrollTarget;
}

function VirtualLogViewport({
  loadOk,
  loading,
  errorText,
  loadingLabel,
  entries,
  lineRanges,
  activeMatchGlobalIndex,
  scrollTarget,
}: VirtualLogViewportProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastWidthRef = useRef<number>(0);
  const appliedScrollSeqRef = useRef<number>(-1);
  const pendingBottomRef = useRef<boolean>(false);
  const pendingFocusMatchRef = useRef<boolean>(false);

  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(600);
  const [widthResetEpoch, setWidthResetEpoch] = useState(0);
  const [, setMeasureRevision] = useState(0);

  const heightIndex = useMemo(() => {
    void widthResetEpoch;
    return new FenwickHeightIndex(entries.length, ESTIMATED_LINE_HEIGHT);
  }, [entries, widthResetEpoch]);
  const totalCount = entries.length;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const updateSize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight || 600;
      setViewportHeight(h);
      if (lastWidthRef.current > 0 && Math.abs(w - lastWidthRef.current) > 2) {
        setWidthResetEpoch((e) => e + 1);
      }
      lastWidthRef.current = w;
    };
    updateSize();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(updateSize);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || !loadOk) return;
    if (appliedScrollSeqRef.current === scrollTarget.seq) return;
    appliedScrollSeqRef.current = scrollTarget.seq;

    if (heightIndex.length === 0) {
      el.scrollTop = 0;
      setScrollTop(0);
      return;
    }

    if (scrollTarget.mode === 'bottom') {
      const targetTop = Math.max(0, heightIndex.totalHeight - el.clientHeight);
      pendingBottomRef.current = true;
      el.scrollTop = targetTop;
      setScrollTop(targetTop);
      return;
    }

    if (scrollTarget.mode === 'line' && scrollTarget.lineIndex != null) {
      const lineIdx = Math.max(
        0,
        Math.min(heightIndex.length - 1, scrollTarget.lineIndex),
      );
      const lineTop = heightIndex.getOffsetTop(lineIdx);
      const lineH = heightIndex.getHeight(lineIdx);
      const targetTop = Math.max(
        0,
        lineTop - Math.max(0, (el.clientHeight - lineH) / 2),
      );
      pendingFocusMatchRef.current = true;
      el.scrollTop = targetTop;
      setScrollTop(targetTop);
    }
  }, [heightIndex, loadOk, scrollTarget]);

  const firstVisible =
    totalCount > 0 ? heightIndex.findIndexAtOffset(scrollTop) : 0;
  const lastVisible =
    totalCount > 0
      ? heightIndex.findIndexAtOffset(scrollTop + viewportHeight)
      : 0;
  const startIndex = Math.max(0, firstVisible - OVERSCAN_LINES);
  const endIndex = Math.min(totalCount, lastVisible + 1 + OVERSCAN_LINES);
  const topSpacerHeight = heightIndex.getOffsetTop(startIndex);
  const bottomSpacerHeight = Math.max(
    0,
    heightIndex.totalHeight - heightIndex.getOffsetTop(endIndex),
  );

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || !loadOk || totalCount === 0) return;
    const children = el.querySelectorAll<HTMLElement>('[data-log-line-idx]');
    let anyChanged = false;
    let deltaAboveViewport = 0;

    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      const lineIdx = Number(node.dataset.logLineIdx);
      if (!Number.isFinite(lineIdx)) continue;
      const h = node.offsetHeight;
      if (h <= 0) continue;
      const delta = heightIndex.setHeight(lineIdx, h);
      if (delta !== 0) {
        anyChanged = true;
        if (lineIdx < firstVisible) {
          deltaAboveViewport += delta;
        }
      }
    }

    if (pendingBottomRef.current) {
      pendingBottomRef.current = false;
      const bottomTop = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = bottomTop;
      setScrollTop(bottomTop);
      if (anyChanged) setMeasureRevision((r) => r + 1);
      return;
    }

    if (pendingFocusMatchRef.current) {
      pendingFocusMatchRef.current = false;
      if (anyChanged) setMeasureRevision((r) => r + 1);
      const activeMark = el.querySelector<HTMLElement>(
        '[data-active-log-match="1"]',
      );
      if (activeMark) {
        activeMark.scrollIntoView({ block: 'center', inline: 'nearest' });
        setScrollTop(el.scrollTop);
      }
      return;
    }

    if (deltaAboveViewport !== 0) {
      el.scrollTop += deltaAboveViewport;
      setScrollTop(el.scrollTop);
    }
    if (anyChanged) {
      setMeasureRevision((r) => r + 1);
    }
  }, [
    activeMatchGlobalIndex,
    endIndex,
    firstVisible,
    heightIndex,
    loadOk,
    scrollTarget,
    startIndex,
    totalCount,
  ]);

  if (!loadOk) {
    return (
      <div
        id="serverLogHistoryPre"
        className="log-view server-log-history__pre"
        tabIndex={0}
        ref={containerRef}
      >
        <div className="server-log-history__empty">
          {loading ? loadingLabel : errorText}
        </div>
      </div>
    );
  }

  const visibleItems = [];
  for (let i = startIndex; i < endIndex; i++) {
    const entry = entries[i];
    const { html } = ensurePreparedLogEntryHtml(entry);
    const ranges = lineRanges?.get(i);
    const renderedHtml = ranges
      ? highlightLogHtmlRanges(html, ranges, activeMatchGlobalIndex)
      : html;
    visibleItems.push(
      <div
        key={i}
        data-log-line-idx={i}
        className="server-log-history__line"
        dangerouslySetInnerHTML={{ __html: renderedHtml }}
      />,
    );
  }

  return (
    <div
      id="serverLogHistoryPre"
      className="log-view server-log-history__pre"
      tabIndex={0}
      ref={containerRef}
      onScroll={(ev) => {
        setScrollTop(ev.currentTarget.scrollTop);
      }}
    >
      {topSpacerHeight > 0 && (
        <div style={{ height: topSpacerHeight }} aria-hidden="true" />
      )}
      {visibleItems}
      {bottomSpacerHeight > 0 && (
        <div style={{ height: bottomSpacerHeight }} aria-hidden="true" />
      )}
    </div>
  );
}

interface ServerLogHistoryModalProps {
  logHistory: ServerLogHistoryApi | ProgramLogHistoryApi;
  title?: string;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function ServerLogHistoryModal({
  logHistory,
  title,
  t,
}: ServerLogHistoryModalProps) {
  function onFindKey(ev: KeyboardEvent<HTMLInputElement>) {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      logHistory.runFindStep(ev.shiftKey ? -1 : 1);
    }
  }

  return (
    <ModalBackdrop
      open={logHistory.open}
      id="serverLogHistoryBackdrop"
      onClose={logHistory.close}
    >
      <div
        className="fu-modal server-log-history-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="serverLogHistoryHeading"
      >
        <div
          className="mod-install-dialog__header"
          id="serverLogHistoryHeading"
        >
          <div className="mod-install-dialog__header-main">
            <div
              className="mod-install-dialog__header-icon-wrap"
              aria-hidden="true"
            >
              <IconHistory size={18} stroke={1.9} />
            </div>
            <div className="mod-install-dialog__header-titles">
              <h2 className="mod-install-dialog__title">
                {title ??
                  ('modalTitle' in logHistory
                    ? logHistory.modalTitle
                    : t('server_log_history_title'))}
              </h2>
            </div>
          </div>
          <div className="mod-install-dialog__header-right">
            <button
              type="button"
              className="mod-install-dialog__close"
              id="btnServerLogHistoryClose"
              aria-label={t('server_log_history_close')}
              title={t('server_log_history_close')}
              onClick={logHistory.close}
            >
              <AppIcon name="close" size={18} />
            </button>
          </div>
        </div>
        <div className="fu-modal__body">
          <div className="server-log-history__status-card">
            <p
              id="serverLogHistoryHint"
              className="server-log-history__hint"
              aria-live="polite"
            >
              {logHistory.hint}
            </p>
            <div className="server-log-history__status-actions">
              <span
                id="serverLogHistorySearchMeta"
                className="server-log-history__search-meta"
                aria-live="polite"
              >
                {logHistory.searchMeta}
              </span>
              {'loadFullFile' in logHistory && logHistory.canLoadFull && (
                <button
                  type="button"
                  className="btn btn--secondary btn--with-icon server-log-history__load-full-btn"
                  id="btnServerLogHistoryLoadFull"
                  disabled={!logHistory.loadOk || logHistory.loadFullBusy}
                  onClick={logHistory.loadFullFile}
                >
                  <IconDownload size={15} stroke={1.9} />
                  {logHistory.loadFullBusy
                    ? t('server_log_history_load_full_busy')
                    : t('server_log_history_load_full_btn')}
                </button>
              )}
            </div>
          </div>
          <div className="server-log-history__toolbar">
            <label
              className="server-log-history__search-label"
              htmlFor="serverLogHistoryFilter"
            >
              <span className="server-log-history__field-caption">
                {t('server_log_history_filter_label')}
              </span>
              <SearchField
                id="serverLogHistoryFilter"
                className="server-log-history__search-input"
                autoComplete="off"
                spellCheck={false}
                placeholder={t('server_log_history_filter_placeholder')}
                disabled={!logHistory.loadOk}
                value={logHistory.filter}
                onChange={(e) => {
                  logHistory.setFilter(e.target.value);
                  if (e.target.value.trim()) {
                    logHistory.scheduleFilterRefresh();
                  }
                }}
              />
            </label>
            <span
              className="server-log-history__toolbar-sep"
              aria-hidden="true"
            />
            <div className="server-log-history__find-block">
              <label
                className="server-log-history__search-label server-log-history__search-label--find"
                htmlFor="serverLogHistoryFind"
              >
                <span className="server-log-history__field-caption">
                  {t('server_log_history_find_label')}
                </span>
                <SearchField
                  id="serverLogHistoryFind"
                  className="server-log-history__search-input"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder={t('server_log_history_find_placeholder')}
                  disabled={!logHistory.loadOk}
                  value={logHistory.find}
                  onChange={(e) => {
                    logHistory.setFind(e.target.value);
                    if (!e.target.value.trim()) logHistory.resetFindSession();
                  }}
                  onKeyDown={onFindKey}
                />
              </label>
              <button
                type="button"
                className="btn btn--secondary btn--with-icon server-log-history__find-btn"
                id="btnServerLogHistoryFindNext"
                disabled={!logHistory.loadOk}
                onClick={() => logHistory.runFindStep(1)}
              >
                <IconSearch size={15} stroke={1.9} />
                {logHistory.findButtonLabel}
              </button>
            </div>
          </div>
          <VirtualLogViewport
            loadOk={logHistory.loadOk}
            loading={logHistory.loading}
            errorText={logHistory.errorText}
            loadingLabel={t('server_log_history_loading')}
            entries={logHistory.filteredEntries}
            lineRanges={logHistory.lineRanges}
            activeMatchGlobalIndex={logHistory.activeMatchGlobalIndex}
            scrollTarget={logHistory.scrollTarget}
          />
        </div>
      </div>
    </ModalBackdrop>
  );
}
