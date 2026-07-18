import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { FccCheck } from '../FccCheck';
import { FccSwitch } from '../FccSwitch';
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
          return tpl.indexOf('{0}') >= 0 ? tpl.replace('{0}', editor.username) : tpl + ' ' + editor.username;
        })()
      : t('web_user_create_title');

  const tabsLocked = tabsDisabledForRole(editor.role);

  return (
    <div id="webUserEditorBackdrop" className="fu-modal-backdrop" aria-hidden="false">
      <div className="fu-modal web-user-editor-modal" role="dialog" aria-modal="true" aria-labelledby="webUserEditorTitle">
        <div className="fu-modal__header" id="webUserEditorTitle">
          {title}
        </div>
        <div className="fu-modal__body">
          <div className="access-user-form">
            <div className="access-user-field access-user-field--enabled">
              <span className="access-user-field__label">{t('web_user_status_label')}</span>
              <FccSwitch
                id="webUserEnabledEdit"
                className="access-user-check"
                labelClassName="access-user-check__label"
                checked={editor.enabled}
                disabled={lastAdminLocked}
                onChange={(checked) => webUsers.setEditor((s) => ({ ...s, enabled: checked }))}
                label={t('web_enabled_label')}
              />
            </div>
            <div className="access-user-field">
              <label className="access-user-field__label" htmlFor="webUserNameEdit">
                {t('web_user_label')}
              </label>
              <input
                type="text"
                id="webUserNameEdit"
                className={'input access-user-field__input' + (editorMode === 'edit' ? ' is-locked' : '')}
                placeholder={t('web_username_placeholder')}
                autoComplete="off"
                spellCheck={false}
                readOnly={editorMode === 'edit'}
                value={editor.username}
                onChange={(e) => webUsers.setEditor((s) => ({ ...s, username: e.target.value }))}
              />
            </div>
            <div className="access-user-field">
              <label className="access-user-field__label" htmlFor="webUserPassEdit">
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
                onChange={(e) => webUsers.setEditor((s) => ({ ...s, password: e.target.value }))}
              />
            </div>
            <div className="access-user-field access-user-field--role">
              <label className="access-user-field__label" htmlFor="webUserRoleEdit">
                {t('web_role_label')}
              </label>
              <select
                id="webUserRoleEdit"
                className="input access-user-field__input"
                value={editor.role}
                disabled={lastAdminLocked}
                onChange={(e) => webUsers.setRole(e.target.value)}
              >
                <option value="administrator">{t('web_role_administrator')}</option>
                <option value="server_engineer">{t('web_role_server_engineer')}</option>
                <option value="moderator">{t('web_role_moderator')}</option>
              </select>
            </div>
          </div>
          <div className="access-perm-groups">
            <div className="access-perm-groups__tabs">
              <section className="access-perm-group">
                <h4 className="access-perm-group__title">{t('web_access_perms_label')}</h4>
                <div className="access-perm-grid access-perm-grid--stack">
                  {WEB_USER_TABS.map((tab) => (
                    <FccSwitch
                      key={tab.value}
                      id={`webUserTab-${tab.value}`}
                      className="access-perm-grid__switch"
                      labelClassName="access-perm-grid__label"
                      checked={editor.tabs.includes(tab.value)}
                      disabled={tabsLocked}
                      onChange={(checked) => webUsers.toggleTab(tab.value, checked)}
                      label={t(tab.i18n)}
                    />
                  ))}
                </div>
              </section>
            </div>
            <section className="access-perm-group access-perm-group--instances">
              <h4 className="access-perm-group__title">{t('instances_title')}</h4>
              <div id="webUserInstancesBox" className="access-perm-grid access-perm-grid--instances">
                <FccCheck
                  id="webUserInstAll"
                  className="access-instance-check access-instance-check--all"
                  labelClassName="access-instance-check__label"
                  checked={editor.allInstances}
                  onChange={(checked) =>
                    webUsers.setEditor((s) => ({
                      ...s,
                      allInstances: checked,
                      instanceIds: checked ? accessInstances.map((it) => String(it.id)) : s.instanceIds,
                    }))
                  }
                  label={t('web_user_instances_all')}
                />
                {accessInstances.map((inst) => {
                  const id = String(inst.id || '').trim();
                  if (!id) return null;
                  const name = String(inst.name || id).trim();
                  const checked = editor.allInstances || editor.instanceIds.includes(id);
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
                          return { ...s, instanceIds: Array.from(set), allInstances: false };
                        });
                      }}
                      label={name}
                    />
                  );
                })}
              </div>
            </section>
          </div>
        </div>
        <div className="fu-modal__footer">
          <CancelButton id="btnWebUserCancel" onClick={webUsers.closeEditor} t={t} />
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
    </div>
  );
}
