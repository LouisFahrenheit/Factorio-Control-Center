import { motion } from 'motion/react';
import { useState, useEffect, useMemo, type MouseEvent } from 'react';
import {
  IconClock,
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react';
import {
  formatTaskScheduleTime,
  nextFireCardLabel,
  taskScheduleSummaryLine,
} from '../../lib/maintenanceUtils';
import { INSTANCE_ALL } from '@fcc/shared/maintenance-time';
import {
  LIST_CONTAINER_VARIANTS,
  LIST_ROW_VARIANTS,
  listWrapVariants,
} from '../../lib/motionPresets';
import { webEffectsReduced } from '../../theme/webEffects';
import type { InstanceItem } from '../../types/instance';
import type { MaintenanceTask } from '../../types/maintenance';
import { AccessSummaryList } from './AccessSummaryList';
import type { StatusMode } from '../../lib/statusModePrefs';
import type {
  MaintenanceColumnKey,
  MaintenanceColumnVisibility,
} from '../../lib/maintenanceColumnPrefs';

interface MaintenanceTaskTableProps {
  tasks: MaintenanceTask[];
  instances: InstanceItem[];
  selectedTaskId?: string;
  columns: MaintenanceColumnVisibility;
  columnOrder: readonly MaintenanceColumnKey[];
  statusMode: StatusMode;
  onOpenEdit: (task: MaintenanceTask) => void;
  onToggleActive: (task: MaintenanceTask) => void;
  onRunNow: (task: MaintenanceTask) => void;
  onDeleteTask: (task: MaintenanceTask) => void;
  onRowClick: (
    task: MaintenanceTask,
    rowEl: HTMLTableRowElement,
    ev: MouseEvent,
  ) => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

type MaintSortCol = 'status' | 'schedule' | 'servers' | 'next_fire';

/** Relative column widths; normalized over the visible columns so the table always fills its width. */
const SCHEDULE_WEIGHT = 24;
const COLUMN_WEIGHT: Record<MaintenanceColumnKey, number> = {
  status: 10,
  next_fire: 18,
  servers: 20,
  actions: 18,
  timezone: 14,
};

export function MaintenanceTaskTable({
  tasks,
  instances,
  selectedTaskId,
  columns,
  columnOrder,
  statusMode,
  onOpenEdit,
  onRowClick,
  t,
}: MaintenanceTaskTableProps) {
  const visibleColumns = columnOrder.filter((key) => columns[key] !== false);
  const totalWeight =
    SCHEDULE_WEIGHT +
    visibleColumns.reduce((sum, key) => sum + COLUMN_WEIGHT[key], 0);
  const showStatusDot = statusMode === 'dot';
  const reduced = webEffectsReduced();
  const wrapVariants = reduced ? undefined : listWrapVariants(0);
  const [isEntering, setIsEntering] = useState(!reduced);

  useEffect(() => {
    if (!isEntering) return;
    const timer = window.setTimeout(() => {
      setIsEntering(false);
    }, 750);
    return () => window.clearTimeout(timer);
  }, [isEntering]);

  // Sorting
  const [sortCol, setSortCol] = useState<MaintSortCol>('status');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const handleSort = (col: MaintSortCol) => {
    if (sortCol === col) {
      setSortAsc((prev) => !prev);
    } else {
      setSortCol(col);
      setSortAsc(col === 'schedule');
    }
  };

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'status') {
        const aVal = a.active ? 1 : 0;
        const bVal = b.active ? 1 : 0;
        cmp = aVal - bVal;
      } else if (sortCol === 'schedule') {
        const aSched = taskScheduleSummaryLine(a, t);
        const bSched = taskScheduleSummaryLine(b, t);
        cmp = aSched.localeCompare(bSched);
      } else if (sortCol === 'servers') {
        const aIds = a.instance_ids?.length ?? 999;
        const bIds = b.instance_ids?.length ?? 999;
        cmp = aIds - bIds;
      } else if (sortCol === 'next_fire') {
        const aTime = a.next_fire_iso ? Date.parse(a.next_fire_iso) : 0;
        const bTime = b.next_fire_iso ? Date.parse(b.next_fire_iso) : 0;
        cmp = aTime - bTime;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [tasks, sortCol, sortAsc, t]);

  // Pagination
  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('fcc_maintenance_page_size');
        if (saved) {
          const parsed = parseInt(saved, 10);
          if ([10, 15, 20, 50].includes(parsed)) return parsed;
        }
      } catch {
        /* ignore */
      }
      if (window.innerHeight >= 860 || window.innerWidth >= 1600) {
        return 15;
      }
    }
    return 10;
  });
  const [currentPage, setCurrentPage] = useState(1);

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    try {
      localStorage.setItem('fcc_maintenance_page_size', String(newSize));
    } catch {
      /* ignore */
    }
  };

  const totalPages = Math.max(1, Math.ceil(sortedTasks.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedTasks = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedTasks.slice(start, start + pageSize);
  }, [sortedTasks, safePage, pageSize]);

  const startIndex = sortedTasks.length > 0 ? (safePage - 1) * pageSize + 1 : 0;
  const endIndex = Math.min(safePage * pageSize, sortedTasks.length);

  return (
    <motion.div
      className={`table-wrap table-wrap--motion-list access-users-table-wrap maintenance-table-wrap ${
        isEntering ? 'access-users-table-wrap--entering' : ''
      }`}
      variants={wrapVariants}
      initial={reduced ? false : 'hidden'}
      animate={reduced ? undefined : 'show'}
    >
      <div className="access-users-table-container">
        <table className="data access-users-table" id="tblMaintenanceTasks">
          <thead>
            <tr>
              {/* Schedule (always visible) */}
              <th
                style={{ width: `${(SCHEDULE_WEIGHT / totalWeight) * 100}%` }}
                className={`access-sort-th ${
                  sortCol === 'schedule' ? 'access-sort-th--active' : ''
                } ${sortCol === 'schedule' && sortAsc ? 'access-sort-th--asc' : ''}`}
                onClick={() => handleSort('schedule')}
              >
                {t('maintenance_col_schedule')}
              </th>
              {visibleColumns.map((key) => {
                const width = `${(COLUMN_WEIGHT[key] / totalWeight) * 100}%`;
                switch (key) {
                    case 'status':
                      return (
                        <th
                          key={key}
                          style={{ width }}
                          className={`access-sort-th ${sortCol === 'status' ? 'access-sort-th--active' : ''} ${sortCol === 'status' && sortAsc ? 'access-sort-th--asc' : ''}`}
                          onClick={() => handleSort('status')}
                        >
                          {t('maintenance_col_status')}
                        </th>
                      );
                    case 'next_fire':
                      return (
                        <th
                          key={key}
                          style={{ width }}
                          className={`access-sort-th ${sortCol === 'next_fire' ? 'access-sort-th--active' : ''} ${sortCol === 'next_fire' && sortAsc ? 'access-sort-th--asc' : ''}`}
                          onClick={() => handleSort('next_fire')}
                        >
                          {t('maintenance_col_next_fire')}
                        </th>
                      );
                    case 'servers':
                      return (
                        <th
                          key={key}
                          style={{ width }}
                          className={`access-sort-th ${sortCol === 'servers' ? 'access-sort-th--active' : ''} ${sortCol === 'servers' && sortAsc ? 'access-sort-th--asc' : ''}`}
                          onClick={() => handleSort('servers')}
                        >
                          {t('maintenance_col_servers')}
                        </th>
                      );
                  case 'actions':
                    return (
                      <th key={key} style={{ width }}>
                        {t('maintenance_col_actions_on_stop')}
                      </th>
                    );
                  case 'timezone':
                    return (
                      <th key={key} style={{ width }}>
                        {t('maintenance_col_timezone')}
                      </th>
                    );
                }
              })}
            </tr>
          </thead>
          <motion.tbody
            id="tblMaintenanceTasksBody"
            key={`${safePage}-${sortCol}-${sortAsc}`}
            variants={reduced ? undefined : LIST_CONTAINER_VARIANTS}
            initial={reduced ? false : 'hidden'}
            animate={reduced ? undefined : 'show'}
            onAnimationComplete={() => setIsEntering(false)}
          >
            {paginatedTasks.map((task) => {
              const taskId = String(task.id || '');
              const active = !!task.active;
              const isSelected = selectedTaskId === taskId;
              const scheduleTitle = taskScheduleSummaryLine(task, t);
              const timeFormatted = formatTaskScheduleTime(task);
              const nextShown = nextFireCardLabel(task.next_fire_iso);

              // Servers
              const rawIds = Array.isArray(task.instance_ids)
                ? task.instance_ids
                    .map((x) => String(x || '').trim())
                    .filter(Boolean)
                : [];
              const isAllServers =
                rawIds.length === 1 && rawIds[0] === INSTANCE_ALL;

              // Options
              const opts = task.options || {};
              const isMaint = !!opts.maintenance;
              const isMods = !!opts.update_mods && !isMaint;
              const isServer = !!opts.update_factorio && !isMaint;
              const isRestartOnly = !isMaint && !isMods && !isServer;

              const rowClass = [
                'access-users-row',
                active ? '' : 'access-users-row--disabled',
                isSelected ? 'access-users-row--selected' : '',
              ]
                .filter(Boolean)
                .join(' ');

              return (
                <motion.tr
                  key={taskId}
                  className={rowClass}
                  variants={reduced ? undefined : LIST_ROW_VARIANTS}
                  onClick={(ev) => onRowClick(task, ev.currentTarget, ev)}
                  onDoubleClick={(ev) => {
                    ev.preventDefault();
                    onOpenEdit(task);
                  }}
                  onContextMenu={(ev) => {
                    ev.preventDefault();
                    onRowClick(task, ev.currentTarget, ev);
                  }}
                >
                  {/* Schedule (always visible) */}
                  <td className="maintenance-table__col-schedule">
                    <div className="access-user-table-cell">
                      {showStatusDot && (
                        <span
                          className={`access-user-status-dot ${active ? 'access-user-status-dot--on' : ''}`}
                          title={
                            active
                              ? t('maintenance_card_active')
                              : t('maintenance_card_inactive')
                          }
                        />
                      )}
                      <div className="maintenance-table-schedule-cell">
                        <span className="maintenance-table-schedule-title">
                          {scheduleTitle}
                        </span>
                        {!task.manual_only && (
                          <span className="maintenance-table-time-text">
                            <IconClock size={13} />
                            <span>{timeFormatted}</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {visibleColumns.map((key) => {
                    switch (key) {
                      case 'status':
                        return (
                          <td key={key}>
                            <span className="access-users-created-text">
                              {active
                                ? t('maintenance_card_active')
                                : t('maintenance_card_inactive')}
                            </span>
                          </td>
                        );
                      case 'next_fire':
                        return (
                          <td key={key} className="maintenance-table__col-next-fire">
                            <span className="maintenance-table-next-fire-cell">
                              {task.manual_only
                                ? t('maintenance_card_next_manual')
                                : nextShown}
                            </span>
                          </td>
                        );
                      case 'servers':
                        return (
                          <td key={key} className="maintenance-table__col-servers">
                            <AccessSummaryList
                              items={
                                isAllServers
                                  ? [t('maintenance_instance_all')]
                                  : rawIds.map((id) => {
                                      const row = instances.find(
                                        (x) => String(x.id || '') === id,
                                      );
                                      return row
                                        ? String(row.name || id).trim() || id
                                        : id;
                                    })
                              }
                              maxVisible={2}
                              variant="table"
                              title={t('maintenance_col_servers')}
                            />
                          </td>
                        );
                      case 'actions':
                        return (
                          <td key={key} className="maintenance-table__col-options">
                            <AccessSummaryList
                              items={[
                                ...(isServer ? [t('maintenance_card_tag_server')] : []),
                                ...(isMods ? [t('maintenance_card_tag_mods')] : []),
                                ...(isMaint
                                  ? [t('maintenance_card_tag_maintenance')]
                                  : []),
                                ...(isRestartOnly
                                  ? [t('maintenance_card_tag_none')]
                                  : []),
                              ]}
                              maxVisible={3}
                              variant="table"
                              title={t('maintenance_col_actions_on_stop')}
                            />
                          </td>
                        );
                      case 'timezone':
                        return (
                          <td key={key} className="instance-mono-cell">
                            {task.timezone || '—'}
                          </td>
                        );
                    }
                  })}
                </motion.tr>
              );
            })}
          </motion.tbody>
        </table>
      </div>

      {/* Pinned Pagination */}
      {sortedTasks.length > 0 && (
        <div className="access-users-pagination">
          <div className="access-users-pagination-left">
            <span className="access-users-pagination-info">
              {startIndex}–{endIndex} of {sortedTasks.length}
            </span>

            <div className="access-users-page-size-picker">
              <span className="access-users-page-size-label">
                {t('page_size_label') || 'На странице:'}
              </span>
              {[10, 15, 20, 50].map((sz) => (
                <button
                  key={sz}
                  type="button"
                  className={`access-users-page-size-btn ${
                    pageSize === sz ? 'access-users-page-size-btn--active' : ''
                  }`}
                  onClick={() => handlePageSizeChange(sz)}
                >
                  {sz}
                </button>
              ))}
            </div>
          </div>

          {totalPages > 1 && (
            <div className="access-users-pagination-controls">
              <button
                type="button"
                className="access-users-page-btn"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                title={t('previous') || 'Previous'}
              >
                <IconChevronLeft size={16} />
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <button
                  key={p}
                  type="button"
                  className={`access-users-page-btn ${
                    p === safePage ? 'access-users-page-btn--active' : ''
                  }`}
                  onClick={() => setCurrentPage(p)}
                >
                  {p}
                </button>
              ))}

              <button
                type="button"
                className="access-users-page-btn"
                disabled={safePage >= totalPages}
                onClick={() =>
                  setCurrentPage((p) => Math.min(totalPages, p + 1))
                }
                title={t('next') || 'Next'}
              >
                <IconChevronRight size={16} />
              </button>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
