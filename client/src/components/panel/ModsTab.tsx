import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { AppIcon } from '../AppIcon';
import { FactorioPortalUsername } from '../FactorioPortalUsername';
import { FccSwitch } from '../FccSwitch';
import { SearchField } from '../SearchField';
import type { ModsApi } from '../../hooks/useMods';
import { TabLoadingPlaceholder, tabInitialLoad } from '../TabLoadingPlaceholder';
import { formatPanelDateOnly } from '../../lib/datetimeUtils';
import { formatPanelActorDisplay } from '../../lib/actorUtils';
import { hardNavigate } from '../../lib/hardNavigate';
import {
  compareModVersionDesc,
  formatModpackSizeBytes,
  maxInstalledModVersion,
  modAuthorPlain,
  formatModAuthorDisplay,
  portalVersionNewer,
} from '../../lib/modUtils';
import type { ModRow, ModSortColumn } from '../../types/mods';
import { ModsFromSaveModal } from './ModsFromSaveModal';
import { ModsRowMenu } from './ModsRowMenu';

interface ModsTabProps {
  mods: ModsApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

const SORT_COLUMNS: { key: ModSortColumn; i18n: string; thId?: string; className?: string }[] = [
  { key: 'enabled', i18n: 'mod_list_col_enabled', thId: 'thModsEnabledSort', className: 'mods-col-enabled' },
  { key: 'name', i18n: 'mod_list_col_name' },
  { key: 'author', i18n: 'mod_list_col_author', className: 'mods-col-author' },
  { key: 'size', i18n: 'mod_list_col_size', className: 'mods-col-size' },
  { key: 'version', i18n: 'mod_list_col_version', className: 'mods-col-version' },
  { key: 'portal', i18n: 'mod_list_col_portal', className: 'mods-col-portal' },
  { key: 'installed', i18n: 'mod_list_col_installed_date', className: 'mods-col-installed' },
  { key: 'installed_by', i18n: 'mod_list_col_installed_by', className: 'mods-col-installed-by' },
];

export function ModsTab({ mods, t }: ModsTabProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuItem, setMenuItem] = useState<ModRow | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const uploadRef = useRef<HTMLInputElement>(null);
  const saveUploadRef = useRef<HTMLInputElement>(null);
  const [listExpanded, setListExpanded] = useState(true);
  const [listAnimKey, setListAnimKey] = useState(0);

  useEffect(() => {
    if (mods.search.trim()) setListExpanded(true);
  }, [mods.search]);

  const totalCount = mods.rawRows.length;
  const initialLoading = tabInitialLoad(mods.loading, totalCount > 0);
  const enabledCount = useMemo(() => mods.rawRows.filter((m) => m.enabled).length, [mods.rawRows]);
  const listTitle =
    mods.search.trim() && totalCount !== mods.rows.length
      ? t('mod_list_panel_title_filtered', mods.rows.length, totalCount)
      : mods.rows.length > 0
        ? t('mod_list_panel_title_count', mods.rows.length)
        : t('mod_list_editor_title');

  function closeMenu() {
    setMenuOpen(false);
  }

