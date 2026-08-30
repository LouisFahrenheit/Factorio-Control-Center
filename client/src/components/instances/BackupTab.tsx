import { useState, useMemo, useRef, type ReactNode, type ChangeEvent } from "react";
import { motion } from "motion/react";
import { AppIcon } from "../AppIcon";
import { FccSwitch } from "../FccSwitch";
import { TabLoadingPlaceholder, tabInitialLoad } from "../TabLoadingPlaceholder";
import { SCREEN_BODY_VARIANTS } from "../../lib/motionPresets";
import { webEffectsReduced } from "../../theme/webEffects";
import { openFccConfirmModal } from "../../lib/fccConfirmModal";
import { BackupRestoreModal } from "../modals/BackupRestoreModal";
import type { useBackup, BackupEntry } from "../../hooks/useBackup";

type BackupApi = ReturnType<typeof useBackup>;

interface BackupTabProps {
  backup: BackupApi;
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
  const sectionClass = "settings-table-section" + (className ? " " + className : "");
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function formatDate(iso: string): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export function BackupTab({ backup, t }: BackupTabProps) {
  const reduced = webEffectsReduced();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Create options state
  const [includeMetrics, setIncludeMetrics] = useState(false);
  const [includeLogs, setIncludeLogs] = useState(false);

  // Auto-backup draft
  const [autoEnabled, setAutoEnabled] = useState<boolean | null>(null);
  const [autoInterval, setAutoInterval] = useState<string | null>(null);
  const [autoMaxCount, setAutoMaxCount] = useState<string | null>(null);
  const [autoIncludeMetrics, setAutoIncludeMetrics] = useState<boolean | null>(null);
  const [autoIncludeLogs, setAutoIncludeLogs] = useState<boolean | null>(null);

  const s = backup.autoSettings;
  const effectiveEnabled = autoEnabled ?? s?.enabled ?? false;
  const effectiveInterval = autoInterval ?? String(s?.intervalHours ?? 24);
  const effectiveMaxCount = autoMaxCount ?? String(s?.maxCount ?? 5);
  const effectiveAutoMetrics = autoIncludeMetrics ?? s?.includeMetrics ?? false;
  const effectiveAutoLogs = autoIncludeLogs ?? s?.includeLogs ?? false;

  const handleCreate = () => {
    void backup.createBackup({ includeMetrics, includeLogs });
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      void backup.uploadBackup(file);
      e.target.value = '';
    }
  };

  const handleDelete = (id: string, filename: string) => {
    openFccConfirmModal({
      title: t("backup_delete_confirm_title"),
      message: `${t("backup_delete_confirm_msg")}\n\n${filename}`,
      confirmLabel: t("backup_delete_btn"),
      cancelLabel: t("cancel"),
      variant: "danger",
      onConfirm: () => {
        const entry = backup.items.find((x) => x.id === id);
        if (entry) void backup.deleteBackup(entry);
      },
    });
  };

  const handleRestore = (id: string) => {
    const entry = backup.items.find((x) => x.id === id);
    if (!entry) return;
    backup.openRestoreConfirm(entry);
  };

  const handleSaveAutoSettings = () => {
    void backup.saveAutoSettings({
      enabled: effectiveEnabled,
      intervalHours: Math.max(1, Math.min(8760, parseInt(effectiveInterval, 10) || 24)),
      maxCount: Math.max(1, Math.min(100, parseInt(effectiveMaxCount, 10) || 5)),
      includeMetrics: effectiveAutoMetrics,
      includeLogs: effectiveAutoLogs,
    });
    setAutoEnabled(null);
    setAutoInterval(null);
    setAutoMaxCount(null);
    setAutoIncludeMetrics(null);
    setAutoIncludeLogs(null);
  };

  const isLoading = tabInitialLoad(backup.loading, true);

