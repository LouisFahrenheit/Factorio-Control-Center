import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '../AppIcon';
import { CancelButton } from '../CancelButton';
import { ModalBackdrop } from '../modals/ModalBackdrop';
import { api } from '../../api/client';
import { formatPanelDateOnly } from '../../lib/datetimeUtils';
import { openFccConfirmModal } from '../../lib/fccConfirmModal';
import { getModPortalUrl, parseModInput } from '../../lib/modUtils';
import type { ModPortalReleaseItem, ModPortalReleasesResponse } from '../../types/modJob';

interface ModPortalVersionsModalProps {
  open: boolean;
  modName: string;
  onClose: () => void;
  onInstall: (modName: string, version: string) => void;
  onModListChange?: () => void;
  serverBusy: boolean;
  jobRunning?: boolean;
  refreshTrigger?: unknown;
  t: (key: string, ...args: (string | number)[]) => string;
}

export function ModPortalVersionsModal({
  open,
  modName,
  onClose,
  onInstall,
  onModListChange,
  serverBusy,
  jobRunning,
  refreshTrigger,
  t,
}: ModPortalVersionsModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<ModPortalReleasesResponse | null>(null);
  const [search, setSearch] = useState('');

  const cleanName = useMemo(() => {
    return parseModInput(modName).modName;
  }, [modName]);

  const fetchReleases = useCallback(
    (showSpinner = true) => {
      if (!cleanName) return;
      if (showSpinner) setLoading(true);
      setError('');

      api<ModPortalReleasesResponse>(`/api/mods/portal-releases/${encodeURIComponent(cleanName)}`)
        .then((res: ModPortalReleasesResponse) => {
          if (res.ok === false) {
            setError(String(res.error || 'fetch_failed'));
          } else {
            setData(res);
          }
        })
        .catch((err: unknown) => {
          setError(err instanceof Error ? err.message : String(err));
        })
        .finally(() => {
          if (showSpinner) setLoading(false);
        });
    },
    [cleanName],
  );

  useEffect(() => {
    if (!open || !cleanName) {
      setData(null);
      setError('');
      setSearch('');
      return;
    }
    fetchReleases(true);
  }, [open, cleanName, fetchReleases]);

  const prevServerBusyRef = useRef(serverBusy);
  useEffect(() => {
    if (prevServerBusyRef.current && !serverBusy && open) {
      fetchReleases(false);
      if (onModListChange) onModListChange();
    }
    prevServerBusyRef.current = serverBusy;
  }, [serverBusy, open, fetchReleases, onModListChange]);

  const prevJobRunningRef = useRef(jobRunning);
  useEffect(() => {
    if (prevJobRunningRef.current && !jobRunning && open) {
      fetchReleases(false);
      if (onModListChange) onModListChange();
    }
    prevJobRunningRef.current = jobRunning;
  }, [jobRunning, open, fetchReleases, onModListChange]);

  const prevTriggerRef = useRef(refreshTrigger);
  useEffect(() => {
    if (open && prevTriggerRef.current !== refreshTrigger) {
      fetchReleases(false);
    }
    prevTriggerRef.current = refreshTrigger;
  }, [refreshTrigger, open, fetchReleases]);

  const filteredReleases = useMemo(() => {
    const list = data?.releases || [];
    const q = search.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => {
      const hay = `${r.version} ${r.factorio_version} ${r.file_name || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [data?.releases, search]);

  const handleActivateVersion = async (modId: string, version: string) => {
    if (serverBusy) return;
    try {
      await api('/api/mods/version', {
        method: 'POST',
        body: JSON.stringify({ name: modId, version }),
      });
      const res = await api<ModPortalReleasesResponse>(
        `/api/mods/portal-releases/${encodeURIComponent(cleanName)}`,
      );
      setData(res);
      if (onModListChange) onModListChange();
    } catch {
      // ignore
    }
  };

  const handleDeleteVersion = (modId: string, version: string) => {
    if (serverBusy) return;
    openFccConfirmModal({
      title: t('mod_list_remove_mod_btn'),
      message: t('mod_list_remove_version_confirm', version, data?.title || modId),
      confirmLabel: t('mod_list_remove_mod_btn'),
      cancelLabel: t('cancel'),
      variant: 'danger',
      onConfirm: async () => {
        await api('/api/mods/remove', {
          method: 'POST',
          body: JSON.stringify({ name: modId, scope: 'version', version }),
        });
        const res = await api<ModPortalReleasesResponse>(
          `/api/mods/portal-releases/${encodeURIComponent(cleanName)}`,
        );
        setData(res);
        if (onModListChange) onModListChange();
      },
    });
  };

  if (!open) return null;

  const title = data?.title || cleanName;
  const portalUrl = getModPortalUrl(cleanName);

  return (
    <ModalBackdrop
      open
      id="modPortalVersionsBackdrop"
      onClose={onClose}
      closeOnEscape={!serverBusy}
      closeOnBackdropClick={!serverBusy}
    >
      <div
        className="fu-modal mod-portal-versions-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modPortalVersionsHeading"
      >
        <div className="mod-update-all-flow mod-portal-versions-dialog__flow">
          <div className="mod-update-all-flow__header mod-portal-versions__header">
            <AppIcon name="history" size={22} className="mod-portal-versions__header-icon" />
            <div className="mod-update-all-flow__header-text">
              <span className="mod-update-all-flow__header-title" id="modPortalVersionsHeading">
                {title}
              </span>
              <div className="mod-portal-versions__header-meta">
                <span className="mod-portal-versions__header-badge">
                  {t('mod_portal_versions_modal_title')}
                </span>
                {portalUrl ? (
                  <a
                    href={portalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mod-portal-versions__link-pill"
                    title={t('mod_list_open_portal_btn')}
                  >
                    <AppIcon name="open_portal" size={13} />
                    <span>mods.factorio.com</span>
                  </a>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              className="mod-update-all-flow__close"
              aria-label={t('close')}
              disabled={serverBusy}
              onClick={onClose}
            >
              <AppIcon name="close" size={16} />
            </button>
          </div>

          <div className="mod-update-all-flow__panel mod-portal-versions-dialog__panel">
            {data ? (
              <div className="mods-from-save-dialog__stats mod-portal-versions__stats">
                <div className="mods-from-save-dialog__stat mod-portal-versions__stat">
                  <span className="mods-from-save-dialog__stat-label">
                    {t('mod_portal_versions_server_ver')}
                  </span>
                  <span className="mods-from-save-dialog__stat-value mod-portal-versions__stat-value--server">
                    {data.game_version || data.factorio_version || '—'}
                  </span>
                </div>
                <div className="mods-from-save-dialog__stat mod-portal-versions__stat">
                  <span className="mods-from-save-dialog__stat-label">
                    {t('mod_portal_versions_installed_ver')}
                  </span>
                  <span
                    className={
                      'mods-from-save-dialog__stat-value' +
                      (data.installed_version
                        ? ' mod-portal-versions__stat-value--installed'
                        : ' mod-portal-versions__stat-value--muted')
                    }
                  >
                    {data.installed_version ? `v${data.installed_version}` : '—'}
                  </span>
                </div>
                <div className="mods-from-save-dialog__stat mod-portal-versions__stat">
                  <span className="mods-from-save-dialog__stat-label">
                    {t('mod_portal_versions_recommended')}
                  </span>
                  <span className="mods-from-save-dialog__stat-value mod-portal-versions__stat-value--rec">
                    {data.recommended_version ? `v${data.recommended_version}` : '—'}
                  </span>
                </div>
              </div>
            ) : null}

            {loading ? (
              <div className="mod-portal-versions__loading">
                <AppIcon name="refresh" size={28} className="mod-portal-versions__spinner" />
                <p>{t('mod_portal_versions_loading')}</p>
              </div>
            ) : error ? (
              <div className="mod-portal-versions__error-wrap">
                <p className="mod-portal-versions__error-text">{error}</p>
                <button
                  type="button"
                  className="btn btn--with-icon"
                  onClick={() => {
                    setError('');
                    setLoading(true);
                    api<ModPortalReleasesResponse>(
                      `/api/mods/portal-releases/${encodeURIComponent(cleanName)}`,
                    )
                      .then((res: ModPortalReleasesResponse) => {
                        if (res.ok === false) setError(String(res.error || 'fetch_failed'));
                        else setData(res);
                      })
                      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
                      .finally(() => setLoading(false));
                  }}
                >
                  <AppIcon name="refresh" size={16} />
                  {t('retry')}
                </button>
              </div>
            ) : data && filteredReleases.length === 0 ? (
              <div className="mod-portal-versions__empty">
                <AppIcon name="info" size={24} />
                <p>{t('mod_portal_versions_empty')}</p>
              </div>
            ) : data ? (
              <>
                <div className="mod-portal-versions__toolbar">
                  <div className="mod-portal-versions__search-box">
                    <AppIcon name="search" size={16} className="mod-portal-versions__search-icon" />
                    <input
                      type="text"
                      className="input mod-portal-versions__search-input"
                      placeholder={t('mod_portal_versions_search_placeholder')}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                    {search ? (
                      <button
                        type="button"
                        className="mod-portal-versions__search-clear"
                        onClick={() => setSearch('')}
                        aria-label={t('reset')}
                      >
                        <AppIcon name="close" size={14} />
                      </button>
                    ) : null}
                  </div>
                  <div className="mod-portal-versions__toolbar-actions">
                    <div className="mod-portal-versions__counter">
                      {t('mod_portal_versions_releases_count', filteredReleases.length)}
                    </div>
                    <button
                      type="button"
                      className="btn btn--toolbar-icon mod-portal-versions__refresh-btn"
                      title={t('refresh')}
                      aria-label={t('refresh')}
                      disabled={loading || serverBusy}
                      onClick={() => fetchReleases(true)}
                    >
                      <AppIcon name="refresh" size={15} />
                    </button>
                  </div>
                </div>

                <div className="mod-portal-versions__table-wrap">
                  <table className="mod-portal-versions__table">
                    <thead>
                      <tr>
                        <th className="mod-portal-versions__th-ver">
                          {t('mod_portal_versions_col_version')}
                        </th>
                        <th className="mod-portal-versions__th-factorio">
                          {t('mod_portal_versions_col_factorio')}
                        </th>
                        <th className="mod-portal-versions__th-date">
                          {t('mod_portal_versions_col_date')}
                        </th>
                        <th className="mod-portal-versions__th-action">
                          {t('mod_portal_versions_col_action')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredReleases.map((rel: ModPortalReleaseItem) => {
                        const isCurrent = data.installed_version === rel.version;
                        const isInstalled =
                          isCurrent ||
                          (Array.isArray(data.available_versions) &&
                            data.available_versions.includes(rel.version));
                        const isRecommended = data.recommended_version === rel.version;
                        return (
                          <tr
                            key={rel.version}
                            className={
                              'mod-portal-versions__row' +
                              (isCurrent ? ' mod-portal-versions__row--installed' : '') +
                              (isRecommended ? ' mod-portal-versions__row--recommended' : '')
                            }
                          >
                            <td className="mod-portal-versions__td-ver">
                              <div className="mod-portal-versions__ver-cell">
                                <span className="mod-portal-versions__version-code">
                                  {rel.version}
                                </span>
                                <div className="mod-portal-versions__badge-group">
                                  {isRecommended ? (
                                    <span
                                      className="mod-portal-pill mod-portal-pill--icon-only mod-portal-pill--rec"
                                      title={t('mod_portal_versions_recommended_badge')}
                                      aria-label={t('mod_portal_versions_recommended_badge')}
                                    >
                                      <AppIcon name="star" size={15} />
                                    </span>
                                  ) : rel.is_compatible ? (
                                    <span
                                      className="mod-portal-pill mod-portal-pill--icon-only mod-portal-pill--compat"
                                      title={t('mod_portal_versions_compatible_badge')}
                                      aria-label={t('mod_portal_versions_compatible_badge')}
                                    >
                                      <AppIcon name="folder_check" size={14} />
                                    </span>
                                  ) : null}
                                  {isCurrent ? (
                                    <span
                                      className="mod-portal-pill mod-portal-pill--icon-only mod-portal-pill--current"
                                      title={t('mod_portal_versions_current_badge')}
                                      aria-label={t('mod_portal_versions_current_badge')}
                                    >
                                      <AppIcon name="check" size={15} />
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                            </td>
                            <td className="mod-portal-versions__td-factorio">
                              <span
                                className={
                                  'mod-portal-branch-badge ' +
                                  (rel.is_compatible
                                    ? 'mod-portal-branch-badge--match'
                                    : 'mod-portal-branch-badge--other')
                                }
                              >
                                {rel.factorio_version ? `Factorio ${rel.factorio_version}` : '—'}
                              </span>
                            </td>
                            <td className="mod-portal-versions__td-date">
                              {rel.released_at ? formatPanelDateOnly(rel.released_at) : '—'}
                            </td>
                            <td className="mod-portal-versions__td-action">
                              <div className="mod-portal-versions__action-wrap">
                                {isInstalled ? (
                                  <>
                                    {isCurrent ? (
                                      <span
                                        className="mod-portal-versions__active-mark"
                                        title={t('mod_portal_versions_active_title')}
                                        aria-label={t('mod_portal_versions_active_title')}
                                      >
                                        <AppIcon name="check" size={15} />
                                      </span>
                                    ) : (
                                      <button
                                        type="button"
                                        className="btn mod-portal-versions__activate-btn"
                                        title={t('mod_portal_versions_activate_btn')}
                                        aria-label={t('mod_portal_versions_activate_btn')}
                                        disabled={serverBusy}
                                        onClick={() =>
                                          handleActivateVersion(data.name || cleanName, rel.version)
                                        }
                                      >
                                        <AppIcon name="check" size={15} />
                                      </button>
                                    )}
                                    <span className="mod-portal-versions__action-btn mod-portal-versions__installed-tag">
                                      <AppIcon name="folder_check" size={14} />
                                      <span>{t('mod_portal_versions_status_installed')}</span>
                                    </span>
                                    <button
                                      type="button"
                                      className="btn mod-portal-versions__delete-btn"
                                      title={t('mod_list_remove_mod_btn')}
                                      aria-label={t('mod_list_remove_mod_btn')}
                                      disabled={serverBusy}
                                      onClick={() => handleDeleteVersion(data.name || cleanName, rel.version)}
                                    >
                                      <AppIcon name="delete" size={15} />
                                    </button>
                                  </>
                                ) : (
                                  <>
                                    <span className="mod-portal-versions__btn-spacer" aria-hidden="true" />
                                    <button
                                      type="button"
                                      className="btn btn--with-icon mod-portal-versions__action-btn mod-portal-versions__install-btn"
                                      disabled={serverBusy}
                                      onClick={() => {
                                        onInstall(data.name || cleanName, rel.version);
                                      }}
                                    >
                                      <AppIcon name="download" size={14} />
                                      <span>{t('mod_portal_versions_install_btn')}</span>
                                    </button>
                                    <span className="mod-portal-versions__btn-spacer" aria-hidden="true" />
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            ) : null}
          </div>

          <div className="mod-update-all-flow__footer mod-portal-versions__footer">
            <CancelButton onClick={onClose} disabled={serverBusy} t={t} />
          </div>
        </div>
      </div>
    </ModalBackdrop>
  );
}
