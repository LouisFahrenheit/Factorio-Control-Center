import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { openFccConfirmModal } from '../lib/fccConfirmModal';
import { api, getToken } from '../api/client';
import type { ModJobApi } from './useModJob';
import { formatModpackFactorioDisplay, formatModpackSizeBytes } from '../lib/modUtils';
import {
  localizeModpackError,
  modpackPayloadImpliesSpaceAge,
  modpackIsValidName,
  modpackSuggestName,
  modpackUserModsFromPayload,
  modpackValidateFccFile,
  modpackDataFromFile,
  readFileAsText,
  type ModpackFccData,
} from '../lib/modpackUtils';
import { feedbackMsg } from '../lib/apiFeedback';
import { parseContentDispositionFilename } from '../lib/downloadFilename';
import { invalidateSpaceAgeDependentQueries } from '../lib/spaceAgeQuery';
import type { ModpackGetResponse, ModpackListResponse, ModpackRow } from '../types/modpack';
import type { ModRow } from '../types/mods';

export type ModpackSaveModEntry = {
  name: string;
  display_name?: string;
  version: string;
  enabled: boolean;
};

function modpackSaveModEntries(rows: ModRow[]): ModpackSaveModEntry[] {
  return rows
    .map((m) => ({
      name: m.name,
      display_name: m.display_name,
      version: String(m.local_version || m.pinned_version || '?').trim() || '?',
      enabled: m.enabled !== false,
    }))
    .sort((a, b) =>
      String(a.display_name || a.name).localeCompare(String(b.display_name || b.name), undefined, {
        sensitivity: 'base',
      }),
    );
}

interface ImportState {
  file: File;
  payload: ModpackFccData;
  userMods: ModpackFccData['mods'];
  hasSettings: boolean;
  factorioLabel: string;
  existingLower: Set<string>;
}

async function downloadModpackExport(name: string, includeSettings: boolean): Promise<string> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const url =
    `/api/modpacks/${encodeURIComponent(name)}/export?include_settings=` + (includeSettings ? '1' : '0');
  const r = await fetch(url, { headers });
  if (!r.ok) {
    const text = await r.text();
    let parsed: { error?: string; detail?: string } | null = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      /* ignore */
    }
    const err = String(parsed?.error || parsed?.detail || text || r.status);
    throw new Error(err);
  }
  let outName = `${name}.fcc`;
  const cd = r.headers.get('Content-Disposition') || '';
  outName = parseContentDispositionFilename(cd, outName);
  const blob = await r.blob();
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = outName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(blobUrl);
  return outName;
}

