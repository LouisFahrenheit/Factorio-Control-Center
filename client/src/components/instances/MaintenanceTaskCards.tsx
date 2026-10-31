import { motion } from 'motion/react';
import type { MouseEvent } from 'react';
import {
  IconClock,
  IconServer,
  IconHistory,
  IconPlayerPlay,
  IconPower,
  IconPencil,
  IconTrash,
  IconPackage,
  IconTool,
  IconRotateClockwise,
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
} from '../../lib/motionPresets';
import { webEffectsReduced } from '../../theme/webEffects';
import type { InstanceItem } from '../../types/instance';
import type { MaintenanceTask } from '../../types/maintenance';

interface MaintenanceTaskCardsProps {
  tasks: MaintenanceTask[];
  instances: InstanceItem[];
  selectedTaskId?: string;
  onOpenEdit: (task: MaintenanceTask) => void;
  onToggleActive: (task: MaintenanceTask) => void;
  onRunNow: (task: MaintenanceTask) => void;
  onDeleteTask: (task: MaintenanceTask) => void;
  onCardClick: (
    task: MaintenanceTask,
    targetEl: HTMLElement,
    ev: MouseEvent,
  ) => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function MaintenanceTaskCards({
  tasks,
  instances,
  selectedTaskId,
  onOpenEdit,
  onToggleActive,
  onRunNow,
  onDeleteTask,
  onCardClick,
  t,
}: MaintenanceTaskCardsProps) {
  const reduced = webEffectsReduced();

  return (
    <motion.div
      className="access-users-cards maintenance-tasks-cards"
      variants={reduced ? undefined : LIST_CONTAINER_VARIANTS}
      initial={reduced ? false : 'hidden'}
      animate={reduced ? undefined : 'show'}
    >
      {tasks.map((task) => {
        const taskId = String(task.id || '');
        const active = !!task.active;
        const isSelected = selectedTaskId === taskId;
        const scheduleTitle = taskScheduleSummaryLine(task, t);
        const timeFormatted = formatTaskScheduleTime(task);
        const nextShown = nextFireCardLabel(task.next_fire_iso);

        // Server chips
        const rawIds = Array.isArray(task.instance_ids)
          ? task.instance_ids.map((x) => String(x || '').trim()).filter(Boolean)
          : [];
        const isAllServers = rawIds.length === 1 && rawIds[0] === INSTANCE_ALL;

        // Options
        const opts = task.options || {};
        const isMaint = !!opts.maintenance;
        const isMods = !!opts.update_mods && !isMaint;
        const isServer = !!opts.update_factorio && !isMaint;
        const isRestartOnly = !isMaint && !isMods && !isServer;

        const cardClass = [
          'access-user-card maintenance-card-item',
          !active ? 'maintenance-card-item--inactive' : '',
          isSelected ? 'access-user-card--selected' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <motion.div
            key={taskId}
            className={cardClass}
            variants={reduced ? undefined : LIST_ROW_VARIANTS}
            onClick={(ev) => onCardClick(task, ev.currentTarget, ev)}
            onDoubleClick={(ev) => {
              ev.preventDefault();
              onOpenEdit(task);
            }}
            onContextMenu={(ev) => {
              ev.preventDefault();
              onCardClick(task, ev.currentTarget, ev);
            }}
            tabIndex={0}
            role="region"
            aria-label={scheduleTitle}
          >
            {/* Top Glow Accent Bar */}
            <div className="access-user-card__glow-bar" />

            {/* 1. Header: Status dot, Title, Time, Status Badge */}
            <div className="access-user-card__header">
              <div className="access-user-card__header-left">
                <span
                  className={
                    'instance-run-dot' + (active ? ' instance-run-dot--on' : '')
                  }
                  title={
                    active
                      ? t('maintenance_card_active')
                      : t('maintenance_card_inactive')
                  }
                />
                <div className="access-user-card__identity">
                  <div className="access-user-card__name-row">
                    <h3
                      className="access-user-card__username"
                      title={scheduleTitle}
                    >
                      {scheduleTitle}
                    </h3>
                  </div>
                  {!task.manual_only && (
                    <span className="maintenance-card-time-sub">
                      <IconClock
                        size={13}
                        className="maintenance-card-icon-sub"
                      />
                      {timeFormatted}
                    </span>
                  )}
                </div>
              </div>
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

            {/* 2. Target Servers */}
            <div className="access-user-card__meta">
              <div className="access-user-card__meta-item">
                <IconServer size={14} className="access-user-card__meta-icon" />
                <div className="access-user-card__servers-list">
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
              </div>

              {/* Next run time */}
              <div className="access-user-card__meta-item">
                <IconHistory
                  size={14}
                  className="access-user-card__meta-icon"
                />
                <span className="maintenance-card-next-fire-val">
                  {task.manual_only
                    ? t('maintenance_card_next_manual')
                    : nextShown}
                </span>
              </div>
            </div>

            {/* 3. Options Section */}
            <div className="access-user-card__perms-section">
              <span className="access-user-card__perms-title">
                {t('maintenance_card_row_options')}
              </span>
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
                    <IconRotateClockwise size={13} style={{ marginRight: 4 }} />
                    {t('maintenance_card_tag_none')}
                  </span>
                )}
              </div>
            </div>

            {/* 4. Action Buttons Footer */}
            <div
              className="access-user-card__actions"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="btn access-user-card__action-btn"
                title={t('maintenance_menu_run_now')}
                onClick={() => onRunNow(task)}
              >
                <IconPlayerPlay size={15} />
                <span>{t('maintenance_menu_run_now')}</span>
              </button>

              <button
                type="button"
                className={
                  'btn access-user-card__action-btn ' +
                  (active
                    ? 'access-user-card__action-btn--toggle-off'
                    : 'access-user-card__action-btn--toggle-on')
                }
                title={
                  active
                    ? t('maintenance_menu_deactivate')
                    : t('maintenance_menu_activate')
                }
                onClick={() => onToggleActive(task)}
              >
                <IconPower size={15} />
              </button>

              <button
                type="button"
                className="btn access-user-card__action-btn access-user-card__action-btn--edit"
                title={t('maintenance_menu_edit')}
                onClick={() => onOpenEdit(task)}
              >
                <IconPencil size={15} />
              </button>

              <button
                type="button"
                className="btn access-user-card__action-btn access-user-card__action-btn--danger"
                title={t('maintenance_menu_delete')}
                onClick={() => onDeleteTask(task)}
              >
                <IconTrash size={15} />
              </button>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
