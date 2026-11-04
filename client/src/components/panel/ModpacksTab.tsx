import { useMemo, useRef, useState, type MouseEvent } from 'react';
import { motion } from 'motion/react';
import { IconRefresh, IconUpload } from '@tabler/icons-react';
import { AppIcon } from '../AppIcon';
import { SearchField } from '../SearchField';
import {
  TabLoadingPlaceholder,
  tabInitialLoad,
} from '../TabLoadingPlaceholder';
import { formatPanelDateOnly } from '../../lib/datetimeUtils';
import {
  LIST_CONTAINER_VARIANTS,
  LIST_ROW_VARIANTS,
  LIST_WRAP_VARIANTS,
} from '../../lib/motionPresets';
import { webEffectsReduced } from '../../theme/webEffects';
import { goToProgramSettings } from '../../lib/goToServers';
import type { ModpackRow } from '../../types/modpack';
import type { ModpacksApi } from '../../hooks/useModpacks';
import { ModpackActivateModal } from './ModpackActivateModal';
import { ModpackExportModal } from './ModpackExportModal';
import { ModpackImportModal } from './ModpackImportModal';
import { ModpackRenameModal } from './ModpackRenameModal';
import { ModpackRowMenu } from './ModpackRowMenu';
import { ModpackSaveModal } from './ModpackSaveModal';

export interface ModpacksTabProps {
  modpacks: ModpacksApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

export type ModpackSortColumn =
  | 'name'
  | 'mods'
  | 'size'
  | 'settings'
  | 'factorio'
  | 'created'
  | 'description';

const SORT_COLUMNS: {
  key: ModpackSortColumn;
  i18n: string;
  thId?: string;
  className?: string;
}[] = [
  {
    key: 'name',
    i18n: 'instances_col_name',
    className: 'modpacks-col-name',
    thId: 'thModpacksNameSort',
  },
  {
    key: 'mods',
    i18n: 'modpack_list_header_mods',
    className: 'modpacks-col-count',
    thId: 'thModpacksModsSort',
  },
  {
    key: 'size',
    i18n: 'modpack_list_header_size',
    className: 'modpacks-col-size',
    thId: 'thModpacksSizeSort',
  },
  {
    key: 'settings',
    i18n: 'modpack_list_header_settings',
    className: 'modpacks-col-flag',
    thId: 'thModpacksSettingsSort',
  },
  {
    key: 'factorio',
    i18n: 'modpack_list_header_factorio',
    className: 'modpacks-col-factorio',
    thId: 'thModpacksFactorioSort',
  },
  {
    key: 'created',
    i18n: 'modpack_list_header_created',
    className: 'modpacks-col-created',
    thId: 'thModpacksCreatedSort',
  },
  {
    key: 'description',
    i18n: 'modpack_list_header_description',
    className: 'modpacks-col-desc',
    thId: 'thModpacksDescSort',
  },
];

const MODPACK_MODS_LOADING_ROW_COUNT = 6;

function ModpackModsLoadingRows() {
  return (
    <>
      {Array.from({ length: MODPACK_MODS_LOADING_ROW_COUNT }, (_, i) => (
        <tr
          key={i}
          className="modpack-mod-row modpack-mod-row--loading"
          aria-hidden="true"
        >
          <td>
            <span className="save-mod-skeleton save-mod-skeleton--name" />
          </td>
          <td className="modpacks-mods-col-version">
            <span className="save-mod-skeleton save-mod-skeleton--ver" />
          </td>
        </tr>
      ))}
    </>
  );
}

function compareModpacks(
  a: ModpackRow,
  b: ModpackRow,
  col: ModpackSortColumn,
  asc: boolean,
): number {
  let diff = 0;
  switch (col) {
    case 'name':
      diff = String(a.name || '').localeCompare(String(b.name || ''), undefined, {
        numeric: true,
        sensitivity: 'base',
      });
      break;
    case 'mods':
      diff = (a.mods_count ?? 0) - (b.mods_count ?? 0);
      break;
    case 'size':
      diff = (a.size_bytes ?? 0) - (b.size_bytes ?? 0);
      break;
    case 'settings':
      diff = Number(!!a.has_mod_settings) - Number(!!b.has_mod_settings);
      break;
    case 'factorio':
      diff = String(a.factorio_version || '').localeCompare(
        String(b.factorio_version || ''),
        undefined,
        { numeric: true },
      );
      break;
    case 'created':
      diff =
        new Date(a.created_at || 0).getTime() -
        new Date(b.created_at || 0).getTime();
      break;
    case 'description':
      diff = String(a.description || '').localeCompare(
        String(b.description || ''),
        undefined,
        { sensitivity: 'base' },
      );
      break;
  }
  if (diff === 0) {
    diff = String(a.name || '').localeCompare(String(b.name || ''), undefined, {
      numeric: true,
      sensitivity: 'base',
    });
  }
  return asc ? diff : -diff;
}

export function ModpacksTab({ modpacks, t }: ModpacksTabProps) {
  const importRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [sortCol, setSortCol] = useState<ModpackSortColumn>('name');
  const [sortAsc, setSortAsc] = useState<boolean>(true);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuName, setMenuName] = useState('');
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const packCount = modpacks.rows.length;
  const initialLoading = tabInitialLoad(modpacks.loading, packCount > 0);
  const reduced = webEffectsReduced();

