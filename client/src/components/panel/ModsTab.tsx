import { memo, useCallback, useMemo, useState, type MouseEvent } from 'react';
import { motion } from 'motion/react';
import { IconUpload } from '@tabler/icons-react';
import { AppIcon } from '../AppIcon';
import { FccSwitch } from '../FccSwitch';
import { SearchField } from '../SearchField';
import { RefreshButton } from '../RefreshButton';
import type { ModsApi } from '../../hooks/useMods';
import {
  TabLoadingPlaceholder,
  tabInitialLoad,
} from '../TabLoadingPlaceholder';
import { formatPanelDateOnly } from '../../lib/datetimeUtils';
import { formatPanelActorDisplay } from '../../lib/actorUtils';
import { hardNavigate } from '../../lib/hardNavigate';
import { LIST_WRAP_VARIANTS } from '../../lib/motionPresets';
import { webEffectsReduced } from '../../theme/webEffects';
import {
  compareModVersionDesc,
  formatModpackSizeBytes,
  maxInstalledModVersion,
  modAuthorPlain,
  formatModAuthorDisplay,
  portalVersionNewer,
} from '../../lib/modUtils';
import type { ModRow, ModSortColumn } from '../../types/mods';
import { ModPortalVersionsModal } from './ModPortalVersionsModal';
import { ModsDownloadAllModal } from './ModsDownloadAllModal';
import { ModsFromSaveModal } from './ModsFromSaveModal';
import { ModsInstallModal } from './ModsInstallModal';
import { ModsRowMenu } from './ModsRowMenu';
import { useColumnPrefs } from '../../hooks/useColumnPrefs';
import {
  MOD_COLUMN_CONFIG,
  modsColumnPrefs,
  type ModColumnKey,
} from '../../lib/modsColumnPrefs';
import { InstanceColumnsDropdown } from '../instances/InstanceColumnsDropdown';

