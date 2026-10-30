import { motion } from 'motion/react';
import { useState, useEffect, type MouseEvent } from 'react';
import { AppIcon } from '../AppIcon';
import {
  listUserInstanceLabels,
  listUserTabLabels,
  roleLabel,
} from '../../lib/webUserUtils';
import {
  LIST_CONTAINER_VARIANTS,
  LIST_ROW_VARIANTS,
  listWrapVariants,
} from '../../lib/motionPresets';
import { webEffectsReduced } from '../../theme/webEffects';
import type { WebAccessInstance, WebUser } from '../../types/webUser';

interface AccessUsersTableProps {
  users: WebUser[];
  accessInstances: WebAccessInstance[];
  selectedUser?: string;
  isLastEnabledAdmin: (username: string) => boolean;
  onOpenEdit: (user: WebUser) => void;
  onToggleEnabled: (user: WebUser) => void;
  onReset2fa: (username: string) => void;
  onDeleteUser: (username: string) => void;
  onRowClick: (
    user: WebUser,
    rowEl: HTMLTableRowElement,
    ev: MouseEvent,
  ) => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function AccessUsersTable({
  users,
  accessInstances,
  selectedUser,
  isLastEnabledAdmin,
  onOpenEdit,
  onToggleEnabled,
  onReset2fa,
  onDeleteUser,
  onRowClick,
  t,
}: AccessUsersTableProps) {
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

  return (
    <motion.div
      className={`table-wrap table-wrap--motion-list access-users-table-wrap ${isEntering ? 'access-users-table-wrap--entering' : ''}`}
      variants={wrapVariants}
      initial={reduced ? false : 'hidden'}
      animate={reduced ? undefined : 'show'}
    >
      <table className="data access-users-table" id="tblWebUsers">
        <thead>
          <tr>
            <th className="access-users-table__col-user">
              {t('web_user_label')}
            </th>
            <th className="access-users-table__col-role">
              {t('web_role_label')}
            </th>
            <th className="access-users-table__col-servers">
              {t('instances_tab_servers')}
            </th>
            <th className="access-users-table__col-perms">
              {t('web_access_perms_label')}
            </th>
            <th className="access-users-table__col-actions">
              {t('web_users_col_actions')}
            </th>
          </tr>
        </thead>
        <motion.tbody
          id="tblWebUsersBody"
          variants={reduced ? undefined : LIST_CONTAINER_VARIANTS}
          initial={reduced ? false : 'hidden'}
          animate={reduced ? undefined : 'show'}
          onAnimationComplete={() => setIsEntering(false)}
        >
          {users.map((u) => {
            const enabled = u.enabled !== false;
            const isAdminUser = u.role === 'administrator';
            const isSelected = selectedUser === u.username;
            const lastAdmin = isLastEnabledAdmin(u.username);
            const tabLabels = listUserTabLabels(u.tabs, t);
            const instanceLabels = listUserInstanceLabels(
              u.instance_ids,
              accessInstances,
              t,
            );

            const rowClass = [
              'access-users-row',
              isSelected ? 'access-users-row--selected' : '',
              !enabled ? 'access-users-row--disabled' : '',
            ]
              .filter(Boolean)
              .join(' ');

            return (
              <motion.tr
                key={u.username}
                className={rowClass}
                variants={reduced ? undefined : LIST_ROW_VARIANTS}
                onClick={(ev) => onRowClick(u, ev.currentTarget, ev)}
                onDoubleClick={(ev) => {
                  ev.preventDefault();
                  onOpenEdit(u);
                }}
              >
                {/* 1. User */}
                <td className="access-users-table__col-user">
                  <div className="access-user-table-cell">
                    <span
                      className={
                        'instance-run-dot' +
                        (enabled ? ' instance-run-dot--on' : '')
                      }
                      title={
                        enabled
                          ? t('web_enabled_label')
                          : t('web_user_status_off')
                      }
                    />
                    <span className="access-users-row__name">{u.username}</span>
                    {u.twoFactorEnabled && (
                      <AppIcon
                        name="2fa"
                        size={18}
                        className="access-user-2fa-icon"
                        title={t('web_2fa_enabled_badge')}
                      />
                    )}
                  </div>
                </td>

                {/* 2. Role */}
                <td className="access-users-table__col-role">
                  <span
                    className={
                      'access-users-role-text' +
                      (!enabled ? ' access-users-role-text--disabled' : '')
                    }
                  >
                    {roleLabel(u.role, t)}
                  </span>
                </td>

                {/* 4. Servers */}
                <td className="access-users-table__col-servers">
                  <div className="access-users-chip-list">
                    {instanceLabels.length ? (
                      instanceLabels.map((label, index) => (
                        <span
                          key={`${u.username}-srv-${index}`}
                          className={
                            'access-users-chip ' +
                            (label === t('web_user_instances_all')
                              ? 'access-users-chip--all-servers'
                              : 'access-users-chip--server')
                          }
                        >
                          {label}
                        </span>
                      ))
                    ) : (
                      <span className="access-users-chip-muted">—</span>
                    )}
                  </div>
                </td>

                {/* 5. Permissions */}
                <td className="access-users-table__col-perms">
                  {isAdminUser ? (
                    <span className="access-users-admin-full-perms">
                      <span>{t('web_users_full_perms')}</span>
                    </span>
                  ) : (
                    <div className="access-users-chip-list">
                      {tabLabels.length ? (
                        tabLabels.map((label, index) => (
                          <span
                            key={`${u.username}-perm-${index}`}
                            className="access-users-chip access-users-chip--perm"
                          >
                            {label}
                          </span>
                        ))
                      ) : (
                        <span className="access-users-chip-muted">—</span>
                      )}
                    </div>
                  )}
                </td>

                {/* 7. Actions */}
                <td
                  className="access-users-table__col-actions"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="access-users-table__actions">
                    <button
                      type="button"
                      className="btn btn--toolbar-icon access-users-table__action-btn"
                      title={t('maintenance_menu_edit')}
                      aria-label={t('maintenance_menu_edit')}
                      onClick={() => onOpenEdit(u)}
                    >
                      <AppIcon name="edit" size={16} />
                    </button>

                    <button
                      type="button"
                      className={
                        'btn btn--toolbar-icon access-users-table__action-btn' +
                        (enabled
                          ? ''
                          : ' access-users-table__action-btn--activate')
                      }
                      disabled={enabled && lastAdmin}
                      title={
                        enabled
                          ? t('maintenance_menu_deactivate')
                          : t('maintenance_menu_activate')
                      }
                      aria-label={
                        enabled
                          ? t('maintenance_menu_deactivate')
                          : t('maintenance_menu_activate')
                      }
                      onClick={() => onToggleEnabled(u)}
                    >
                      <AppIcon name="mode_off_on" size={16} />
                    </button>

                    {u.twoFactorEnabled && (
                      <button
                        type="button"
                        className="btn btn--toolbar-icon access-users-table__action-btn access-users-table__action-btn--reset-2fa"
                        title={t('web_user_reset_2fa')}
                        aria-label={t('web_user_reset_2fa')}
                        onClick={() => onReset2fa(u.username)}
                      >
                        <AppIcon name="person_shield" size={16} />
                      </button>
                    )}

                    <button
                      type="button"
                      className="btn btn--toolbar-icon access-users-table__action-btn access-users-table__action-btn--danger"
                      disabled={lastAdmin}
                      title={t('maintenance_menu_delete')}
                      aria-label={t('maintenance_menu_delete')}
                      onClick={() => onDeleteUser(u.username)}
                    >
                      <AppIcon name="delete" size={16} />
                    </button>
                  </div>
                </td>
              </motion.tr>
            );
          })}
        </motion.tbody>
      </table>
    </motion.div>
  );
}
