import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getToken } from "../api/client";
import { notifyOk } from "../lib/notify";
import { notifyApiError } from "../lib/networkErrors";

export interface BackupEntry {
  id: string;
  filename: string;
  createdAt: string;
  sizeBytes: number;
  sections: string[];
  fccVersion: string;
  type?: "manual" | "auto" | "uploaded";
}

export interface BackupCreateOptions {
  includeMetrics: boolean;
  includeLogs: boolean;
  type?: "manual" | "auto" | "uploaded";
}

export interface AutoBackupSettings {
  enabled: boolean;
  intervalHours: number;
  maxCount: number;
  includeMetrics: boolean;
  includeLogs: boolean;
  lastRunAt: string;
  nextRunAt: string;
}

export type RestoreMode = "all" | "db_only" | "files_only";

export function useBackup(
  enabled: boolean,
  t: (key: string, ...args: (string | number)[]) => string,
) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [restoreConfirmOpen, setRestoreConfirmOpen] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupEntry | null>(null);
  const [restoreMode, setRestoreMode] = useState<RestoreMode>("all");
  const [settingsBusy, setSettingsBusy] = useState(false);

  const listQuery = useQuery({
    queryKey: ["backup", "list"],
    queryFn: () => api<{ ok: boolean; items: BackupEntry[] }>("/api/backup/list"),
    enabled,
    staleTime: 10_000,
  });

  const settingsQuery = useQuery({
    queryKey: ["backup", "settings"],
    queryFn: () =>
      api<{ ok: boolean; settings: AutoBackupSettings }>("/api/backup/settings"),
    enabled,
    staleTime: 30_000,
  });

  const reload = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["backup"] });
  }, [qc]);

  const createBackup = useCallback(
    async (opts: BackupCreateOptions) => {
      setCreating(true);
      try {
        await api("/api/backup/create", {
          method: "POST",
          body: JSON.stringify(opts),
        });
        notifyOk(t("backup_created_ok"));
        reload();
      } catch (e) {
        notifyApiError(t("backup_create_err"), e, t);
      } finally {
        setCreating(false);
      }
    },
    [reload, t],
  );

  const downloadBackup = useCallback(async (entry: BackupEntry) => {
    try {
      const token = getToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch(`/api/backup/${encodeURIComponent(entry.id)}/download`, { headers });
      if (!res.ok) {
        throw new Error(await res.text() || res.statusText);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = entry.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      notifyApiError(t("backup_download_err") || "Failed to download backup.", e, t);
    }
  }, [t]);

  const deleteBackup = useCallback(
    async (entry: BackupEntry) => {
      try {
        await api(`/api/backup/${encodeURIComponent(entry.id)}`, { method: "DELETE" });
        notifyOk(t("backup_deleted_ok"));
        reload();
      } catch (e) {
        notifyApiError(t("backup_delete_err"), e, t);
      }
    },
    [reload, t],
  );

  const openRestoreConfirm = useCallback((entry: BackupEntry) => {
    setRestoreTarget(entry);
    setRestoreMode("all");
    setRestoreConfirmOpen(true);
  }, []);

  const closeRestoreConfirm = useCallback(() => {
    setRestoreConfirmOpen(false);
    setRestoreTarget(null);
  }, []);

  const confirmRestore = useCallback(async () => {
    if (!restoreTarget) return;
    const target = restoreTarget;
    setRestoring(true);
    closeRestoreConfirm();
    try {
      await api(`/api/backup/${encodeURIComponent(target.id)}/restore`, {
        method: "POST",
        body: JSON.stringify({ mode: restoreMode }),
      });
      notifyOk(t("backup_restore_ok"), t("backup_restore_restarting"));

      // Wait for server to actually exit before polling (exit timer is 1500ms)
      let attempts = 0;
      const maxAttempts = 30; // 60 seconds max
      const startPolling = () => {
        const checkInterval = setInterval(async () => {
          attempts++;
          try {
            const check = await fetch("/api/health");
            if (check.ok) {
              clearInterval(checkInterval);
              window.location.reload();
            }
          } catch {
            // server still restarting — expected
          }
          if (attempts >= maxAttempts) {
            clearInterval(checkInterval);
            window.location.reload();
          }
        }, 2000);
      };
      setTimeout(startPolling, 3000);
    } catch (e) {
      notifyApiError(t("backup_restore_err"), e, t);
      setRestoring(false);
    }
  }, [restoreTarget, restoreMode, closeRestoreConfirm, t]);

  const saveAutoSettings = useCallback(
    async (patch: Partial<AutoBackupSettings>) => {
      setSettingsBusy(true);
      try {
        await api("/api/backup/settings", {
          method: "PUT",
          body: JSON.stringify(patch),
        });
        notifyOk(t("backup_settings_saved_ok"));
        void qc.invalidateQueries({ queryKey: ["backup", "settings"] });
      } catch (e) {
        notifyApiError(t("backup_settings_err"), e, t);
      } finally {
        setSettingsBusy(false);
      }
    },
    [qc, t],
  );

  const [uploading, setUploading] = useState(false);

  const uploadBackup = useCallback(
    async (file: File) => {
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const token = getToken();
        const headers: Record<string, string> = {};
        if (token) headers.Authorization = `Bearer ${token}`;

        const res = await fetch("/api/backup/upload", {
          method: "POST",
          headers,
          body: formData,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || res.statusText);
        }

        notifyOk(t("backup_upload_ok"));
        reload();
      } catch (e) {
        notifyApiError(t("backup_upload_err"), e, t);
      } finally {
        setUploading(false);
      }
    },
    [reload, t],
  );

  return {
    items: listQuery.data?.items ?? [],
    loading: listQuery.isLoading,
    creating,
    uploading,
    restoring,
    restoreConfirmOpen,
    restoreTarget,
    restoreMode,
    setRestoreMode,
    autoSettings: settingsQuery.data?.settings ?? null,
    settingsBusy,
    createBackup,
    uploadBackup,
    downloadBackup,
    deleteBackup,
    openRestoreConfirm,
    closeRestoreConfirm,
    confirmRestore,
    saveAutoSettings,
    reload,
  };
}
