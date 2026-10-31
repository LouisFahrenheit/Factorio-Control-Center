import { motion } from 'motion/react';
import { useState, useEffect, useMemo, type MouseEvent } from 'react';
import {
  IconClock,
  IconServer,
  IconPlayerPlay,
  IconPower,
  IconPencil,
  IconTrash,
  IconPackage,
  IconTool,
  IconRotateClockwise,
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

interface MaintenanceTaskTableProps {
  tasks: MaintenanceTask[];
  instances: InstanceItem[];
  selectedTaskId?: string;
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

export function MaintenanceTaskTable({
  tasks,
  instances,
  selectedTaskId,
  onOpenEdit,
  onToggleActive,
  onRunNow,
  onDeleteTask,
  onRowClick,
  t,
}: MaintenanceTaskTableProps) {
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
              {/* Status */}
              <th
                className={`access-sort-th ${
                  sortCol === 'status' ? 'access-sort-th--active' : ''
                } ${sortCol === 'status' && sortAsc ? 'access-sort-th--asc' : ''}`}
                onClick={() => handleSort('status')}
                style={{ width: 130 }}
              >
                {t('maintenance_col_status')}
              </th>

              {/* Schedule */}
              <th
                className={`access-sort-th ${
                  sortCol === 'schedule' ? 'access-sort-th--active' : ''
                } ${sortCol === 'schedule' && sortAsc ? 'access-sort-th--asc' : ''}`}
                onClick={() => handleSort('schedule')}
              >
                {t('maintenance_col_schedule')}
              </th>

              {/* Servers */}
              <th
                className={`access-sort-th ${
                  sortCol === 'servers' ? 'access-sort-th--active' : ''
                } ${sortCol === 'servers' && sortAsc ? 'access-sort-th--asc' : ''}`}
                onClick={() => handleSort('servers')}
              >
                {t('maintenance_col_servers')}
              </th>

              {/* Next fire */}
              <th
                className={`access-sort-th ${
                  sortCol === 'next_fire' ? 'access-sort-th--active' : ''
                } ${sortCol === 'next_fire' && sortAsc ? 'access-sort-th--asc' : ''}`}
                onClick={() => handleSort('next_fire')}
                style={{ width: 280, minWidth: 260 }}
              >
                {t('maintenance_col_next_fire')}
              </th>

              {/* Stop options */}
              <th>{t('maintenance_col_actions_on_stop')}</th>

              {/* Actions */}
              <th style={{ textAlign: 'right', width: 160 }}>
                {t('maintenance_col_actions')}
              </th>
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
                  {/* Status */}
                  <td className="maintenance-table__col-status">
                    <div className="maintenance-table-status-wrap">
                      <span
                        className={
                          'instance-run-dot' +
                          (active ? ' instance-run-dot--on' : '')
                        }
                      />
                      <span
                        className={
                          'maintenance-task-badge ' +
                          (active
                            ? 'maintenance-task-badge--on'
                            : 'maintenance-task-badge--off')
                        }
                      >
                        {active
                          ? t('maintenance_card_active')
                          : t('maintenance_card_inactive')}
                      </span>
                    </div>
                  </td>

                  {/* Schedule */}
                  <td className="maintenance-table__col-schedule">
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
                  </td>

                  {/* Servers */}
                  <td className="maintenance-table__col-servers">
                    <div className="access-users-chip-list">
                      {isAllServers ? (
                        <span className="access-users-chip access-users-chip--all-servers">
                          {t('maintenance_instance_all')}
                        </span>
                      ) : rawIds.length ? (
                        rawIds.map((id) => {
                          const row = instances.find(
                            (x) => String(x.id || '') === id,
                          );
                          const name = row
                            ? String(row.name || id).trim() || id
                            : id;
                          return (
                            <span
                              key={`${taskId}-inst-${id}`}
                              className="access-users-chip access-users-chip--server"
                            >
                              {name}
                            </span>
                          );
                        })
                      ) : (
                        <span className="access-users-chip-muted">—</span>
                      )}
                    </div>
                  </td>

                  {/* Next fire */}
                  <td className="maintenance-table__col-next-fire">
                    <span className="maintenance-table-next-fire-cell">
                      {task.manual_only
                        ? t('maintenance_card_next_manual')
                        : nextShown}
                    </span>
                  </td>

                  {/* Stop options */}
                  <td className="maintenance-table__col-options">
                    <div className="access-users-chip-list">
                      {isServer && (
                        <span className="access-users-chip access-users-chip--perm">
                          <IconServer size={13} style={{ marginRight: 4 }} />
                          {t('maintenance_card_tag_server')}
                        </span>
                      )}
                      {isMods && (
                        <span className="access-users-chip access-users-chip--perm">
                          <IconPackage size={13} style={{ marginRight: 4 }} />
                          {t('maintenance_card_tag_mods')}
                        </span>
                      )}
                      {isMaint && (
                        <span className="access-users-chip access-users-chip--perm">
                          <IconTool size={13} style={{ marginRight: 4 }} />
                          {t('maintenance_card_tag_maintenance')}
                        </span>
                      )}
                      {isRestartOnly && (
                        <span className="access-users-chip access-users-chip--perm">
                          <IconRotateClockwise
                            size={13}
                            style={{ marginRight: 4 }}
                          />
                          {t('maintenance_card_tag_none')}
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Actions */}
                  <td
                    className="access-users-table__col-actions"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="access-users-table__actions">
                      <button
                        type="button"
                        className="btn btn--toolbar-icon access-users-table__action-btn"
                        title={t('maintenance_menu_run_now')}
                        aria-label={t('maintenance_menu_run_now')}
                        onClick={() => onRunNow(task)}
                      >
                        <IconPlayerPlay size={16} />
                      </button>

                      <button
                        type="button"
                        className={
                          'btn btn--toolbar-icon access-users-table__action-btn' +
                          (active
                            ? ''
                            : ' access-users-table__action-btn--activate')
                        }
                        title={
                          active
                            ? t('maintenance_menu_deactivate')
                            : t('maintenance_menu_activate')
                        }
                        aria-label={
                          active
                            ? t('maintenance_menu_deactivate')
                            : t('maintenance_menu_activate')
                        }
                        onClick={() => onToggleActive(task)}
                      >
                        <IconPower size={16} />
                      </button>

                      <button
                        type="button"
                        className="btn btn--toolbar-icon access-users-table__action-btn"
                        title={t('maintenance_menu_edit')}
                        aria-label={t('maintenance_menu_edit')}
                        onClick={() => onOpenEdit(task)}
                      >
                        <IconPencil size={16} />
                      </button>

                      <button
                        type="button"
                        className="btn btn--toolbar-icon access-users-table__action-btn access-users-table__action-btn--danger"
                        title={t('maintenance_menu_delete')}
                        aria-label={t('maintenance_menu_delete')}
                        onClick={() => onDeleteTask(task)}
                      >
                        <IconTrash size={16} />
                      </button>
                    </div>
                  </td>
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
