import { useRef, useState, type MouseEvent } from 'react';
import { AppIcon } from '../AppIcon';
import { formatPanelDateOnly } from '../../lib/datetimeUtils';
import type { ModpacksApi } from '../../hooks/useModpacks';
import { TabLoadingPlaceholder, tabInitialLoad } from '../TabLoadingPlaceholder';
import type { ModpackRow } from '../../types/modpack';
import { ModpackActivateModal } from './ModpackActivateModal';
import { ModpackExportModal } from './ModpackExportModal';
import { ModpackImportModal } from './ModpackImportModal';
import { ModpackRowMenu } from './ModpackRowMenu';
import { ModpackRenameModal } from './ModpackRenameModal';
import { ModpackSaveModal } from './ModpackSaveModal';

interface ModpacksPanelProps {
  modpacks: ModpacksApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

const MODPACK_MODS_LOADING_ROW_COUNT = 6;

function ModpackModsLoadingRows() {
  return (
    <>
      {Array.from({ length: MODPACK_MODS_LOADING_ROW_COUNT }, (_, i) => (
        <tr key={i} className="modpack-mod-row modpack-mod-row--loading" aria-hidden="true">
          <td>
            <span className="save-mod-skeleton save-mod-skeleton--name" />
          </td>
          <td>
            <span className="save-mod-skeleton save-mod-skeleton--ver" />
          </td>
        </tr>
      ))}
    </>
  );
}

export function ModpacksPanel({ modpacks, t }: ModpacksPanelProps) {
  const importRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuName, setMenuName] = useState('');
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const packCount = modpacks.rows.length;
  const initialLoading = tabInitialLoad(modpacks.loading, packCount > 0);
  const packListTitle =
    packCount > 0 ? t('modpack_panel_title_count', packCount) : t('modpack_section_title');

  const mods = modpacks.details?.mods || [];
  const modsLoading = !!modpacks.selected && modpacks.detailsLoading;
  const modsTitle = modsLoading
    ? t('modpack_mods_loading')
    : !modpacks.selected
      ? t('modpack_mods_panel_title')
      : mods.length > 0
        ? t('modpack_mods_panel_count', mods.length)
        : t('modpack_mods_panel_title');

  function closeMenu() {
    setMenuOpen(false);
  }

  function onRowClick(row: ModpackRow, ev: MouseEvent) {
    ev.stopPropagation();
    modpacks.setSelected(row.name);
    const clickedName = !!(ev.target as HTMLElement).closest('td.mods-col-name');
    if (clickedName) {
      setMenuName(row.name);
      setMenuPos({ x: ev.clientX + 2, y: ev.clientY + 2 });
      setMenuOpen(true);
    } else {
      closeMenu();
    }
  }

