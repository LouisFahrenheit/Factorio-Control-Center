import { useState, type ReactNode } from 'react';
import type { InstanceItem } from '../../types/instance';
import type { useInstances } from '../../hooks/useInstances';
import type { useProgramSettings } from '../../hooks/useProgramSettings';
import { FCC_THEMES } from '../../theme/themes';
import { AppIcon } from '../AppIcon';
import { FccSwitch } from '../FccSwitch';
import { api } from '../../api/client';

interface InstancePublicTabProps {
  instances: InstanceItem[];
  instancesApi: ReturnType<typeof useInstances>;
  settings: ReturnType<typeof useProgramSettings>;
  t: (key: string, ...args: (string | number)[]) => string;
}

interface SettingsTableProps {
  title: string;
  titleId: string;
  titleMeta?: ReactNode;
  sectionId?: string;
  className?: string;
  children: ReactNode;
}

function SettingsTable({ title, titleId, titleMeta, sectionId, className, children }: SettingsTableProps) {
  const sectionClass = 'settings-table-section' + (className ? ' ' + className : '');
  return (
    <section className={sectionClass} id={sectionId} aria-labelledby={titleId}>
      <h3 id={titleId} className="settings-table-section__title">
        <span className="settings-table-section__title-text">{title}</span>
        {titleMeta ? <span className="settings-table-section__title-meta">{titleMeta}</span> : null}
      </h3>
      <table className="settings-table">
        <tbody>{children}</tbody>
      </table>
    </section>
  );
}

interface SettingsCheckRowProps {
  label: string;
  hint?: string;
  htmlFor: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

function SettingsCheckRow({ label, hint, htmlFor, checked, onChange }: SettingsCheckRowProps) {
  return (
    <tr className="settings-table__row settings-table__row--inline-check">
      <td colSpan={2} className="settings-table__inline-cell">
        <FccSwitch
          id={htmlFor}
          className="settings-table__inline-check"
          labelClassName="settings-table__inline-check-label"
          checked={checked}
          onChange={onChange}
          label={label}
        />
        {hint ? <span className="settings-table__hint">{hint}</span> : null}
      </td>
    </tr>
  );
}

export function InstancePublicTab({ instances, instancesApi, settings, t }: InstancePublicTabProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editAddr, setEditAddr] = useState('');

  const handleRouteSave = (route: string) => {
    settings.setPublicPageRoute(route || '/servers');
  };