export function useModpacks(
  enabled: boolean,
  serverBusy: boolean,
  gameVersion: string,
  userMods: ModRow[],
  removeOldZips: boolean,
  modJob: ModJobApi,
  t: (key: string, ...args: (string | number)[]) => string,
) {
  const qc = useQueryClient();
  const modsCount = userMods.length;
  const [selected, setSelected] = useState('');
  const modpacksTitle = t('modpack_tab_modpacks');

  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState('');
  const [saveDesc, setSaveDesc] = useState('');
  const [saveIncludeSettings, setSaveIncludeSettings] = useState(true);
  const [saveIncludeDisabled, setSaveIncludeDisabled] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saveSubmitting, setSaveSubmitting] = useState(false);

  const saveMods = useMemo(
    () =>
      modpackSaveModEntries(
        saveIncludeDisabled ? userMods : userMods.filter((m) => m.enabled !== false),
      ),
    [userMods, saveIncludeDisabled],
  );
  const saveModsCount = saveMods.length;

  const [importOpen, setImportOpen] = useState(false);
  const [importState, setImportState] = useState<ImportState | null>(null);
  const [importTargetName, setImportTargetName] = useState('');
  const [importApplySettings, setImportApplySettings] = useState(false);
  const [importError, setImportError] = useState('');
  const [importSubmitting, setImportSubmitting] = useState(false);

  const [exportOpen, setExportOpen] = useState(false);
  const [exportName, setExportName] = useState('');
  const [exportHasSettings, setExportHasSettings] = useState(false);
  const [exportIncludeSettings, setExportIncludeSettings] = useState(false);

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameOldName, setRenameOldName] = useState('');
  const [renameNewName, setRenameNewName] = useState('');
  const [renameError, setRenameError] = useState('');
  const [renameSubmitting, setRenameSubmitting] = useState(false);

  const [activateOpen, setActivateOpen] = useState(false);
  const [activateName, setActivateName] = useState('');
  const [activateModCount, setActivateModCount] = useState('?');
  const [activateBackup, setActivateBackup] = useState(true);
  const [activateSubmitting, setActivateSubmitting] = useState(false);

  const listQuery = useQuery({
    queryKey: ['modpacks', 'list'],
    queryFn: async () => {
      const j = await api<ModpackListResponse>('/api/modpacks');
      if (j?.ok === false) throw new Error(String(j.error || 'list_failed'));
      return j;
    },
    enabled,
  });

  const rows = useMemo(() => {
    const list = Array.isArray(listQuery.data?.modpacks) ? listQuery.data!.modpacks!.slice() : [];
    list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    return list;
  }, [listQuery.data?.modpacks]);

  const activeName = String(listQuery.data?.active || '').trim();
  const activateUseSymlinks = listQuery.data?.activate_use_symlinks !== false;
  const existingLower = useMemo(() => new Set(rows.map((r) => String(r.name || '').toLowerCase())), [rows]);
  const saveFactorioLabel = formatModpackFactorioDisplay(gameVersion, false) || '—';

  useEffect(() => {
    if (!rows.length) {
      setSelected('');
      return;
    }
    if (!rows.some((x) => x.name === selected)) {
      setSelected(rows[0]?.name || '');
    }
  }, [rows, selected]);

  const detailsQuery = useQuery({
    queryKey: ['modpacks', 'details', selected],
    queryFn: async () => {
      const j = await api<ModpackGetResponse>(`/api/modpacks/${encodeURIComponent(selected)}`);
      if (j?.ok === false) throw new Error(String(j.error || 'not_found'));
      return j.modpack ?? null;
    },
    enabled: enabled && !!selected,
  });

  const setModpackMsg = useCallback(
    (text: string, isErr = false) => {
      feedbackMsg(modpacksTitle, text, isErr, false, t);
    },
    [modpacksTitle],
  );

  const reload = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['modpacks'] });
    await qc.invalidateQueries({ queryKey: ['mods'] });
    await invalidateSpaceAgeDependentQueries(qc);
  }, [qc]);

  const openSaveDialog = useCallback(() => {
    if (modsCount <= 0) {
      setModpackMsg(t('modpack_no_mods_in_folder'), true);
      return;
    }
    setSaveName(modpackSuggestName('modpack', existingLower));
    setSaveDesc('');
    setSaveIncludeSettings(true);
    setSaveIncludeDisabled(false);
    setSaveError('');
    setSaveOpen(true);
  }, [existingLower, modsCount, setModpackMsg, t]);

  const closeSaveDialog = useCallback(() => {
    setSaveOpen(false);
    setSaveError('');
    setSaveSubmitting(false);
  }, []);

  const submitSave = useCallback(async () => {
    if (saveModsCount <= 0) {
      setSaveError(t('modpack_no_mods_in_folder'));
      return;
    }
    const name = saveName.trim();
    if (!name) {
      setSaveError(t('modpack_name_empty'));
      return;
    }
    if (!modpackIsValidName(name)) {
      setSaveError(t('modpack_name_invalid'));
      return;
    }
    if (existingLower.has(name.toLowerCase())) {
      setSaveError(t('modpack_name_exists'));
      return;
    }
    setSaveSubmitting(true);
    setSaveError('');
    try {
      setModpackMsg(t('mod_job_phase_preparing'), false);
      const j = await api<{ ok?: boolean; error?: string; name?: string }>('/api/modpacks', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description: saveDesc.trim(),
          include_settings: saveIncludeSettings,
          include_disabled: saveIncludeDisabled,
        }),
      });
      if (!j || j.ok === false) throw new Error(String(j?.error || 'save_failed'));
      const finalName = String(j.name || name);
      setSelected(finalName);
      closeSaveDialog();
      await reload();
      setModpackMsg(t('modpack_save_done', finalName), false);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const text = localizeModpackError(raw, t);
      setSaveError(text);
      setModpackMsg(text, true);
    } finally {
      setSaveSubmitting(false);
    }
  }, [
    closeSaveDialog,
    existingLower,
    reload,
    saveDesc,
    saveIncludeDisabled,
    saveIncludeSettings,
    saveModsCount,
    saveName,
    setModpackMsg,
    t,
  ]);

  const closeImportDialog = useCallback(() => {
    setImportOpen(false);
    setImportState(null);
    setImportError('');
    setImportSubmitting(false);
  }, []);

  const handleImportFile = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length) return;
      const f = fileList[0];
      let parsed: unknown;
      try {
        const text = await readFileAsText(f);
        parsed = JSON.parse(text);
      } catch (e) {
        setModpackMsg(
          t('modpack_import_invalid_format', e instanceof Error ? e.message : String(e)),
          true,
        );
        return;
      }
      const v = modpackValidateFccFile(parsed);
      if (!v.ok) {
        setModpackMsg(
          t(v.reason === 'wrong kind' ? 'fcc_import_wrong_kind_map_preset' : 'modpack_import_invalid_format', v.reason || ''),
          true,
        );
        return;
      }
      if (v.tooNew) {
        setModpackMsg(t('modpack_import_format_too_new', v.tooNew), true);
        return;
      }
      const payload = modpackDataFromFile(parsed);
      if (!payload) {
        setModpackMsg(t('modpack_import_invalid_format', ''), true);
        return;
      }
      const userMods = modpackUserModsFromPayload(payload);
      if (!userMods.length) {
        setModpackMsg(t('modpack_import_no_mods'), true);
        return;
      }
      const hasSettings = typeof payload.mod_settings_b64 === 'string' && payload.mod_settings_b64.length > 0;
      const factorioLabel =
        formatModpackFactorioDisplay(payload.factorio_version, modpackPayloadImpliesSpaceAge(payload)) || '—';
      const nameInFile = String(payload.name || '').trim();
      setImportState({
        file: f,
        payload,
        userMods,
        hasSettings,
        factorioLabel,
        existingLower: new Set(existingLower),
      });
      setImportTargetName(nameInFile || modpackSuggestName('imported', existingLower));
      setImportApplySettings(hasSettings);
      setImportError('');
      setImportOpen(true);
    },
    [existingLower, setModpackMsg, t],
  );

  const submitImport = useCallback(async () => {
    const st = importState;
    if (!st) return;
    const name = importTargetName.trim();
    if (!name) {
      setImportError(t('modpack_name_empty'));
      return;
    }
    if (!modpackIsValidName(name)) {
      setImportError(t('modpack_name_invalid'));
      return;
    }
    if (st.existingLower.has(name.toLowerCase())) {
      setImportError(t('modpack_name_exists'));
      return;
    }
    const applySettings = importApplySettings && st.hasSettings;
    const fd = new FormData();
    fd.append('file', st.file, st.file.name || 'modpack.fcc');
    fd.append('name', name);
    if (applySettings) fd.append('apply_settings', '1');

    setImportSubmitting(true);
    setImportError('');
    closeImportDialog();
    modJob.openPreparing();
    try {
      const h: Record<string, string> = {};
      const token = getToken();
      if (token) h.Authorization = `Bearer ${token}`;
      const r = await fetch('/api/modpacks/import-upload', { method: 'POST', headers: h, body: fd });
      const text = await r.text();
      let j: { ok?: boolean; error?: string; detail?: string; name?: string; user_mods_count?: number } | null = null;
      try {
        j = JSON.parse(text);
      } catch {
        /* ignore */
      }
      if (!r.ok || !j?.ok) {
        const err = String(j?.error || j?.detail || text || r.status);
        throw new Error(err);
      }
      const finalName = String(j.name || name);
      const modsToDownload = Number(j.user_mods_count || st.userMods?.length || 0);
      setSelected(finalName);
      await reload();

      if (modsToDownload <= 0) {
        modJob.close();
        setModpackMsg(t('modpack_save_done', finalName), false);
        return;
      }

      const plan = await api<{ dependencies?: string[] }>(
        `/api/modpacks/${encodeURIComponent(finalName)}/import-download-plan`,
      );
      const extraDeps = Array.isArray(plan?.dependencies) ? plan.dependencies : [];
      if (extraDeps.length) {
        const appended = await api<{ ok?: boolean; error?: string }>(
          `/api/modpacks/${encodeURIComponent(finalName)}/import-download-append-deps`,
          { method: 'POST', body: JSON.stringify({}) },
        );
        if (!appended?.ok) throw new Error(String(appended?.error || 'modpack_import_deps_append_failed'));
      }
      await modJob.start(`/api/modpacks/${encodeURIComponent(finalName)}/import-download`, {
        remove_old_zips: removeOldZips,
      });
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const text = localizeModpackError(raw, t);
      modJob.fail(text);
      setModpackMsg(text, true);
    } finally {
      setImportSubmitting(false);
    }
  }, [
    closeImportDialog,
    importApplySettings,
    importState,
    importTargetName,
    modJob,
    reload,
    removeOldZips,
    setModpackMsg,
    t,
  ]);

  const openExportDialog = useCallback(
    (name: string) => {
      const row = rows.find((x) => x.name === name);
      const hasSettings = !!row?.has_mod_settings;
      setExportName(name);
      setExportHasSettings(hasSettings);
      setExportIncludeSettings(hasSettings);
      setExportOpen(true);
    },
    [rows],
  );

  const closeExportDialog = useCallback(() => {
    setExportOpen(false);
    setExportName('');
  }, []);

  const submitExport = useCallback(async () => {
    const name = exportName;
    if (!name) return;
    closeExportDialog();
    try {
      const filename = await downloadModpackExport(name, exportIncludeSettings);
      setModpackMsg(t('modpack_export_done_msg', filename), false);
    } catch (e) {
      setModpackMsg(localizeModpackError(e instanceof Error ? e.message : String(e), t), true);
    }
  }, [closeExportDialog, exportIncludeSettings, exportName, setModpackMsg, t]);

  const openActivateDialog = useCallback(
    (name: string) => {
      if (serverBusy) {
        setModpackMsg(t('server_running_mutate_blocked'), true);
        return;
      }
      const trimmed = String(name || '').trim();
      if (!trimmed) return;
      if (trimmed === activeName) {
        setModpackMsg(t('modpack_activate_already_active'), true);
        return;
      }
      setSelected(trimmed);
      setActivateName(trimmed);
      const row = rows.find((r) => r.name === trimmed);
      setActivateModCount(row?.mods_count != null ? String(row.mods_count) : '?');
      setActivateBackup(modsCount > 0);
      setActivateOpen(true);
    },
    [activeName, modsCount, rows, serverBusy, setModpackMsg, t],
  );

  const closeActivateDialog = useCallback(() => {
    setActivateOpen(false);
    setActivateName('');
    setActivateSubmitting(false);
  }, []);

  const submitActivate = useCallback(async () => {
    const name = activateName.trim();
    if (!name || activateSubmitting) return;
    if (serverBusy) {
      setModpackMsg(t('server_running_mutate_blocked'), true);
      return;
    }
    if (name === activeName) {
      setModpackMsg(t('modpack_activate_already_active'), true);
      closeActivateDialog();
      return;
    }
    setActivateSubmitting(true);
    setModpackMsg(t('mod_job_phase_install'), false);
    try {
      const j = await api<{ ok?: boolean; error?: string; backup?: string }>(
        `/api/modpacks/${encodeURIComponent(name)}/activate`,
        {
          method: 'POST',
          body: JSON.stringify({ create_backup: activateBackup && modsCount > 0 }),
        },
      );
      if (!j || j.ok === false) throw new Error((j && j.error) || 'activate_failed');
      closeActivateDialog();
      const backup = String(j.backup || '').trim();
      if (backup) {
        setModpackMsg(t('modpack_activate_done_with_backup', name, backup), false);
      } else {
        setModpackMsg(t('modpack_activate_done', name), false);
      }
      await reload();
      await qc.invalidateQueries({ queryKey: ['mods'] });
    } catch (e) {
      setModpackMsg(localizeModpackError(e instanceof Error ? e.message : String(e), t), true);
    } finally {
      setActivateSubmitting(false);
    }
  }, [
    activateBackup,
    activateName,
    activateSubmitting,
    activeName,
    modsCount,
    closeActivateDialog,
    qc,
    reload,
    serverBusy,
    setModpackMsg,
    t,
  ]);

  const openRenameDialog = useCallback((name: string) => {
    const trimmed = String(name || '').trim();
    if (!trimmed) return;
    setRenameOldName(trimmed);
    setRenameNewName(trimmed);
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
    const nextName = renameNewName.trim();
    if (!oldName) {
      closeRenameDialog();
      return;
    }
    if (!nextName) {
      setRenameError(t('modpack_name_empty'));
      return;
    }
    if (!modpackIsValidName(nextName)) {
      setRenameError(t('modpack_name_invalid'));
      return;
    }
    if (nextName.toLowerCase() === oldName.toLowerCase()) {
      closeRenameDialog();
      return;
    }
    if (existingLower.has(nextName.toLowerCase())) {
      setRenameError(t('modpack_name_exists'));
      return;
    }
    setRenameSubmitting(true);
    setRenameError('');
    try {
      const j = await api<{ ok?: boolean; error?: string; name?: string }>(
        `/api/modpacks/${encodeURIComponent(oldName)}/rename`,
        {
          method: 'POST',
          body: JSON.stringify({ new: nextName }),
        },
      );
      if (!j || j.ok === false) throw new Error(String(j?.error || 'rename_failed'));
      const finalName = String(j.name || nextName);
      if (selected === oldName) setSelected(finalName);
      closeRenameDialog();
      await reload();
      setModpackMsg(t('updated_successfully'), false);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      const text = localizeModpackError(raw, t);
      setRenameError(text);
      setModpackMsg(t('modpack_rename_failed', text), true);
    } finally {
      setRenameSubmitting(false);
    }
  }, [
    closeRenameDialog,
    existingLower,
    reload,
    renameNewName,
    renameOldName,
    selected,
    setModpackMsg,
    t,
  ]);

  const remove = useCallback(
    async (name: string) => {
      openFccConfirmModal({
        title: t('modpack_delete_confirm_title'),
        message: t('modpack_delete_confirm_msg', name),
        confirmLabel: t('modpack_delete_btn'),
        cancelLabel: t('cancel'),
        variant: 'danger',
        onConfirm: async () => {
          try {
            const j = await api<{ ok?: boolean; error?: string }>(
              `/api/modpacks/${encodeURIComponent(name)}`,
              { method: 'DELETE' },
            );
            if (j?.ok === false) throw new Error(String(j.error || 'delete_failed'));
            setModpackMsg(t('updated_successfully'), false);
            await reload();
          } catch (e) {
            const raw = e instanceof Error ? e.message : String(e);
            setModpackMsg(t('modpack_delete_failed', localizeModpackError(raw, t)), true);
          }
        },
      });
    },
    [reload, setModpackMsg, t],
  );

  const reset = useCallback(async () => {
    openFccConfirmModal({
      title: t('reset_btn'),
      message: t('modpack_reset_confirm_msg'),
      confirmLabel: t('reset_btn'),
      cancelLabel: t('cancel'),
      variant: 'danger',
      onConfirm: async () => {
        await api('/api/modpacks/reset', { method: 'POST' });
        setModpackMsg(t('updated_successfully'), false);
        await reload();
      },
    });
  }, [reload, setModpackMsg, t]);

  const handleError = useCallback(
    (e: unknown) => {
      const text = e instanceof Error ? e.message : String(e);
      setModpackMsg(text, true);
    },
    [setModpackMsg],
  );

  const formatFactorio = useCallback((p: ModpackRow) => {
    let fv = String(p.factorio_version_label || '').trim();
    if (!fv) fv = formatModpackFactorioDisplay(p.factorio_version, p.requires_space_age) || '—';
    return fv;
  }, []);

  return {
    rows,
    activeName,
    activateUseSymlinks,
    selected,
    setSelected,
    details: detailsQuery.data,
    detailsLoading:
      !!selected &&
      enabled &&
      (detailsQuery.isPending || (detailsQuery.isFetching && detailsQuery.data === undefined)),
    loading: listQuery.isLoading,
    serverBusy,
    reload,
    openActivateDialog,
    closeActivateDialog,
    submitActivate,
    activateOpen,
    activateName,
    activateModCount,
    activateBackup,
    setActivateBackup,
    activateSubmitting,
    installedUserModsCount: modsCount,
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
    reset,
    saveCurrent: openSaveDialog,
    exportPack: openExportDialog,
    importPack: handleImportFile,
    handleError,
    formatFactorio,
    formatSize: formatModpackSizeBytes,
    saveOpen,
    saveName,
    setSaveName,
    saveDesc,
    setSaveDesc,
    saveIncludeSettings,
    setSaveIncludeSettings,
    saveIncludeDisabled,
    setSaveIncludeDisabled,
    saveError,
    saveSubmitting,
    saveModsCount,
    saveMods,
    canSaveCurrent: modsCount > 0,
    saveFactorioLabel,
    closeSaveDialog,
    submitSave,
    importOpen,
    importState,
    importTargetName,
    setImportTargetName,
    importApplySettings,
    setImportApplySettings,
    importError,
    importSubmitting,
    closeImportDialog,
    submitImport,
    exportOpen,
    exportName,
    exportHasSettings,
    exportIncludeSettings,
    setExportIncludeSettings,
    closeExportDialog,
    submitExport,
  };
}

export type ModpacksApi = ReturnType<typeof useModpacks>;
