import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { IconRefresh, IconHelp } from '@tabler/icons-react';
import { AppIcon } from '../AppIcon';
import { MaintenanceReportDetail } from './MaintenanceReportDetail';
import { useListViewportPageSize } from '../../hooks/useListViewportPageSize';
import { useUserMaintenanceViewMode } from '../../hooks/useUserMaintenanceViewMode';
import {
  filterPeriodReports,
  formatTaskScheduleTime,
  instanceLabel,
  nextFireCardLabel,
  reportDurationBetween,
  reportOptionsFromRep,
  reportPeriodLabel,
  reportRunTypeLabel,
  reportSelectionKey,
  sortTasksForDisplay,
  taskOptionsSummary,
  taskScheduleSummaryLine,
  type EventKindFilter,
  type ReportKindFilter,
} from '../../lib/maintenanceUtils';
import { INSTANCE_ALL } from '@fcc/shared/maintenance-time';
import type { MaintenanceApi } from '../../hooks/useMaintenance';
import { TabLoadingPlaceholder } from '../TabLoadingPlaceholder';
import type { MaintenanceTaskEditorApi } from '../../hooks/useMaintenanceTaskEditor';
import type { InstanceItem } from '../../types/instance';
import type {
  MaintenanceReport,
  MaintenanceTask,
} from '../../types/maintenance';
import { MaintenanceInstancePickerModal } from './MaintenanceInstancePickerModal';
import { MaintenanceTaskEditorModal } from './MaintenanceTaskEditorModal';
import { MaintenanceTaskMenu } from './MaintenanceTaskMenu';
import { MaintenanceTasksBar } from './MaintenanceTasksBar';
import {
  MaintenanceTasksEmpty,
  MaintenanceTasksNoResults,
} from './MaintenanceTasksEmpty';
import { MaintenanceTaskCards } from './MaintenanceTaskCards';
import { MaintenanceTaskTable } from './MaintenanceTaskTable';
import { SearchField } from '../SearchField';

interface InstanceMaintenanceTabProps {
  maintenance: MaintenanceApi;
  instances: InstanceItem[];
  taskEditor: MaintenanceTaskEditorApi;
  onInnerTabChange?: (tab: InnerTab) => void;
  onOpenHelp?: () => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

type InnerTab = 'tasks' | 'reports';

function MaintenanceTabBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="maintenance-tab__tab-badge">{count}</span>;
}

