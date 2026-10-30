import { useState, useMemo, useRef, useCallback, useEffect, type ChangeEvent, type MouseEvent } from "react";
import {
  IconArchive,
  IconDownload,
  IconRotateClockwise,
  IconTrash,
  IconClock,
  IconUser,
  IconCloudUpload,
  IconUpload,
  IconSparkles,
  IconChevronLeft,
  IconChevronRight,
} from "@tabler/icons-react";
import { motion } from "motion/react";
import { TabLoadingPlaceholder, tabInitialLoad } from "../TabLoadingPlaceholder";
import {
  SCREEN_BODY_VARIANTS,
  LIST_CONTAINER_VARIANTS,
  LIST_ROW_VARIANTS,
} from "../../lib/motionPresets";
import { webEffectsReduced } from "../../theme/webEffects";
import { openFccConfirmModal } from "../../lib/fccConfirmModal";
import { BackupRestoreModal } from "../modals/BackupRestoreModal";
import { BackupCreateModal } from "../modals/BackupCreateModal";
import { BackupAutoSettingsModal } from "../modals/BackupAutoSettingsModal";
import { BackupBar } from "./BackupBar";
import { BackupRowMenu } from "./BackupRowMenu";
import type { useBackup, BackupEntry } from "../../hooks/useBackup";

type BackupApi = ReturnType<typeof useBackup>;