interface ModsTabProps {
  mods: ModsApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

const CONFIGURABLE_COLUMNS: Record<
  ModColumnKey,
  {
    i18n: string;
    thId?: string;
    className?: string;
  }
> = {
  type: { i18n: 'mod_list_col_type', className: 'mods-col-type' },
  author: { i18n: 'mod_list_col_author', className: 'mods-col-author' },
  size: { i18n: 'mod_list_col_size', className: 'mods-col-size' },
  version: { i18n: 'mod_list_col_version', className: 'mods-col-version' },
  portal: { i18n: 'mod_list_col_portal', className: 'mods-col-portal' },
  installed: {
    i18n: 'mod_list_col_installed_date',
    className: 'mods-col-installed',
  },
  installed_by: {
    i18n: 'mod_list_col_installed_by',
    className: 'mods-col-installed-by',
  },
};

interface ModTableRowProps {
  m: ModRow;
  isSelected: boolean;
  visibleColumns: ModColumnKey[];
  serverProcessBusy: boolean;
  blockUpdates: boolean;
  onRowClick: (row: ModRow, tr: HTMLTableRowElement, ev: MouseEvent) => void;
  onToggleEnabled: (name: string, enabled: boolean) => void;
  onSetVersion: (name: string, version: string) => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

const ModTableRow = memo(function ModTableRow({
  m,
  isSelected,
  visibleColumns,
  serverProcessBusy,
  blockUpdates,
  onRowClick,
  onToggleEnabled,
  onSetVersion,
  t,
}: ModTableRowProps) {
  const portalNewer = useMemo(
    () =>
      !m.is_builtin &&
      portalVersionNewer(m.portal_version || '', maxInstalledModVersion(m)),
    [m],
  );

  const av = useMemo(
    () =>
      Array.isArray(m.available_versions)
        ? m.available_versions.slice().sort(compareModVersionDesc)
        : [],
    [m.available_versions],
  );

  const author = useMemo(() => {
    const authorFull = m.is_builtin
      ? 'Wube Software'
      : modAuthorPlain(m) || '—';
    return formatModAuthorDisplay(authorFull);
  }, [m]);

  const rowClassName =
    [
      isSelected ? 'mods-row--selected' : '',
      !m.enabled ? 'mods-row--disabled' : '',
    ]
      .filter(Boolean)
      .join(' ') || undefined;

  return (
    <tr
      className={rowClassName}
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
            serverProcessBusy ? t('server_running_mutate_blocked') : undefined
          }
          disabled={serverProcessBusy}
          onClick={(ev) => {
            ev.stopPropagation();
            onToggleEnabled(m.name, !m.enabled);
          }}
        >
          <span className="mods-enabled-mark" aria-hidden="true" />
        </button>
      </td>
      <td className="mods-col-name">{m.display_name || m.name}</td>
      {visibleColumns.map((key) => {
        switch (key) {
          case 'type': {
            const isBuiltin = !!m.is_builtin;
            const isCustom = !isBuiltin && m.portal_version === '~';
            const label = isBuiltin
              ? t('mod_type_builtin')
              : isCustom
                ? t('mod_type_custom')
                : t('mod_type_portal');
            return (
              <td key={key} className="mods-col-type">
                {label}
              </td>
            );
          }
          case 'author':
            return (
              <td
                key={key}
                className="mods-col-author"
                title={author.truncated ? author.full : undefined}
              >
                {author.display}
              </td>
            );
          case 'size':
            return (
              <td key={key} className="mods-col-size">
                {formatModpackSizeBytes(m.zip_size_bytes)}
              </td>
            );
          case 'version':
            return (
              <td key={key} className="mods-col-version">
                {av.length > 1 && !m.is_builtin ? (
                  <div className="mods-version-select-wrap">
                    <select
                      className="mods-version-select"
                      data-name={m.name}
                      value={String(m.local_version || av[0] || '')}
                      disabled={serverProcessBusy || blockUpdates}
                      onClick={(ev) => ev.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        onSetVersion(m.name, e.target.value);
                      }}
                      title={t('mod_list_col_version')}
                    >
                      {av.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <span className="mods-version-text">
                    {m.local_version || '-'}
                  </span>
                )}
              </td>
            );
          case 'portal':
            return (
              <td
                key={key}
                className={
                  'mods-col-portal' + (portalNewer ? ' mods-portal-newer' : '')
                }
              >
                {portalNewer ? (
                  <span
                    className="mods-portal-newer-badge"
                    title={t(
                      'mod_list_update_available',
                      m.portal_version || '',
                    )}
                  >
                    <AppIcon
                      name="arrow_upward"
                      size={12}
                      className="mods-portal-newer-icon"
                    />
                    <span>{m.portal_version}</span>
                  </span>
                ) : (
                  m.portal_version || '-'
                )}
              </td>
            );
          case 'installed':
            return (
              <td key={key} className="mods-col-installed">
                {formatPanelDateOnly(m.install_date)}
              </td>
            );
          case 'installed_by':
            return (
              <td key={key} className="mods-col-installed-by">
                {m.is_builtin
                  ? t('mod_list_builtin_installed_by')
                  : formatPanelActorDisplay(m.installed_by, t)}
              </td>
            );
          default:
            return null;
        }
      })}
    </tr>
  );
});

export function ModsTab({ mods, t }: ModsTabProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuItem, setMenuItem] = useState<ModRow | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const modsColumns = useColumnPrefs(modsColumnPrefs);
  const visibleColumns = useMemo(
    () => modsColumns.order.filter((key) => modsColumns.columns[key] !== false),
    [modsColumns.order, modsColumns.columns],
  );
  const totalCount = mods.rawRows.length;
  const initialLoading = tabInitialLoad(mods.loading, totalCount > 0);
  const reduced = webEffectsReduced();
  const enabledCount = useMemo(
    () => mods.rawRows.filter((m) => m.enabled).length,
    [mods.rawRows],
  );

  const modsListEnterKey = useMemo(() => {
    if (!mods.rows.length) return 'mods-empty';
    return `mods-${mods.rows.length}-${mods.rows.map((r) => r.name).join('|')}`;
  }, [mods.rows]);

  function closeMenu() {
    setMenuOpen(false);
  }

  const handleRowClick = useCallback(
    (row: ModRow, tr: HTMLTableRowElement, ev: MouseEvent) => {
      ev.stopPropagation();
      if ((ev.target as HTMLElement).closest('select')) return;
      if ((ev.target as HTMLElement).closest('button.mods-enabled-btn')) return;

      const x = Number.isFinite(ev.clientX)
        ? Math.round(ev.clientX + 2)
        : Math.round(tr.getBoundingClientRect().left + 12);
      const y = Number.isFinite(ev.clientY)
        ? Math.round(ev.clientY + 2)
        : Math.round(tr.getBoundingClientRect().bottom + 6);
      setMenuItem(row);
      setMenuPos({ x, y });
      setMenuOpen(true);
    },
    [],
  );

  const handleToggleEnabled = useCallback(
    (name: string, enabled: boolean) => {
      void mods.toggleEnabled(name, enabled).catch(mods.handleError);
    },
    [mods],
  );

