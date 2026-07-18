import { useMemo, useRef, useState, type MouseEvent } from 'react';
import type { SavesApi } from '../../hooks/useSaves';
import { AppIcon } from '../AppIcon';
import { SearchField } from '../SearchField';
import { TabLoadingPlaceholder, tabInitialLoad } from '../TabLoadingPlaceholder';
import { filterSaveRows, saveDisplayLabel, type SaveModCompareRow } from '../../lib/saveUtils';
import { SavesRowMenu } from './SavesRowMenu';
import { SaveRenameModal } from './SaveRenameModal';
import { QuickSaveNameModal } from './QuickSaveNameModal';

function saveModStatusKey(nameClass: string): string | null {
  switch (nameClass) {
    case 'save-mod-name--ok':
      return 'saves_manager_status_ok';
    case 'save-mod-name--ver-diff':
      return 'saves_manager_status_version_diff';
    case 'save-mod-name--not-in-save':
      return 'saves_manager_status_not_in_save';
    case 'save-mod-name--not-on-server':
      return 'saves_manager_status_not_on_server';
    default:
      return null;
  }
}

function saveModRowKind(nameClass: string): string {
  return nameClass ? nameClass.replace('save-mod-name--', '') : 'neutral';
}

const MODS_LOADING_ROW_COUNT = 6;

function SavesModsLoadingRows() {
  return (
    <>
      {Array.from({ length: MODS_LOADING_ROW_COUNT }, (_, i) => (
        <tr key={i} className="save-mod-row save-mod-row--loading" aria-hidden="true">
          <td>
            <span className="save-mod-skeleton save-mod-skeleton--name" />
          </td>
          <td>
            <span className="save-mod-skeleton save-mod-skeleton--ver" />
          </td>
          <td>
            <span className="save-mod-skeleton save-mod-skeleton--ver" />
          </td>
          <td>
            <span className="save-mod-skeleton save-mod-skeleton--status" />
          </td>
        </tr>
      ))}
    </>
  );
}

interface SavesTabProps {
  saves: SavesApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function SavesTab({ saves, t }: SavesTabProps) {
  const uploadRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuItem, setMenuItem] = useState<(typeof saves.rows)[0] | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [modsListExpanded, setModsListExpanded] = useState(true);
  const [filter, setFilter] = useState('');

  const filteredRows = useMemo(
    () => filterSaveRows(saves.rows, filter),
    [filter, saves.rows],
  );

  const compareRows = saves.compare?.rows ?? [];
  const modsLoading = !!saves.selectedSave && saves.compareLoading;
  const initialLoading = tabInitialLoad(saves.loading, saves.rows.length > 0);
  const modCount = compareRows.length;
  const modsListTitle = modsLoading
    ? t('saves_manager_mods_loading')
    : modCount > 0
      ? t('saves_manager_mods_list_title_count', modCount)
      : t('saves_manager_mods_list_title');
  const modStats = useMemo(
    () =>
      compareRows.reduce(
        (acc, row) => {
          const kind = saveModRowKind(row.nameClass);
          if (kind === 'ok') acc.ok += 1;
          else if (kind === 'ver-diff') acc.diff += 1;
          else if (kind === 'not-in-save') acc.notInSave += 1;
          else if (kind === 'not-on-server') acc.notOnServer += 1;
          return acc;
        },
        { ok: 0, diff: 0, notInSave: 0, notOnServer: 0 },
      ),
    [compareRows],
  );