interface BackupTabProps {
  backup: BackupApi;
  t: (key: string, ...args: (string | number)[]) => string;
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

const TAG_LABELS: Record<string, string> = {
  database: 'DB',
  metrics: 'Metrics',
  instance_logs: 'Logs',
  tls: 'TLS',
  map_presets: 'Presets',
  announcements: 'Announce',
  env: 'Env',
};

export function BackupTab({ backup, t }: BackupTabProps) {
  const reduced = webEffectsReduced();
  const [isTableEntering, setIsTableEntering] = useState<boolean>(!reduced);

  useEffect(() => {
    if (!isTableEntering) return;
    const timer = window.setTimeout(() => {
      setIsTableEntering(false);
    }, 750);
    return () => window.clearTimeout(timer);
  }, [isTableEntering]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadDragOver, setIsUploadDragOver] = useState(false);

  // Search & Filter
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");

  // Modals
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [autoSettingsModalOpen, setAutoSettingsModalOpen] = useState(false);

  // Sorting state
  type BackupSortCol = 'date' | 'type' | 'size';
  const [sortCol, setSortCol] = useState<BackupSortCol>('date');
  const [sortAsc, setSortAsc] = useState<boolean>(false);

  const handleSort = (col: BackupSortCol) => {
    if (sortCol === col) {
      setSortAsc((prev) => !prev);
    } else {
      setSortCol(col);
      setSortAsc(col === 'type');
    }
  };

  // Pagination state (defaults to 15 on high-res / 2K screens, 10 on standard)
  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('fcc_backup_page_size');
        if (saved) {
          const parsed = parseInt(saved, 10);
          if ([10, 15, 20, 50].includes(parsed)) return parsed;
        }
      } catch {
        // ignore
      }
      if (window.innerHeight >= 860 || window.innerWidth >= 1600) {
        return 15;
      }
    }
    return 10;
  });
  const [currentPage, setCurrentPage] = useState(1);

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    try {
      localStorage.setItem('fcc_backup_page_size', String(newSize));
    } catch {
      // ignore
    }
  };

  // Context Menu state
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuEntry, setMenuEntry] = useState<BackupEntry | null>(null);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
  }, []);

  const onRowClick = (
    entry: BackupEntry,
    rowEl: HTMLElement,
    ev: MouseEvent,
  ) => {
    ev.stopPropagation();
    const x = Number.isFinite(ev.clientX)
      ? Math.round(ev.clientX + 2)
      : Math.round(rowEl.getBoundingClientRect().left + 12);
    const y = Number.isFinite(ev.clientY)
      ? Math.round(ev.clientY + 2)
      : Math.round(rowEl.getBoundingClientRect().bottom + 6);
    setMenuEntry(entry);
    setMenuPos({ x, y });
    setMenuOpen(true);
  };

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

  const handleCreateSubmit = () => {
    setCreateModalOpen(false);
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
    setAutoSettingsModalOpen(false);
  };

  const isLoading = tabInitialLoad(backup.loading, true);

  // Find newest backup across all items
  const latestBackupId = useMemo(() => {
    if (!backup.items || backup.items.length === 0) return null;
    let newestId = backup.items[0].id;
    let newestTime = new Date(backup.items[0].createdAt).getTime() || 0;
    for (let i = 1; i < backup.items.length; i++) {
      const time = new Date(backup.items[i].createdAt).getTime() || 0;
      if (time > newestTime) {
        newestTime = time;
        newestId = backup.items[i].id;
      }
    }
    return newestId;
  }, [backup.items]);

  // Filter items
  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return backup.items.filter((entry) => {
      // Type filter
      if (typeFilter !== 'all' && entry.type !== typeFilter) return false;

      // Search query
      if (q) {
        const nameMatch = (entry.filename || '').toLowerCase().includes(q);
        const dateMatch = formatDate(entry.createdAt).toLowerCase().includes(q);
        const tagMatch = (entry.sections || []).some(
          (sec) => (TAG_LABELS[sec] || sec).toLowerCase().includes(q)
        );
        if (!nameMatch && !dateMatch && !tagMatch) return false;
      }

      return true;
    });
  }, [backup.items, search, typeFilter]);

  // Sorted items
  const sortedItems = useMemo(() => {
    return [...filteredItems].sort((a, b) => {
      let cmp = 0;
      if (sortCol === 'date') {
        const timeA = new Date(a.createdAt).getTime() || 0;
        const timeB = new Date(b.createdAt).getTime() || 0;
        cmp = timeA - timeB;
      } else if (sortCol === 'size') {
        cmp = (a.sizeBytes || 0) - (b.sizeBytes || 0);
      } else if (sortCol === 'type') {
        const typeA = a.type || 'manual';
        const typeB = b.type || 'manual';
        cmp = typeA.localeCompare(typeB);
      }
      return sortAsc ? cmp : -cmp;
    });
  }, [filteredItems, sortCol, sortAsc]);

  // Paginated items
  const totalPages = Math.max(1, Math.ceil(sortedItems.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sortedItems.slice(start, start + pageSize);
  }, [sortedItems, safePage, pageSize]);

  const startIndex = sortedItems.length > 0 ? (safePage - 1) * pageSize + 1 : 0;
  const endIndex = Math.min(safePage * pageSize, sortedItems.length);

  if (isLoading) {
    return <TabLoadingPlaceholder variant="form" label={t("tab_data_loading")} />;
  }

  return (
    <motion.div
      className="sub-tab-panel sub-tab-panel--active"
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

      {/* ── Create Backup Modal ───────────────────────────────────────── */}
      <BackupCreateModal
        opened={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        includeMetrics={includeMetrics}
        onIncludeMetricsChange={setIncludeMetrics}
        includeLogs={includeLogs}
        onIncludeLogsChange={setIncludeLogs}
        onSubmit={handleCreateSubmit}
        creating={backup.creating}
        t={t}
      />

      {/* ── Auto Settings Modal ───────────────────────────────────────── */}
      <BackupAutoSettingsModal
        opened={autoSettingsModalOpen}
        onClose={() => setAutoSettingsModalOpen(false)}
        enabled={effectiveEnabled}
        onEnabledChange={(v) => setAutoEnabled(v)}
        interval={effectiveInterval}
        onIntervalChange={setAutoInterval}
        maxCount={effectiveMaxCount}
        onMaxCountChange={setAutoMaxCount}
        includeMetrics={effectiveAutoMetrics}
        onIncludeMetricsChange={(v) => setAutoIncludeMetrics(v)}
        includeLogs={effectiveAutoLogs}
        onIncludeLogsChange={(v) => setAutoIncludeLogs(v)}
        lastRunAt={s?.lastRunAt}
        nextRunAt={s?.nextRunAt}
        onSave={handleSaveAutoSettings}
        saving={backup.settingsBusy}
        t={t}
      />

      {/* ── Row Context Menu ──────────────────────────────────────────── */}
      <BackupRowMenu
        open={menuOpen}
        entry={menuEntry}
        position={menuPos}
        onClose={closeMenu}
        onDownload={(e) => backup.downloadBackup(e)}
        onRestore={(e) => handleRestore(e.id)}
        onDelete={(e) => handleDelete(e.id, e.filename)}
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

      {/* Скрытый инпут для загрузки файла */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".zip"
        style={{ display: 'none' }}
        onChange={handleFileInputChange}
      />

      <div className="access-layout backup-tab-layout">
        {/* ── Тулбар управления (стиль списка серверов) ────────────────── */}
        <BackupBar
          search={search}
          onSearchChange={(val) => {
            setSearch(val);
            setCurrentPage(1);
          }}
          typeFilter={typeFilter}
          onTypeFilterChange={(val) => {
            setTypeFilter(val);
            setCurrentPage(1);
          }}
          onRefresh={() => backup.reload()}
          onOpenCreate={() => setCreateModalOpen(true)}
          onOpenAutoSettings={() => setAutoSettingsModalOpen(true)}
          onTriggerUpload={() => fileInputRef.current?.click()}
          autoEnabled={effectiveEnabled}
          creating={backup.creating}
          uploading={backup.uploading}
          totalCount={backup.items.length}
          filteredCount={filteredItems.length}
          t={t}
        />

        {/* ── Таблица архивов (Drag & Drop зона) ────────────────────────── */}
        <div
          className={'table-wrap table-wrap--motion-list backup-tab__table-wrap fcc-drop-target' + (isUploadDragOver ? ' is-drag-over' : '')}
          onDragOver={(ev) => {
            if (ev.dataTransfer.types.includes('Files')) {
              ev.preventDefault();
              setIsUploadDragOver(true);
            }
          }}
          onDragEnter={(ev) => {
            if (ev.dataTransfer.types.includes('Files')) {
              ev.preventDefault();
              setIsUploadDragOver(true);
            }
          }}
          onDragLeave={(ev) => {
            if (!ev.currentTarget.contains(ev.relatedTarget as Node)) {
              setIsUploadDragOver(false);
            }
          }}
          onDrop={(ev) => {
            ev.preventDefault();
            setIsUploadDragOver(false);
            const f = ev.dataTransfer.files?.[0];
            if (f) void backup.uploadBackup(f);
          }}
        >
          {isUploadDragOver && (
            <div className="fcc-drop-overlay">
              <IconUpload size={32} className="fcc-drop-overlay__icon" />
              <span className="fcc-drop-overlay__text" style={{ fontSize: '0.95rem', fontWeight: 600 }}>
                {t('upload_drop_zone_hint') || 'Перетащите архив бэкапа сюда'}
              </span>
            </div>
          )}

          <div className={`backup-tab__table-container ${isTableEntering ? 'backup-tab__table-container--entering' : ''}`}>
            {filteredItems.length === 0 ? (
              <div className="backup-tab__empty-state">
                <div className="backup-tab__empty-icon-wrap">
                  <IconArchive size={36} />
                </div>
                <span className="backup-tab__empty-title">
                  {backup.items.length === 0
                    ? t("backup_list_empty")
                    : (t("instances_search_no_results") || "Ничего не найдено по заданным фильтрам")}
                </span>
              </div>
            ) : (
              <table className="data backup-tab__table" id="tblBackups">
                <thead>
                  <tr>
                    <th
                      style={{ textAlign: 'left', minWidth: 260 }}
                      className={`backup-sort-th ${sortCol === 'date' ? 'backup-sort-th--active' : ''} ${sortCol === 'date' && sortAsc ? 'backup-sort-th--asc' : ''}`}
                      onClick={() => handleSort('date')}
                    >
                      {t("backup_col_date")}
                    </th>
                    <th
                      style={{ textAlign: 'center', width: 110 }}
                      className={`backup-sort-th ${sortCol === 'type' ? 'backup-sort-th--active' : ''} ${sortCol === 'type' && sortAsc ? 'backup-sort-th--asc' : ''}`}
                      onClick={() => handleSort('type')}
                    >
                      {t("backup_col_type")}
                    </th>
                    <th
                      style={{ textAlign: 'center', width: 95 }}
                      className={`backup-sort-th ${sortCol === 'size' ? 'backup-sort-th--active' : ''} ${sortCol === 'size' && sortAsc ? 'backup-sort-th--asc' : ''}`}
                      onClick={() => handleSort('size')}
                    >
                      {t("backup_col_size")}
                    </th>
                    <th style={{ textAlign: 'left', minWidth: 180 }}>{t("backup_col_sections")}</th>
                    <th style={{ textAlign: 'right', width: 130 }}>{t("backup_col_actions")}</th>
                  </tr>
                </thead>
                <motion.tbody
                  id="tblBackupsBody"
                  variants={reduced ? undefined : LIST_CONTAINER_VARIANTS}
                  initial={reduced ? false : 'hidden'}
                  animate={reduced ? undefined : 'show'}
                  onAnimationComplete={() => setIsTableEntering(false)}
                >
                  {paginatedItems.map((entry: BackupEntry) => {
                    const isSelected = menuOpen && menuEntry?.id === entry.id;
                    const rowClass = [
                      'backup-tab__row',
                      isSelected ? 'backup-tab__row--selected' : '',
                    ]
                      .filter(Boolean)
                      .join(' ');

                    return (
                      <motion.tr
                        key={entry.id}
                        className={rowClass}
                        variants={reduced ? undefined : LIST_ROW_VARIANTS}
                        onClick={(ev) => onRowClick(entry, ev.currentTarget, ev)}
                      >
                        {/* Дата и имя архива */}
                        <td className="backup-tab__cell">
                          <div className="backup-tab__file-info">
                            <div className="backup-tab__file-icon">
                              <IconArchive size={20} />
                            </div>
                            <div className="backup-tab__file-details">
                              <div className="backup-tab__file-header">
                                <span className="backup-tab__file-date">{formatDate(entry.createdAt)}</span>
                                {entry.id === latestBackupId && (
                                  <span className="backup-tab__badge-latest" title={t("backup_badge_latest")}>
                                    <IconSparkles size={11} />
                                    {t("backup_badge_latest")}
                                  </span>
                                )}
                              </div>
                              <span className="backup-tab__file-name">{entry.filename}</span>
                            </div>
                          </div>
                        </td>

                        {/* Тип (Auto / Manual / Uploaded) */}
                        <td className="backup-tab__cell" style={{ textAlign: 'center' }}>
                          {entry.type === 'auto' ? (
                            <span className="backup-tab__type-badge backup-tab__type-badge--auto">
                              <IconClock size={13} />
                              {t("backup_type_auto")}
                            </span>
                          ) : entry.type === 'uploaded' ? (
                            <span className="backup-tab__type-badge backup-tab__type-badge--uploaded">
                              <IconCloudUpload size={13} />
                              {t("backup_type_uploaded")}
                            </span>
                          ) : (
                            <span className="backup-tab__type-badge backup-tab__type-badge--manual">
                              <IconUser size={13} />
                              {t("backup_type_manual")}
                            </span>
                          )}
                        </td>

                        {/* Размер */}
                        <td className="backup-tab__cell" style={{ textAlign: 'center' }}>
                          <span className="backup-tab__size-badge">
                            {entry.sizeBytes > 0 ? formatBytes(entry.sizeBytes) : "—"}
                          </span>
                        </td>

                        {/* Состав архива */}
                        <td className="backup-tab__cell">
                          <div className="backup-tab__tags">
                            {entry.sections && entry.sections.length > 0 ? (
                              entry.sections.map((sec: string) => (
                                <span key={sec} className="backup-tab__tag">
                                  {TAG_LABELS[sec] || sec}
                                </span>
                              ))
                            ) : (
                              <span className="backup-tab__tag">DB</span>
                            )}
                          </div>
                        </td>

                        {/* Кнопки действий */}
                        <td className="backup-tab__cell" style={{ textAlign: 'right' }}>
                          <div className="backup-tab__actions">
                            <button
                              type="button"
                              className="backup-tab__action-btn"
                              id={`backupDownloadBtn-${entry.id}`}
                              title={t("backup_download_btn")}
                              aria-label={t("backup_download_btn")}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                backup.downloadBackup(entry);
                              }}
                            >
                              <IconDownload size={18} />
                            </button>
                            <button
                              type="button"
                              className="backup-tab__action-btn backup-tab__action-btn--restore"
                              id={`backupRestoreBtn-${entry.id}`}
                              title={t("backup_restore_btn")}
                              aria-label={t("backup_restore_btn")}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                handleRestore(entry.id);
                              }}
                            >
                              <IconRotateClockwise size={18} />
                            </button>
                            <button
                              type="button"
                              className="backup-tab__action-btn backup-tab__action-btn--danger"
                              id={`backupDeleteBtn-${entry.id}`}
                              title={t("backup_delete_btn")}
                              aria-label={t("backup_delete_btn")}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                handleDelete(entry.id, entry.filename);
                              }}
                            >
                              <IconTrash size={18} />
                            </button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </motion.tbody>
              </table>
            )}
          </div>

          {/* ── Пагинация (прижата к низу карточки) ────────────────── */}
          {sortedItems.length > 0 && (
            <div className="backup-tab__pagination">
              <div className="backup-tab__pagination-left">
                <span className="backup-tab__pagination-info">
                  {startIndex}–{endIndex} of {sortedItems.length}
                </span>
                <div className="backup-tab__page-size-picker">
                  <span className="backup-tab__page-size-label">
                    {t('page_size_label') || 'На странице:'}
                  </span>
                  {[10, 15, 20, 50].map((sz) => (
                    <button
                      key={sz}
                      type="button"
                      className={`backup-tab__page-size-btn ${pageSize === sz ? 'backup-tab__page-size-btn--active' : ''}`}
                      onClick={() => handlePageSizeChange(sz)}
                    >
                      {sz}
                    </button>
                  ))}
                </div>
              </div>

              {totalPages > 1 && (
                <div className="backup-tab__pagination-controls">
                  <button
                    type="button"
                    className="backup-tab__page-btn"
                    disabled={safePage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    title={t("previous") || "Previous"}
                  >
                    <IconChevronLeft size={16} />
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
                    title={t("next") || "Next"}
                  >
                    <IconChevronRight size={16} />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