  const mods = modpacks.details?.mods || [];
  const modsLoading = !!modpacks.selected && modpacks.detailsLoading;
  const modsTitle = modsLoading
    ? t('modpack_mods_loading')
    : t('modpack_mods_panel_title');

  function closeMenu() {
    setMenuOpen(false);
  }

  function toggleSort(col: ModpackSortColumn) {
    if (sortCol === col) {
      setSortAsc((prev) => !prev);
    } else {
      setSortCol(col);
      setSortAsc(col === 'name' || col === 'description' || col === 'factorio');
    }
  }

  function sortClass(column: ModpackSortColumn): string {
    const active = sortCol === column;
    return [
      'mods-sort-th',
      active ? 'mods-sort-th--active' : '',
      active && sortAsc ? 'mods-sort-th--asc' : '',
      active && !sortAsc ? 'mods-sort-th--desc' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  function onRowClick(row: ModpackRow, ev: MouseEvent) {
    ev.stopPropagation();
    modpacks.setSelected(row.name);
    const clickedName = !!(ev.target as HTMLElement).closest(
      'td.mods-col-name',
    );
    if (clickedName) {
      setMenuName(row.name);
      setMenuPos({ x: ev.clientX + 2, y: ev.clientY + 2 });
      setMenuOpen(true);
    } else {
      closeMenu();
    }
  }

  function onRowContextMenu(row: ModpackRow, ev: MouseEvent) {
    ev.preventDefault();
    ev.stopPropagation();
    modpacks.setSelected(row.name);
    setMenuName(row.name);
    setMenuPos({ x: ev.clientX + 2, y: ev.clientY + 2 });
    setMenuOpen(true);
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = modpacks.rows;
    if (q) {
      list = list.filter((p) => {
        const name = String(p.name || '').toLowerCase();
        const desc = String(p.description || '').toLowerCase();
        const fv = String(modpacks.formatFactorio(p) || '').toLowerCase();
        return name.includes(q) || desc.includes(q) || fv.includes(q);
      });
    }
    return [...list].sort((a, b) => compareModpacks(a, b, sortCol, sortAsc));
  }, [modpacks, search, sortCol, sortAsc]);

  const modpacksListEnterKey = useMemo(() => {
    if (!filteredRows.length) return 'modpacks-empty';
    return `modpacks-${filteredRows.length}-${filteredRows.map((r) => r.name).join('|')}`;
  }, [filteredRows]);

  return (
    <div
      id="tabPanelModpacks"
      className="tab-panel tab-panel--active modpacks-tab"
      role="tabpanel"
      aria-labelledby="tabBtnModpacks"
    >
      <section
        className={
          'panel modpacks-tab__panel fcc-drop-target' +
          (isDraggingOver ? ' is-drag-over' : '')
        }
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
          if (files?.length) void modpacks.importPack(files);
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

        <div className="panel__body modpacks-tab__body">
          <div className="mods-toolbar modpacks-toolbar">
            <div className="mods-toolbar__section mods-toolbar__section--actions">
              <SearchField
                type="text"
                id="inpModpacksSearch"
                className="mods-toolbar__search"
                placeholder={t('search_placeholder')}
                autoComplete="off"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span className="mods-toolbar__sep" aria-hidden="true" />
              <div className="mods-toolbar__btn-group">
                <button
                  type="button"
                  className="btn btn--toolbar-icon"
                  id="btnModpackRefresh"
                  title={t('update_list_btn')}
                  aria-label={t('update_list_btn')}
                  onClick={() => {
                    setSearch('');
                    void modpacks.reload();
                  }}
                >
                  <IconRefresh size={18} />
                </button>
                <button
                  type="button"
                  className="btn btn--with-icon"
                  id="btnModpackSave"
                  disabled={!modpacks.canSaveCurrent || modpacks.serverBusy}
                  onClick={modpacks.saveCurrent}
                >
                  <AppIcon name="save" size={16} />
                  {t('modpack_save_btn')}
                </button>
                <button
                  type="button"
                  className="btn btn--danger btn--with-icon"
                  id="btnModpackReset"
                  disabled={modpacks.serverBusy}
                  onClick={() => void modpacks.reset()}
                >
                  <AppIcon name="reset" size={16} />
                  {t('reset_btn')}
                </button>
              </div>
              <span className="mods-toolbar__sep" aria-hidden="true" />
              <div className="mods-toolbar__btn-group">
                <button
                  type="button"
                  className="btn btn--with-icon"
                  id="btnModpackExport"
                  disabled={!modpacks.selected || modpacks.serverBusy}
                  onClick={() =>
                    modpacks.selected && modpacks.exportPack(modpacks.selected)
                  }
                >
                  <AppIcon name="download" size={16} />
                  {t('modpack_export_btn')}
                </button>
                <input
                  ref={importRef}
                  type="file"
                  id="inpModpackImport"
                  className="input input--file"
                  accept=".fcc,.zip,application/json,application/zip,application/x-zip-compressed"
                  style={{ display: 'none' }}
                  disabled={modpacks.serverBusy}
                  onChange={(ev) => {
                    void modpacks.importPack(ev.target.files);
                    ev.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="btn btn--with-icon"
                  id="btnModpackImport"
                  disabled={modpacks.serverBusy}
                  onClick={() => importRef.current?.click()}
                >
                  <AppIcon name="upload" size={16} />
                  {t('modpack_import_btn')}
                </button>
              </div>
              <span className="mods-toolbar__grow" aria-hidden="true" />
              <div className="mods-toolbar__meta-group">
                {modpacks.activeName ? (
                  <span
                    id="modpackActivePill"
                    className="active-modpack-pill"
                    title={t('modpack_active_label') || undefined}
                  >
                    {modpacks.activeName}
                  </span>
                ) : null}
                <button
                  type="button"
                  className="mods-toolbar__portal-link modpacks-toolbar__mode-link"
                  id="btnModpackActivateMode"
                  title={t('program_modpack_activate_use_symlinks_tip')}
                  onClick={() =>
                    goToProgramSettings('cbSelectorModpackActivateUseSymlinks')
                  }
                >
                  <AppIcon name="settings" size={15} />
                  <span>
                    {modpacks.activateUseSymlinks
                      ? t('modpack_activate_mode_symlinks')
                      : t('modpack_activate_mode_copy')}
                  </span>
                </button>
              </div>
            </div>
          </div>

          {initialLoading ? (
            <TabLoadingPlaceholder
              variant="split"
              label={t('tab_data_loading')}
              className="modpacks-tab__loading"
            />
          ) : (
            <div className="modpacks-split">
              <div className="modpacks-split__main">
                <motion.div
                  className="table-wrap table-wrap--motion-list modpacks-tab__table-wrap"
                  variants={reduced ? undefined : LIST_WRAP_VARIANTS}
                  initial={reduced ? false : 'hidden'}
                  animate={reduced ? undefined : 'show'}
                  key={modpacksListEnterKey}
                >
                  <table
                    className="data data--modpacks data--mods"
                    id="tblModpack"
                  >
                    <thead>
                      <tr>
                        {SORT_COLUMNS.map((col) => (
                          <th
                            key={col.key}
                            id={col.thId}
                            scope="col"
                            className={[col.className, sortClass(col.key)]
                              .filter(Boolean)
                              .join(' ')}
                            data-modpacks-sort={col.key}
                            aria-sort={
                              sortCol === col.key
                                ? sortAsc
                                  ? 'ascending'
                                  : 'descending'
                                : 'none'
                            }
                            onClick={() => toggleSort(col.key)}
                            style={{ cursor: 'pointer' }}
                          >
                            {t(col.i18n)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <motion.tbody
                      id="tblModpackBody"
                      variants={reduced ? undefined : LIST_CONTAINER_VARIANTS}
                      initial={reduced ? false : 'hidden'}
                      animate={reduced ? undefined : 'show'}
                    >
                      {filteredRows.map((p) => {
                        const isActive =
                          modpacks.activeName && p.name === modpacks.activeName;
                        const isSelected = modpacks.selected === p.name;
                        const fv = modpacks.formatFactorio(p);
                        const desc = String(p.description || '').trim();
                        return (
                          <motion.tr
                            key={p.name}
                            className={
                              [
                                isSelected ? 'mods-row--selected' : '',
                                isActive ? 'modpack-row--active' : '',
                              ]
                                .filter(Boolean)
                                .join(' ') || undefined
                            }
                            variants={reduced ? undefined : LIST_ROW_VARIANTS}
                            onClick={(ev) =>
                              onRowClick(p, ev)
                            }
                            onContextMenu={(ev) =>
                              onRowContextMenu(p, ev)
                            }
                          >
                            <td className="mods-col-name modpacks-col-name">
                              <span className="instance-name-cell">
                                <span
                                  className={
                                    'instance-run-dot' +
                                    (isActive ? ' instance-run-dot--on' : '')
                                  }
                                  title={
                                    isActive
                                      ? t('modpack_active_label')
                                      : undefined
                                  }
                                />
                                <span className="modpack-name-text">
                                  {p.name}
                                </span>
                              </span>
                            </td>
                            <td className="modpacks-col-count">
                              {p.mods_count != null
                                ? String(p.mods_count)
                                : '-'}
                            </td>
                            <td className="modpacks-col-size">
                              {modpacks.formatSize(p.size_bytes)}
                            </td>
                            <td className="modpacks-col-flag">
                              {p.has_mod_settings ? (
                                <span
                                  className="modpack-settings-check"
                                  title={t('modpack_list_header_settings')}
                                >
                                  ✓
                                </span>
                              ) : (
                                <span className="muted">—</span>
                              )}
                            </td>
                            <td className="modpacks-col-factorio" title={fv}>
                              {fv}
                            </td>
                            <td className="modpacks-col-created">
                              {formatPanelDateOnly(p.created_at, '-')}
                            </td>
                            <td
                              className="modpacks-col-desc"
                              title={desc || undefined}
                            >
                              {desc || '—'}
                            </td>
                          </motion.tr>
                        );
                      })}
                      {filteredRows.length === 0 && (
                        <tr>
                          <td colSpan={7} className="muted modpacks-empty-cell">
                            {search.trim()
                              ? t('instances_search_no_results')
                              : t('modpack_details_no_selection')}
                          </td>
                        </tr>
                      )}
                    </motion.tbody>
                  </table>
                </motion.div>
              </div>

              <div
                className={
                  'modpacks-split__side modpacks-detail-card' +
                  (modsLoading ? ' modpacks-detail-card--loading' : '')
                }
              >
                <header className="modpacks-detail-card__header">
                  <span className="modpacks-detail-card__title-group">
                    <span
                      className="modpacks-detail-card__title"
                      id="modpackDetailsTitle"
                    >
                      {modsTitle}
                    </span>
                  </span>
                  <span className="modpacks-detail-card__meta">
                    {mods.length > 0 && !modsLoading ? (
                      <span className="mods-toolbar__badge">
                        <span>
                          {t('modpack_panel_total_count', mods.length)}
                        </span>
                      </span>
                    ) : null}
                  </span>
                </header>
                <div className="modpacks-detail-card__body">
                  <div
                    className={
                      'table-wrap table-wrap--enter modpacks-tab__table-wrap modpack-mods-wrap' +
                      (modsLoading ? ' modpack-mods-wrap--loading' : '')
                    }
                    aria-busy={modsLoading}
                    aria-live="polite"
                  >
                    <table className="data data--mods modpack-mods-table">
                      <thead>
                        <tr>
                          <th>{t('mod_list_col_name')}</th>
                          <th className="modpacks-mods-col-version">
                            {t('mod_list_col_version')}
                          </th>
                        </tr>
                      </thead>
                      <tbody id="tblModpackDetailsBody">
                        {modsLoading ? (
                          <ModpackModsLoadingRows />
                        ) : (
                          <>
                            {mods.map((m) => (
                              <tr key={`${m.name}-${m.version}`}>
                                <td className="mods-col-name">
                                  {m.display_name || m.name}
                                </td>
                                <td className="modpacks-mods-col-version">
                                  {m.version || '-'}
                                </td>
                              </tr>
                            ))}
                            {!mods.length && (
                              <tr>
                                <td
                                  colSpan={2}
                                  className="muted modpacks-empty-cell"
                                >
                                  {modpacks.selected
                                    ? '—'
                                    : t('modpack_details_no_selection')}
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
          )}
        </div>
      </section>

      <ModpackRowMenu
        open={menuOpen}
        name={menuName}
        serverBusy={modpacks.serverBusy}
        isActive={!!modpacks.activeName && menuName === modpacks.activeName}
        position={menuPos}
        onClose={closeMenu}
        onActivate={() => {
          closeMenu();
          modpacks.openActivateDialog(menuName);
        }}
        onRename={() => {
          closeMenu();
          modpacks.openRenameDialog(menuName);
        }}
        onDelete={() => {
          closeMenu();
          void modpacks.remove(menuName).catch(modpacks.handleError);
        }}
        t={t}
      />

      <ModpackSaveModal modpacks={modpacks} t={t} />
      <ModpackRenameModal modpacks={modpacks} t={t} />
      <ModpackImportModal modpacks={modpacks} t={t} />
      <ModpackExportModal modpacks={modpacks} t={t} />
      <ModpackActivateModal modpacks={modpacks} t={t} />
    </div>
  );
}