  const handleSetVersion = useCallback(
    (name: string, version: string) => {
      void mods.setVersion(name, version).catch(mods.handleError);
    },
    [mods],
  );

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

  const [isDraggingOver, setIsDraggingOver] = useState(false);

  return (
    <div
      id="tabPanelMods"
      className="tab-panel tab-panel--active mods-tab"
      role="tabpanel"
      aria-labelledby="tabBtnMods"
    >
      <section
        className={
          'panel mods-tab__panel fcc-drop-target' +
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
          if (files?.length) void mods.uploadArchives(files);
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
        <div className="panel__body mods-tab__body">
          <div className="mods-toolbar">
            <div className="mods-toolbar__section mods-toolbar__section--actions">
              <SearchField
                type="text"
                id="modsSearchInput"
                className="mods-toolbar__search"
                placeholder={t('search_placeholder')}
                autoComplete="off"
                value={mods.search}
                onChange={(e) => mods.setSearch(e.target.value)}
              />
              <span className="mods-toolbar__sep" aria-hidden="true" />
              <div className="mods-toolbar__btn-group">
                <RefreshButton
                  className="btn btn--toolbar-icon"
                  id="btnModRefresh"
                  title={t('update_list_btn')}
                  aria-label={t('update_list_btn')}
                  onClick={() => {
                    mods.setSearch('');
                    void mods.reload();
                  }}
                />
                <button
                  type="button"
                  className={
                    'btn btn--with-icon mods-toolbar__install-open-btn' +
                    (!mods.loading && !mods.hasPortalMods
                      ? ' btn--update-available'
                      : '')
                  }
                  id="btnModOpenInstall"
                  onClick={mods.openInstallModal}
                >
                  <AppIcon name="add" size={16} />
                  {t('mod_list_install_modal_open_btn')}
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
                  <AppIcon name="package_settings" size={16} />
                  {t('mod_settings_btn')}
                </button>
                <button
                  type="button"
                  className="btn btn--with-icon"
                  id="btnModCheckUpdates"
                  disabled={!mods.hasPortalMods}
                  onClick={mods.openUpdatesModal}
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
                  disabled={
                    !mods.hasPortalMods || mods.serverBusy || mods.blockUpdates
                  }
                  onClick={() => void mods.updateAll()}
                >
                  <AppIcon name="package_update" size={16} />
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
                  {mods.allNonBuiltinDisabled
                    ? t('mod_list_enable_all_btn')
                    : t('mod_list_disable_all_btn')}
                </button>
                <button
                  type="button"
                  className="btn btn--with-icon"
                  id="btnModDownloadAll"
                  disabled={!mods.hasPortalMods}
                  onClick={mods.openDownloadAllDialog}
                >
                  <AppIcon name="download" size={16} />
                  {t('mod_list_download_all_btn')}
                </button>
              </div>
              <span className="mods-toolbar__grow" aria-hidden="true" />
              <div className="mods-toolbar__meta-group">
                {mods.activeModpack ? (
                  <span
                    id="modsActiveModpackLbl"
                    className="active-modpack-pill"
                  >
                    {mods.activeModpack}
                  </span>
                ) : null}
                {totalCount > 0 ? (
                  <span
                    id="modsEnabledCountBadge"
                    className="mods-toolbar__badge mods-toolbar__badge--enabled"
                    title={t(
                      'mod_list_panel_enabled_count',
                      enabledCount,
                      totalCount,
                    )}
                  >
                    <span>
                      {t(
                        'mod_list_panel_enabled_count',
                        enabledCount,
                        totalCount,
                      )}
                    </span>
                  </span>
                ) : null}
                <FccSwitch
                  id="modRemoveOldZips"
                  className="mods-toolbar__switch row__inline-switch"
                  labelClassName="row__inline-switch-label"
                  checked={mods.removeOldZips}
                  onChange={(checked) =>
                    void mods.setRemoveOldZipsPref(checked)
                  }
                  label={t('mod_list_remove_old_zips_cb')}
                />
                <InstanceColumnsDropdown
                  idPrefix="Mods"
                  config={MOD_COLUMN_CONFIG}
                  columns={modsColumns.columns}
                  order={modsColumns.order}
                  onToggleColumn={modsColumns.setColumn}
                  onMoveColumn={modsColumns.moveColumn}
                  onReset={modsColumns.resetColumns}
                  t={t}
                />
              </div>
            </div>
          </div>
          {initialLoading ? (
            <TabLoadingPlaceholder
              variant="table"
              label={t('tab_data_loading')}
            />
          ) : (
            <motion.div
              className="table-wrap table-wrap--motion-list mods-tab__table-wrap"
              variants={reduced ? undefined : LIST_WRAP_VARIANTS}
              initial={reduced ? false : 'hidden'}
              animate={reduced ? undefined : 'show'}
              key={modsListEnterKey}
            >
              <table className="data data--mods" id="tblMods">
                <thead>
                  <tr>
                    <th
                      id="thModsEnabledSort"
                      scope="col"
                      className={['mods-col-enabled', sortClass('enabled')]
                        .filter(Boolean)
                        .join(' ')}
                      data-mods-sort="enabled"
                      aria-sort={
                        mods.sortColumn === 'enabled'
                          ? mods.sortAsc
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                      onClick={() => mods.toggleSort('enabled')}
                      style={{ cursor: 'pointer' }}
                    >
                      ✓
                    </th>
                    <th
                      id="thModsNameSort"
                      scope="col"
                      className={sortClass('name')}
                      data-mods-sort="name"
                      aria-sort={
                        mods.sortColumn === 'name'
                          ? mods.sortAsc
                            ? 'ascending'
                            : 'descending'
                          : 'none'
                      }
                      onClick={() => mods.toggleSort('name')}
                      style={{ cursor: 'pointer' }}
                    >
                      {t('mod_list_col_name')}
                    </th>
                    {visibleColumns.map((key) => {
                      const col = CONFIGURABLE_COLUMNS[key];
                      if (!col) return null;
                      return (
                        <th
                          key={key}
                          id={col.thId}
                          scope="col"
                          className={[col.className, sortClass(key)]
                            .filter(Boolean)
                            .join(' ')}
                          data-mods-sort={key}
                          aria-sort={
                            mods.sortColumn === key
                              ? mods.sortAsc
                                ? 'ascending'
                                : 'descending'
                              : 'none'
                          }
                          onClick={() => mods.toggleSort(key)}
                          style={{ cursor: 'pointer' }}
                        >
                          {t(col.i18n)}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody id="tblModsBody">
                  {mods.rows.map((m) => (
                    <ModTableRow
                      key={m.name}
                      m={m}
                      isSelected={menuOpen && menuItem?.name === m.name}
                      visibleColumns={visibleColumns}
                      serverProcessBusy={mods.serverProcessBusy}
                      blockUpdates={mods.blockUpdates}
                      onRowClick={handleRowClick}
                      onToggleEnabled={handleToggleEnabled}
                      onSetVersion={handleSetVersion}
                      t={t}
                    />
                  ))}
                </tbody>
              </table>
            </motion.div>
          )}
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
        onChangeVersion={() => {
          if (!menuItem) return;
          closeMenu();
          mods.openVersionPicker(menuItem.name);
        }}
        onDownload={() => {
          if (!menuItem) return;
          closeMenu();
          void mods.downloadMod(menuItem.name).catch(mods.handleError);
        }}
        onChangelog={() => {
          if (!menuItem) return;
          closeMenu();
          mods.openModCard(menuItem, 'changelog');
        }}
        onOpenCard={() => {
          if (!menuItem) return;
          closeMenu();
          mods.openModCard(menuItem);
        }}
        onRemove={() => {
          if (!menuItem) return;
          closeMenu();
          void mods.removeMod(menuItem.name).catch(mods.handleError);
        }}
        t={t}
      />

      <ModsInstallModal mods={mods} t={t} />

      <ModPortalVersionsModal
        open={mods.portalVersionsModalOpen}
        modName={mods.portalVersionsModalMod}
        onClose={mods.closeVersionPicker}
        onInstall={(name, version) => {
          void mods.installFromUrl(name, version);
        }}
        onModListChange={() => {
          void mods.reload();
        }}
        serverBusy={mods.serverBusy}
        jobRunning={mods.modJob.open || !!mods.modJob.status?.running}
        refreshTrigger={mods.rawRows}
        t={t}
      />

      <ModsFromSaveModal mods={mods} t={t} />

      <ModsDownloadAllModal
        open={mods.downloadAllConfirmOpen}
        archiveName={mods.downloadAllArchiveName}
        localModsCount={mods.downloadAllModsCount}
        includeDisabled={mods.downloadAllIncludeDisabled}
        includeSettings={mods.downloadAllIncludeSettings}
        onIncludeDisabledChange={mods.setDownloadAllIncludeDisabled}
        onIncludeSettingsChange={mods.setDownloadAllIncludeSettings}
        onClose={mods.closeDownloadAllDialog}
        onConfirm={() => void mods.downloadAll().catch(mods.handleError)}
        t={t}
      />
    </div>
  );
}