  function onRowClick(row: ModRow, _tr: HTMLTableRowElement, ev: MouseEvent) {
    ev.stopPropagation();
    if ((ev.target as HTMLElement).closest('select')) return;
    if ((ev.target as HTMLElement).closest('button.mods-enabled-btn')) return;

    mods.setSelectedMod(row.name);
    const clickedName = !!(ev.target as HTMLElement).closest('td.mods-col-name');
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

  function sortClass(column: ModSortColumn): string {
    const active = mods.sortColumn === column;
    return [
      'mods-sort-th',
      active ? 'mods-sort-th--active' : '',
      active && mods.sortAsc ? 'mods-sort-th--asc' : '',
      active && !mods.sortAsc ? 'mods-sort-th--desc' : '',
    ]
      .filter(Boolean)
      .join(' ');
  }

  return (
    <div id="tabPanelMods" className="tab-panel tab-panel--active mods-tab" role="tabpanel" aria-labelledby="tabBtnMods">
      <section className="panel mods-tab__panel">
        <div className="panel__body mods-tab__body">
          <div className="mods-toolbar">
            <div className="mods-toolbar__section mods-toolbar__section--install">
              <div className={'mods-toolbar__field' + (mods.installBlink ? ' mods-toolbar__field--accent-blink' : '')}>
                <AppIcon name="add_link" size={18} className="mods-toolbar__field-icon" aria-hidden />
                <input
                  type="text"
                  id="modInstallInput"
                  className="input mods-toolbar__field-input"
                  autoComplete="off"
                  placeholder={t('mod_list_install_from_url_prompt')}
                  disabled={mods.serverBusy}
                  value={mods.installInput}
                  onChange={(e) => mods.setInstallInput(e.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter') void mods.installFromUrl();
                  }}
                />
                <button
                  type="button"
                  className="btn mods-toolbar__field-action"
                  id="btnModInstall"
                  disabled={mods.serverBusy}
                  onClick={() => void mods.installFromUrl()}
                >
                  {t('mod_list_install_from_url_btn')}
                </button>
              </div>
              <span className="mods-toolbar__sep" aria-hidden="true" />
              <div className="mods-toolbar__btn-group">
                <input
                  ref={uploadRef}
                  type="file"
                  id="inpModUpload"
                  className="input input--file"
                  accept=".zip,.dat,application/zip,application/octet-stream"
                  multiple
                  style={{ display: 'none' }}
                  disabled={mods.serverBusy}
                  onChange={(ev) => {
                    void mods.uploadArchives(ev.target.files);
                    ev.target.value = '';
                  }}
                />
                <button
                  type="button"
                  className="btn btn--with-icon"
                  id="btnModUpload"
                  disabled={mods.serverBusy}
                  onClick={() => uploadRef.current?.click()}
                >
                  <AppIcon name="upload" size={16} />
                  {t('mod_list_upload_btn')}
                </button>
                <input
                  ref={saveUploadRef}
                  type="file"
                  id="inpModsFromSave"
                  className="input input--file"
                  accept=".zip,application/zip"
                  style={{ display: 'none' }}
                  disabled={mods.serverBusy}
                  onChange={(ev) => {
                    const f = ev.target.files?.[0];
                    ev.target.value = '';
                    if (f) void mods.previewFromSave(f);
                  }}
                />
                <button
                  type="button"
                  className="btn btn--with-icon"
                  id="btnModsFromSave"
                  disabled={mods.serverBusy}
                  onClick={() => saveUploadRef.current?.click()}
                >
                  <AppIcon name="upload" size={16} />
                  {t('mods_from_save_btn')}
                </button>
              </div>
              <div className="mods-toolbar__portal-meta">
                <FactorioPortalUsername
                  username={mods.portalUsername}
                  t={t}
                  className="mods-toolbar__portal-username"
                />
                <a
                  href="https://mods.factorio.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mods-toolbar__portal-link"
                >
                  <AppIcon name="open_portal" size={16} />
                  {t('mod_list_portal_website_link')}
                </a>
              </div>
            </div>
            <div className="mods-toolbar__section mods-toolbar__section--actions">
              <SearchField
                type="text"
                id="modsSearchInput"
                className="mods-toolbar__search"
                placeholder={t('mods_search_placeholder')}
                autoComplete="off"
                value={mods.search}
                onChange={(e) => mods.setSearch(e.target.value)}
              />
              <span className="mods-toolbar__sep" aria-hidden="true" />
              <div className="mods-toolbar__btn-group">
                <button
                  type="button"
                  className="btn btn--toolbar-icon"
                  id="btnModRefresh"
                  title={t('update_list_btn')}
                  aria-label={t('update_list_btn')}
                  onClick={() => {
                    mods.setSearch('');
                    void mods.reload();
                  }}
                >
                  <AppIcon name="refresh" size={16} />
                </button>
                <button
                  type="button"
                  className="btn btn--with-icon"
                  id="btnModSettings"
                  disabled={mods.serverBusy}
                  onClick={() => {
                    hardNavigate('/panel/mod-settings');
                  }}
                >
                  <AppIcon name="edit_document" size={16} />
                  {t('mod_settings_btn')}
                </button>
                <button
                  type="button"
                  className="btn btn--with-icon"
                  id="btnModCheckUpdates"
                  disabled={!mods.hasPortalMods}
                  onClick={() => void mods.checkUpdates(true)}
                >
                  <AppIcon name="update" size={16} />
                  {t('mod_list_check_portal_btn')}
                </button>
              </div>
              <span className="mods-toolbar__sep" aria-hidden="true" />
              <div className="mods-toolbar__btn-group">
                <button
                  type="button"
                  className="btn btn--with-icon"
                  id="btnModUpdateAll"
                  disabled={!mods.hasPortalMods || mods.serverBusy || mods.blockUpdates}
                  onClick={() => void mods.updateAll()}
                >
                  <AppIcon name="mod_update_" size={16} />
                  {t('mod_list_update_all_btn')}
                </button>
                <button
                  type="button"
                  className="btn btn--with-icon"
                  id="btnModToggleAll"
                  disabled={!mods.hasPortalMods || mods.serverProcessBusy}
                  onClick={() => void mods.toggleAllEnabled()}
                >
                  <AppIcon name="mode_off_on" size={16} />
                  {mods.allNonBuiltinDisabled ? t('mod_list_enable_all_btn') : t('mod_list_disable_all_btn')}
                </button>
                <button
                  type="button"
                  className="btn btn--with-icon"
                  id="btnModDownloadAll"
                  disabled={!mods.hasPortalMods}
                  onClick={() => void mods.downloadAll().catch(mods.handleError)}
                >
                  <AppIcon name="download" size={16} />
                  {t('mod_list_download_all_btn')}
                </button>
              </div>
              <span className="mods-toolbar__grow" aria-hidden="true" />
              <FccSwitch
                id="modRemoveOldZips"
                className="mods-toolbar__switch row__inline-switch"
                labelClassName="row__inline-switch-label"
                checked={mods.removeOldZips}
                onChange={(checked) => void mods.setRemoveOldZipsPref(checked)}
                label={t('mod_list_remove_old_zips_cb')}
              />
            </div>
          </div>
          <div className={'mods-list-panel' + (listExpanded ? ' mods-list-panel--expanded' : '')}>
            <button
              type="button"
              className="mods-list-panel__summary"
              id="btnModsListToggle"
              aria-expanded={listExpanded}
              aria-controls="modsListBody"
              onClick={() => {
                setListExpanded((open) => {
                  const next = !open;
                  if (next) setListAnimKey((k) => k + 1);
                  return next;
                });
              }}
            >
              <span className="mods-list-panel__chevron" aria-hidden="true" />
              <span className="mods-list-panel__summary-main">
                <AppIcon name="list" size={18} className="mods-list-panel__title-icon" aria-hidden />
                <span className="mods-list-panel__title">{listTitle}</span>
                {mods.activeModpack ? (
                  <span id="modsActiveModpackLbl" className="active-modpack-pill mods-list-panel__modpack-pill">
                    {mods.activeModpack}
                  </span>
                ) : null}
              </span>
              <span className="mods-list-panel__meta">
                {totalCount > 0 ? (
                  <span className="mods-list-panel__badge mods-list-panel__badge--enabled">
                    {t('mod_list_panel_enabled_count', enabledCount, totalCount)}
                  </span>
                ) : null}
              </span>
            </button>
            <div
              id="modsListBody"
              className={'mods-list-panel__collapse' + (listExpanded ? ' is-expanded' : '')}
              aria-hidden={!listExpanded}
            >
              <div
                className="mods-list-panel__collapse-inner"
                {...(!listExpanded ? { inert: true as const } : {})}
              >
                <div className="mods-list-panel__body">
                  {initialLoading ? (
                    <TabLoadingPlaceholder variant="table" label={t('tab_data_loading')} />
                  ) : (
                  <div className="table-wrap table-wrap--enter mods-list-panel__table-wrap">
                    <table className="data data--mods" id="tblMods">
                  <thead>
                    <tr>
                      {SORT_COLUMNS.map((col) => (
                        <th
                          key={col.key}
                          id={col.thId}
                          scope="col"
                          className={[col.className, sortClass(col.key)].filter(Boolean).join(' ')}
                          data-mods-sort={col.key}
                          aria-sort={
                            mods.sortColumn === col.key
                              ? mods.sortAsc
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                          onClick={() => mods.toggleSort(col.key)}
                          style={{ cursor: 'pointer' }}
                        >
                          {col.key === 'enabled' ? '✓' : t(col.i18n)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody id="tblModsBody" key={listAnimKey}>
                    {mods.rows.map((m) => {
                      const portalNewer = !m.is_builtin && portalVersionNewer(m.portal_version || '', maxInstalledModVersion(m));
                      const av = Array.isArray(m.available_versions) ? m.available_versions : [];
                      const authorFull = m.is_builtin ? 'Wube Software' : modAuthorPlain(m) || '—';
                      const author = formatModAuthorDisplay(authorFull);
                      return (
                        <tr
                          key={m.name}
                          className={
                            [
                              mods.selectedMod === m.name ? 'mods-row--selected' : '',
                              !m.enabled ? 'mods-row--disabled' : '',
                            ]
                              .filter(Boolean)
                              .join(' ') || undefined
                          }
                          onClick={(ev) => onRowClick(m, ev.currentTarget, ev)}
                        >
                          <td className="mods-col-enabled">
                            <button
                              type="button"
                              className="mods-enabled-btn"
                              data-name={m.name}
                              aria-pressed={m.enabled ? 'true' : 'false'}
                              aria-label={t('mod_list_col_enabled')}
                              title={
                                mods.serverProcessBusy ? t('server_running_mutate_blocked') : undefined
                              }
                              disabled={mods.serverProcessBusy}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                void mods.toggleEnabled(m.name, !m.enabled).catch(mods.handleError);
                              }}
                            >
                              <span className="mods-enabled-mark" aria-hidden="true" />
                            </button>
                          </td>
                          <td className="mods-col-name">{m.display_name || m.name}</td>
                          <td className="mods-col-author" title={author.truncated ? author.full : undefined}>
                            {author.display}
                          </td>
                          <td className="mods-col-size">{formatModpackSizeBytes(m.zip_size_bytes)}</td>
                          <td className="mods-col-version">
                            {av.length > 1 && !m.is_builtin ? (
                              <select
                                className="input mods-version-select"
                                data-name={m.name}
                                value={String(m.local_version || av[0] || '')}
                                disabled={mods.serverProcessBusy || mods.blockUpdates}
                                onClick={(ev) => ev.stopPropagation()}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  void mods.setVersion(m.name, e.target.value).catch(mods.handleError);
                                }}
                              >
                                {av
                                  .slice()
                                  .sort(compareModVersionDesc)
                                  .map((v) => (
                                    <option key={v} value={v}>
                                      {v}
                                    </option>
                                  ))}
                              </select>
                            ) : (
                              m.local_version || '-'
                            )}
                          </td>
                          <td className={'mods-col-portal' + (portalNewer ? ' mods-portal-newer' : '')}>
                            {m.portal_version || '-'}
                          </td>
                          <td className="mods-col-installed">{formatPanelDateOnly(m.install_date)}</td>
                          <td className="mods-col-installed-by">
                            {m.is_builtin
                              ? t('mod_list_builtin_installed_by')
                              : formatPanelActorDisplay(m.installed_by, t)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                    </table>
                  </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <ModsRowMenu
        open={menuOpen}
        item={menuItem}
        position={menuPos}
        serverBusy={mods.serverBusy}
        blockUpdates={mods.blockUpdates}
        onClose={closeMenu}
        onUpdate={() => {
          if (!menuItem) return;
          closeMenu();
          void mods.updateSelected(menuItem.name);
        }}
        onDownload={() => {
          if (!menuItem) return;
          closeMenu();
          void mods.downloadMod(menuItem.name).catch(mods.handleError);
        }}
        onChangelog={() => {
          if (!menuItem) return;
          closeMenu();
          void mods.showChangelog(menuItem);
        }}
        onRemove={() => {
          if (!menuItem) return;
          closeMenu();
          void mods.removeMod(menuItem.name).catch(mods.handleError);
        }}
        t={t}
      />

      <ModsFromSaveModal mods={mods} t={t} />
    </div>
  );
}
