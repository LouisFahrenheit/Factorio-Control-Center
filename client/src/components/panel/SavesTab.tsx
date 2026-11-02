import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { IconRefresh, IconUpload } from '@tabler/icons-react';
import type { SavesApi } from '../../hooks/useSaves';
import { AppIcon } from '../AppIcon';
import { SearchField } from '../SearchField';
import {
  TabLoadingPlaceholder,
  tabInitialLoad,
} from '../TabLoadingPlaceholder';
import {
  filterSaveRows,
  getSaveKind,
  getSaveTypeBadgeLabel,
  saveDisplayLabel,
  sortSaveRows,
  type SaveModCompareRow,
  type SaveSortColumn,
} from '../../lib/saveUtils';
import { SavesRowMenu } from './SavesRowMenu';
import { SaveRenameModal } from './SaveRenameModal';
import { QuickSaveNameModal } from './QuickSaveNameModal';
import { SaveTransferModal } from './SaveTransferModal';

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
        <tr
          key={i}
          className="save-mod-row save-mod-row--loading"
          aria-hidden="true"
        >
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

  const [filter, setFilter] = useState('');
  const [sortColumn, setSortColumn] = useState<SaveSortColumn>('mtime');
  const [sortAsc, setSortAsc] = useState(false);

  const filteredRows = useMemo(
    () => filterSaveRows(saves.rows, filter),
    [filter, saves.rows],
  );

  const sortedRows = useMemo(
    () => sortSaveRows(filteredRows, sortColumn, sortAsc, t),
    [filteredRows, sortColumn, sortAsc, t],
  );

  const handleSort = (col: SaveSortColumn) => {
    if (sortColumn === col) {
      setSortAsc((prev) => !prev);
    } else {
      setSortColumn(col);
      setSortAsc(col === 'mtime' ? false : true);
    }
  };

  function sortThClass(col: SaveSortColumn, extraClass?: string): string {
    const active = sortColumn === col;
    return [
      extraClass,
      'saves-sort-th',
      active ? 'saves-sort-th--active' : '',
      active && sortAsc ? 'saves-sort-th--asc' : '',
      active && !sortAsc ? 'saves-sort-th--desc' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  const compareRows = useMemo(
    () => saves.compare?.rows ?? [],
    [saves.compare?.rows],
  );
  const modsLoading = !!saves.selectedSave && saves.compareLoading;
  const initialLoading = tabInitialLoad(saves.loading, saves.rows.length > 0);

  const modStats = useMemo(() => {
    return compareRows.reduce(
      (acc, row) => {
        const kind = saveModRowKind(row.nameClass);
        if (kind === 'ok') acc.ok += 1;
        else if (kind === 'ver-diff' || kind === 'diff') acc.diff += 1;
        else if (kind === 'not-in-save' || kind === 'not_in_save')
          acc.notInSave += 1;
        else if (kind === 'not-on-server' || kind === 'not_on_server')
          acc.notOnServer += 1;
        return acc;
      },
      { ok: 0, diff: 0, notInSave: 0, notOnServer: 0 },
    );
  }, [compareRows]);

  const modsContainerTitle = modsLoading
    ? t('saves_manager_mods_loading')
    : compareRows.length > 0
      ? t('saves_manager_mods_list_title_count', compareRows.length)
      : t('saves_manager_mods_list_title');

  function renderModStatus(row: SaveModCompareRow) {
    const statusKey = saveModStatusKey(row.nameClass);
    if (!statusKey)
      return (
        <span className="save-mod-status save-mod-status--neutral">—</span>
      );
    const kind = saveModRowKind(row.nameClass);
    return (
      <span className={'save-mod-status save-mod-status--' + kind}>
        {t(statusKey)}
      </span>
    );
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  function onRowClick(
    row: (typeof saves.rows)[0],
    _tr: HTMLTableRowElement,
    ev: MouseEvent,
  ) {
    ev.stopPropagation();
    const changed = saves.selectedSave !== row.name;
    if (changed) saves.setSelectedSave(row.name);
    const clickedName = !!(ev.target as HTMLElement).closest(
      'td.saves-col-name',
    );
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

  const [isDraggingOver, setIsDraggingOver] = useState(false);

  return (
    <div
      id="tabPanelSaves"
      className={
        'tab-panel tab-panel--active saves-tab fcc-drop-target' +
        (isDraggingOver ? ' is-drag-over' : '')
      }
      role="tabpanel"
      aria-labelledby="tabBtnSaves"
      onDragOver={(ev) => {
        if (ev.dataTransfer.types.includes('Files')) {
          ev.preventDefault();
          setIsDraggingOver(true);
        }
      }}
      onDragEnter={(ev) => {
        if (ev.dataTransfer.types.includes('Files')) {
          ev.preventDefault();
          setIsDraggingOver(true);
        }
      }}
      onDragLeave={(ev) => {
        if (!ev.currentTarget.contains(ev.relatedTarget as Node)) {
          setIsDraggingOver(false);
        }
      }}
      onDrop={(ev) => {
        ev.preventDefault();
        setIsDraggingOver(false);
        const files = ev.dataTransfer.files;
        if (files?.length)
          void saves.uploadFiles(files).catch(saves.handleError);
      }}
    >
      {isDraggingOver && (
        <div className="fcc-drop-overlay">
          <IconUpload size={36} className="fcc-drop-overlay__icon" />
          <span className="fcc-drop-overlay__text">
            {t('upload_drop_zone_hint') ||
              'Перетащите файлы сюда для загрузки'}
          </span>
        </div>
      )}
      {initialLoading ? (
        <TabLoadingPlaceholder
          variant="split"
          label={t('tab_data_loading')}
          className="saves-tab__loading"
        />
      ) : (
        <div className="saves-tab__layout saves-split">
          <section className="saves-tab__card saves-tab__card--list saves-split__left">
            <header className="saves-tab__toolbar row--saves-actions">
              <SearchField
                type="text"
                id="inpSavesFilter"
                className="saves-tab__search saves-actions__filter"
                placeholder={t('search_placeholder')}
                autoComplete="off"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
              <div className="saves-tab__toolbar-actions">
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
                  <IconRefresh size={18} />
                </button>
                <button
                  type="button"
                  className={
                    'btn btn--with-icon' +
                    (saves.noSaves ? ' btn--update-available' : '')
                  }
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
                    if (files?.length)
                      void saves.uploadFiles(files).catch(saves.handleError);
                    e.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className={
                    'btn btn--with-icon' +
                    (saves.noSaves ? ' btn--update-available' : '')
                  }
                  id="btnSavesUpload"
                  onClick={() => uploadRef.current?.click()}
                >
                  <AppIcon name="upload" size={16} />
                  {t('saves_manager_upload_btn')}
                </button>
              </div>
            </header>
            <div className="saves-tab__card-body">
              <div className="table-wrap table-wrap--enter">
                <table className="data data--saves" id="tblSaves">
                  <thead>
                    <tr>
                      <th
                        className={sortThClass('name')}
                        data-saves-sort="name"
                        aria-sort={
                          sortColumn === 'name'
                            ? sortAsc
                              ? 'ascending'
                              : 'descending'
                            : undefined
                        }
                        onClick={() => handleSort('name')}
                      >
                        {t('saves_manager_tree_header')}
                      </th>
                      <th
                        className={sortThClass('type', 'saves-col-type')}
                        data-saves-sort="type"
                        aria-sort={
                          sortColumn === 'type'
                            ? sortAsc
                              ? 'ascending'
                              : 'descending'
                            : undefined
                        }
                        onClick={() => handleSort('type')}
                      >
                        {t('saves_manager_col_type')}
                      </th>
                      <th
                        className={sortThClass('mtime', 'saves-col-mtime')}
                        data-saves-sort="mtime"
                        aria-sort={
                          sortColumn === 'mtime'
                            ? sortAsc
                              ? 'ascending'
                              : 'descending'
                            : undefined
                        }
                        onClick={() => handleSort('mtime')}
                      >
                        {t('saves_manager_ov_mtime')}
                      </th>
                    </tr>
                  </thead>
                  <tbody id="tblSavesBody">
                    {sortedRows.map((s) => (
                      <tr
                        key={s.name}
                        className={
                          (s.is_running_active
                            ? 'save-row--active-running '
                            : '') +
                          (s.name === saves.selectedSave
                            ? 'mods-row--selected'
                            : '')
                        }
                        onClick={(ev) => onRowClick(s, ev.currentTarget, ev)}
                      >
                        <td className="saves-col-name">
                          <span className="instance-name-cell">
                            <span
                              className={
                                'instance-run-dot' +
                                (s.is_running_active
                                  ? ' instance-run-dot--on'
                                  : '')
                              }
                            />
                            <span>{saveDisplayLabel(s.name)}</span>
                          </span>
                        </td>
                        <td className="saves-col-type">
                          <span
                            className={`save-type-badge save-type-badge--${getSaveKind(s.name)}`}
                          >
                            {getSaveTypeBadgeLabel(s.name, t)}
                          </span>
                        </td>
                        <td className="saves-col-mtime">
                          {saves.formatLocalTime(s.mtime)}
                        </td>
                      </tr>
                    ))}
                    {!initialLoading &&
                      filter.trim() &&
                      filteredRows.length === 0 &&
                      saves.rows.length > 0 && (
                        <tr className="saves-filter-empty">
                          <td colSpan={3} className="muted">
                            {t('saves_manager_filter_none')}
                          </td>
                        </tr>
                      )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section
            className={
              'saves-tab__card saves-tab__card--detail saves-split__right saves-detail-panel' +
              (modsLoading ? ' saves-detail-panel--loading' : '')
            }
          >
            <header className="saves-detail-panel__overview">
              {saves.selectedSave ? (
                <div
                  className="saves-detail-panel__save-pill"
                  title={saves.selectedSave}
                >
                  <span className="saves-detail-panel__save-name">
                    {saveDisplayLabel(saves.selectedSave)}
                  </span>
                  <span
                    className="saves-detail-panel__mods-badges"
                    title={modsContainerTitle}
                    aria-label={modsContainerTitle}
                  >
                    {modsLoading ? (
                      <span
                        className="saves-mods-badge saves-mods-badge--loading"
                        title={t('saves_manager_mods_loading')}
                      >
                        …
                      </span>
                    ) : (
                      <>
                        {modStats.ok > 0 && (
                          <span
                            className="saves-mods-badge saves-mods-badge--ok"
                            title={`${t('saves_manager_status_ok')}: ${modStats.ok}`}
                          >
                            {modStats.ok}
                          </span>
                        )}
                        {modStats.diff > 0 && (
                          <span
                            className="saves-mods-badge saves-mods-badge--warn"
                            title={`${t('saves_manager_status_version_diff')}: ${modStats.diff}`}
                          >
                            {modStats.diff}
                          </span>
                        )}
                        {(modStats.notOnServer > 0 ||
                          modStats.notInSave > 0) && (
                          <span
                            className="saves-mods-badge saves-mods-badge--danger"
                            title={
                              modStats.notOnServer > 0 && modStats.notInSave > 0
                                ? `${t('saves_manager_status_not_on_server')}: ${modStats.notOnServer}, ${t('saves_manager_status_not_in_save')}: ${modStats.notInSave}`
                                : modStats.notOnServer > 0
                                  ? `${t('saves_manager_status_not_on_server')}: ${modStats.notOnServer}`
                                  : `${t('saves_manager_status_not_in_save')}: ${modStats.notInSave}`
                            }
                          >
                            {modStats.notOnServer + modStats.notInSave}
                          </span>
                        )}
                        {compareRows.length === 0 && (
                          <span
                            className="saves-mods-badge saves-mods-badge--zero"
                            title={t('saves_manager_mods_list_title_count', 0)}
                          >
                            0
                          </span>
                        )}
                      </>
                    )}
                  </span>
                  <span
                    className={`save-type-badge save-type-badge--${getSaveKind(saves.selectedSave)}`}
                  >
                    {getSaveTypeBadgeLabel(saves.selectedSave, t)}
                  </span>
                  <span
                    id="saveFactorioVersionLine"
                    className="saves-detail-panel__fv-inline"
                    title={t(
                      'saves_manager_ov_fv',
                      saves.compare?.factorioVersion || '-',
                    )}
                  >
                    {modsLoading ? (
                      <span
                        className="save-mod-skeleton save-mod-skeleton--fv"
                        aria-hidden="true"
                      />
                    ) : (
                      <span>
                        {t(
                          'saves_manager_ov_fv',
                          saves.compare?.factorioVersion || '-',
                        )}
                      </span>
                    )}
                  </span>
                </div>
              ) : (
                <div className="saves-detail-panel__save-pill saves-detail-panel__save-pill--empty muted">
                  —
                </div>
              )}
            </header>
            <div className="saves-tab__card-body saves-detail-panel__body">
              <div
                className={
                  'table-wrap table-wrap--enter saves-mods-compare__table-wrap' +
                  (modsLoading
                    ? ' saves-mods-compare__table-wrap--loading'
                    : '')
                }
                aria-busy={modsLoading}
                aria-live="polite"
              >
                <table
                  className="data data--save-mods"
                  id="tblSaveModsCompare"
                >
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
                              className={
                                r.nameClass
                                  ? 'save-mod-row save-mod-row--' +
                                    kind
                                  : undefined
                              }
                            >
                              <td
                                className={
                                  'save-mod-col-name ' + r.nameClass
                                }
                                title={r.name}
                              >
                                {r.display_name}
                              </td>
                              <td className="save-mod-col-ver">
                                {r.saveVer}
                              </td>
                              <td className="save-mod-col-ver">
                                {r.diskVer}
                              </td>
                              <td className="save-mod-col-status">
                                {renderModStatus(r)}
                              </td>
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
          </section>
        </div>
      )}

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
        onTransfer={() => {
          if (!menuItem) return;
          closeMenu();
          saves.openTransferDialog(menuItem.name);
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
      <SaveTransferModal saves={saves} t={t} />
      <QuickSaveNameModal saves={saves} t={t} />
    </div>
  );
}
