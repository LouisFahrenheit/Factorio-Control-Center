import { motion } from 'motion/react';
import type { MouseEvent } from 'react';
import { AppIcon } from '../AppIcon';
import {
  listUserInstanceLabels,
  listUserTabLabels,
  roleLabel,
} from '../../lib/webUserUtils';
import {
  LIST_CONTAINER_VARIANTS,
  LIST_ROW_VARIANTS,
} from '../../lib/motionPresets';
import { webEffectsReduced } from '../../theme/webEffects';
import type { WebAccessInstance, WebUser } from '../../types/webUser';

interface AccessUsersCardsProps {
  users: WebUser[];
  accessInstances: WebAccessInstance[];
  selectedUser?: string;
  isLastEnabledAdmin: (username: string) => boolean;
  onOpenEdit: (user: WebUser) => void;
  onToggleEnabled: (user: WebUser) => void;
  onReset2fa: (username: string) => void;
  onDeleteUser: (username: string) => void;
  onRowClick: (user: WebUser, targetEl: HTMLElement, ev: MouseEvent) => void;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function AccessUsersCards({
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
}: AccessUsersCardsProps) {
  const reduced = webEffectsReduced();

  return (
    <motion.div
      className="access-users-cards"
      variants={reduced ? undefined : LIST_CONTAINER_VARIANTS}
      initial={reduced ? false : 'hidden'}
      animate={reduced ? undefined : 'show'}
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

        const cardClass = [
          'access-user-card',
          isSelected ? 'access-user-card--selected' : '',
          !enabled ? 'access-user-card--disabled' : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <motion.div
            key={u.username}
            className={cardClass}
            variants={reduced ? undefined : LIST_ROW_VARIANTS}
            onClick={(ev) => onRowClick(u, ev.currentTarget, ev)}
            onDoubleClick={(ev) => {
              ev.preventDefault();
              onOpenEdit(u);
            }}
            tabIndex={0}
            role="region"
            aria-label={u.username}
          >
            {/* Top Accent Indicator */}
            <div className="access-user-card__glow-bar" />

            {/* 1. Card Header */}
            <div className="access-user-card__header">
              <div className="access-user-card__header-left">
                <span
                  className={
                    'instance-run-dot' +
                    (enabled ? ' instance-run-dot--on' : '')
                  }
                  title={
                    enabled ? t('web_enabled_label') : t('web_user_status_off')
                  }
                />
                <div className="access-user-card__identity">
                  <div className="access-user-card__name-row">
                    <h3
                      className="access-user-card__username"
                      title={u.username}
                    >
                      {u.username}
                    </h3>
                    {u.twoFactorEnabled && (
                      <AppIcon
                        name="2fa"
                        size={16}
                        className="access-user-2fa-icon"
                        title={t('web_2fa_enabled_badge')}
                      />
                    )}
                  </div>
                  <span
                    className={
                      'access-users-role-text' +
                      (!enabled ? ' access-users-role-text--disabled' : '')
                    }
                  >
                    {roleLabel(u.role, t)}
                  </span>
                </div>
              </div>
            </div>

            {/* 2. Scope Meta */}
            <div className="access-user-card__meta">
              <div className="access-user-card__meta-item access-user-card__meta-item--servers">
                <AppIcon
                  name="lan"
                  size={14}
                  className="access-user-card__meta-icon"
                />
                <div className="access-user-card__servers-list">
                  {instanceLabels.length ? (
                    instanceLabels.map((label, idx) => (
                      <span
                        key={`${u.username}-srv-${idx}`}
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
              </div>
            </div>

            {/* 3. Permissions Section */}
            <div className="access-user-card__perms-section">
              <span className="access-user-card__perms-title">
                {t('web_access_perms_label')}
              </span>
              {isAdminUser ? (
                <div className="access-user-card__admin-full-box">
                  <div className="access-user-card__admin-full-badge">
                    <span className="access-user-card__admin-full-title">
                      {t('web_users_full_perms')}
                    </span>
                  </div>
                  <span className="access-user-card__admin-perms-desc">
                    {t('web_users_full_perms_desc')}
                  </span>
                </div>
              ) : (
                <div className="access-users-chip-list">
                  {tabLabels.length ? (
                    tabLabels.map((label, idx) => (
                      <span
                        key={`${u.username}-perm-${idx}`}
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
            </div>

            {/* 4. Action Buttons Footer */}
            <div
              className="access-user-card__actions"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                className="btn access-user-card__action-btn access-user-card__action-btn--edit"
                title={t('maintenance_menu_edit')}
                aria-label={t('maintenance_menu_edit')}
                onClick={() => onOpenEdit(u)}
              >
                <AppIcon name="edit" size={16} />
                <span>{t('maintenance_menu_edit')}</span>
              </button>

              <button
                type="button"
                className={
                  'btn access-user-card__action-btn' +
                  (enabled
                    ? ' access-user-card__action-btn--toggle-off'
                    : ' access-user-card__action-btn--toggle-on')
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
                  className="btn access-user-card__action-btn access-user-card__action-btn--reset-2fa"
                  title={t('web_user_reset_2fa')}
                  aria-label={t('web_user_reset_2fa')}
                  onClick={() => onReset2fa(u.username)}
                >
                  <AppIcon name="person_shield" size={16} />
                </button>
              )}

              <button
                type="button"
                className="btn access-user-card__action-btn access-user-card__action-btn--danger"
                disabled={lastAdmin}
                title={t('maintenance_menu_delete')}
                aria-label={t('maintenance_menu_delete')}
                onClick={() => onDeleteUser(u.username)}
              >
                <AppIcon name="delete" size={16} />
              </button>
            </div>
          </motion.div>
        );
      })}
    </motion.div>
  );
}