export function InstanceMaintenanceTab({
  maintenance,
  instances,
  taskEditor,
  onInnerTabChange,
  onOpenHelp,
  t,
}: InstanceMaintenanceTabProps) {
  const [innerTab, setInnerTab] = useState<InnerTab>('tasks');
  const [viewMode, setViewMode] = useUserMaintenanceViewMode();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [serverFilter, setServerFilter] = useState('all');

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuTask, setMenuTask] = useState<MaintenanceTask | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const [reportSearch, setReportSearch] = useState('');
  const [reportKindFilter, setReportKindFilter] =
    useState<ReportKindFilter>('');
  const [eventKindFilter, setEventKindFilter] = useState<EventKindFilter>('');
  const [reportInstanceFilter, setReportInstanceFilter] = useState('');
  const [reportPage, setReportPage] = useState(0);
  const reportsListRef = useRef<HTMLDivElement>(null);

  const sortedTasks = useMemo(
    () => sortTasksForDisplay(maintenance.tasks),
    [maintenance.tasks],
  );

  const activeTasksCount = useMemo(() => {
    return maintenance.tasks.filter((task) => !!task.active).length;
  }, [maintenance.tasks]);

  const serverOptions = useMemo(() => {
    return instances
      .map((it) => ({
        id: String(it.id || '').trim(),
        name: String(it.name || it.id || '').trim(),
      }))
      .filter((it) => Boolean(it.id))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      );
  }, [instances]);

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase();

    return sortedTasks.filter((task) => {
      // Status filter
      if (statusFilter === 'active' && !task.active) return false;
      if (statusFilter === 'inactive' && task.active) return false;

      // Server filter
      if (serverFilter !== 'all') {
        const rawIds = Array.isArray(task.instance_ids)
          ? task.instance_ids.map((x) => String(x || '').trim())
          : [];
        const isAll = rawIds.length === 1 && rawIds[0] === INSTANCE_ALL;
        if (!isAll && !rawIds.includes(serverFilter)) return false;
      }

      // Search query
      if (q) {
        const schedSummary = taskScheduleSummaryLine(task, t).toLowerCase();
        const timeStr = formatTaskScheduleTime(task).toLowerCase();
        const srvLabel = instanceLabel(task, instances, t).toLowerCase();
        const optSummary = taskOptionsSummary(task, t).toLowerCase();
        const nextStr = nextFireCardLabel(task.next_fire_iso).toLowerCase();

        const match =
          schedSummary.includes(q) ||
          timeStr.includes(q) ||
          srvLabel.includes(q) ||
          optSummary.includes(q) ||
          nextStr.includes(q);

        if (!match) return false;
      }

      return true;
    });
  }, [sortedTasks, statusFilter, serverFilter, search, instances, t]);

  const reportInstanceOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const inst of instances) {
      const id = String(inst.id || '').trim();
      if (id) map.set(id, String(inst.name || id).trim() || id);
    }
    for (const rep of maintenance.reports) {
      const id = String(rep.instance_id || '').trim();
      if (id && !map.has(id))
        map.set(id, String(rep.instance_name || id).trim() || id);
    }
    return [...map.entries()].sort((a, b) =>
      a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }),
    );
  }, [instances, maintenance.reports]);

  useEffect(() => {
    onInnerTabChange?.(innerTab);
  }, [innerTab, onInnerTabChange]);

  const visibleReports = useMemo(() => {
    const base = filterPeriodReports(
      maintenance.reports,
      reportInstanceFilter || undefined,
      reportKindFilter || undefined,
      eventKindFilter || undefined,
    );
    const q = reportSearch.trim().toLowerCase();
    if (!q) return base;

    return base.filter((rep) => {
      const srv = String(
        rep.instance_name || rep.instance_id || '',
      ).toLowerCase();
      const dateStr = reportPeriodLabel(rep).toLowerCase();
      const runType = reportRunTypeLabel(rep, t).toLowerCase();
      const actor = String(rep.web_actor || '').toLowerCase();
      const err = String(rep.error || '').toLowerCase();
      const statusStr =
        rep.success !== false
          ? t('maintenance_report_ok').toLowerCase()
          : t('maintenance_report_fail').toLowerCase();
      const optionsStr = reportOptionsFromRep(rep, t).toLowerCase();

      if (
        srv.includes(q) ||
        dateStr.includes(q) ||
        runType.includes(q) ||
        actor.includes(q) ||
        err.includes(q) ||
        statusStr.includes(q) ||
        optionsStr.includes(q)
      ) {
        return true;
      }

      if (rep.steps && rep.steps.length > 0) {
        for (const st of rep.steps) {
          if (
            (st.kind && String(st.kind).toLowerCase().includes(q)) ||
            (st.error && String(st.error).toLowerCase().includes(q)) ||
            (st.web_actor && String(st.web_actor).toLowerCase().includes(q))
          ) {
            return true;
          }
        }
      }

      return false;
    });
  }, [
    maintenance.reports,
    reportInstanceFilter,
    reportKindFilter,
    eventKindFilter,
    reportSearch,
    t,
  ]);

  const reportsPageSize = useListViewportPageSize(
    reportsListRef,
    '.maint-report-row',
    innerTab === 'reports' &&
      visibleReports.length > 0 &&
      !maintenance.reportsLoading,
    [
      innerTab,
      visibleReports.length,
      maintenance.reportsLoading,
      reportInstanceFilter,
      reportKindFilter,
      eventKindFilter,
      reportSearch,
    ],
  );

  const reportPageCount = Math.max(
    1,
    Math.ceil(visibleReports.length / reportsPageSize),
  );

  const pagedReports = useMemo(() => {
    const page = Math.min(reportPage, reportPageCount - 1);
    const start = page * reportsPageSize;
    return visibleReports.slice(start, start + reportsPageSize);
  }, [visibleReports, reportPage, reportsPageSize, reportPageCount]);

  useEffect(() => {
    setReportPage(0);
  }, [reportInstanceFilter, reportKindFilter, eventKindFilter, reportSearch]);

  useEffect(() => {
    if (reportPage >= reportPageCount) {
      setReportPage(Math.max(0, reportPageCount - 1));
    }
  }, [reportPage, reportPageCount]);

  const { setSelectedReport } = maintenance;
  useEffect(() => {
    if (innerTab !== 'reports') return;
    if (!visibleReports.length) {
      setSelectedReport(null);
      return;
    }
    setSelectedReport((cur) => {
      const curKey = cur ? reportSelectionKey(cur) : '';
      const match = visibleReports.find(
        (r) => reportSelectionKey(r) === curKey,
      );
      return match || visibleReports[0];
    });
  }, [innerTab, visibleReports, setSelectedReport]);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const onTaskClick = (
    task: MaintenanceTask,
    _targetEl: HTMLElement,
    ev: MouseEvent,
  ) => {
    ev.stopPropagation();
    setMenuTask(task);
    setMenuPos({
      x: Math.round(ev.clientX + 2),
      y: Math.round(ev.clientY + 2),
    });
    setMenuOpen(true);
  };

  const selectReport = (rep: MaintenanceReport) => {
    maintenance.setSelectedReport(rep);
  };

  return (
    <div
      id="instanceTabMaintenance"
      className="sub-tab-panel sub-tab-panel--active maintenance-tab"
      role="tabpanel"
      aria-labelledby="instanceTabMaintenanceBtn"
    >
      <div className="maintenance-tab__header">
        <div
          className="sub-tabs maintenance-inner-tabs maintenance-tab__sub-tabs"
          role="tablist"
          aria-label={t('instances_tab_maintenance')}
        >
          <button
            type="button"
            className={
              'sub-tabs__tab btn--with-icon' +
              (innerTab === 'tasks' ? ' sub-tabs__tab--active' : '')
            }
            id="maintTabTasksBtn"
            role="tab"
            aria-selected={innerTab === 'tasks'}
            onClick={() => setInnerTab('tasks')}
          >
            <span className="sub-tabs__tab-inner">
              <AppIcon name="maintenance" size={16} />
              {t('maintenance_inner_tab_tasks')}
              <MaintenanceTabBadge count={maintenance.tasks.length} />
            </span>
          </button>
          <button
            type="button"
            className={
              'sub-tabs__tab btn--with-icon' +
              (innerTab === 'reports' ? ' sub-tabs__tab--active' : '')
            }
            id="maintTabReportsBtn"
            role="tab"
            aria-selected={innerTab === 'reports'}
            onClick={() => setInnerTab('reports')}
          >
            <span className="sub-tabs__tab-inner">
              <AppIcon name="history" size={16} />
              {t('maintenance_inner_tab_reports')}
              <MaintenanceTabBadge count={visibleReports.length} />
            </span>
          </button>
        </div>
      </div>

      {innerTab === 'tasks' && (
        <div
          id="maintPanelTasks"
          className="access-layout maintenance-tasks-layout"
        >
          {/* Toolbar: Search, Filters, View toggle, Actions */}
          <MaintenanceTasksBar
            search={search}
            onSearchChange={setSearch}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            serverFilter={serverFilter}
            onServerFilterChange={setServerFilter}
            serverOptions={serverOptions}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            shownCount={filteredTasks.length}
            totalCount={maintenance.tasks.length}
            activeCount={activeTasksCount}
            onRefresh={maintenance.refreshTasks}
            onOpenAdd={taskEditor.openAdd}
            onDeactivateAll={maintenance.deactivateAllTasks}
            onOpenHelp={onOpenHelp}
            t={t}
          />

          {/* Content Area */}
          <div className="maintenance-tasks-layout__content">
            {maintenance.tasksLoading && !maintenance.tasks.length ? (
              <TabLoadingPlaceholder
                variant="table"
                label={t('tab_data_loading')}
              />
            ) : maintenance.tasks.length === 0 ? (
              <MaintenanceTasksEmpty onOpenAdd={taskEditor.openAdd} t={t} />
            ) : filteredTasks.length === 0 ? (
              <MaintenanceTasksNoResults
                query={search}
                onClear={() => {
                  setSearch('');
                  setStatusFilter('all');
                  setServerFilter('all');
                }}
                t={t}
              />
            ) : viewMode === 'cards' ? (
              <MaintenanceTaskCards
                tasks={filteredTasks}
                instances={instances}
                selectedTaskId={
                  menuOpen && menuTask ? String(menuTask.id) : undefined
                }
                onOpenEdit={taskEditor.openEdit}
                onToggleActive={(tsk) =>
                  void maintenance.toggleActive(String(tsk.id), !tsk.active)
                }
                onRunNow={(tsk) => void maintenance.runNow(String(tsk.id))}
                onDeleteTask={(tsk) =>
                  void maintenance.deleteTask(String(tsk.id))
                }
                onCardClick={onTaskClick}
                t={t}
              />
            ) : (
              <MaintenanceTaskTable
                tasks={filteredTasks}
                instances={instances}
                selectedTaskId={
                  menuOpen && menuTask ? String(menuTask.id) : undefined
                }
                onOpenEdit={taskEditor.openEdit}
                onToggleActive={(tsk) =>
                  void maintenance.toggleActive(String(tsk.id), !tsk.active)
                }
                onRunNow={(tsk) => void maintenance.runNow(String(tsk.id))}
                onDeleteTask={(tsk) =>
                  void maintenance.deleteTask(String(tsk.id))
                }
                onRowClick={onTaskClick}
                t={t}
              />
            )}
          </div>
        </div>
      )}

      {innerTab === 'reports' && (
        <div className="maintenance-tasks-layout maintenance-reports-layout">
          <div
            className="access-users-bar maintenance-reports-toolbar maintenance-reports-bar"
            role="toolbar"
            aria-label={t('maintenance_inner_tab_reports')}
          >
            {/* 1. Поиск */}
            <SearchField
              id="maintenanceReportsSearchInput"
              className="access-users-bar__search maintenance-reports-bar__search"
              placeholder={t('search_placeholder')}
              autoComplete="off"
              spellCheck={false}
              value={reportSearch}
              onChange={(e) => setReportSearch(e.target.value)}
            />

            {/* 2. Фильтры */}
            <div className="access-users-bar__filters maintenance-reports-bar__filters">
              <label className="maintenance-reports-filter">
                <span className="maintenance-reports-filter__label">
                  {t('maintenance_reports_filter_instance')}
                </span>
                <select
                  className="input access-users-bar__select maintenance-reports-filter__select"
                  value={reportInstanceFilter}
                  onChange={(e) => setReportInstanceFilter(e.target.value)}
                  aria-label={t('maintenance_reports_filter_instance')}
                >
                  <option value="">
                    {t('maintenance_reports_filter_all')}
                  </option>
                  {reportInstanceOptions.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="maintenance-reports-filter">
                <span className="maintenance-reports-filter__label">
                  {t('maintenance_reports_filter_type')}
                </span>
                <select
                  className="input access-users-bar__select maintenance-reports-filter__select"
                  value={reportKindFilter}
                  onChange={(e) =>
                    setReportKindFilter(e.target.value as ReportKindFilter)
                  }
                  aria-label={t('maintenance_reports_filter_type')}
                >
                  <option value="">
                    {t('maintenance_reports_filter_all')}
                  </option>
                  <option value="manual_session">
                    {t('audit_report_kind_manual_session')}
                  </option>
                  <option value="maintenance_run">
                    {t('audit_report_kind_maintenance_run')}
                  </option>
                </select>
              </label>

              <label className="maintenance-reports-filter">
                <span className="maintenance-reports-filter__label">
                  {t('maintenance_reports_filter_event')}
                </span>
                <select
                  className="input access-users-bar__select maintenance-reports-filter__select"
                  value={eventKindFilter}
                  onChange={(e) =>
                    setEventKindFilter(e.target.value as EventKindFilter)
                  }
                  aria-label={t('maintenance_reports_filter_event')}
                >
                  <option value="">
                    {t('maintenance_reports_filter_all')}
                  </option>
                  <option value="mod">
                    {t('maintenance_reports_filter_event_mod')}
                  </option>
                  <option value="server_settings">
                    {t('maintenance_reports_filter_event_settings')}
                  </option>
                  <option value="save">
                    {t('maintenance_reports_filter_event_save')}
                  </option>
                  <option value="modpack">
                    {t('maintenance_reports_filter_event_modpack')}
                  </option>
                  <option value="factorio_update">
                    {t('maintenance_reports_filter_event_factorio')}
                  </option>
                </select>
              </label>
            </div>

            <div className="access-users-bar__actions">
              <button
                type="button"
                className="btn access-users-bar__refresh-btn"
                title={t('update_list_btn') || 'Обновить'}
                aria-label={t('update_list_btn') || 'Обновить'}
                onClick={() => void maintenance.refreshReports()}
                disabled={maintenance.reportsLoading}
              >
                <IconRefresh size={18} />
              </button>
              {onOpenHelp && (
                <button
                  type="button"
                  className="btn access-users-bar__help-btn"
                  title={t('instances_help_modal_title')}
                  aria-label={t('instances_help_modal_title')}
                  onClick={onOpenHelp}
                >
                  <IconHelp size={18} />
                </button>
              )}
            </div>
          </div>

          <div className="maintenance-reports-split">
            <div className="maintenance-reports-split__list">
              <div className="maintenance-reports-split__list-head">
                <AppIcon
                  name="history"
                  size={16}
                  className="maintenance-reports-split__list-head-icon"
                />
                <span>{t('maintenance_inner_tab_reports')}</span>
                {visibleReports.length > 0 ? (
                  <span className="maintenance-reports-split__list-count">
                    {visibleReports.length}
                  </span>
                ) : null}
              </div>
              <div className="maintenance-reports-split__list-body">
                <div
                  id="maintReportsList"
                  ref={reportsListRef}
                  className={
                    'maintenance-reports-list' +
                    (reportPageCount > 1
                      ? ' maintenance-reports-list--paged'
                      : '')
                  }
                  role="list"
                >
                  {maintenance.reportsLoading && (
                    <TabLoadingPlaceholder
                      variant="table"
                      label={t('tab_data_loading')}
                    />
                  )}
                  {!maintenance.reportsLoading && maintenance.reportsError && (
                    <p className="maintenance-tab__inline-error">
                      {maintenance.reportsError}
                    </p>
                  )}
                  {!maintenance.reportsLoading &&
                    !maintenance.reportsError &&
                    !visibleReports.length && (
                      <div className="maintenance-tab__empty maintenance-tab__empty--compact">
                        <AppIcon
                          name="history"
                          size={24}
                          className="maintenance-tab__empty-icon"
                        />
                        <span>
                          {reportSearch.trim()
                            ? t('maintenance_reports_search_no_results')
                            : t('maintenance_reports_empty')}
                        </span>
                      </div>
                    )}
                  {!maintenance.reportsLoading &&
                    pagedReports.map((rep) => {
                      const key = reportSelectionKey(rep);
                      const selected =
                        maintenance.selectedReport &&
                        reportSelectionKey(maintenance.selectedReport) === key;
                      const dur = reportDurationBetween(
                        rep.started_at,
                        rep.finished_at,
                        t,
                      );
                      return (
                        <button
                          key={key}
                          type="button"
                          className={
                            'maint-report-row' +
                            (selected ? ' maint-report-row--selected' : '')
                          }
                          role="listitem"
                          title={reportOptionsFromRep(rep, t)}
                          onClick={() => selectReport(rep)}
                        >
                          <div className="maint-report-row__body">
                            <div className="maint-report-row__line">
                              <span className="maint-report-row__date">
                                {reportPeriodLabel(rep)}
                              </span>
                              <span
                                className={
                                  'maint-report-row__badge ' +
                                  (rep.success !== false
                                    ? 'maint-report-row__badge--ok'
                                    : 'maint-report-row__badge--fail')
                                }
                              >
                                {rep.success !== false
                                  ? t('maintenance_report_ok')
                                  : t('maintenance_report_fail')}
                              </span>
                              {dur ? (
                                <span className="maint-report-row__dur">
                                  {dur}
                                </span>
                              ) : null}
                            </div>
                            <div className="maint-report-row__type">
                              {reportRunTypeLabel(rep, t)}
                            </div>
                          </div>
                          {String(
                            rep.instance_name || rep.instance_id || '',
                          ).trim() ? (
                            <span className="maint-report-row__server">
                              {String(
                                rep.instance_name || rep.instance_id || '',
                              ).trim()}
                            </span>
                          ) : null}
                        </button>
                      );
                    })}
                </div>
                {reportPageCount > 1 ? (
                  <div
                    className="maintenance-reports-list-pager"
                    aria-label={t('maintenance_reports_pager_aria')}
                  >
                    <button
                      type="button"
                      className="maintenance-reports-list-pager__btn"
                      disabled={reportPage <= 0}
                      aria-label={t('maintenance_reports_pager_prev')}
                      onClick={() =>
                        setReportPage((page) => Math.max(0, page - 1))
                      }
                    >
                      ‹
                    </button>
                    <span className="maintenance-reports-list-pager__status">
                      {t(
                        'maintenance_reports_pager_status',
                        reportPage + 1,
                        reportPageCount,
                      )}
                    </span>
                    <button
                      type="button"
                      className="maintenance-reports-list-pager__btn"
                      disabled={reportPage >= reportPageCount - 1}
                      aria-label={t('maintenance_reports_pager_next')}
                      onClick={() =>
                        setReportPage((page) =>
                          Math.min(reportPageCount - 1, page + 1),
                        )
                      }
                    >
                      ›
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
            <div className="maintenance-reports-split__detail">
              <div className="maintenance-reports-detail-frame">
                {!maintenance.selectedReport && !maintenance.reportsLoading && (
                  <div
                    id="maintReportDetailEmpty"
                    className="maintenance-reports-detail-empty"
                  >
                    <AppIcon
                      name="info"
                      size={32}
                      className="maintenance-reports-detail-empty-icon"
                    />
                    <span>{t('maintenance_report_detail_placeholder')}</span>
                  </div>
                )}
                {maintenance.selectedReport && (
                  <MaintenanceReportDetail
                    report={maintenance.selectedReport}
                    t={t}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <MaintenanceTaskMenu
        open={menuOpen}
        task={menuTask}
        position={menuPos}
        onClose={closeMenu}
        onActivate={() => {
          if (!menuTask?.id) return;
          closeMenu();
          void maintenance.toggleActive(String(menuTask.id), true);
        }}
        onDeactivate={() => {
          if (!menuTask?.id) return;
          closeMenu();
          void maintenance.toggleActive(String(menuTask.id), false);
        }}
        onRunNow={() => {
          if (!menuTask?.id) return;
          closeMenu();
          void maintenance.runNow(String(menuTask.id));
        }}
        onEdit={() => {
          if (!menuTask) return;
          closeMenu();
          taskEditor.openEdit(menuTask);
        }}
        onDelete={() => {
          if (!menuTask?.id) return;
          closeMenu();
          void maintenance.deleteTask(String(menuTask.id));
        }}
        t={t}
      />

      <MaintenanceTaskEditorModal editor={taskEditor} t={t} />
      <MaintenanceInstancePickerModal
        editor={taskEditor}
        instances={instances}
        t={t}
      />
    </div>
  );
}