  // Pagination (10 per page)
  const PAGE_SIZE = 10;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(backup.items.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    const sorted = [...backup.items].sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime() || 0;
      const timeB = new Date(b.createdAt).getTime() || 0;
      return timeB - timeA;
    });
    const start = (safePage - 1) * PAGE_SIZE;
    return sorted.slice(start, start + PAGE_SIZE);
  }, [backup.items, safePage]);

  const startIndex = (safePage - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(safePage * PAGE_SIZE, backup.items.length);

  if (isLoading) {
    return <TabLoadingPlaceholder variant="form" label={t("tab_data_loading")} />;
  }

  return (
    <motion.div
      className="sub-tab-panel sub-tab-panel--active instance-settings-tables"
      id="instanceTabBackup"
      role="tabpanel"
      aria-labelledby="instanceTabBackupBtn"
      variants={reduced ? undefined : SCREEN_BODY_VARIANTS}
      initial={reduced ? false : "hidden"}
      animate={reduced ? undefined : "show"}
    >
      {/* ── Restore confirm modal ─────────────────────────────────────── */}
      <BackupRestoreModal
        opened={backup.restoreConfirmOpen && !!backup.restoreTarget}
        target={backup.restoreTarget}
        mode={backup.restoreMode}
        onModeChange={backup.setRestoreMode}
        onConfirm={() => void backup.confirmRestore()}
        onClose={backup.closeRestoreConfirm}
        t={t}
      />

      {/* ── Restore in progress overlay ───────────────────────────────── */}
      {backup.restoring && (
        <div className="modal-backdrop" id="backupRestoringOverlay">
          <div className="fcc-modal" role="status" style={{ padding: 24, textAlign: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div className="spinner" />
              <p style={{ margin: 0, fontWeight: 500 }}>{t("backup_restoring_label")}</p>
            </div>
          </div>
        </div>
      )}

      <div className="backup-tab__layout">
        {/* ── Левая колонка: Создание и Автоматизация ──────────────────── */}
        <div className="backup-tab__sidebar">
          {/* Создание бэкапа */}
          <div className="backup-tab__card">
            <div className="backup-tab__card-header">
              <AppIcon name="backup" size={16} />
              <span>{t("backup_create_title")}</span>
            </div>
            <div className="backup-tab__card-body">
              <FccSwitch
                id="backupOptMetrics"
                checked={includeMetrics}
                onChange={setIncludeMetrics}
                label={t("backup_opt_include_metrics")}
              />
              <FccSwitch
                id="backupOptLogs"
                checked={includeLogs}
                onChange={setIncludeLogs}
                label={t("backup_opt_include_logs")}
              />
              <button
                type="button"
                id="backupCreateBtn"
                className="btn btn--primary btn--with-icon"
                disabled={backup.creating}
                onClick={handleCreate}
                style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
              >
                {backup.creating ? (
                  <>
                    <div className="spinner spinner--sm" />
                    <span>{t("backup_creating_label")}</span>
                  </>
                ) : (
                  <>
                    <AppIcon name="backup" size={16} />
                    <span>{t("backup_create_btn")}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Автоматический бэкап */}
          <div className="backup-tab__card">
            <div className="backup-tab__card-header">
              <AppIcon name="settings" size={16} />
              <span>{t("backup_auto_title")}</span>
            </div>
            <div className="backup-tab__card-body">
              <FccSwitch
                id="backupAutoEnabled"
                checked={effectiveEnabled}
                onChange={(v) => setAutoEnabled(v)}
                label={t("backup_auto_enabled_label")}
              />

              <div className="backup-tab__divider" />

              <div className="backup-tab__fields-grid">
                <div className="backup-tab__field-col">
                  <span className="backup-tab__field-label">{t("backup_auto_interval_label")}</span>
                  <div className="backup-tab__number-wrap">
                    <input
                      id="backupAutoInterval"
                      type="number"
                      className="backup-tab__number-input"
                      min={1}
                      max={8760}
                      value={effectiveInterval}
                      onChange={(e) => setAutoInterval(e.target.value)}
                      disabled={!effectiveEnabled}
                    />
                    <span className="backup-tab__number-unit">{t("backup_auto_interval_unit")}</span>
                  </div>
                </div>

                <div className="backup-tab__field-col">
                  <span className="backup-tab__field-label">{t("backup_auto_max_count_label")}</span>
                  <div className="backup-tab__number-wrap">
                    <input
                      id="backupAutoMaxCount"
                      type="number"
                      className="backup-tab__number-input"
                      min={1}
                      max={100}
                      value={effectiveMaxCount}
                      onChange={(e) => setAutoMaxCount(e.target.value)}
                      disabled={!effectiveEnabled}
                    />
                    <span className="backup-tab__number-unit">{t("backup_auto_max_count_unit")}</span>
                  </div>
                </div>
              </div>

              <div className="backup-tab__divider" />

              <FccSwitch
                id="backupAutoMetrics"
                checked={effectiveAutoMetrics}
                disabled={!effectiveEnabled}
                onChange={(v) => setAutoIncludeMetrics(v)}
                label={t("backup_opt_include_metrics")}
              />

              <FccSwitch
                id="backupAutoLogs"
                checked={effectiveAutoLogs}
                disabled={!effectiveEnabled}
                onChange={(v) => setAutoIncludeLogs(v)}
                label={t("backup_opt_include_logs")}
              />

              {s?.enabled && (s.lastRunAt || s.nextRunAt) ? (
                <div className="backup-tab__schedule-status">
                  {s.lastRunAt ? (
                    <div className="backup-tab__schedule-item">
                      <span>{t("backup_auto_last_run")}</span>
                      <span className="backup-tab__schedule-val">{formatDate(s.lastRunAt)}</span>
                    </div>
                  ) : null}
                  {s.nextRunAt ? (
                    <div className="backup-tab__schedule-item">
                      <span>{t("backup_auto_next_run")}</span>
                      <span className="backup-tab__schedule-val">{formatDate(s.nextRunAt)}</span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <button
                type="button"
                id="backupAutoSaveBtn"
                className="btn btn--primary btn--with-icon"
                disabled={backup.settingsBusy}
                onClick={handleSaveAutoSettings}
                style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}
              >
                <AppIcon name="save" size={16} />
                <span>{t("backup_auto_save_btn")}</span>
              </button>
            </div>
          </div>

          {/* Загрузка бэкапа */}
          <div className="backup-tab__card">
            <div className="backup-tab__card-header">
              <AppIcon name="upload" size={16} />
              <span>{t("backup_upload_title")}</span>
            </div>
            <div className="backup-tab__card-body">
              <input
                ref={fileInputRef}
                type="file"
                accept=".zip"
                style={{ display: 'none' }}
                onChange={handleFileInputChange}
              />
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.35 }}>
                {t("backup_upload_hint")}
              </span>
              <button
                type="button"
                className="btn btn--secondary btn--with-icon"
                id="backupUploadBtn"
                disabled={backup.uploading}
                title={t("backup_upload_btn")}
                onClick={() => fileInputRef.current?.click()}
                style={{ width: '100%', justifyContent: 'center', marginTop: 2 }}
              >
                {backup.uploading ? (
                  <>
                    <div className="spinner spinner--sm" />
                    <span>{t("backup_uploading_label")}</span>
                  </>
                ) : (
                  <>
                    <AppIcon name="upload" size={16} />
                    <span>{t("backup_upload_btn")}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* ── Правая колонка: Список архивов ──────────────────────────── */}
        <div className="instance-settings-tables__major" style={{ width: '100%' }}>
          <SettingsTable
            title={`${t("backup_list_title")} (${backup.items.length})`}
            titleId="backupListTitle"
            sectionId="backupListSection"
            titleMeta={
              <button
                type="button"
                className="instance-servers-toolbar__btn"
                id="backupRefreshBtn"
                title={t("web_refresh")}
                aria-label={t("web_refresh")}
                onClick={() => backup.reload()}
                style={{ padding: 4 }}
              >
                <AppIcon name="refresh" size={18} />
              </button>
            }
          >
            {backup.items.length === 0 ? (
              <tr className="settings-table__row">
                <td colSpan={2} style={{ padding: '48px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                    <span style={{ color: 'var(--text-muted)', opacity: 0.5, display: 'inline-flex' }}>
                      <AppIcon name="folder_zip" size={36} />
                    </span>
                    <span>{t("backup_list_empty")}</span>
                  </div>
                </td>
              </tr>
            ) : (
              <tr className="settings-table__row">
                <td colSpan={2} style={{ padding: 0 }}>
                  <div style={{ overflowX: 'auto' }}>
                    <table className="backup-tab__table">
                      <thead>
                        <tr>
                          <th style={{ textAlign: 'left', minWidth: 240 }}>{t("backup_col_date")}</th>
                          <th style={{ textAlign: 'center', width: 95 }}>{t("backup_col_type")}</th>
                          <th style={{ textAlign: 'center', width: 90 }}>{t("backup_col_size")}</th>
                          <th style={{ textAlign: 'left', minWidth: 160 }}>{t("backup_col_sections")}</th>
                          <th style={{ textAlign: 'right', width: 120 }}>{t("backup_col_actions")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedItems.map((entry: BackupEntry) => {
                          const tagLabels: Record<string, string> = {
                            database: 'DB',
                            metrics: 'Metrics',
                            instance_logs: 'Logs',
                            tls: 'TLS',
                            map_presets: 'Presets',
                            announcements: 'Announce',
                            env: 'Env',
                          };

                          return (
                            <tr key={entry.id} className="backup-tab__row">
                              <td className="backup-tab__cell" style={{ textAlign: 'left' }}>
                                <div className="backup-tab__file-info" style={{ textAlign: 'left', justifyContent: 'flex-start' }}>
                                  <div className="backup-tab__file-icon">
                                    <AppIcon name="folder_zip" size={18} />
                                  </div>
                                  <div className="backup-tab__file-details" style={{ textAlign: 'left', alignItems: 'flex-start' }}>
                                    <span className="backup-tab__file-date" style={{ textAlign: 'left' }}>{formatDate(entry.createdAt)}</span>
                                    <span className="backup-tab__file-name" style={{ textAlign: 'left' }}>{entry.filename}</span>
                                  </div>
                                </div>
                              </td>

                              <td className="backup-tab__cell" style={{ textAlign: 'center' }}>
                                {entry.type === 'auto' ? (
                                  <span className="backup-tab__tag backup-tab__tag--auto">
                                    <AppIcon name="schedule" size={12} />
                                    {t("backup_type_auto")}
                                  </span>
                                ) : entry.type === 'uploaded' ? (
                                  <span className="backup-tab__tag backup-tab__tag--uploaded">
                                    <AppIcon name="upload" size={12} />
                                    {t("backup_type_uploaded")}
                                  </span>
                                ) : (
                                  <span className="backup-tab__tag backup-tab__tag--manual">
                                    <AppIcon name="users" size={12} />
                                    {t("backup_type_manual")}
                                  </span>
                                )}
                              </td>

                              <td className="backup-tab__cell" style={{ textAlign: 'center' }}>
                                <span className="backup-tab__size-badge">
                                  {entry.sizeBytes > 0 ? formatBytes(entry.sizeBytes) : "—"}
                                </span>
                              </td>

                              <td className="backup-tab__cell">
                                <div className="backup-tab__tags">
                                  {entry.sections && entry.sections.length > 0 ? (
                                    entry.sections.map((sec: string) => (
                                      <span
                                        key={sec}
                                        className="backup-tab__tag"
                                      >
                                        {tagLabels[sec] || sec}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="backup-tab__tag">DB</span>
                                  )}
                                </div>
                              </td>

                              <td className="backup-tab__cell" style={{ textAlign: 'right' }}>
                                <div className="backup-tab__actions">
                                  <button
                                    type="button"
                                    className="backup-tab__action-btn"
                                    id={`backupDownloadBtn-${entry.id}`}
                                    title={t("backup_download_btn")}
                                    aria-label={t("backup_download_btn")}
                                    onClick={() => backup.downloadBackup(entry)}
                                  >
                                    <AppIcon name="download" size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    className="backup-tab__action-btn backup-tab__action-btn--restore"
                                    id={`backupRestoreBtn-${entry.id}`}
                                    title={t("backup_restore_btn")}
                                    aria-label={t("backup_restore_btn")}
                                    onClick={() => handleRestore(entry.id)}
                                  >
                                    <AppIcon name="restore" size={16} />
                                  </button>
                                  <button
                                    type="button"
                                    className="backup-tab__action-btn backup-tab__action-btn--danger"
                                    id={`backupDeleteBtn-${entry.id}`}
                                    title={t("backup_delete_btn")}
                                    aria-label={t("backup_delete_btn")}
                                    onClick={() => handleDelete(entry.id, entry.filename)}
                                  >
                                    <AppIcon name="delete" size={16} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    {/* Пагинация (если бэкапов больше PAGE_SIZE) */}
                    {backup.items.length > PAGE_SIZE && (
                      <div className="backup-tab__pagination">
                        <span className="backup-tab__pagination-info">
                          {startIndex}–{endIndex} of {backup.items.length}
                        </span>
                        <div className="backup-tab__pagination-controls">
                          <button
                            type="button"
                            className="backup-tab__page-btn"
                            disabled={safePage <= 1}
                            onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                            title="Previous page"
                          >
                            ‹
                          </button>

                          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                            <button
                              key={p}
                              type="button"
                              className={`backup-tab__page-btn ${p === safePage ? 'backup-tab__page-btn--active' : ''}`}
                              onClick={() => setCurrentPage(p)}
                            >
                              {p}
                            </button>
                          ))}

                          <button
                            type="button"
                            className="backup-tab__page-btn"
                            disabled={safePage >= totalPages}
                            onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                            title="Next page"
                          >
                            ›
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            )}
          </SettingsTable>
        </div>
      </div>
    </motion.div>
  );
}
