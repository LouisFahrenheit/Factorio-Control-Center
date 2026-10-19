import { useCallback, useMemo, useState, type MouseEvent } from 'react';
import type { WebUsersApi } from '../../hooks/useWebUsers';
import { useUserAccessViewMode } from '../../hooks/useUserAccessViewMode';
import { TabLoadingPlaceholder, tabInitialLoad } from '../TabLoadingPlaceholder';
import type { WebUser } from '../../types/webUser';
import { listUserInstanceLabels, roleLabel } from '../../lib/webUserUtils';
import { AccessUsersBar } from './AccessUsersBar';
import { AccessUsersCards } from './AccessUsersCards';
import { AccessUsersTable } from './AccessUsersTable';
import { AccessUsersEmpty, AccessUsersNoResults } from './AccessUsersEmpty';
import { WebUserEditorModal } from './WebUserEditorModal';
import { WebUserRowMenu } from './WebUserRowMenu';

interface InstanceAccessTabProps {
  webUsers: WebUsersApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function InstanceAccessTab({ webUsers, t }: InstanceAccessTabProps) {
  const [viewMode, setViewMode] = useUserAccessViewMode();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const [menuOpen, setMenuOpen] = useState(false);
  const [menuUser, setMenuUser] = useState<WebUser | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const initialLoading = tabInitialLoad(webUsers.loading, webUsers.users.length > 0);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const onRowClick = (user: WebUser, _targetEl: HTMLElement, ev: MouseEvent) => {
    ev.stopPropagation();
    setMenuUser(user);
    setMenuPos({
      x: Math.round(ev.clientX + 2),
      y: Math.round(ev.clientY + 2),
    });
    setMenuOpen(true);
  };

  const totalCount = webUsers.users.length;

  // Filtered users
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();

    return webUsers.users.filter((u) => {
      // Role filter
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;

      // Status filter
      if (statusFilter === 'enabled' && u.enabled === false) return false;
      if (statusFilter === 'disabled' && u.enabled !== false) return false;
      if (statusFilter === '2fa' && !u.twoFactorEnabled) return false;

      // Search query filter
      if (q) {
        const usernameMatch = (u.username || '').toLowerCase().includes(q);
        const roleText = roleLabel(u.role, t).toLowerCase();
        const roleMatch = roleText.includes(q) || (u.role || '').toLowerCase().includes(q);
        const instanceText = listUserInstanceLabels(
          u.instance_ids,
          webUsers.accessInstances,
          t,
        )
          .join(' ')
          .toLowerCase();
        const instanceMatch = instanceText.includes(q);

        if (!usernameMatch && !roleMatch && !instanceMatch) return false;
      }

      return true;
    });
  }, [webUsers.users, webUsers.accessInstances, search, roleFilter, statusFilter, t]);

  return (
    <div
      id="instanceTabAccess"
      className="sub-tab-panel sub-tab-panel--active"
      role="tabpanel"
      aria-labelledby="instanceTabAccessBtn"
    >
      <section id="webUsersSection">
        <div id="accessLayout" className="access-layout">
          {/* Search, Filter, View Mode, Actions Toolbar */}
          <AccessUsersBar
            search={search}
            onSearchChange={setSearch}
            roleFilter={roleFilter}
            onRoleFilterChange={setRoleFilter}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onRefresh={() => void webUsers.refresh()}
            shownCount={filteredUsers.length}
            totalCount={totalCount}
            t={t}
          />

          {/* Main Content Area */}
          <div className="access-layout__content">
            {initialLoading ? (
              <TabLoadingPlaceholder variant="table" label={t('tab_data_loading')} />
            ) : webUsers.loadError ? (
              <p className="maintenance-tab__inline-error" role="alert">
                {webUsers.loadError}
              </p>
            ) : totalCount === 0 ? (
              <AccessUsersEmpty onCreate={webUsers.openCreate} t={t} />
            ) : filteredUsers.length === 0 ? (
              <AccessUsersNoResults
                query={search}
                onClear={() => {
                  setSearch('');
                  setRoleFilter('all');
                  setStatusFilter('all');
                }}
                t={t}
              />
            ) : viewMode === 'cards' ? (
              <AccessUsersCards
                users={filteredUsers}
                accessInstances={webUsers.accessInstances}
                selectedUser={webUsers.editorMode === 'edit' ? webUsers.selectedUser : undefined}
                isLastEnabledAdmin={webUsers.isLastEnabledAdmin}
                onOpenEdit={webUsers.openEdit}
                onToggleEnabled={(u) => void webUsers.setEnabled(u.username, u.enabled === false)}
                onReset2fa={(username) => void webUsers.reset2fa(username)}
                onDeleteUser={(username) => void webUsers.deleteUser(username)}
                onRowClick={onRowClick}
                t={t}
              />
            ) : (
              <AccessUsersTable
                users={filteredUsers}
                accessInstances={webUsers.accessInstances}
                selectedUser={webUsers.editorMode === 'edit' ? webUsers.selectedUser : undefined}
                isLastEnabledAdmin={webUsers.isLastEnabledAdmin}
                onOpenEdit={webUsers.openEdit}
                onToggleEnabled={(u) => void webUsers.setEnabled(u.username, u.enabled === false)}
                onReset2fa={(username) => void webUsers.reset2fa(username)}
                onDeleteUser={(username) => void webUsers.deleteUser(username)}
                onRowClick={onRowClick}
                t={t}
              />
            )}
          </div>
        </div>

        {/* Edit / Create User Modal */}
        <WebUserEditorModal webUsers={webUsers} t={t} />

        {/* Row Context Menu */}
        <WebUserRowMenu
          open={menuOpen}
          user={menuUser}
          position={menuPos}
          lastAdminLocked={menuUser ? webUsers.isLastEnabledAdmin(menuUser.username) : false}
          onClose={closeMenu}
          onEnable={() => {
            if (!menuUser) return;
            closeMenu();
            void webUsers.setEnabled(menuUser.username, true);
          }}
          onDisable={() => {
            if (!menuUser) return;
            closeMenu();
            void webUsers.setEnabled(menuUser.username, false);
          }}
          onEdit={() => {
            if (!menuUser) return;
            closeMenu();
            webUsers.openEdit(menuUser);
          }}
          onReset2fa={() => {
            if (!menuUser) return;
            closeMenu();
            void webUsers.reset2fa(menuUser.username);
          }}
          onDelete={() => {
            if (!menuUser) return;
            closeMenu();
            void webUsers.deleteUser(menuUser.username);
          }}
          t={t}
        />
      </section>
    </div>
  );
}
