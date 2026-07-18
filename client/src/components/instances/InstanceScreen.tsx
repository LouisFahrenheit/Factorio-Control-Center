import { motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { isAdmin, userHasTab } from '../../hooks/useAuth';
import type { useInstances } from '../../hooks/useInstances';
import { useMaintenance } from '../../hooks/useMaintenance';
import { useMaintenanceTaskEditor } from '../../hooks/useMaintenanceTaskEditor';
import { useProgramSettings } from '../../hooks/useProgramSettings';
import { useWebUsers } from '../../hooks/useWebUsers';
import { useInstanceEditor } from '../../hooks/useInstanceEditor';
import { useLocale } from '../../i18n/LocaleProvider';
import {
  SCREEN_BODY_VARIANTS,
  SCREEN_HEADER_VARIANTS,
  SCREEN_SECTION_VARIANTS,
} from '../../lib/motionPresets';
import { webEffectsReduced } from '../../theme/webEffects';
import type { AuthUser, InstanceItem } from '../../types/instance';
import { InstanceAccessTab } from './InstanceAccessTab';
import { WebAccessHelpModal } from './WebAccessHelpModal';
import { SectionHelpModal } from '../SectionHelpModal';
import { INSTANCES_HELP, MAINTENANCE_HELP } from '../../lib/instanceHelpContent';
import { SlidingTabIndicator } from '../SlidingTabHighlight';
import { TabPanelsTransition } from '../TabPanelsTransition';
import { TabLoadingPlaceholder, tabInitialLoad } from '../TabLoadingPlaceholder';
import { useSlidingTabIndicator, TAB_INDICATOR_ID_ATTR } from '../../hooks/useSlidingTabIndicator';
import { InstanceBootstrapProgressModal } from './InstanceBootstrapProgressModal';
import { InstanceCloneModal } from './InstanceCloneModal';
import { InstanceDeleteModal, type InstanceDeleteOptions } from './InstanceDeleteModal';
import { InstanceDeleteProgressModal } from './InstanceDeleteProgressModal';
import { InstanceEditorModal } from './InstanceEditorModal';
import { InstanceMaintenanceTab } from './InstanceMaintenanceTab';
import { InstancePathBrowserModal } from './InstancePathBrowserModal';
import { AppIcon } from '../AppIcon';
import { InstanceRowMenu } from './InstanceRowMenu';
import { InstanceSettingsTab } from './InstanceSettingsTab';
import { InstanceTable } from './InstanceTable';
import { InstanceServersBar } from './InstanceServersBar';
import { InstanceServersEmpty, InstanceServersNoResults } from './InstanceServersEmpty';
import {
  filterInstanceRows,
  instanceSortDefaultAsc,
  sortInstanceRows,
  type InstanceSortColumn,
} from '../../lib/instanceListUtils';

type InstancesApi = ReturnType<typeof useInstances>;

type InstanceTabKey = 'servers' | 'maintenance' | 'settings' | 'access';

interface InstanceScreenProps {
  user: AuthUser | null;
  instances: InstancesApi;
  onOpenPanel: (item: InstanceItem) => void;
  listEnterDelay?: number;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function InstanceScreen({ user, instances, onOpenPanel, listEnterDelay = 0, t }: InstanceScreenProps) {
  const { reload: reloadLocale, defaultWebCredentialsActive } = useLocale();
  const reduced = webEffectsReduced();
  const [activeTab, setActiveTab] = useState<InstanceTabKey>('servers');
  const [maintInnerTab, setMaintInnerTab] = useState<'tasks' | 'reports'>('tasks');
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuItem, setMenuItem] = useState<InstanceItem | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteItem, setDeleteItem] = useState<InstanceItem | null>(null);
  const [deleteOptions, setDeleteOptions] = useState<InstanceDeleteOptions>({
    deleteData: false,
    deleteFromDisk: false,
  });
  const [cloneOpen, setCloneOpen] = useState(false);
  const [cloneItem, setCloneItem] = useState<InstanceItem | null>(null);
  const [cloneName, setCloneName] = useState('');
  const [cloneBusy, setCloneBusy] = useState(false);
  const [accessHelpOpen, setAccessHelpOpen] = useState(false);
  const [serversHelpOpen, setServersHelpOpen] = useState(false);
  const [maintenanceHelpOpen, setMaintenanceHelpOpen] = useState(false);
  const [serverSearch, setServerSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<InstanceSortColumn>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const tableWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const tab = sessionStorage.getItem('fcc_open_instance_tab');
    if (tab === 'maintenance' && userHasTab(user, 'maintenance')) {
      setActiveTab('maintenance');
    }
    sessionStorage.removeItem('fcc_open_instance_tab');
  }, [user]);

  const tabAllowed = useCallback(
    (key: InstanceTabKey) => {
      if (key === 'settings' || key === 'access') return isAdmin(user);
      if (key === 'maintenance') return userHasTab(user, 'maintenance');
      return true;
    },
    [user],
  );

  const activateTab = (key: InstanceTabKey) => {
    if (!tabAllowed(key)) return;
    setActiveTab(key);
    if (key !== 'servers') setMenuOpen(false);
  };

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const onRowClick = (item: InstanceItem, rowEl: HTMLTableRowElement, ev: MouseEvent) => {
    ev.stopPropagation();
    const x = Number.isFinite(ev.clientX)
      ? Math.round(ev.clientX + 2)
      : Math.round(rowEl.getBoundingClientRect().left + 12);
    const y = Number.isFinite(ev.clientY)
      ? Math.round(ev.clientY + 2)
      : Math.round(rowEl.getBoundingClientRect().bottom + 6);
    setMenuItem(item);
    setMenuPos({ x, y });
    setMenuOpen(true);
  };

  const onRowDoubleClick = (item: InstanceItem, ev: MouseEvent) => {
    ev.stopPropagation();
    setMenuOpen(false);
    onOpenPanel(item);
  };

  const onSortColumn = (col: InstanceSortColumn) => {
    if (sortColumn === col) {
      setSortAsc((v) => !v);
      return;
    }
    setSortColumn(col);
    setSortAsc(instanceSortDefaultAsc(col));
  };

  const openDelete = (item: InstanceItem) => {
    setDeleteItem(item);
    setDeleteOptions({ deleteData: false, deleteFromDisk: false });
    setDeleteOpen(true);
  };

  const closeDelete = useCallback(() => {
    setDeleteOpen(false);
    setDeleteItem(null);
    setDeleteOptions({ deleteData: false, deleteFromDisk: false });
  }, []);

  const confirmDelete = () => {
    if (!deleteItem) return;
    const item = deleteItem;
    const opts = { ...deleteOptions };
    closeDelete();
    instances
      .removeInstance(item, opts)
      .catch((e) => instances.handleError(e));
  };

  const openClone = (item: InstanceItem) => {
    setCloneItem(item);
    setCloneName(String(item.name || '') + ' (clone)');
    setCloneBusy(false);
    setCloneOpen(true);
  };

  const closeClone = useCallback(() => {
    if (cloneBusy) return;
    setCloneOpen(false);
    setCloneItem(null);
    setCloneName('');
    setCloneBusy(false);
  }, [cloneBusy]);

  const confirmClone = () => {
    if (!cloneItem || cloneBusy) return;
    const name = cloneName.trim();
    if (!name) return;
    const item = cloneItem;
    setCloneBusy(true);
    instances
      .cloneInstance(item, name)
      .catch((e) => instances.handleError(e))
      .finally(() => {
        setCloneBusy(false);
        setCloneOpen(false);
        setCloneItem(null);
        setCloneName('');
      });
  };

  const {
    rows,
    showEndMaintenanceAll,
    getEffectiveStatus,
    quickAction,
    startAll,
    stopAll,
    killAll,
    endMaintenanceAll,
    endMaintenanceOne,
    handleError,
    selectedId,
    loading: instancesLoading,
  } = instances;

  const filteredRows = useMemo(
    () => filterInstanceRows(rows, serverSearch, getEffectiveStatus, t),
    [rows, serverSearch, getEffectiveStatus, t],
  );

  const displayRows = useMemo(
    () => sortInstanceRows(filteredRows, sortColumn, sortAsc, getEffectiveStatus),
    [filteredRows, sortColumn, sortAsc, getEffectiveStatus],
  );

  const maintenanceEnabled = activeTab === 'maintenance' || activeTab === 'settings';
  const maintenance = useMaintenance(
    maintenanceEnabled,
    activeTab === 'maintenance',
    rows,
    t,
  );
  const maintenanceTaskEditor = useMaintenanceTaskEditor(
    maintenance,
    rows,
    selectedId || '',
    t,
  );
  const programSettings = useProgramSettings(activeTab === 'settings', t, () => void reloadLocale());
  const webUsers = useWebUsers(activeTab === 'access', t);

  const instanceEditor = useInstanceEditor({
    rows,
    t,
    reload: instances.reload,
    setInstanceMsg: instances.setInstanceMsg,
    setInstanceMsgTimed: instances.setInstanceMsgTimed,
  });

  const hasServers = rows.length > 0;
  const activeMaintTasks = useMemo(
    () => maintenance.tasks.filter((task) => !!task.active).length,
    [maintenance.tasks],
  );

  const serversListEnterKey = useMemo(() => {
    if (activeTab !== 'servers') return 'off';
    if (!displayRows.length) return 'servers-empty';
    return `servers-${displayRows.length}-${displayRows.map((r) => String(r.id)).join('|')}`;
  }, [activeTab, displayRows]);

  const mainTabsRef = useRef<HTMLDivElement>(null);
  const mainTabIndicator = useSlidingTabIndicator(mainTabsRef, activeTab);

  const defaultPasswordWarning =
    defaultWebCredentialsActive && isAdmin(user) && tabAllowed('access');
  const accessTabBlink = defaultPasswordWarning && activeTab !== 'access';

  return (
    <motion.section
      id="instanceScreen"
      className="panel instance-screen"
      variants={reduced ? undefined : SCREEN_SECTION_VARIANTS}
      initial={reduced ? false : 'hidden'}
      animate={reduced ? undefined : 'show'}
    >
      {defaultPasswordWarning ? (
        <div className="instances-default-creds-banner" role="alert">
          <AppIcon name="person_shield" size={20} />
          <span data-i18n="instances_default_password_banner">{t('instances_default_password_banner')}</span>
        </div>
      ) : null}
      <motion.div className="instance-screen__header" variants={reduced ? undefined : SCREEN_HEADER_VARIANTS}>
        <div
          ref={mainTabsRef}
          className="sub-tabs instance-screen__tabs"
          role="tablist"
          aria-label={t('instances_title')}
        >
          <SlidingTabIndicator rect={mainTabIndicator} variant="sub-tabs" />
          <button
            type="button"
            className={
              'sub-tabs__tab btn--with-icon' + (activeTab === 'servers' ? ' sub-tabs__tab--active' : '')
            }
            id="instanceTabServersBtn"
            role="tab"
            aria-selected={activeTab === 'servers'}
            {...{ [TAB_INDICATOR_ID_ATTR]: 'servers' }}
            onClick={() => activateTab('servers')}
            data-i18n="instances_tab_servers"
          >
            <span className="sub-tabs__tab-inner">
              <AppIcon name="list" size={18} />
              {t('instances_tab_servers')}
            </span>
          </button>
          {tabAllowed('maintenance') && (
            <button
              type="button"
              className={
                'sub-tabs__tab btn--with-icon' + (activeTab === 'maintenance' ? ' sub-tabs__tab--active' : '')
              }
              id="instanceTabMaintenanceBtn"
              role="tab"
              aria-selected={activeTab === 'maintenance'}
              {...{ [TAB_INDICATOR_ID_ATTR]: 'maintenance' }}
              onClick={() => activateTab('maintenance')}
              data-i18n="instances_tab_maintenance"
            >
              <span className="sub-tabs__tab-inner">
                <AppIcon name="maintenance" size={18} />
                {t('instances_tab_maintenance')}
              </span>
            </button>
          )}
          {tabAllowed('access') && (
            <button
              type="button"
              className={
                'sub-tabs__tab btn--with-icon' +
                (activeTab === 'access' ? ' sub-tabs__tab--active' : '') +
                (accessTabBlink ? ' sub-tabs__tab--default-creds-alert' : '')
              }
              id="instanceTabAccessBtn"
              role="tab"
              aria-selected={activeTab === 'access'}
              {...{ [TAB_INDICATOR_ID_ATTR]: 'access' }}
              onClick={() => activateTab('access')}
              data-i18n="instances_tab_access"
            >
              <span className="sub-tabs__tab-inner">
                <AppIcon name="users" size={18} />
                {t('instances_tab_access')}
              </span>
            </button>
          )}
          {tabAllowed('settings') && (
            <button
              type="button"
              className={
                'sub-tabs__tab btn--with-icon' + (activeTab === 'settings' ? ' sub-tabs__tab--active' : '')
              }
              id="instanceTabSettingsBtn"
              role="tab"
              aria-selected={activeTab === 'settings'}
              {...{ [TAB_INDICATOR_ID_ATTR]: 'settings' }}
              onClick={() => activateTab('settings')}
              data-i18n="instances_tab_settings"
            >
              <span className="sub-tabs__tab-inner">
                <AppIcon name="settings" size={18} />
                {t('instances_tab_settings')}
              </span>
            </button>
          )}
        </div>
        {activeTab === 'access' && (
          <div className="instance-servers-toolbar" role="toolbar" aria-label={t('instances_tab_access')}>
            <div className="instance-servers-toolbar__segment">
              <button
                type="button"
                className="instance-servers-toolbar__btn"
                id="btnWebUserCreate"
                data-i18n-title="web_user_create_btn"
                title={t('web_user_create_btn')}
                aria-label={t('web_user_create_btn')}
                onClick={() => webUsers.openCreate()}
              >
                <AppIcon name="person_add" size={20} />
              </button>
              <button
                type="button"
                className="instance-servers-toolbar__btn"
                id="btnWebAccessHelp"
                data-i18n-title="web_access_help_btn"
                title={t('web_access_help_btn')}
                aria-label={t('web_access_help_btn')}
                onClick={() => setAccessHelpOpen(true)}
              >
                <AppIcon name="help" size={20} />
              </button>
            </div>
          </div>
        )}
        {activeTab === 'maintenance' && (
          <div className="instance-servers-toolbar" role="toolbar" aria-label={t('instances_tab_maintenance')}>
            {maintInnerTab === 'tasks' && (
              <>
                <div className="instance-servers-toolbar__segment">
                  <button
                    type="button"
                    className="instance-servers-toolbar__btn"
                    id="btnMaintAdd"
                    data-i18n-title="maintenance_add_btn"
                    title={t('maintenance_add_btn')}
                    aria-label={t('maintenance_add_btn')}
                    onClick={() => maintenanceTaskEditor.openAdd()}
                  >
                    <AppIcon name="add" size={20} />
                  </button>
                </div>
                <div className="instance-servers-toolbar__segment">
                  <button
                    type="button"
                    className="instance-servers-toolbar__btn instance-servers-toolbar__btn--danger"
                    id="btnMaintDeactivateAll"
                    data-i18n-title="maintenance_deactivate_all_btn"
                    title={t('maintenance_deactivate_all_btn')}
                    aria-label={t('maintenance_deactivate_all_btn')}
                    disabled={activeMaintTasks === 0}
                    onClick={() => maintenance.deactivateAllTasks()}
                  >
                    <AppIcon name="stop" size={20} />
                  </button>
                </div>
              </>
            )}
            <div className="instance-servers-toolbar__segment">
              <button
                type="button"
                className="instance-servers-toolbar__btn"
                id="btnMaintenanceHelp"
                data-i18n-title="maintenance_help_btn"
                title={t('maintenance_help_btn')}
                aria-label={t('maintenance_help_btn')}
                onClick={() => setMaintenanceHelpOpen(true)}
              >
                <AppIcon name="help" size={20} />
              </button>
            </div>
          </div>
        )}
        {activeTab === 'servers' && (
          <div className="instance-servers-toolbar" role="toolbar" aria-label={t('instances_tab_servers')}>
            <div className="instance-servers-toolbar__segment">
              <button
                type="button"
                className={
                  'instance-servers-toolbar__btn' + (!hasServers ? ' btn--update-available' : '')
                }
                id="btnInstanceAdd"
                data-i18n-title="instances_add_btn"
                title={t('instances_add_btn')}
                aria-label={t('instances_add_btn')}
                onClick={() => instanceEditor.openAdd()}
              >
                <AppIcon name="add" size={20} />
              </button>
              <button
                type="button"
                className="instance-servers-toolbar__btn"
                id="btnInstancesHelp"
                data-i18n-title="instances_help_btn"
                title={t('instances_help_btn')}
                aria-label={t('instances_help_btn')}
                onClick={() => setServersHelpOpen(true)}
              >
                <AppIcon name="help" size={20} />
              </button>
            </div>
            <div className="instance-servers-toolbar__segment">
              <button
                type="button"
                className="instance-servers-toolbar__btn"
                id="btnInstanceStartAll"
                data-i18n-title="instances_start_all_btn"
                title={t('instances_start_all_btn')}
                aria-label={t('instances_start_all_btn')}
                onClick={() => startAll().catch(handleError)}
              >
                <AppIcon name="start" size={20} />
              </button>
              <button
                type="button"
                className="instance-servers-toolbar__btn instance-servers-toolbar__btn--danger"
                id="btnInstanceStopAll"
                data-i18n-title="instances_stop_all_btn"
                title={t('instances_stop_all_btn')}
                aria-label={t('instances_stop_all_btn')}
                onClick={() => stopAll().catch(handleError)}
              >
                <AppIcon name="stop" size={20} />
              </button>
              <button
                type="button"
                className="instance-servers-toolbar__btn instance-servers-toolbar__btn--danger"
                id="btnInstanceKillAll"
                data-i18n-title="instances_kill_all_btn"
                title={t('instances_kill_all_btn')}
                aria-label={t('instances_kill_all_btn')}
                onClick={() => killAll().catch(handleError)}
              >
                <AppIcon name="kill" size={20} />
              </button>
            </div>
            {showEndMaintenanceAll && (
              <div className="instance-servers-toolbar__segment">
                <button
                  type="button"
                  className="instance-servers-toolbar__btn"
                  id="btnInstanceEndMaintenanceAll"
                  data-i18n-title="instances_end_maintenance_all_btn"
                  title={t('instances_end_maintenance_all_btn')}
                  aria-label={t('instances_end_maintenance_all_btn')}
                  onClick={() => endMaintenanceAll().catch(handleError)}
                >
                  <AppIcon name="maintenance" size={20} />
                </button>
              </div>
            )}
          </div>
        )}
      </motion.div>

      <motion.div className="panel__body" variants={reduced ? undefined : SCREEN_BODY_VARIANTS}>
        <TabPanelsTransition activeKey={activeTab} stageClassName="tab-panels__stage instance-screen__tab-stage">
          {activeTab === 'servers' && (
            <div
              id="instanceTabServers"
              className="sub-tab-panel sub-tab-panel--active"
              role="tabpanel"
            >
              {tabInitialLoad(instancesLoading, rows.length > 0) ? (
                <TabLoadingPlaceholder variant="table" label={t('tab_data_loading')} />
              ) : !rows.length ? (
                <InstanceServersEmpty onAdd={() => instanceEditor.openAdd()} t={t} />
              ) : (
                <>
                  <InstanceServersBar
                    search={serverSearch}
                    onSearchChange={setServerSearch}
                    onRefresh={() => void instances.reload().catch(handleError)}
                    shownCount={displayRows.length}
                    totalCount={rows.length}
                    t={t}
                  />
                  {!displayRows.length ? (
                    <InstanceServersNoResults
                      query={serverSearch}
                      onClear={() => setServerSearch('')}
                      t={t}
                    />
                  ) : (
                    <InstanceTable
                      rows={displayRows}
                      enterKey={serversListEnterKey}
                      listEnterDelay={listEnterDelay}
                      getEffectiveStatus={getEffectiveStatus}
                      selectedRowId={menuOpen && menuItem ? String(menuItem.id) : ''}
                      sortColumn={sortColumn}
                      sortAsc={sortAsc}
                      onSortColumn={onSortColumn}
                      onRowClick={onRowClick}
                      onRowDoubleClick={onRowDoubleClick}
                      tableWrapRef={tableWrapRef}
                      t={t}
                    />
                  )}
                </>
              )}
            </div>
          )}

          {activeTab === 'maintenance' && (
            <InstanceMaintenanceTab
              maintenance={maintenance}
              instances={rows}
              taskEditor={maintenanceTaskEditor}
              onInnerTabChange={setMaintInnerTab}
              t={t}
            />
          )}
          {activeTab === 'settings' && (
            <InstanceSettingsTab settings={programSettings} t={t} />
          )}
          {activeTab === 'access' && <InstanceAccessTab webUsers={webUsers} t={t} />}
        </TabPanelsTransition>
      </motion.div>

      <InstanceRowMenu
        open={menuOpen}
        item={menuItem}
        position={menuPos}
        getEffectiveStatus={getEffectiveStatus}
        onClose={closeMenu}
        onStart={() => {
          if (!menuItem) return;
          closeMenu();
          quickAction(String(menuItem.id), 'start').catch(handleError);
        }}
        onStop={() => {
          if (!menuItem) return;
          closeMenu();
          quickAction(String(menuItem.id), 'stop').catch(handleError);
        }}
        onKill={() => {
          if (!menuItem) return;
          closeMenu();
          quickAction(String(menuItem.id), 'kill').catch(handleError);
        }}
        onOpen={() => {
          if (!menuItem) return;
          closeMenu();
          onOpenPanel(menuItem);
        }}
        onEdit={() => {
          if (!menuItem) return;
          closeMenu();
          instanceEditor.openEdit(menuItem);
        }}
        onClone={() => {
          if (!menuItem) return;
          closeMenu();
          openClone(menuItem);
        }}
        onDelete={() => {
          if (!menuItem) return;
          closeMenu();
          openDelete(menuItem);
        }}
        onEndMaintenance={() => {
          if (!menuItem) return;
          closeMenu();
          endMaintenanceOne(String(menuItem.id)).catch(handleError);
        }}
        t={t}
      />

      <InstanceEditorModal editor={instanceEditor} t={t} />
      <InstancePathBrowserModal editor={instanceEditor} t={t} />
      <InstanceBootstrapProgressModal editor={instanceEditor} t={t} />
      <InstanceCloneModal
        open={cloneOpen}
        item={cloneItem}
        busy={cloneBusy}
        cloneName={cloneName}
        onCloneNameChange={setCloneName}
        onConfirm={confirmClone}
        onClose={closeClone}
        t={t}
      />
      <InstanceDeleteModal
        open={deleteOpen}
        item={deleteItem}
        options={deleteOptions}
        onOptionsChange={(patch) => setDeleteOptions((o) => ({ ...o, ...patch }))}
        onConfirm={confirmDelete}
        onClose={closeDelete}
        t={t}
      />
      <InstanceDeleteProgressModal
        open={instances.deleteProgressOpen}
        serverName={instances.deleteProgressName}
        t={t}
      />
      <WebAccessHelpModal open={accessHelpOpen} onClose={() => setAccessHelpOpen(false)} t={t} />
      <SectionHelpModal
        open={serversHelpOpen}
        onClose={() => setServersHelpOpen(false)}
        t={t}
        backdropId="instancesHelpBackdrop"
        titleId="instancesHelpTitle"
        closeId="instancesHelpClose"
        content={INSTANCES_HELP}
      />
      <SectionHelpModal
        open={maintenanceHelpOpen}
        onClose={() => setMaintenanceHelpOpen(false)}
        t={t}
        backdropId="maintenanceHelpBackdrop"
        titleId="maintenanceHelpTitle"
        closeId="maintenanceHelpClose"
        content={MAINTENANCE_HELP}
      />
    </motion.section>
  );
}