  return (
    <div id="modpacksPanelRoot" className="modpacks-panel">
      <div className="mods-toolbar modpacks-toolbar">
        <div className="mods-toolbar__section mods-toolbar__section--actions">
          <div className="mods-toolbar__btn-group">
            <button
              type="button"
              className="btn btn--toolbar-icon"
              id="btnModpackRefresh"
              title={t('update_list_btn')}
              aria-label={t('update_list_btn')}
              onClick={() => void modpacks.reload()}
            >
              <AppIcon name="refresh" size={16} />
            </button>
          </div>
          <span className="mods-toolbar__sep" aria-hidden="true" />
          <div className="mods-toolbar__btn-group">
            <button
              type="button"
              className="btn btn--with-icon"
              id="btnModpackSave"
              disabled={!modpacks.canSaveCurrent}
              onClick={modpacks.saveCurrent}
            >
              <AppIcon name="save" size={16} />
              {t('modpack_save_btn')}
            </button>
            <button
              type="button"
              className="btn btn--danger btn--with-icon"
              id="btnModpackReset"
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
              disabled={!modpacks.selected}
              onClick={() => modpacks.selected && modpacks.exportPack(modpacks.selected)}
            >
              <AppIcon name="download" size={16} />
              {t('modpack_export_btn')}
            </button>
            <input
              ref={importRef}
              type="file"
              id="inpModpackImport"
              className="input input--file"
              accept=".fcc,application/json"
              style={{ display: 'none' }}
              onChange={(ev) => {
                void modpacks.importPack(ev.target.files);
                ev.target.value = '';
              }}
            />
            <button type="button" className="btn btn--with-icon" id="btnModpackImport" onClick={() => importRef.current?.click()}>
              <AppIcon name="upload" size={16} />
              {t('modpack_import_btn')}
            </button>
          </div>
          <span className="mods-toolbar__grow" aria-hidden="true" />
          <span
            className={
              'modpacks-toolbar__mode mods-list-panel__badge' +
              (modpacks.activateUseSymlinks ? ' mods-list-panel__badge--enabled' : '')
            }
            id="modpackActivateModeLbl"
            title={t('program_modpack_activate_use_symlinks_tip')}
          >
            {modpacks.activateUseSymlinks
              ? t('modpack_activate_mode_symlinks')
              : t('modpack_activate_mode_copy')}
          </span>
        </div>
      </div>

      {initialLoading ? (
        <TabLoadingPlaceholder variant="split" label={t('tab_data_loading')} className="modpacks-tab__loading" />
      ) : (
      <div className="modpacks-split">
        <div className="mods-list-panel mods-list-panel--static modpacks-split__main">
          <div className="mods-list-panel__header">
            <span className="mods-list-panel__summary-main">
              <AppIcon name="folder_copy" size={18} className="mods-list-panel__title-icon" aria-hidden />
              <span className="mods-list-panel__title">{packListTitle}</span>
              {modpacks.activeName ? (
                <span className="active-modpack-pill mods-list-panel__modpack-pill">{modpacks.activeName}</span>
              ) : null}
            </span>
            <span className="mods-list-panel__meta">
              {packCount > 0 ? (
                <span className="mods-list-panel__badge mods-list-panel__badge--enabled">
                  {t('modpack_panel_total_count', packCount)}
                </span>
              ) : null}
            </span>
          </div>
          <div className="mods-list-panel__body">
            <div className="table-wrap table-wrap--enter mods-list-panel__table-wrap">
              <table className="data data--modpacks data--mods" id="tblModpack">
                <thead>
                  <tr>
                    <th>{t('instances_col_name')}</th>
                    <th>{t('modpack_list_header_mods')}</th>
                    <th>{t('modpack_list_header_size')}</th>
                    <th>{t('modpack_list_header_settings')}</th>
                    <th>{t('modpack_list_header_factorio')}</th>
                    <th>{t('modpack_list_header_created')}</th>
                    <th>{t('modpack_list_header_description')}</th>
                  </tr>
                </thead>
                <tbody id="tblModpackBody">
                  {modpacks.rows.map((p) => {
                    const isActive = modpacks.activeName && p.name === modpacks.activeName;
                    const fv = modpacks.formatFactorio(p);
                    const desc = String(p.description || '').trim();
                    return (
                      <tr
                        key={p.name}
                        className={modpacks.selected === p.name ? 'mods-row--selected' : undefined}
                        onClick={(ev) => onRowClick(p, ev)}
                      >
                        <td className="mods-col-name">
                          <span className="instance-name-cell">
                            <span className={'instance-run-dot' + (isActive ? ' instance-run-dot--on' : '')} />
                            <span>{p.name}</span>
                          </span>
                        </td>
                        <td className="modpacks-col-count">{p.mods_count != null ? String(p.mods_count) : '-'}</td>
                        <td className="modpacks-col-size">{modpacks.formatSize(p.size_bytes)}</td>
                        <td className="modpacks-col-flag">{p.has_mod_settings ? '✓' : '—'}</td>
                        <td className="modpacks-col-factorio" title={fv}>
                          {fv}
                        </td>
                        <td className="modpacks-col-created">{formatPanelDateOnly(p.created_at, '-')}</td>
                        <td className="modpacks-col-desc" title={desc || undefined}>
                          {desc || '—'}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div
          className={
            'mods-list-panel mods-list-panel--static modpacks-split__side' +
            (modsLoading ? ' mods-list-panel--loading' : '')
          }
        >
          <div className="mods-list-panel__header">
            <span className="mods-list-panel__summary-main">
              <AppIcon name="list" size={18} className="mods-list-panel__title-icon" aria-hidden />
              <span className="mods-list-panel__title" id="modpackDetailsTitle">
                {modsTitle}
              </span>
            </span>
          </div>
          <div className="mods-list-panel__body">
            <div
              className={
                'table-wrap table-wrap--enter mods-list-panel__table-wrap modpack-mods-wrap' +
                (modsLoading ? ' mods-list-panel__table-wrap--loading' : '')
              }
              aria-busy={modsLoading}
              aria-live="polite"
            >
              <table className="data data--mods modpack-mods-table">
                <thead>
                  <tr>
                    <th>{t('mod_list_col_name')}</th>
                    <th>{t('mod_list_col_version')}</th>
                  </tr>
                </thead>
                <tbody id="tblModpackDetailsBody">
                  {modsLoading ? (
                    <ModpackModsLoadingRows />
                  ) : (
                    <>
                      {mods.map((m) => (
                        <tr key={`${m.name}-${m.version}`}>
                          <td>{m.display_name || m.name}</td>
                          <td>{m.version || '-'}</td>
                        </tr>
                      ))}
                      {!mods.length && (
                        <tr>
                          <td colSpan={2} className="muted">
                            {modpacks.selected ? '—' : t('modpack_details_no_selection')}
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
