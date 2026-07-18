import { useCallback, useState, type MouseEvent } from 'react';
import { AppIcon } from '../AppIcon';
import {
  listUserInstanceLabels,
  listUserTabLabels,
  roleLabel,
  userRoleClass,
  userRoleIcon,
} from '../../lib/webUserUtils';
import type { WebUsersApi } from '../../hooks/useWebUsers';
import { TabLoadingPlaceholder, tabInitialLoad } from '../TabLoadingPlaceholder';
import type { WebUser } from '../../types/webUser';
import { WebUserEditorModal } from './WebUserEditorModal';
import { WebUserRowMenu } from './WebUserRowMenu';

interface InstanceAccessTabProps {
  webUsers: WebUsersApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function InstanceAccessTab({ webUsers, t }: InstanceAccessTabProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuUser, setMenuUser] = useState<WebUser | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
  const initialLoading = tabInitialLoad(webUsers.loading, webUsers.users.length > 0);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const onRowClick = (user: WebUser, ev: MouseEvent<HTMLTableRowElement>) => {
    ev.stopPropagation();
    setMenuUser(user);
    setMenuPos({
      x: Math.round(ev.clientX + 2),
      y: Math.round(ev.clientY + 2),
    });
    setMenuOpen(true);
  };

  return (
    <div
      id="instanceTabAccess"
      className="sub-tab-panel sub-tab-panel--active"
      role="tabpanel"
      aria-labelledby="instanceTabAccessBtn"
    >
      <section id="webUsersSection">
        <div id="accessLayout" className="access-layout">
          <div className="access-layout__table">
            {initialLoading ? (
              <TabLoadingPlaceholder variant="table" label={t('tab_data_loading')} />
            ) : webUsers.loadError ? (
              <p className="maintenance-tab__inline-error" role="alert">
                {webUsers.loadError}
              </p>
            ) : (
            <div className="table-wrap table-wrap--access-users">
              <table className="data access-users-table">
                <thead>
                  <tr>
                    <th className="access-users-table__col-status">{t('web_user_status_label')}</th>
                    <th className="access-users-table__col-user">{t('web_user_label')}</th>
                    <th className="access-users-table__col-role">{t('web_role_label')}</th>
                    <th className="access-users-table__col-perms">{t('web_access_perms_label')}</th>
                    <th className="access-users-table__col-servers">{t('instances_tab_servers')}</th>
                  </tr>
                </thead>
                <tbody id="tblWebUsersBody">
                  {webUsers.users.map((u) => {
                      const selected =
                        webUsers.editorMode === 'edit' && webUsers.selectedUser === u.username;
                      const enabled = u.enabled !== false;
                      const tabLabels = listUserTabLabels(u.tabs, t);
                      const instanceLabels = listUserInstanceLabels(
                        u.instance_ids,
                        webUsers.accessInstances,
                        t,
                      );
                      const rowClass = [
                        'access-users-row',
                        selected ? 'access-users-row--selected' : '',
                        !enabled ? 'access-users-row--disabled' : '',
                      ]
                        .filter(Boolean)
                        .join(' ');

                      return (
                        <tr key={u.username} className={rowClass} onClick={(ev) => onRowClick(u, ev)}>
                          <td className="access-users-table__col-status">
                            <span
                              className={
                                'access-users-status ' +
                                (enabled ? 'access-users-status--on' : 'access-users-status--off')
                              }
                            >
                              {enabled ? t('web_enabled_label') : t('web_user_status_off')}
                            </span>
                          </td>
                          <td className="access-users-table__col-user">
                            <span className="access-users-row__name">{u.username}</span>
                          </td>
                          <td className="access-users-table__col-role">
                            <span
                              className={
                                'access-users-role ' +
                                userRoleClass(u.role) +
                                (!enabled ? ' access-users-role--disabled' : '')
                              }
                            >
                              <AppIcon
                                name={enabled ? userRoleIcon(u.role) : 'person_off'}
                                size={18}
                                className="access-users-role__icon"
                              />
                              {roleLabel(u.role, t)}
                            </span>
                          </td>
                          <td className="access-users-table__col-perms">
                            <div className="access-users-chip-list">
                              {tabLabels.map((label, index) => (
                                <span
                                  key={`${u.username}-perm-${index}`}
                                  className="access-users-chip access-users-chip--perm"
                                >
                                  {label}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td className="access-users-table__col-servers">
                            <div className="access-users-chip-list">
                              {instanceLabels.length ? (
                                instanceLabels.map((label, index) => (
                                  <span
                                    key={`${u.username}-srv-${index}`}
                                    className="access-users-chip access-users-chip--server"
                                  >
                                    {label}
                                  </span>
                                ))
                              ) : (
                                <span className="access-users-chip access-users-chip--muted">—</span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            )}
          </div>
        </div>
        <WebUserEditorModal webUsers={webUsers} t={t} />
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
