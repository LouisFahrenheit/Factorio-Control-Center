import type { CommandRow } from '../../lib/commandUtils';
import type { CommandEditorApi } from '../../hooks/useCommandEditor';
import { AppIcon } from '../AppIcon';
import { SearchField } from '../SearchField';
import type { CommandsApi } from '../../hooks/useCommands';
import { TabLoadingPlaceholder, tabInitialLoad } from '../TabLoadingPlaceholder';

function CommandParams({
  row,
  params,
  setParam,
  onlinePlayers,
  t,
}: {
  row: CommandRow;
  params: Record<string, string>;
  setParam: (k: string, v: string) => void;
  onlinePlayers: string[];
  t: (key: string) => string;
}) {
  const cmd = row.raw;

  return (
    <div id="cmdParams" className="commands-params commands-tab__params">
      {!!cmd.has_player && (
        <div className="commands-tab__field">
          <label className="commands-tab__field-label">{t('player')}</label>
          <select className="input" value={params.player || ''} onChange={(e) => setParam('player', e.target.value)}>
            {!onlinePlayers.length && <option value="" />}
            {onlinePlayers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      )}
      {!!cmd.has_boolean && (
        <div className="commands-tab__field">
          <label className="commands-tab__field-label">{t('cmd_param_boolean')}</label>
          <select className="input input--narrow" value={params.value || 'true'} onChange={(e) => setParam('value', e.target.value)}>
            <option value="true">true</option>
            <option value="false">false</option>
          </select>
        </div>
      )}
      {!cmd.has_boolean && !!cmd.has_value && (
        <div className="commands-tab__field">
          <label className="commands-tab__field-label">{t('cmd_param_value')}</label>
          <input className="input" value={params.value || ''} onChange={(e) => setParam('value', e.target.value)} />
        </div>
      )}
      {!!cmd.has_item && (
        <div className="commands-tab__field">
          <label className="commands-tab__field-label">{t('cmd_param_item')}</label>
          <select
            className="input"
            value={params.item || ''}
            onChange={(e) => {
              setParam('item', e.target.value);
              const items = cmd.items as Record<string, unknown> | undefined;
              if (items && items[e.target.value] != null) setParam('count', String(items[e.target.value]));
            }}
          >
            {Object.keys((cmd.items as object) || {}).map((it) => (
              <option key={it} value={it}>
                {it}
              </option>
            ))}
          </select>
        </div>
      )}
      {!!cmd.has_count && (
        <div className="commands-tab__field">
          <label className="commands-tab__field-label">{t('cmd_param_count')}</label>
          <input className="input" value={params.count || '1'} onChange={(e) => setParam('count', e.target.value)} />
        </div>
      )}
      {!!cmd.has_quality && (
        <div className="commands-tab__field">
          <label className="commands-tab__field-label">{t('cmd_param_quality')}</label>
          <select className="input" value={params.quality || 'normal'} onChange={(e) => setParam('quality', e.target.value)}>
            {['normal', 'uncommon', 'rare', 'epic', 'legendary'].map((q) => (
              <option key={q} value={q}>
                {q}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

interface CommandsTabProps {
  commands: CommandsApi;
  commandEditor: CommandEditorApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function CommandsTab({ commands, commandEditor, t }: CommandsTabProps) {
  const selectedName = commands.selected?.name || '—';
  const initialLoading = tabInitialLoad(commands.loading, commands.grouped.length > 0);

  return (
    <div id="tabPanelCommands" className="tab-panel tab-panel--active commands-tab" role="tabpanel" aria-labelledby="tabBtnCommands">
      <div className="commands-tab__layout commands-layout">
        <section className="commands-tab__card commands-tab__card--list commands-list">
          <header className="commands-tab__toolbar commands-list__toolbar">
            <SearchField
              type="text"
              id="cmdSearch"
              className="commands-tab__search"
              placeholder={t('cmd_search_placeholder')}
              autoComplete="off"
              value={commands.search}
              onChange={(e) => commands.setSearch(e.target.value)}
            />
            <div className="commands-tab__toolbar-actions">
              <button
                type="button"
                className="btn btn--with-icon"
                id="btnCmdRefresh"
                onClick={() => {
                  commands.setSearch('');
                  void commands.reload();
                }}
              >
                <AppIcon name="refresh" size={16} />
                {t('saves_manager_refresh')}
              </button>
              <button
                type="button"
                className="btn btn--with-icon"
                id="btnCmdEditor"
                disabled={commandEditor.loading}
                onClick={() => void commandEditor.openDialog()}
              >
                <AppIcon name="edit_document" size={16} />
                {t('commands_editor_btn')}
              </button>
            </div>
          </header>
          <div className="commands-tab__grid-wrap">
            {initialLoading ? (
              <TabLoadingPlaceholder variant="grid" label={t('tab_data_loading')} />
            ) : (
            <div id="cmdList" className="commands-grid">
              {commands.grouped.map((group) => (
                <section key={group.categoryKey} className="commands-group">
                  <h4 className="commands-group__title">{group.categoryName}</h4>
                  <div className="commands-group__items">
                    {group.items.map((r) => (
                      <button
                        key={r.id}
                        type="button"
                        className={
                          'commands-item' + (commands.selected?.id === r.id ? ' commands-item--selected' : '')
                        }
                        title={r.description}
                        onClick={() => commands.setSelectedId(r.id)}
                      >
                        <div className="commands-item__name">{r.name}</div>
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            )}
          </div>
        </section>

        <section className="commands-tab__card commands-tab__card--editor commands-editor">
          <header className="commands-tab__editor-head commands-editor__header">
            <div className="commands-tab__editor-title-wrap">
              <h2 id="cmdTitle" className="commands-tab__editor-title">
                {selectedName}
              </h2>
              {commands.selected ? <span className="commands-tab__badge commands-tab__badge--accent">RCON</span> : null}
            </div>
            <p id="cmdDesc" className="commands-tab__editor-desc hint">
              {commands.selected?.description || ''}
            </p>
          </header>

          <div className="commands-tab__editor-body">
            {commands.selected && (
              <CommandParams
                row={commands.selected}
                params={commands.params}
                setParam={commands.setParam}
                onlinePlayers={commands.onlinePlayers}
                t={t}
              />
            )}

            <label htmlFor="cmdPreview" className="commands-tab__preview-label commands-editor__preview-label">
              {t('cmd_preview_label')}
            </label>
            <textarea
              id="cmdPreview"
              className="settings-json commands-tab__preview"
              spellCheck={false}
              value={commands.preview}
              onChange={(e) => commands.setPreview(e.target.value)}
            />
          </div>

          <footer className="commands-tab__editor-footer commands-editor__actions">
            <label className="commands-tab__quiet-toggle commands-editor__quiet-toggle" htmlFor="cbCmdQuiet">
              <input
                type="checkbox"
                id="cbCmdQuiet"
                checked={commands.quiet}
                onChange={(e) => commands.setQuiet(e.target.checked)}
              />
              <span data-i18n="cmd_quiet_mode_cb">{t('cmd_quiet_mode_cb')}</span>
            </label>
            <button
              type="button"
              className="btn btn--with-icon commands-tab__execute-btn"
              id="btnCmdExecute"
              disabled={!commands.running || !commands.selected}
              onClick={() => void commands.execute()}
            >
              <AppIcon name="start" size={16} />
              {t('command_execute')}
            </button>
          </footer>
        </section>
      </div>
    </div>
  );
}
