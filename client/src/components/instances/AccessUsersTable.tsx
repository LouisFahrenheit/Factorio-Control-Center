import { motion } from 'motion/react';
import { useState, useEffect, useMemo, type MouseEvent } from 'react';
import {
  IconUser,
  IconShieldCheck,
  IconPencil,
  IconPower,
  IconKey,
  IconTrash,
  IconChevronLeft,
  IconChevronRight,
} from '@tabler/icons-react';
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

type UserSortCol = 'username' | 'role' | 'servers' | 'status';

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

  // Sorting
  const [sortCol, setSortCol] = useState<UserSortCol>('username');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  const handleSort = (col: UserSortCol) => {
    if (sortCol === col) {
      setSortAsc((prev) => !prev);
    } else {
      setSortCol(col);
      setSortAsc(true);
    }
  };

  const sortedUsers = useMemo(() => {
    return [...users].sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'username') {
        cmp = (a.username || '').localeCompare(b.username || '');
      } else if (sortCol === 'role') {
        cmp = (a.role || '').localeCompare(b.role || '');
      } else if (sortCol === 'status') {
        const aVal = a.enabled !== false ? 1 : 0;
        const bVal = b.enabled !== false ? 1 : 0;
        cmp = aVal - bVal;
      } else if (sortCol === 'servers') {
        const aCount = a.instance_ids ? a.instance_ids.length : 999;
        const bCount = b.instance_ids ? b.instance_ids.length : 999;
        cmp = aCount - bCount;
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [users, sortCol, sortAsc]);

  // Pagination
  const [pageSize, setPageSize] = useState<number>(() => {
    const saved = localStorage.getItem('fcc_users_page_size');
    if (saved) {
      const parsed = parseInt(saved, 10);
      if ([10, 15, 20, 50].includes(parsed)) return parsed;
    }
    return 15;
  });
  const [currentPage, setCurrentPage] = useState<number>(1);

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    localStorage.setItem('fcc_users_page_size', String(newSize));
  };

  const totalPages = Math.max(1, Math.ceil(sortedUsers.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedUsers = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedUsers.slice(start, start + pageSize);
  }, [sortedUsers, safePage, pageSize]);

  const startIndex = sortedUsers.length > 0 ? (safePage - 1) * pageSize + 1 : 0;
  const endIndex = Math.min(safePage * pageSize, sortedUsers.length);

  return (
    <motion.div
      className={`table-wrap table-wrap--motion-list access-users-table-wrap ${isEntering ? 'access-users-table-wrap--entering' : ''}`}
      variants={wrapVariants}
      initial={reduced ? false : 'hidden'}
      animate={reduced ? undefined : 'show'}
    >
      <div className="access-users-table-container">
        <table className="data access-users-table" id="tblWebUsers">
          <thead>
            <tr>
              <th
                className={`access-sort-th ${sortCol === 'username' ? 'access-sort-th--active' : ''} ${sortCol === 'username' && sortAsc ? 'access-sort-th--asc' : ''}`}
                onClick={() => handleSort('username')}
              >
                {t('web_user_label')}
              </th>
              <th
                className={`access-sort-th ${sortCol === 'role' ? 'access-sort-th--active' : ''} ${sortCol === 'role' && sortAsc ? 'access-sort-th--asc' : ''}`}
                onClick={() => handleSort('role')}
                style={{ width: 170 }}
              >
                {t('web_role_label')}
              </th>
              <th
                className={`access-sort-th ${sortCol === 'servers' ? 'access-sort-th--active' : ''} ${sortCol === 'servers' && sortAsc ? 'access-sort-th--asc' : ''}`}
                onClick={() => handleSort('servers')}
              >
                {t('instances_tab_servers')}
              </th>
              <th>{t('web_access_perms_label')}</th>
              <th style={{ textAlign: 'right', width: 140 }}>{t('web_users_col_actions')}</th>
            </tr>
          </thead>
          <motion.tbody
            id="tblWebUsersBody"
            variants={reduced ? undefined : LIST_CONTAINER_VARIANTS}
            initial={reduced ? false : 'hidden'}
            animate={reduced ? undefined : 'show'}
            onAnimationComplete={() => setIsEntering(false)}
          >
            {paginatedUsers.map((u) => {
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
                      <div className="access-user-avatar-wrap">
                        <IconUser size={18} />
                        <span
                          className={`access-user-status-dot ${enabled ? 'access-user-status-dot--on' : ''}`}
                          title={enabled ? t('web_enabled_label') : t('web_user_status_off')}
                        />
                      </div>
                      <div className="access-user-identity">
                        <span className="access-users-row__name">{u.username}</span>
                        {u.twoFactorEnabled && (
                          <span className="access-user-2fa-badge" title={t('web_2fa_enabled_badge')}>
                            <IconShieldCheck size={13} />
                            <span>2FA</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* 2. Role */}
                  <td className="access-users-table__col-role">
                    <span
                      className={`access-users-role-text ${!enabled ? 'access-users-role-text--disabled' : ''}`}
                    >
                      {roleLabel(u.role, t)}
                    </span>
                  </td>

                  {/* 3. Servers */}
                  <td className="access-users-table__col-servers">
                    <div className="access-users-chip-list">
                      {instanceLabels.length ? (
                        instanceLabels.map((label, index) => (
                          <span
                            key={`${u.username}-srv-${index}`}
                            className="access-users-chip"
                          >
                            {label}
                          </span>
                        ))
                      ) : (
                        <span className="access-users-chip-muted">—</span>
                      )}
                    </div>
                  </td>

                  {/* 4. Permissions */}
                  <td className="access-users-table__col-perms">
                    {isAdminUser ? (
                      <span className="access-users-chip access-users-chip--full-access">
                        {t('web_users_full_perms')}
                      </span>
                    ) : (
                      <div className="access-users-chip-list">
                        {tabLabels.length ? (
                          tabLabels.map((label, index) => (
                            <span
                              key={`${u.username}-perm-${index}`}
                              className="access-users-chip"
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

                  {/* 5. Actions */}
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
                        <IconPencil size={16} />
                      </button>

                      <button
                        type="button"
                        className={
                          'btn btn--toolbar-icon access-users-table__action-btn' +
                          (enabled ? '' : ' access-users-table__action-btn--activate')
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
                        <IconPower size={16} />
                      </button>

                      {u.twoFactorEnabled && (
                        <button
                          type="button"
                          className="btn btn--toolbar-icon access-users-table__action-btn access-users-table__action-btn--reset-2fa"
                          title={t('web_user_reset_2fa')}
                          aria-label={t('web_user_reset_2fa')}
                          onClick={() => onReset2fa(u.username)}
                        >
                          <IconKey size={16} />
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
      {sortedUsers.length > 0 && (
        <div className="access-users-pagination">
          <div className="access-users-pagination-left">
            <span className="access-users-pagination-info">
              {startIndex}–{endIndex} of {sortedUsers.length}
            </span>
            <div className="access-users-page-size-picker">
              <span className="access-users-page-size-label">
                {t('page_size_label') || 'На странице:'}
              </span>
              {[10, 15, 20, 50].map((sz) => (
                <button
                  key={sz}
                  type="button"
                  className={`access-users-page-size-btn ${pageSize === sz ? 'access-users-page-size-btn--active' : ''}`}
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
                  className={`access-users-page-btn ${p === safePage ? 'access-users-page-btn--active' : ''}`}
                  onClick={() => setCurrentPage(p)}
                >
                  {p}
                </button>
              ))}

              <button
                type="button"
                className="access-users-page-btn"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
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