  function renderModStatus(row: SaveModCompareRow) {
    const statusKey = saveModStatusKey(row.nameClass);
    if (!statusKey) return <span className="save-mod-status save-mod-status--neutral">—</span>;
    const kind = saveModRowKind(row.nameClass);
    return <span className={'save-mod-status save-mod-status--' + kind}>{t(statusKey)}</span>;
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  function onRowClick(row: (typeof saves.rows)[0], _tr: HTMLTableRowElement, ev: MouseEvent) {
    ev.stopPropagation();
    const changed = saves.selectedSave !== row.name;
    if (changed) saves.setSelectedSave(row.name);
    const clickedName = !!(ev.target as HTMLElement).closest('td.saves-col-name');
    if (clickedName) {
      setMenuItem(row);
      setMenuPos({
        x: ev.clientX + 2,
        y: ev.clientY + 2,
      });
      setMenuOpen(true);
    } else {
      closeMenu();
    }
  }

  return (
    <div id="tabPanelSaves" className="tab-panel tab-panel--active saves-tab" role="tabpanel" aria-labelledby="tabBtnSaves">
      <section className="panel saves-tab__panel">
        <div className="panel__body saves-tab__body">
          <div className="row row--saves-actions">
            <SearchField
              type="text"
              id="inpSavesFilter"
              className="saves-actions__filter"
              placeholder={t('saves_manager_filter_placeholder')}
              autoComplete="off"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <button
              type="button"
              className="btn btn--toolbar-icon"
              id="btnSavesRefresh"
              title={t('update_list_btn')}
              aria-label={t('update_list_btn')}
              onClick={() => {
                setFilter('');
                void saves.reload();
              }}
            >
              <AppIcon name="refresh" size={16} />
            </button>
            <button
              type="button"
              className={'btn btn--with-icon' + (saves.noSaves ? ' btn--update-available' : '')}
              id="btnSavesCreate"
              disabled={saves.serverBusy || saves.quickCreating}
              onClick={() => saves.createSave()}
            >
              <AppIcon name="add" size={16} />
              {t('create_save_btn')}
            </button>
            <button
              type="button"
              className="btn btn--with-icon"
              id="btnSavesQuickCreate"
              disabled={saves.serverBusy || saves.quickCreating}
              onClick={() => saves.openQuickSaveDialog()}
            >
              <AppIcon name="add" size={16} />
              {t('create_save_quick_btn')}
            </button>
            <span className="saves-actions__sep" aria-hidden="true" />
            <input
              ref={uploadRef}
              type="file"
              id="inpSaveUpload"
              className="input input--file"
              accept=".zip,application/zip"
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                const files = e.target.files;
                if (files?.length) void saves.uploadFiles(files).catch(saves.handleError);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className={'btn btn--with-icon' + (saves.noSaves ? ' btn--update-available' : '')}
              id="btnSavesUpload"
              onClick={() => uploadRef.current?.click()}
            >
              <AppIcon name="upload" size={16} />
              {t('saves_manager_upload_btn')}
            </button>
          </div>
          {initialLoading ? (
            <TabLoadingPlaceholder variant="split" label={t('tab_data_loading')} className="saves-tab__loading" />
          ) : (
          <div className="saves-split">
            <div className="saves-split__left">
              <div className="table-wrap table-wrap--enter">
                <table className="data">
                  <thead>
                    <tr>
                      <th data-i18n="saves_manager_tree_header">{t('saves_manager_tree_header')}</th>
                      <th data-i18n="saves_manager_ov_mtime">{t('saves_manager_ov_mtime')}</th>
                    </tr>
                  </thead>
                  <tbody id="tblSavesBody">
                    {filteredRows.map((s) => (
                      <tr
                        key={s.name}
                        className={
                          (s.is_running_active ? 'save-row--active-running ' : '') +
                          (s.name === saves.selectedSave ? 'mods-row--selected' : '')
                        }
                        onClick={(ev) => onRowClick(s, ev.currentTarget, ev)}
                      >
                        <td className="saves-col-name">
                          <span className="instance-name-cell">
                            <span
                              className={
                                'instance-run-dot' + (s.is_running_active ? ' instance-run-dot--on' : '')
                              }
                            />
                            <span>{saveDisplayLabel(s.name)}</span>
                          </span>
                        </td>
                        <td>{saves.formatLocalTime(s.mtime)}</td>
                      </tr>
                    ))}
                    {!initialLoading && filter.trim() && filteredRows.length === 0 && saves.rows.length > 0 && (
                      <tr className="saves-filter-empty">
                        <td colSpan={2} className="muted">
                          {t('saves_manager_filter_none')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="saves-split__right">
              <div
                className={
                  'saves-detail-panel' +
                  (modsListExpanded ? ' saves-detail-panel--expanded' : '') +
                  (modsLoading ? ' saves-detail-panel--loading' : '')
                }
              >
                <div className="saves-detail-panel__overview">
                  {saves.selectedSave ? (
                    <span className="saves-detail-panel__save-pill" title={saves.selectedSave}>
                      <AppIcon name="save" size={14} className="saves-detail-panel__save-pill-icon" />
                      <span>{saveDisplayLabel(saves.selectedSave)}</span>
                    </span>
                  ) : (
                    <span className="saves-detail-panel__save-pill saves-detail-panel__save-pill--empty muted">
                      —
                    </span>
                  )}
                  <p id="saveFactorioVersionLine" className="saves-detail-panel__fv">
                    {modsLoading ? (
                      <span className="save-mod-skeleton save-mod-skeleton--fv" aria-hidden="true" />
                    ) : (
                      <span>{t('saves_manager_ov_fv', saves.compare?.factorioVersion || '-')}</span>
                    )}
                  </p>
                </div>
                <div className="saves-mods-compare">
                  <button
                    type="button"
                    className={
                      'saves-mods-compare__summary' + (modsLoading ? ' saves-mods-compare__summary--loading' : '')
                    }
                    id="btnSavesModsCompareToggle"
                    aria-expanded={modsListExpanded}
                    aria-controls="savesModsCompareBody"
                    aria-busy={modsLoading}
                    onClick={() => setModsListExpanded((open) => !open)}
                  >
                    <span className="saves-mods-compare__chevron" aria-hidden="true" />
                    <span className="saves-mods-compare__summary-main">
                      <span className="saves-mods-compare__summary-label">{modsListTitle}</span>
                    </span>
                    <span className="saves-mods-compare__meta">
                      {!modsLoading && modStats.ok > 0 ? (
                        <span className="saves-mods-compare__badge saves-mods-compare__badge--ok">
                          {modStats.ok}
                        </span>
                      ) : null}
                      {!modsLoading && modStats.diff > 0 ? (
                        <span className="saves-mods-compare__badge saves-mods-compare__badge--warn">
                          {modStats.diff}
                        </span>
                      ) : null}
                      {!modsLoading && modStats.notInSave > 0 ? (
                        <span className="saves-mods-compare__badge saves-mods-compare__badge--danger">
                          {modStats.notInSave}
                        </span>
                      ) : null}
                      {!modsLoading && modStats.notOnServer > 0 ? (
                        <span className="saves-mods-compare__badge saves-mods-compare__badge--muted">
                          {modStats.notOnServer}
                        </span>
                      ) : null}
                    </span>
                  </button>
                  <div
                    id="savesModsCompareBody"
                    className={'saves-mods-compare__collapse' + (modsListExpanded ? ' is-expanded' : '')}
                    aria-hidden={!modsListExpanded}
                  >
                    <div
                      className="saves-mods-compare__collapse-inner"
                      {...(!modsListExpanded ? { inert: true as const } : {})}
                    >
                      <div className="saves-mods-compare__body">
                        <div
                          className={
                            'table-wrap table-wrap--enter saves-mods-compare__table-wrap' +
                            (modsLoading ? ' saves-mods-compare__table-wrap--loading' : '')
                          }
                          aria-busy={modsLoading}
                          aria-live="polite"
                        >
                          <table className="data data--save-mods" id="tblSaveModsCompare">
                            <thead>
                              <tr>
                                <th>{t('saves_manager_col_mod')}</th>
                                <th>{t('saves_manager_col_save_ver')}</th>
                                <th>{t('saves_manager_col_disk_ver')}</th>
                                <th>{t('saves_manager_col_status')}</th>
                              </tr>
                            </thead>
                            <tbody id="tblSaveModsCompareBody">
                              {modsLoading ? (
                                <SavesModsLoadingRows />
                              ) : (
                                <>
                                  {compareRows.map((r) => {
                                    const kind = saveModRowKind(r.nameClass);
                                    return (
                                      <tr
                                        key={r.name}
                                        className={r.nameClass ? 'save-mod-row save-mod-row--' + kind : undefined}
                                      >
                                        <td className={'save-mod-col-name ' + r.nameClass} title={r.name}>
                                          {r.display_name}
                                        </td>
                                        <td className="save-mod-col-ver">{r.saveVer}</td>
                                        <td className="save-mod-col-ver">{r.diskVer}</td>
                                        <td className="save-mod-col-status">{renderModStatus(r)}</td>
                                      </tr>
                                    );
                                  })}
                                  {!saves.selectedSave && (
                                    <tr>
                                      <td colSpan={4} className="muted">
                                        —
                                      </td>
                                    </tr>
                                  )}
                                </>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          )}
        </div>
      </section>

      <SavesRowMenu
        open={menuOpen}
        item={menuItem}
        position={menuPos}
        serverBusy={saves.serverBusy}
        onClose={closeMenu}
        onDownload={() => {
          if (!menuItem) return;
          closeMenu();
          void saves.download(menuItem.name).catch(saves.handleError);
        }}
        onSetLaunch={() => {
          if (!menuItem) return;
          closeMenu();
          void saves.setLaunch(menuItem.name).catch(saves.handleError);
        }}
        onDuplicate={() => {
          if (!menuItem) return;
          closeMenu();
          void saves.duplicate(menuItem.name).catch(saves.handleError);
        }}
        onRename={() => {
          if (!menuItem) return;
          closeMenu();
          saves.openRenameDialog(menuItem.name);
        }}
        onDelete={() => {
          if (!menuItem) return;
          closeMenu();
          void saves.remove(menuItem.name).catch(saves.handleError);
        }}
        t={t}
      />

      <SaveRenameModal saves={saves} t={t} />
      <QuickSaveNameModal saves={saves} t={t} />
    </div>
  );
}
