import type { KeyboardEvent } from 'react';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import { AppIcon } from '../AppIcon';
import { SearchField } from '../SearchField';
import type { ServerLogHistoryApi } from '../../hooks/useServerLogHistory';
import type { ProgramLogHistoryApi } from '../../hooks/useProgramLogHistory';

interface ServerLogHistoryModalProps {
  logHistory: ServerLogHistoryApi | ProgramLogHistoryApi;
  title?: string;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function ServerLogHistoryModal({ logHistory, title, t }: ServerLogHistoryModalProps) {
  function onFindKey(ev: KeyboardEvent<HTMLInputElement>) {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      logHistory.runFindStep();
    }
  }

  return (
    <ModalBackdrop open={logHistory.open} id="serverLogHistoryBackdrop" onClose={logHistory.close}>
      <div className="fu-modal server-log-history-modal" role="dialog" aria-modal="true" aria-labelledby="serverLogHistoryHeading">
        <div className="fu-modal__header" id="serverLogHistoryHeading">
          {title ?? ('modalTitle' in logHistory ? logHistory.modalTitle : t('server_log_history_title'))}
        </div>
        <div className="fu-modal__body">
          <p id="serverLogHistoryHint" className="hint server-log-history__hint" aria-live="polite">
            {logHistory.hint}
          </p>
          <div className="server-log-history__toolbar">
            <label className="server-log-history__search-label" htmlFor="serverLogHistoryFilter">
              <span>{t('server_log_history_filter_label')}</span>
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
                  logHistory.scheduleFilterRefresh();
                }}
              />
            </label>
            <div className="server-log-history__find-block">
              {'loadFullFile' in logHistory && logHistory.canLoadFull && (
                <button
                  type="button"
                  className="btn"
                  id="btnServerLogHistoryLoadFull"
                  disabled={!logHistory.loadOk || logHistory.loadFullBusy}
                  onClick={logHistory.loadFullFile}
                >
                  {logHistory.loadFullBusy
                    ? t('server_log_history_load_full_busy')
                    : t('server_log_history_load_full_btn')}
                </button>
              )}
              <label className="server-log-history__search-label server-log-history__search-label--find" htmlFor="serverLogHistoryFind">
                <span>{t('server_log_history_find_label')}</span>
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
                className="btn"
                id="btnServerLogHistoryFindNext"
                disabled={!logHistory.loadOk}
                onClick={logHistory.runFindStep}
              >
                {logHistory.findButtonLabel}
              </button>
            </div>
            <span id="serverLogHistorySearchMeta" className="server-log-history__search-meta" aria-live="polite">
              {logHistory.searchMeta}
            </span>
          </div>
          <pre id="serverLogHistoryPre" className="log-view server-log-history__pre" tabIndex={0} ref={logHistory.preRef} />
        </div>
        <div className="fu-modal__footer">
          <button
            type="button"
            className="btn btn--primary btn--with-icon"
            id="btnServerLogHistoryClose"
            onClick={logHistory.close}
          >
            <AppIcon name="close" size={16} />
            {t('server_log_history_close')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