  const handleToggleInstance = async (item: InstanceItem, checked: boolean) => {
    try {
      await api(`/api/instances/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ isPublic: checked }),
      });
      await instancesApi.reload();
    } catch (e) {
      instancesApi.handleError(e);
    }
  };

  const startEditing = (item: InstanceItem) => {
    setEditingId(item.id);
    setEditDesc(item.publicDescription || '');
    setEditAddr(item.publicConnectionAddress || '');
  };

  const saveEditing = async (item: InstanceItem) => {
    try {
      await api(`/api/instances/${encodeURIComponent(item.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ publicDescription: editDesc, publicConnectionAddress: editAddr }),
      });
      setEditingId(null);
      await instancesApi.reload();
    } catch (e) {
      instancesApi.handleError(e);
    }
  };

  return (
    <div id="instanceTabPublic" className="sub-tab-panel sub-tab-panel--active instance-settings-tables" role="tabpanel">
      <div className="instance-settings-tables__layout">
        <div className="instance-settings-tables__minor">
          <SettingsTable
            title={t('public_page_settings') || 'Public Page Settings'}
            titleId="publicPageSettingsTitle"
            sectionId="publicPageSettingsPanel"
            className="settings-table-section--compact"
          >

            <SettingsCheckRow
              label={t('enable_public_page') || 'Enable public page'}
              htmlFor="cbPublicPageEnabled"
              checked={settings.settings.public_page_enabled || false}
              onChange={(checked) => settings.setPublicPageEnabled(checked)}
            />
            {settings.settings.public_page_enabled && (
              <>
                <tr className="settings-table__row settings-table__row--inline-check">
                  <td colSpan={2} className="settings-table__inline-cell">
                    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', padding: '2px 0', justifyContent: 'center' }}>
                      <FccSwitch
                        id="cbPublicPageAllowModDownloads"
                        className="settings-table__inline-check"
                        labelClassName="settings-table__inline-check-label"
                        checked={settings.settings.public_page_allow_mod_downloads || false}
                        onChange={(checked) => settings.setPublicPageAllowModDownloads(checked)}
                        label={t('public_page_allow_mod_downloads') || 'Allow mod downloads'}
                      />
                      <FccSwitch
                        id="cbPublicPageShowPlayers"
                        className="settings-table__inline-check"
                        labelClassName="settings-table__inline-check-label"
                        checked={settings.settings.public_page_show_players || false}
                        onChange={(checked) => settings.setPublicPageShowPlayers(checked)}
                        label={t('public_page_show_players') || 'Show online players list'}
                      />
                    </div>
                  </td>
                </tr>
                <tr className="settings-table__row">
                  <td colSpan={2} style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        {t('public_page_theme') || 'Page Theme'}
                      </label>
                      <select
                        className="input"
                        style={{ width: '100%', maxWidth: '100%' }}
                        value={settings.settings.public_page_theme || ''}
                        onChange={(e) => settings.setPublicPageTheme(e.target.value)}
                      >
                        <option value="">{t('theme_default') || 'Same as panel theme'}</option>
                        {FCC_THEMES.map((theme) => (
                          <option key={theme.id} value={theme.id}>
                            {t('ui_theme_' + theme.id) || theme.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </td>
                </tr>
                <tr className="settings-table__row">
                  <td colSpan={2} style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        {t('public_page_route') || 'Public Page Route'}
                      </label>
                      <input
                        type="text"
                        className="input"
                        style={{ width: '100%', maxWidth: '100%' }}
                        defaultValue={settings.settings.public_page_route || '/servers'}
                        onBlur={(e) => handleRouteSave(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleRouteSave(e.currentTarget.value);
                        }}
                      />
                    </div>
                  </td>
                </tr>
                 <tr className="settings-table__row settings-table__row--inline-check">
                  <td colSpan={2} className="settings-table__inline-cell">
                    <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', padding: '2px 0', justifyContent: 'center' }}>
                      <FccSwitch
                        id="pub-hide-title"
                        className="settings-table__inline-check"
                        labelClassName="settings-table__inline-check-label"
                        checked={settings.settings.public_page_hide_title === true}
                        onChange={(checked) => settings.setPublicPageHideTitle(checked)}
                        label={t('public_page_hide_title') || 'Hide Page Title'}
                      />
                      <FccSwitch
                        id="pub-hide-subtitle"
                        className="settings-table__inline-check"
                        labelClassName="settings-table__inline-check-label"
                        checked={settings.settings.public_page_hide_subtitle === true}
                        onChange={(checked) => settings.setPublicPageHideSubtitle(checked)}
                        label={t('public_page_hide_subtitle') || 'Hide Page Subtitle'}
                      />
                    </div>
                  </td>
                </tr>
                {!settings.settings.public_page_hide_title && (
                  <tr className="settings-table__row">
                    <td colSpan={2} style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                          {t('public_page_title') || 'Page Title'}
                        </label>
                        <input
                          type="text"
                          className="input"
                          style={{ width: '100%', maxWidth: '100%' }}
                          defaultValue={settings.settings.public_page_title || ''}
                          placeholder={t('public_servers_page_title') || 'Factorio Servers'}
                          onBlur={(e) => settings.setPublicPageTitle(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') settings.setPublicPageTitle(e.currentTarget.value);
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                )}
                {!settings.settings.public_page_hide_subtitle && (
                  <tr className="settings-table__row">
                    <td colSpan={2} style={{ padding: '0.75rem 1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                        <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                          {t('public_page_subtitle') || 'Page Subtitle'}
                        </label>
                        <textarea
                          className="input"
                          rows={3}
                          style={{ width: '100%', maxWidth: '100%', resize: 'none', minHeight: '72px', fontFamily: 'inherit', fontSize: 'inherit' }}
                          defaultValue={settings.settings.public_page_subtitle || ''}
                          placeholder={t('public_servers_page_desc') || 'Public access terminal for network servers. Select a node to establish connection.'}
                          onBlur={(e) => settings.setPublicPageSubtitle(e.target.value)}
                        />
                      </div>
                    </td>
                  </tr>
                )}
                <tr className="settings-table__row">
                  <td colSpan={2} style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        {t('public_page_contact_link') || 'External Contact Link'}
                      </label>
                      <input
                        type="text"
                        className="input"
                        style={{ width: '100%', maxWidth: '100%' }}
                        defaultValue={settings.settings.public_page_contact_link || ''}
                        placeholder="https://discord.gg/... or https://t.me/..."
                        onBlur={(e) => settings.setPublicPageContactLink(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') settings.setPublicPageContactLink(e.currentTarget.value);
                        }}
                      />
                      <div className="settings-table__hint" style={{ marginTop: '0.25rem' }}>
                        {t('public_page_contact_link_desc') || 'A link to your Discord, Telegram, or website, displayed at the top of the public page.'}
                      </div>
                    </div>
                  </td>
                </tr>

                <tr className="settings-table__row">
                  <td colSpan={2} style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                      <label style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                        {t('default_connection_address') || 'Default Connection IP'}
                      </label>
                      <input
                        type="text"
                        className="input"
                        style={{ width: '100%', maxWidth: '100%' }}
                        defaultValue={settings.settings.public_host || ''}
                        placeholder={t('auto') || 'Auto (Hostname)'}
                        onBlur={(e) => settings.setPublicHost(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') settings.setPublicHost(e.currentTarget.value);
                        }}
                      />
                      <div className="settings-table__hint" style={{ marginTop: '0.25rem' }}>
                        {t('default_connection_address_desc') || 'Used as the connection IP when the server binds to 0.0.0.0. Leave empty to automatically use the current page hostname.'}
                      </div>
                    </div>
                  </td>
                </tr>
                <tr className="settings-table__row">
                  <td colSpan={2} style={{ padding: '0.75rem 1rem' }}>
                    <a
                      href={settings.settings.public_page_route || '/servers'}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn btn--primary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', textDecoration: 'none', width: '100%', justifyContent: 'center' }}
                    >
                      <AppIcon name="open_portal" size={16} />
                      <span>{t('open_public_page') || 'Open Page'}</span>
                    </a>
                  </td>
                </tr>
              </>
            )}
          </SettingsTable>
        </div>

        {settings.settings.public_page_enabled && (
          <div className="instance-settings-tables__major">
            <SettingsTable
              title={t('public_servers') || 'Public Servers'}
              titleId="publicServersTitle"
              sectionId="publicServersPanel"
            >
              <tr className="settings-table__row settings-table__row--footnote settings-table__row--sync-desc">
                <td colSpan={2} className="settings-table__footnote">
                  {t('public_servers_desc') || 'Select which servers should be visible on the public page and provide descriptions.'}
                </td>
              </tr>
              <tr className="settings-table__row">
                <td colSpan={2} style={{ padding: 0 }}>
                  <div className="table-wrap">
                    <table className="table instances-table">
                      <thead>
                        <tr>
                          <th style={{ width: '40px' }}></th>
                          <th style={{ width: '25%' }}>{t('server_name') || 'Name'}</th>
                          <th style={{ width: '25%' }}>{t('connection_address') || 'Connection IP'}</th>
                          <th>{t('description') || 'Description'}</th>
                          <th style={{ width: '100px', textAlign: 'center' }}>{t('actions') || 'Actions'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {instances.map((item) => (
                          <tr key={item.id}>
                            <td>
                              <FccSwitch
                                id={`toggle_public_${item.id}`}
                                checked={item.isPublic || false}
                                onChange={(checked) => handleToggleInstance(item, checked)}
                                label=""
                              />
                            </td>
                            <td style={{ fontWeight: 600 }}>{item.name}</td>
                            <td>
                              {editingId === item.id ? (
                                <input
                                  type="text"
                                  className="input"
                                  style={{ width: '100%' }}
                                  value={editAddr}
                                  onChange={(e) => setEditAddr(e.target.value)}
                                  placeholder={item.ip || '0.0.0.0'}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEditing(item);
                                    if (e.key === 'Escape') setEditingId(null);
                                  }}
                                  autoFocus
                                />
                              ) : (
                                <span style={{ opacity: item.publicConnectionAddress ? 1 : 0.5 }}>
                                  {item.publicConnectionAddress || (item.ip === '0.0.0.0' ? 'Auto' : item.ip)}
                                </span>
                              )}
                            </td>
                            <td>
                              {editingId === item.id ? (
                                <input
                                  type="text"
                                  className="input"
                                  style={{ width: '100%' }}
                                  value={editDesc}
                                  onChange={(e) => setEditDesc(e.target.value)}
                                  placeholder={t('public_description_placeholder') || 'Enter public description...'}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') saveEditing(item);
                                    if (e.key === 'Escape') setEditingId(null);
                                  }}
                                />
                              ) : (
                                <span style={{ opacity: item.publicDescription ? 1 : 0.5 }}>
                                  {item.publicDescription || (t('no_description') || 'No description')}
                                </span>
                              )}
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              {editingId === item.id ? (
                                <button className="btn btn--small btn--primary" onClick={() => saveEditing(item)}>
                                  <AppIcon name="save" size={16} />
                                </button>
                              ) : (
                                <button className="btn btn--small" onClick={() => startEditing(item)} title={t('edit_btn')}>
                                  <AppIcon name="edit" size={16} />
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </td>
              </tr>
            </SettingsTable>
          </div>
        )}
      </div>
    </div>
  );
}
