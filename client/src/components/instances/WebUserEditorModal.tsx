import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { FccCheck } from '../FccCheck';
import { FccSwitch } from '../FccSwitch';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import { WEB_USER_TABS, tabsDisabledForRole } from '../../lib/webUserUtils';
import type { WebUsersApi } from '../../hooks/useWebUsers';

interface WebUserEditorModalProps {
  webUsers: WebUsersApi;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function WebUserEditorModal({ webUsers, t }: WebUserEditorModalProps) {
  const { editorOpen, editorMode, editor, accessInstances } = webUsers;
  if (!editorOpen) return null;

  const lastAdminLocked =
    editorMode === 'edit' && webUsers.isLastEnabledAdmin(editor.username);

  const title =
    editorMode === 'edit'
      ? (() => {
          const tpl = t('web_user_edit_title');
          return tpl.indexOf('{0}') >= 0
            ? tpl.replace('{0}', editor.username)
            : tpl + ' ' + editor.username;
        })()
      : t('web_user_create_title');

  const tabsLocked = tabsDisabledForRole(editor.role);

  return (
    <ModalBackdrop
      open={editorOpen}
      onClose={webUsers.closeEditor}
      id="webUserEditorBackdrop"
    >
      <div
        className="fu-modal web-user-editor-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="webUserEditorTitle"
      >
        <div
          className="fu-modal__header fu-modal__header--with-icon"
          id="webUserEditorTitle"
        >
          <AppIcon
            name={editorMode === 'edit' ? 'edit' : 'person_add'}
            size={20}
            className="web-user-editor-modal__header-icon"
          />
          <span className="fu-modal__header-title web-user-editor-modal__header-title">
            {title}
          </span>
        </div>

        <div className="fu-modal__body web-user-editor-modal__body">
          {/* 1. Account Credentials & Status Card */}
          <div className="web-user-modal-hero">
            <div className="web-user-modal-grid">
              {/* Username */}
              <div className="access-user-field">
                <label
                  className="access-user-field__label"
                  htmlFor="webUserNameEdit"
                >
                  {t('web_user_label')}
                </label>
                <input
                  type="text"
                  id="webUserNameEdit"
                  className={
                    'input access-user-field__input' +
                    (editorMode === 'edit' ? ' is-locked' : '')
                  }
                  placeholder={t('web_username_placeholder')}
                  autoComplete="off"
                  spellCheck={false}
                  readOnly={editorMode === 'edit'}
                  value={editor.username}
                  onChange={(e) =>
                    webUsers.setEditor((s) => ({
                      ...s,
                      username: e.target.value,
                    }))
                  }
                />
              </div>

              {/* Password */}
              <div className="access-user-field">
                <label
                  className="access-user-field__label"
                  htmlFor="webUserPassEdit"
                >
                  {t('web_password_label')}
                </label>
                <input
                  type="password"
                  id="webUserPassEdit"
                  name="fcc_web_admin_user_password"
                  className="input access-user-field__input"
                  placeholder={t('web_password_placeholder')}
                  autoComplete="new-password"
                  autoCapitalize="off"
                  autoCorrect="off"
                  data-lpignore="true"
                  data-1p-ignore="true"
                  data-bwignore="true"
                  value={editor.password}
                  onChange={(e) =>
                    webUsers.setEditor((s) => ({
                      ...s,
                      password: e.target.value,
                    }))
                  }
                />
              </div>

              {/* Role */}
              <div className="access-user-field access-user-field--role">
                <label
                  className="access-user-field__label"
                  htmlFor="webUserRoleEdit"
                >
                  {t('web_role_label')}
                </label>
                <select
                  id="webUserRoleEdit"
                  className="input access-user-field__input"
                  value={editor.role}
                  disabled={lastAdminLocked}
                  onChange={(e) => webUsers.setRole(e.target.value)}
                >
                  <option value="administrator">
                    {t('web_role_administrator')}
                  </option>
                  <option value="server_engineer">
                    {t('web_role_server_engineer')}
                  </option>
                  <option value="moderator">{t('web_role_moderator')}</option>
                </select>
              </div>
            </div>

            {/* Status & 2FA Row */}
            <div className="web-user-modal-status-bar">
              <div className="web-user-modal-status-item">
                <span className="web-user-modal-status-item__label">
                  {t('web_user_status_label')}:
                </span>
                <FccSwitch
                  id="webUserEnabledEdit"
                  className="web-user-modal-switch"
                  labelClassName={
                    'web-user-modal-switch-text ' +
                    (editor.enabled
                      ? 'web-user-modal-switch-text--on'
                      : 'web-user-modal-switch-text--off')
                  }
                  checked={editor.enabled}
                  disabled={lastAdminLocked}
                  onChange={(checked) =>
                    webUsers.setEditor((s) => ({ ...s, enabled: checked }))
                  }
                  label={
                    editor.enabled
                      ? t('web_enabled_label')
                      : t('web_user_status_off')
                  }
                />
                {lastAdminLocked && (
                  <span className="web-user-modal-lock-hint">
                    ({t('web_user_last_admin_locked')})
                  </span>
                )}
              </div>

              {editorMode === 'edit' && (
                <div className="web-user-modal-status-item web-user-modal-status-item--2fa">
                  <span className="web-user-modal-status-item__label">
                    {t('web_user_2fa_label')}:
                  </span>
                  <div className="web-user-modal-2fa-actions">
                    <span
                      className={
                        'web-user-modal-2fa-badge ' +
                        (editor.twoFactorEnabled
                          ? 'web-user-modal-2fa-badge--on'
                          : 'web-user-modal-2fa-badge--off')
                      }
                    >
                      <AppIcon name="2fa" size={15} />
                      <span>
                        {editor.twoFactorEnabled
                          ? t('web_2fa_enabled_badge')
                          : t('web_2fa_disabled_badge')}
                      </span>
                    </span>
                    {editor.twoFactorEnabled && (
                      <button
                        type="button"
                        className="btn btn--toolbar-icon web-user-modal-2fa-reset-btn"
                        onClick={() => void webUsers.reset2fa(editor.username)}
                        title={t('web_user_reset_2fa')}
                        aria-label={t('web_user_reset_2fa')}
                      >
                        <AppIcon name="person_shield" size={14} />
                        <span>{t('web_user_reset_2fa')}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 2. Permissions and Server Access Side-by-Side */}
          <div className="access-perm-groups">
            {/* Left: Section Permissions */}
            <section className="access-perm-group access-perm-group--tabs">
              <div className="access-perm-group__header">
                <AppIcon
                  name="person_shield"
                  size={16}
                  className="access-perm-group__header-icon"
                />
                <h4 className="access-perm-group__title">
                  {t('web_access_perms_label')}
                </h4>
              </div>

              {tabsLocked ? (
                <div className="access-perm-admin-notice">
                  <div className="access-perm-admin-notice__body">
                    <span className="access-perm-admin-notice__title">
                      {t('web_users_full_perms')}
                    </span>
                    <p className="access-perm-admin-notice__desc">
                      {t('web_users_full_perms_desc')}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="access-perm-grid access-perm-grid--stack">
                  {WEB_USER_TABS.map((tab) => (
                    <div key={tab.value} className="access-perm-item">
                      <FccSwitch
                        id={`webUserTab-${tab.value}`}
                        className="access-perm-grid__switch"
                        labelClassName="access-perm-grid__label"
                        checked={editor.tabs.includes(tab.value)}
                        disabled={tabsLocked}
                        onChange={(checked) =>
                          webUsers.toggleTab(tab.value, checked)
                        }
                        label={t(tab.i18n)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Right: Server Access */}
            <section className="access-perm-group access-perm-group--instances">
              <div className="access-perm-group__header">
                <AppIcon
                  name="lan"
                  size={16}
                  className="access-perm-group__header-icon"
                />
                <h4 className="access-perm-group__title">
                  {t('instances_title')}
                </h4>
              </div>

              {tabsLocked ? (
                <div className="access-perm-admin-notice">
                  <div className="access-perm-admin-notice__body">
                    <span className="access-perm-admin-notice__title">
                      {t('web_user_instances_all')}
                    </span>
                    <p className="access-perm-admin-notice__desc">
                      {t('web_users_all_instances_desc')}
                    </p>
                  </div>
                </div>
              ) : (
                <div
                  id="webUserInstancesBox"
                  className="access-perm-grid access-perm-grid--instances"
                >
                  <div className="access-instance-check-wrap access-instance-check-wrap--all">
                    <FccCheck
                      id="webUserInstAll"
                      className="access-instance-check access-instance-check--all"
                      labelClassName="access-instance-check__label"
                      checked={editor.allInstances}
                      onChange={(checked) =>
                        webUsers.setEditor((s) => ({
                          ...s,
                          allInstances: checked,
                          instanceIds: checked
                            ? accessInstances.map((it) => String(it.id))
                            : s.instanceIds,
                        }))
                      }
                      label={t('web_user_instances_all')}
                    />
                  </div>

                  <div className="access-instance-list">
                    {accessInstances.map((inst) => {
                      const id = String(inst.id || '').trim();
                      if (!id) return null;
                      const name = String(inst.name || id).trim();
                      const checked =
                        editor.allInstances || editor.instanceIds.includes(id);
                      return (
                        <FccCheck
                          key={id}
                          id={`webUserInst-${id}`}
                          className="access-instance-check"
                          labelClassName="access-instance-check__label"
                          checked={checked}
                          disabled={editor.allInstances}
                          onChange={(checked) => {
                            webUsers.setEditor((s) => {
                              const set = new Set(s.instanceIds);
                              if (checked) set.add(id);
                              else set.delete(id);
                              return {
                                ...s,
                                instanceIds: Array.from(set),
                                allInstances: false,
                              };
                            });
                          }}
                          label={name}
                        />
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>

        <div className="fu-modal__footer">
          <CancelButton
            id="btnWebUserCancel"
            onClick={webUsers.closeEditor}
            t={t}
          />
          <button
            type="button"
            className="btn btn--primary btn--with-icon"
            id="btnWebUserSave"
            onClick={() => void webUsers.saveEditor()}
          >
            <AppIcon name="save" size={16} />
            {t('save_btn')}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}
