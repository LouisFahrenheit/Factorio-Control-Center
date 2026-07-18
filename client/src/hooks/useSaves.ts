import { useCallback, useEffect, useMemo, useState } from 'react';
import { useCreateSave } from './useCreateSave';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { modals } from '@mantine/modals';
import { api, getToken } from '../api/client';
import {
  buildSaveModCompareRows,
  buildUniqueQuickSaveName,
  formatLocalTime,
  localizeCreateSaveError,
  localizeSaveRenameError,
  localizeSaveUploadError,
  normalizeSaveZipName,
  saveDisplayLabel,
  type SaveRow,
} from '../lib/saveUtils';
import { randomMapSeed } from '../lib/mapGen/sliderScale';
import { feedbackMsg } from '../lib/apiFeedback';
import { resolveStatusKind, type PanelStatus } from '../types/panel';

export function useSaves(
  enabled: boolean,
  instanceId: string,
  status: PanelStatus | null | undefined,
  t: (key: string, ...args: (string | number)[]) => string,
) {
  const qc = useQueryClient();
  const [selectedSave, setSelectedSave] = useState('');
  const savesTitle = t('saves_manager_btn');

  const kind = resolveStatusKind(status);
  const serverBusy = kind === 'running' || kind === 'starting' || kind === 'stopping';
  const maintLocked = kind === 'maintenance';

  const listQuery = useQuery({
    queryKey: ['saves', 'list'],
    queryFn: async () => {
      const j = await api<{ saves?: SaveRow[]; ok?: boolean; error?: string }>('/api/saves');
      if (j?.ok === false) {
        const err = String(j.error || '');
        if (err.includes('not_found') || err.includes('no_saves')) return [] as SaveRow[];
        throw new Error(err || 'load_failed');
      }
      const rows = Array.isArray(j.saves) ? j.saves.slice() : [];
      rows.sort((a, b) => (Number(b.mtime) || 0) - (Number(a.mtime) || 0));
      return rows;
    },
    enabled,
  });

  const rows = listQuery.data || [];
  const existingSaveNames = useMemo(
    () => new Set(rows.map((r) => String(r.name || '').toLowerCase())),
    [rows],
  );

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameOldName, setRenameOldName] = useState('');
  const [renameNewName, setRenameNewName] = useState('');
  const [renameError, setRenameError] = useState('');
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [quickSaveDialogOpen, setQuickSaveDialogOpen] = useState(false);
  const [quickSaveFileName, setQuickSaveFileName] = useState('');
  const [quickSaveNameError, setQuickSaveNameError] = useState('');
  const [quickSaveAutoHint, setQuickSaveAutoHint] = useState('');
  const [quickSaveSeed, setQuickSaveSeed] = useState<number | null>(null);
  const [quickCreating, setQuickCreating] = useState(false);

  useEffect(() => {
    if (!rows.length) {
      setSelectedSave('');
      return;
    }
    if (!rows.some((x) => x.name === selectedSave)) {
      setSelectedSave(rows[0]?.name || '');
    }
  }, [rows, selectedSave]);

  const compareQuery = useQuery({
    queryKey: ['saves', 'compare', selectedSave],
    queryFn: async () => {
      const name = selectedSave;
      const [insp, modList, modsAll] = await Promise.all([
        api<{ header?: { factorio_version?: string; mods?: { name?: string; version?: string }[] } }>(
          `/api/saves/${encodeURIComponent(name)}/inspect`,
        ),
        api<{ data?: { mods?: { name?: string; enabled?: boolean }[] } }>('/api/files/mod-list'),
        api<{ mods?: { name?: string; local_version?: string }[]; game_version?: string }>('/api/mods'),
      ]);
      return buildSaveModCompareRows(insp, modList, modsAll);
    },
    enabled: enabled && !!selectedSave,
  });

  const setSavesMsg = useCallback(
    (text: string, isErr = false) => {
      feedbackMsg(savesTitle, text, isErr, false, t);
    },
    [savesTitle],
  );

  const reload = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['saves'] }),
      qc.invalidateQueries({ queryKey: ['players'] }),
    ]);
  }, [qc]);

  const download = useCallback(
    async (name: string) => {
      const token = getToken();
      const headers: Record<string, string> = {};
      if (token) headers.Authorization = `Bearer ${token}`;
      const r = await fetch(`/api/saves/${encodeURIComponent(name)}/download`, { headers });
      if (!r.ok) throw new Error(await r.text());
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setSavesMsg(t('saves_manager_download_ok', name), false);
    },
    [setSavesMsg, t],
  );

  const openRenameDialog = useCallback((name: string) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;
    setRenameOldName(trimmed);
    setRenameNewName(saveDisplayLabel(trimmed));
    setRenameError('');
    setRenameSubmitting(false);
    setRenameOpen(true);
  }, []);

  const closeRenameDialog = useCallback(() => {
    setRenameOpen(false);
    setRenameOldName('');
    setRenameNewName('');
    setRenameError('');
    setRenameSubmitting(false);
  }, []);

  const submitRename = useCallback(async () => {
    const oldName = renameOldName.trim();
    const nextZip = normalizeSaveZipName(renameNewName);
    if (!oldName) {
      closeRenameDialog();
      return;
    }
    if (!nextZip) {
      setRenameError(t('saves_manager_rename_invalid'));
      return;
    }
    if (nextZip.toLowerCase() === oldName.toLowerCase()) {
      closeRenameDialog();
      return;
    }
    if (existingSaveNames.has(nextZip.toLowerCase())) {
      setRenameError(t('saves_manager_rename_exists', nextZip));
      return;
    }
    setRenameSubmitting(true);
    setRenameError('');
    try {
      const j = await api<{ ok?: boolean; error?: string; name?: string }>(
        `/api/saves/${encodeURIComponent(oldName)}/rename`,
        {
          method: 'POST',
          body: JSON.stringify({ new_name: renameNewName.trim() }),
        },
      );
      if (!j || j.ok === false) throw new Error(String(j?.error || 'rename_failed'));
      const finalName = String(j.name || nextZip);
      if (selectedSave === oldName) setSelectedSave(finalName);
      closeRenameDialog();
      await reload();
      setSavesMsg(t('updated_successfully'), false);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const text = localizeSaveRenameError(raw, t, nextZip);
      setRenameError(text);
      setSavesMsg(t('saves_manager_rename_failed', text), true);
    } finally {
      setRenameSubmitting(false);
    }
  }, [
    closeRenameDialog,
    existingSaveNames,
    reload,
    renameNewName,
    renameOldName,
    selectedSave,
    setSavesMsg,
    t,
  ]);

  const remove = useCallback(
    async (name: string) => {
      modals.openConfirmModal({
        title: t('saves_manager_delete'),
        children: t('saves_manager_delete_confirm', name),
        labels: { confirm: t('saves_manager_delete'), cancel: t('cancel') },
        confirmProps: { className: 'btn btn--danger' },
        onConfirm: async () => {
          await api(`/api/saves/${encodeURIComponent(name)}`, { method: 'DELETE' });
          await reload();
          setSavesMsg(t('updated_successfully'), false);
        },
      });
    },
    [reload, setSavesMsg, t],
  );

  const duplicate = useCallback(
    async (name: string) => {
      await api(`/api/saves/${encodeURIComponent(name)}/duplicate`, { method: 'POST' });
      await reload();
      setSavesMsg(t('updated_successfully'), false);
    },
    [reload, setSavesMsg, t],
  );

  const setLaunch = useCallback(
    async (name: string) => {
      await api('/api/saves/set-launch', { method: 'POST', body: JSON.stringify({ name }) });
      await qc.invalidateQueries({ queryKey: ['players'] });
      setSavesMsg(t('saves_manager_launch_set', name), false);
    },
    [qc, setSavesMsg, t],
  );

  const createSaveDialog = useCreateSave(instanceId, serverBusy, reload, setSavesMsg, t);

  const openQuickSaveDialog = useCallback(() => {
    if (serverBusy) {
      setSavesMsg(t('server_running_mutate_blocked'), true);
      return;
    }
    setQuickSaveFileName('');
    setQuickSaveNameError('');
    const seed = Number.parseInt(randomMapSeed(), 10);
    setQuickSaveSeed(seed);
    setQuickSaveAutoHint(buildUniqueQuickSaveName(existingSaveNames, t, seed));
    setQuickSaveDialogOpen(true);
  }, [existingSaveNames, serverBusy, setSavesMsg, t]);

  const closeQuickSaveDialog = useCallback(() => {
    if (quickCreating) return;
    setQuickSaveDialogOpen(false);
    setQuickSaveFileName('');
    setQuickSaveNameError('');
    setQuickSaveAutoHint('');
    setQuickSaveSeed(null);
  }, [quickCreating]);

  const submitQuickSave = useCallback(async () => {
    if (quickCreating) return;
    const seed = quickSaveSeed ?? Number.parseInt(randomMapSeed(), 10);
    const trimmed = String(quickSaveFileName || '').trim();
    let name: string;
    if (!trimmed) {
      name = buildUniqueQuickSaveName(existingSaveNames, t, seed);
    } else {
      const zip = normalizeSaveZipName(trimmed);
      if (!zip) {
        setQuickSaveNameError(t('saves_manager_rename_invalid'));
        return;
      }
      if (existingSaveNames.has(zip.toLowerCase())) {
        setQuickSaveNameError(t('saves_manager_rename_exists', saveDisplayLabel(zip)));
        return;
      }
      name = saveDisplayLabel(zip);
    }
    setQuickCreating(true);
    setQuickSaveNameError('');
    try {
      const r = await api<{ ok?: boolean; error?: string; name?: string }>('/api/server/create-save', {
        method: 'POST',
        body: JSON.stringify({ name, mode: 'default', seed }),
      });
      if (r?.ok === false) throw new Error(String(r.error || 'create_save_failed'));
      const finalName = String(r.name || `${name}.zip`);
      setQuickSaveDialogOpen(false);
      setQuickSaveFileName('');
      setQuickSaveAutoHint('');
      setQuickSaveSeed(null);
      setSelectedSave(finalName);
      await reload();
      setSavesMsg(t('create_save_quick_done', saveDisplayLabel(finalName)), false);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setQuickSaveNameError(localizeCreateSaveError(raw, t));
    } finally {
      setQuickCreating(false);
    }
  }, [existingSaveNames, quickCreating, quickSaveFileName, quickSaveSeed, reload, setSavesMsg, t]);

  const uploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (!list.length) return;
      for (const file of list) {
        if (!/\.zip$/i.test(String(file.name || ''))) {
          setSavesMsg(t('saves_manager_upload_invalid_archive'), true);
          continue;
        }
        const fd = new FormData();
        fd.append('file', file, file.name);
        fd.append('filename', file.name);
        try {
          await api('/api/saves/upload', { method: 'POST', body: fd });
        } catch (e) {
          const raw = e instanceof Error ? e.message : String(e);
          setSavesMsg(localizeSaveUploadError(raw, t), true);
          return;
        }
      }
      await reload();
      setSavesMsg(t('updated_successfully'), false);
    },
    [reload, setSavesMsg, t],
  );

  const handleError = useCallback(
    (e: unknown) => {
      const text = localizeSaveUploadError(e instanceof Error ? e.message : String(e), t);
      feedbackMsg(savesTitle, text, true, false, t);
    },
    [savesTitle, t],
  );

  const noSaves = rows.length === 0;

  return {
    rows,
    selectedSave,
    setSelectedSave,
    compare: compareQuery.data,
    compareLoading:
      !!selectedSave &&
      enabled &&
      (compareQuery.isPending || (compareQuery.isFetching && compareQuery.data === undefined)),
    loading: listQuery.isLoading,
    serverBusy,
    maintLocked,
    noSaves,
    formatLocalTime,
    reload,
    download,
    openRenameDialog,
    closeRenameDialog,
    submitRename,
    renameOpen,
    renameOldName,
    renameNewName,
    setRenameNewName,
    renameError,
    renameSubmitting,
    remove,
    duplicate,
    setLaunch,
    createSave: createSaveDialog.openDialog,
    openQuickSaveDialog,
    closeQuickSaveDialog,
    submitQuickSave,
    quickSaveDialogOpen,
    quickSaveFileName,
    setQuickSaveFileName,
    quickSaveNameError,
    quickSaveAutoHint,
    quickCreating,
    createSaveDialog,
    uploadFiles,
    handleError,
  };
}

export type SavesApi = ReturnType<typeof useSaves>;
