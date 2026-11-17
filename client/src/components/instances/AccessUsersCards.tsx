import { motion } from 'motion/react';
import type { MouseEvent } from 'react';
import { AppIcon } from '../AppIcon';
import {
  listUserInstanceLabels,
  listUserTabLabels,
  roleLabel,
} from '../../lib/webUserUtils';
import { AccessSummaryList } from './AccessSummaryList';
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
  currentUsername?: string;
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
  currentUsername,
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
        const isSelf = Boolean(
          currentUsername &&
          u.username.toLowerCase() === currentUsername.toLowerCase(),
        );
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

            {/* 2. Servers & Permissions Scope */}
            <div className="access-user-card__scope">
              <div className="access-user-card__scope-row">
                <span className="access-user-card__scope-label">
                  <AppIcon
                    name="lan"
                    size={13}
                    className="access-user-card__meta-icon"
                  />
                  <span>{t('instances_tab_servers')}</span>
                </span>
                <AccessSummaryList
                  items={instanceLabels}
                  maxVisible={2}
                  variant="card"
                  title={t('instances_tab_servers')}
                />
              </div>

              <div className="access-user-card__scope-row">
                <span className="access-user-card__scope-label">
                  <span>{t('web_access_perms_label')}</span>
                </span>
                {isAdminUser ? (
                  <div
                    className="access-user-card__full-inline"
                    title={t('web_users_full_perms_desc')}
                  >
                    <span className="access-summary__text access-summary__text--highlight">
                      {t('web_users_full_perms')}
                    </span>
                    <span className="access-user-card__full-inline-sub">
                      — {t('web_users_full_perms_desc')}
                    </span>
                  </div>
                ) : (
                  <AccessSummaryList
                    items={tabLabels}
                    maxVisible={3}
                    variant="card"
                    title={t('web_access_perms_label')}
                  />
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
                disabled={enabled && (lastAdmin || isSelf)}
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
