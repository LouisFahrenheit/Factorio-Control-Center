import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { modals } from '@mantine/modals';
import { api, getToken } from '../api/client';
import type { ModJobApi } from './useModJob';
import {
  filterModRows,
  maxInstalledModVersion,
  modsDefaultAscForColumn,
  portalVersionNewer,
  sortModRows,
} from '../lib/modUtils';
import { localizeModError, modConfirm, modsNeedingGameLinesFromPlan, normalizeFactorioDisplayVersion } from '../lib/modErrorUtils';
import { openModGameVersionConfirm } from '../lib/modGameVersionConfirm';
import { modDepsConfirm, modDepsUploadChoice } from '../lib/modDepsConfirm';
import { openModUpdateAllFlow } from '../lib/modUpdateAllFlow';
import { installConflictsFromPlan, mergeInstallConflicts } from '../lib/modConflictUtils';
import { openFccConfirmModal } from '../lib/fccConfirmModal';
import { feedbackMsg } from '../lib/apiFeedback';
import { modsArchiveDownloadName, parseContentDispositionFilename } from '../lib/downloadFilename';
import {
  invalidateSpaceAgeDependentQueries,
  modAffectsSpaceAgeMode,
} from '../lib/spaceAgeQuery';
import { resolveStatusKind, type PanelStatus } from '../types/panel';
import type { ModRow, ModSortColumn } from '../types/mods';
import type { ModInstallConflictInfo } from '../types/modConflict';
import type {
  ModCheckResultEntry,
  ModCheckStatus,
  ModInstallPlan,
  ModSavePreview,
  ModSavePreviewMod,
  ModUploadResponse,
} from '../types/modJob';

interface ModsResponse {
  ok?: boolean;
  error?: string;
  mods?: ModRow[];
  remove_old_zips?: boolean;
  active_modpack?: string;
  portal_username?: string;
}

interface FromSaveState {
  filename: string;
  factorio: string;
  mods: ModSavePreviewMod[];
  missingCount: number;
  error: string;
  preparing: boolean;
}

async function downloadBlob(url: string, fallbackName: string): Promise<string> {
  const headers: Record<string, string> = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(url, { headers });
  if (!r.ok) throw new Error(await r.text());
  let outName = fallbackName;
  const cd = r.headers.get('Content-Disposition') || '';
  outName = parseContentDispositionFilename(cd, fallbackName);
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

function countAvailableModUpdates(rows: ModRow[], results: Record<string, ModCheckResultEntry>): number {
  let count = 0;
  for (const m of rows) {
    if (!m || m.is_builtin) continue;
    const name = String(m.name || '');
    if (!name) continue;
    const r = results[name];
    if (!r?.ok || !r.version) continue;
    if (portalVersionNewer(String(r.version || ''), maxInstalledModVersion(m))) count += 1;
  }
  return count;
}

function modListHasPortalMods(rows: ModRow[]): boolean {
  return rows.some((m) => m && !m.is_builtin);
}

/** Automatic portal check at most once per 24h per instance (localStorage). */
const MODS_PORTAL_CHECK_PERIOD_MS = 24 * 60 * 60 * 1000;
const MODS_PORTAL_CHECK_TS_PREFIX = 'fcc_mods_portal_check_ts:';

function modsPortalCheckStorageKey(instanceId: string): string {
  return `${MODS_PORTAL_CHECK_TS_PREFIX}${String(instanceId || '').trim()}`;
}

function modsPortalDailyCheckDue(instanceId: string): boolean {
  const iid = String(instanceId || '').trim();
  if (!iid) return false;
  try {
    const raw = String(localStorage.getItem(modsPortalCheckStorageKey(iid)) || '').trim();
    const last = parseInt(raw, 10);
    if (!Number.isFinite(last) || last <= 0) return true;
    return Date.now() - last >= MODS_PORTAL_CHECK_PERIOD_MS;
  } catch {
    return true;
  }
}

function modsPortalDailyCheckMarkNow(instanceId: string): void {
  const iid = String(instanceId || '').trim();
  if (!iid) return;
  try {
    localStorage.setItem(modsPortalCheckStorageKey(iid), String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function useMods(
  enabled: boolean,
  status: PanelStatus | null | undefined,
  blockUpdates: boolean,
  instanceId: string,
  instanceName: string,
  t: (key: string, ...args: (string | number)[]) => string,
  modJob: ModJobApi,
) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedMod, setSelectedMod] = useState('');
  const [sortColumn, setSortColumn] = useState<ModSortColumn | ''>('');
  const [sortAsc, setSortAsc] = useState(true);
  const [removeOldZips, setRemoveOldZips] = useState(true);
  const [installInput, setInstallInput] = useState('');
  const [installBlink, setInstallBlink] = useState(false);
  const [checkResults, setCheckResults] = useState<Record<string, ModCheckResultEntry>>({});
  const [modsCheckRunning, setModsCheckRunning] = useState(false);
  const [fromSaveState, setFromSaveState] = useState<FromSaveState | null>(null);
  const checkPollRef = useRef<number | null>(null);
  const autoCheckRunningRef = useRef(false);

  const kind = resolveStatusKind(status);
  const serverProcessBusy = kind === 'running' || kind === 'starting' || kind === 'stopping';
  const serverBusy = serverProcessBusy || kind === 'maintenance';

  const query = useQuery({
    queryKey: ['mods', 'list', instanceId],
    queryFn: () => api<ModsResponse>('/api/mods'),
    enabled: enabled && !!instanceId,
  });

  const rawRows = useMemo(() => (Array.isArray(query.data?.mods) ? query.data!.mods! : []), [query.data?.mods]);
  const hasPortalMods = useMemo(() => modListHasPortalMods(rawRows), [rawRows]);
  const allNonBuiltinDisabled = useMemo(() => {
    const nonBuiltin = rawRows.filter((m) => m && !m.is_builtin);
    return nonBuiltin.length > 0 && nonBuiltin.every((m) => !m.enabled);
  }, [rawRows]);

  const displayRows = useMemo(() => {
    if (!Object.keys(checkResults).length) return rawRows;
    return rawRows.map((m) => {
      const r = checkResults[m.name];
      if (!r) return m;
      let next: string;
      if (r.ok && r.version) next = String(r.version);
      else if (r.error === 'no_release') next = '—';
      else next = '-';
      return m.portal_version !== next ? { ...m, portal_version: next } : m;
    });
  }, [checkResults, rawRows]);

  const listOrder = useMemo(() => rawRows.map((x) => x.name), [rawRows]);
  const activeModpack = String(query.data?.active_modpack || '').trim();
  const portalUsername = String(query.data?.portal_username || '').trim();

  useEffect(() => {
    if (typeof query.data?.remove_old_zips === 'boolean') {
      setRemoveOldZips(query.data.remove_old_zips);
    }
  }, [query.data?.remove_old_zips]);

  useEffect(() => {
    if (!rawRows.length) {
      setSelectedMod('');
      return;
    }
    if (!rawRows.some((x) => x.name === selectedMod)) {
      setSelectedMod(rawRows[0]?.name || '');
    }
  }, [rawRows, selectedMod]);

  useEffect(() => {
    return () => {
      if (checkPollRef.current) window.clearInterval(checkPollRef.current);
    };
  }, []);

  const rows = useMemo(() => {
    const sorted = sortModRows(displayRows, listOrder, sortColumn, sortAsc);
    return filterModRows(sorted, search);
  }, [displayRows, listOrder, sortColumn, sortAsc, search]);

  const setModsMsg = useCallback(
    (text: string, isErr = false) => {
      feedbackMsg(t('mods_btn'), text, isErr, false, t);
    },
    [t],
  );

  const reload = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['mods'] });
    await qc.refetchQueries({ queryKey: ['mods', 'list', instanceId] });
  }, [qc, instanceId]);

  const toggleSort = useCallback(
    (column: ModSortColumn) => {
      const defaultAsc = modsDefaultAscForColumn(column);
      if (sortColumn !== column) {
        setSortColumn(column);
        setSortAsc(defaultAsc);
      } else if (sortAsc === defaultAsc) {
        setSortAsc(!defaultAsc);
      } else {
        setSortColumn('');
        setSortAsc(true);
      }
    },
    [sortColumn, sortAsc],
  );

  const confirmPortalGameVersion = useCallback(
    async (modNames: string[]): Promise<{ ok: boolean; allow_requires_game_update: boolean }> => {
      const mods = Array.from(new Set(modNames.map((x) => String(x || '').trim()).filter(Boolean)));
      if (!mods.length) return { ok: true, allow_requires_game_update: false };
      try {
        const batch = await api<ModInstallPlan>('/api/mods/install-plan-batch', {
          method: 'POST',
          body: JSON.stringify({ mods }),
        });
        if (!batch || batch.ok === false) return { ok: true, allow_requires_game_update: false };
        if (!batch.requires_game_update_confirmation) return { ok: true, allow_requires_game_update: false };
        const flow = await openModGameVersionConfirm(t, {
          title: t('mod_install_requires_newer_game_title'),
          gameVersion: String(batch.game_version || '').trim() || '—',
          modLines: modsNeedingGameLinesFromPlan(batch),
        });
        if (!flow.ok) return { ok: false, allow_requires_game_update: false };
        return { ok: true, allow_requires_game_update: flow.allow_requires_game_update };
      } catch {
        return { ok: true, allow_requires_game_update: false };
      }
    },
    [t],
  );

  const pollModsCheck = useCallback(async () => {
    try {
      const st = await api<ModCheckStatus>('/api/mods/check-updates');
      const running = !!st?.running;
      setModsCheckRunning(running);
      if (st?.results) setCheckResults(st.results);
      const total = Number(st?.total || 0);
      if (running) {
        return;
      }
      if (checkPollRef.current) {
        window.clearInterval(checkPollRef.current);
        checkPollRef.current = null;
      }
      const err = st?.error ? String(st.error) : '';
      if (err) {
        setModsMsg(err, true);
      } else if (total > 0) {
        const failed = Number(st?.failed || 0);
        const updates = countAvailableModUpdates(rawRows, st?.results || {});
        if (failed > 0) {
          setModsMsg(t('mod_list_check_result_summary', String(total), String(updates), String(failed)), true);
        } else if (updates > 0) {
          setModsMsg(t('mod_list_check_result_updates_only', String(updates)), false);
        }
      }
    } catch (e) {
      setModsCheckRunning(false);
      if (checkPollRef.current) {
        window.clearInterval(checkPollRef.current);
        checkPollRef.current = null;
      }
      setModsMsg(e instanceof Error ? e.message : String(e), true);
    }
  }, [rawRows, setModsMsg, t]);

  const startModsCheckPolling = useCallback(() => {
    if (checkPollRef.current) window.clearInterval(checkPollRef.current);
    checkPollRef.current = window.setInterval(() => {
      void pollModsCheck();
    }, 500);
    void pollModsCheck();
  }, [pollModsCheck]);

  const checkUpdates = useCallback(
    async (manual = true) => {
      if (!manual && blockUpdates) return;
      if (!modListHasPortalMods(rawRows)) {
        if (!manual) modsPortalDailyCheckMarkNow(instanceId);
        return;
      }
      if (modsCheckRunning) {
        setModsMsg(t('about_factorio_update_checking'), false);
        startModsCheckPolling();
        return;
      }
      setModsMsg(t('about_factorio_update_checking'), false);
      if (rawRows.length) {
        setCheckResults((prev) => {
          const out = { ...prev };
          for (const m of rawRows) {
            if (!m.is_builtin) out[m.name] = { ok: true, version: '…' };
          }
          return out;
        });
      }
      try {
        const j = await api<{ ok?: boolean; error?: string; started?: boolean; reason?: string }>(
          '/api/mods/check-updates',
          { method: 'POST', body: JSON.stringify({ ignoreBlockUpdates: manual }) },
        );
        if (!j?.ok) throw new Error(String(j?.error || j?.reason || 'check failed'));
        const running = j.started === false && j.reason === 'already_running' ? true : !!j.started;
        setModsCheckRunning(running);
        if (running) {
          startModsCheckPolling();
        }
        if (
          !manual &&
          j?.ok &&
          (running || j.reason === 'no_portal_mods' || j.reason === 'updates_blocked_by_instance_setting')
        ) {
          modsPortalDailyCheckMarkNow(instanceId);
        }
      } catch (e) {
        setModsCheckRunning(false);
        setModsMsg(localizeModError(e instanceof Error ? e.message : String(e), undefined, t), true);
      }
    },
    [blockUpdates, instanceId, modsCheckRunning, rawRows, setModsMsg, startModsCheckPolling, t],
  );

  useEffect(() => {
    const iid = String(instanceId || '').trim();
    if (!enabled || !iid || blockUpdates) return;
    if (query.isLoading || query.isFetching) return;
    if (!modListHasPortalMods(rawRows)) return;
    if (!modsPortalDailyCheckDue(iid)) return;
    if (autoCheckRunningRef.current) return;
    autoCheckRunningRef.current = true;
    void checkUpdates(false).finally(() => {
      autoCheckRunningRef.current = false;
    });
  }, [
    enabled,
    instanceId,
    blockUpdates,
    query.isLoading,
    query.isFetching,
    rawRows,
    checkUpdates,
  ]);

  const installFromUrl = useCallback(async () => {
    if (serverBusy) {
      setModsMsg(t('server_running_mutate_blocked'), true);
      return;
    }
    const mod = installInput.trim();
    if (!mod) {
      setInstallBlink(false);
      requestAnimationFrame(() => setInstallBlink(true));
      window.setTimeout(() => setInstallBlink(false), 1200);
      return;
    }
    try {
      const plan = await api<ModInstallPlan>('/api/mods/install-plan', {
        method: 'POST',
        body: JSON.stringify({ mod }),
      });
      if (plan?.ok === false) {
        const code = String(plan.error || 'install_plan_failed');
        if (code === 'requires_space_age') {
          setModsMsg(t('mod_requires_space_age', String(plan.mod || '').trim() || '?'), true);
          return;
        }
        throw new Error(code);
      }
      const deps = Array.isArray(plan?.dependencies) ? plan.dependencies : [];
      const conflicts = installConflictsFromPlan(plan);
      const recommended = Array.isArray(plan?.recommended) ? plan.recommended : [];
      let checkedRecommended: string[] = [];
      if (deps.length || conflicts.length || recommended.length) {
        const res = await modDepsConfirm(deps, 'install', t, { conflicts, recommended });
        if (!res.confirmed) return;
        checkedRecommended = res.recommendedToInstall || [];
      }
      let allowRg = false;
      if (plan?.requires_game_update_confirmation) {
        const flow = await openModGameVersionConfirm(t, {
          title: t('mod_install_requires_newer_game_title'),
          gameVersion: String(plan.game_version || '').trim() || '—',
          modLines: modsNeedingGameLinesFromPlan(plan),
        });
        if (!flow.ok) return;
        allowRg = flow.allow_requires_game_update;
      }
      setInstallInput('');
      if (checkedRecommended.length > 0) {
        await modJob.start('/api/mods/job/start-install-save', {
          mods: [mod, ...checkedRecommended],
          remove_old_zips: removeOldZips,
          allow_requires_game_update: allowRg,
        });
      } else {
        await modJob.start('/api/mods/job/start-install', {
          mod,
          remove_old_zips: removeOldZips,
          allow_requires_game_update: allowRg,
        });
      }
    } catch (e) {
      setModsMsg(localizeModError(e instanceof Error ? e.message : String(e), undefined, t), true);
    }
  }, [installInput, modJob, removeOldZips, serverBusy, setModsMsg, t]);

  const uploadArchives = useCallback(
    async (fileList: FileList | null) => {
      if (!fileList?.length) {
        setModsMsg(t('mod_list_upload_select_file'), true);
        return;
      }
      const files = Array.from(fileList);
      const prepared: { f: File; isSettings: boolean }[] = [];
      const skipped: string[] = [];
      for (const f of files) {
        const lowerName = String(f.name || '').toLowerCase();
        const isSettings = lowerName === 'mod-settings.dat' || lowerName.endsWith('.dat');
        const isZip = lowerName.endsWith('.zip');
        if (!isSettings && !isZip) {
          skipped.push(f.name || '—');
          continue;
        }
        prepared.push({ f, isSettings });
      }
      if (!prepared.length) {
        setModsMsg(t('mod_list_upload_unknown_kind'), true);
        return;
      }

      async function sendOne(entry: { f: File; isSettings: boolean }, confirmReplace: boolean) {
        const fd = new FormData();
        fd.append('file', entry.f, entry.f.name || (entry.isSettings ? 'mod-settings.dat' : 'mod.zip'));
        if (confirmReplace) fd.append('confirm_replace', '1');
        const h: Record<string, string> = {};
        const token = getToken();
        if (token) h.Authorization = `Bearer ${token}`;
        const r = await fetch('/api/mods/upload', { method: 'POST', headers: h, body: fd });
        const text = await r.text();
        let j: ModUploadResponse | null = null;
        try {
          j = JSON.parse(text) as ModUploadResponse;
        } catch {
          /* ignore */
        }
        if (!r.ok || !j?.ok) {
          const err = String(j?.error || j?.detail || text || r.status);
          const e = new Error(err) as Error & { code?: string; requiresSpaceAgeMod?: string };
          e.code = err;
          if (err === 'requires_space_age' && j?.mod_name) e.requiresSpaceAgeMod = String(j.mod_name).trim();
          throw e;
        }
        return j;
      }

      let settingsBatchReplace = false;
      let anyZipOk = false;
      const uploadedModNames = new Set<string>();
      const uploadedDeps = new Set<string>();
      const uploadedConflicts = new Map<string, ModInstallConflictInfo>();
      const failures: { name: string; msg: string }[] = [];
      const multi = prepared.length > 1;
      let lastUploadResult: ModUploadResponse | null = null;

      try {
        for (let i = 0; i < prepared.length; i++) {
          const entry = prepared[i];
          setModsMsg(
            multi
              ? t('mod_list_upload_progress', String(i + 1), String(prepared.length), entry.f.name || '')
              : t('mod_list_uploading'),
            false,
          );
          let j: ModUploadResponse;
          try {
            j = await sendOne(entry, !!(entry.isSettings && settingsBatchReplace));
          } catch (e) {
            const err = e as Error & { code?: string; requiresSpaceAgeMod?: string };
            if (err.code === 'mod_settings_exists' && entry.isSettings && !settingsBatchReplace) {
              if (!(await modConfirm(t('mod_list_upload_settings_replace_confirm'), t))) {
                return;
              }
              settingsBatchReplace = true;
              j = await sendOne(entry, true);
            } else {
              failures.push({
                name: entry.f.name || '—',
                msg: localizeModError(err.message, err.requiresSpaceAgeMod, t),
              });
              continue;
            }
          }
          lastUploadResult = j;
          if (j.kind !== 'mod_settings') {
            anyZipOk = true;
            const uploadedName = String(j.mod_name || '').trim();
            if (uploadedName) uploadedModNames.add(uploadedName);
            for (const dep of j.required_dependencies || []) {
              const d = String(dep || '').trim();
              if (d) uploadedDeps.add(d);
            }
            mergeInstallConflicts(j.install_conflicts, uploadedConflicts);
          }
        }

        if (anyZipOk) {
          await reload();
          const existingNames = new Set(rawRows.map((m) => String(m.name || '').trim()).filter(Boolean));
          const missingDeps = Array.from(uploadedDeps)
            .map((d) => String(d || '').trim())
            .filter((d) => d && !uploadedModNames.has(d) && !existingNames.has(d));
          const conflictList = Array.from(uploadedConflicts.values());
          if (missingDeps.length || conflictList.length) {
            const choice = await modDepsUploadChoice(missingDeps, t, conflictList);
            if (choice !== 'download' && choice !== 'as_is') {
              for (const name of uploadedModNames) {
                try {
                  await api('/api/mods/remove', { method: 'POST', body: JSON.stringify({ name }) });
                } catch {
                  /* ignore per-mod remove errors */
                }
              }
              await reload();
              setModsMsg(t('mod_list_upload_missing_deps_cancelled'), false);
              return;
            }
            const conflictsToDisable = conflictList.map((c) => c.name).filter(Boolean);
            if (conflictsToDisable.length) {
              await api('/api/mods/disable-conflicts', {
                method: 'POST',
                body: JSON.stringify({ names: conflictsToDisable }),
              });
              await reload();
            }
            if (choice === 'download') {
              const gvOk = await confirmPortalGameVersion(missingDeps);
              if (!gvOk.ok) return;
              await modJob.start('/api/mods/job/start-install-save', {
                mods: missingDeps,
                remove_old_zips: removeOldZips,
                allow_requires_game_update: gvOk.allow_requires_game_update,
              });
            }
          }
        }

        const tail = skipped.length ? ' ' + t('mod_list_upload_skipped_warn', skipped.join(', ')) : '';
        if (failures.length) {
          const failText = failures.map((x) => x.name + ': ' + x.msg).join('; ');
          if (failures.length === prepared.length) {
            setModsMsg(failText + tail, true);
            return;
          }
          setModsMsg(
            t('mod_list_upload_batch_partial', String(prepared.length - failures.length), String(failures.length)) +
              ' ' +
              failText +
              tail,
            true,
          );
          return;
        }
        if (multi) {
          setModsMsg(t('mod_list_upload_batch_all_ok', String(prepared.length)) + tail, false);
        } else {
          const only = prepared[0];
          if (only.isSettings || lastUploadResult?.kind === 'mod_settings') {
            setModsMsg(t('mod_list_upload_settings_ok') + tail, false);
          } else {
            const disp = lastUploadResult?.name || only.f.name || '';
            setModsMsg(t('mod_list_upload_ok', disp) + tail, false);
          }
        }
      } catch (e) {
        setModsMsg(localizeModError(e instanceof Error ? e.message : String(e), undefined, t), true);
      }
    },
    [confirmPortalGameVersion, modJob, rawRows, reload, removeOldZips, setModsMsg, t],
  );

  const previewFromSave = useCallback(
    async (file: File) => {
      const fd = new FormData();
      fd.append('file', file, file.name || 'save.zip');
      try {
        setModsMsg(t('mod_list_uploading'), false);
        const h: Record<string, string> = {};
        const token = getToken();
        if (token) h.Authorization = `Bearer ${token}`;
        const lang = localStorage.getItem('fcc_lang') || '';
        if (lang) h['X-FCC-UI-Lang'] = lang;
        const r = await fetch('/api/mods/import-save/preview', { method: 'POST', headers: h, body: fd });
        const text = await r.text();
        let j: ModSavePreview | null = null;
        try {
          j = JSON.parse(text) as ModSavePreview;
        } catch {
          /* ignore */
        }
        if (!r.ok || !j?.ok) {
          const err = String(j?.error || text || r.status);
          throw new Error(err);
        }
        const mods = Array.isArray(j.mods) ? j.mods : [];
        const fvRaw = String(j.factorio_version || '').trim();
        const fvDisp = normalizeFactorioDisplayVersion(fvRaw);
        setFromSaveState({
          filename: file.name || '',
          factorio: fvDisp || fvRaw,
          mods,
          missingCount: mods.filter((m) => !m.installed).length,
          error: '',
          preparing: false,
        });
      } catch (e) {
        setModsMsg(localizeModError(e instanceof Error ? e.message : String(e), undefined, t), true);
      }
    },
    [setModsMsg, t],
  );

  const closeFromSaveDialog = useCallback(() => {
    setFromSaveState(null);
  }, []);

  const confirmFromSaveDialog = useCallback(async () => {
    const st = fromSaveState;
    if (!st) return;
    const names = st.mods
      .filter((m) => m?.name && !m.installed)
      .map((m) => String(m.name || '').trim())
      .filter(Boolean);
    if (!names.length) {
      setFromSaveState({ ...st, error: t('mods_from_save_nothing_to_download') });
      return;
    }
    setFromSaveState({ ...st, preparing: true, error: '' });
    let gvOk = { ok: true, allow_requires_game_update: false };
    try {
      gvOk = await confirmPortalGameVersion(names);
    } finally {
      setFromSaveState((prev) => (prev ? { ...prev, preparing: false } : null));
    }
    if (!gvOk.ok) return;
    closeFromSaveDialog();
    await modJob.start('/api/mods/job/start-install-save', {
      mods: names,
      remove_old_zips: removeOldZips,
      allow_requires_game_update: gvOk.allow_requires_game_update,
    });
  }, [closeFromSaveDialog, confirmPortalGameVersion, fromSaveState, modJob, removeOldZips, t]);

  const updateSelected = useCallback(
    async (name: string) => {
      if (serverBusy) {
        setModsMsg(t('server_running_mutate_blocked'), true);
        return;
      }
      if (blockUpdates) {
        setModsMsg(t('updates_blocked_by_instance_setting'), true);
        return;
      }
      if (!name) return;
      try {
        const plan = await api<ModInstallPlan>('/api/mods/install-plan', {
          method: 'POST',
          body: JSON.stringify({ mod: name }),
        });
        if (plan?.ok === false) {
          const code = String(plan.error || 'install_plan_failed');
          if (code === 'requires_space_age') {
            setModsMsg(t('mod_requires_space_age', String(plan.mod || '').trim() || '?'), true);
            return;
          }
          throw new Error(code);
        }
        const rootMod = String(plan?.mod || name).trim();
        const toInstall = Array.isArray(plan?.to_install) ? plan.to_install : [];
        const depsToInstall = toInstall.filter((x) => {
          const n = String(x?.name || '').trim();
          return n && n !== rootMod;
        });
        if (depsToInstall.length) {
          const depNames = depsToInstall
            .map((x) => String(x?.name || '').trim())
            .filter(Boolean);
          const conflicts = installConflictsFromPlan(plan);
          if (!(await modDepsConfirm(depNames, 'update', t, { conflicts })).confirmed) return;
        } else {
          const conflicts = installConflictsFromPlan(plan);
          if (conflicts.length && !(await modDepsConfirm([], 'update', t, { conflicts })).confirmed) return;
        }
        let allowRg = false;
        if (plan?.requires_game_update_confirmation) {
          const flow = await openModGameVersionConfirm(t, {
            title: t('mod_update_requires_newer_game_title'),
            gameVersion: String(plan.game_version || '').trim() || '—',
            modLines: modsNeedingGameLinesFromPlan(plan),
          });
          if (!flow.ok) return;
          allowRg = flow.allow_requires_game_update;
        }
        await modJob.start('/api/mods/job/start-update', {
          name,
          remove_old_zips: removeOldZips,
          allow_requires_game_update: allowRg,
        });
      } catch (e) {
        setModsMsg(localizeModError(e instanceof Error ? e.message : String(e), undefined, t), true);
      }
    },
    [blockUpdates, modJob, removeOldZips, serverBusy, setModsMsg, t],
  );

  const updateAll = useCallback(async () => {
    if (serverBusy) {
      setModsMsg(t('server_running_mutate_blocked'), true);
      return;
    }
    if (blockUpdates) {
      setModsMsg(t('updates_blocked_by_instance_setting'), true);
      return;
    }
    try {
      const flow = await openModUpdateAllFlow(t, () => api<ModInstallPlan>('/api/mods/update-all-plan'));
      if (!flow.ok) return;
      await modJob.start('/api/mods/job/start-update-all', {
        remove_old_zips: removeOldZips,
        allow_requires_game_update: flow.allow_requires_game_update,
      });
    } catch (e) {
      setModsMsg(localizeModError(e instanceof Error ? e.message : String(e), undefined, t), true);
    }
  }, [blockUpdates, modJob, removeOldZips, serverBusy, setModsMsg, t]);

  const toggleEnabled = useCallback(
    async (name: string, enabledNext: boolean) => {
      if (serverProcessBusy) {
        setModsMsg(t('server_running_mutate_blocked'), true);
        return;
      }
      const queryKey = ['mods', 'list', instanceId] as const;
      const prev = qc.getQueryData<ModsResponse>(queryKey);
      const toggleKey = String(name || '')
        .trim()
        .toLowerCase()
        .replace(/_/g, '-');
      qc.setQueryData<ModsResponse>(queryKey, (old) => {
        if (!old?.mods) return old;
        return {
          ...old,
          mods: old.mods.map((m) => {
            const key = String(m.name || '')
              .trim()
              .toLowerCase()
              .replace(/_/g, '-');
            return key === toggleKey ? { ...m, enabled: enabledNext } : m;
          }),
        };
      });
      try {
        const j = await api<{ ok?: boolean; error?: string }>('/api/mods/toggle', {
          method: 'POST',
          body: JSON.stringify({ name, enabled: enabledNext }),
        });
        if (!j?.ok) throw new Error(String(j?.error || 'toggle_failed'));
        await reload();
        void qc.invalidateQueries({ queryKey: ['players'] });
        if (modAffectsSpaceAgeMode(name)) {
          await invalidateSpaceAgeDependentQueries(qc);
        }
      } catch (e) {
        if (prev) qc.setQueryData(queryKey, prev);
        else await reload();
        setModsMsg(localizeModError(e instanceof Error ? e.message : String(e), undefined, t), true);
      }
    },
    [instanceId, qc, reload, serverProcessBusy, setModsMsg, t],
  );

  const toggleAllEnabled = useCallback(async () => {
    if (serverProcessBusy) {
      setModsMsg(t('server_running_mutate_blocked'), true);
      return;
    }
    if (!hasPortalMods) return;
    const enabledNext = allNonBuiltinDisabled;
    const queryKey = ['mods', 'list', instanceId] as const;
    const prev = qc.getQueryData<ModsResponse>(queryKey);
    qc.setQueryData<ModsResponse>(queryKey, (old) => {
      if (!old?.mods) return old;
      return {
        ...old,
        mods: old.mods.map((m) => (m.is_builtin ? m : { ...m, enabled: enabledNext })),
      };
    });
    try {
      const j = await api<{ ok?: boolean; error?: string; changed?: number }>('/api/mods/toggle-all', {
        method: 'POST',
        body: JSON.stringify({ enabled: enabledNext }),
      });
      if (!j?.ok) throw new Error(String(j?.error || 'toggle_all_failed'));
      await reload();
      void qc.invalidateQueries({ queryKey: ['players'] });
      const changed = Number(j.changed || 0);
      if (changed > 0) {
        setModsMsg(
          enabledNext
            ? t('mod_list_enable_all_ok', changed)
            : t('mod_list_disable_all_ok', changed),
          false,
        );
      }
    } catch (e) {
      if (prev) qc.setQueryData(queryKey, prev);
      else await reload();
      setModsMsg(localizeModError(e instanceof Error ? e.message : String(e), undefined, t), true);
    }
  }, [allNonBuiltinDisabled, hasPortalMods, instanceId, qc, reload, serverProcessBusy, setModsMsg, t]);

  const setVersion = useCallback(
    async (name: string, version: string) => {
      if (serverProcessBusy) {
        setModsMsg(t('server_running_mutate_blocked'), true);
        await reload();
        return;
      }
      if (blockUpdates) {
        setModsMsg(t('updates_blocked_by_instance_setting'), true);
        await reload();
        return;
      }
      await api('/api/mods/version', { method: 'POST', body: JSON.stringify({ name, version }) });
      setModsMsg(t('updated_successfully'), false);
      await reload();
    },
    [blockUpdates, reload, serverProcessBusy, setModsMsg, t],
  );

  const setRemoveOldZipsPref = useCallback(async (checked: boolean) => {
    setRemoveOldZips(checked);
    await api('/api/mods/prefs', { method: 'PUT', body: JSON.stringify({ remove_old_zips: checked }) });
  }, []);

  const downloadMod = useCallback(
    async (name: string) => {
      const row = rawRows.find((x) => x.name === name);
      if (row?.is_builtin) {
        setModsMsg(t('mod_list_cannot_download_builtin'), true);
        return;
      }
      await downloadBlob(`/api/mods/${encodeURIComponent(name)}/download`, `${name}.zip`);
      setModsMsg(t('mod_list_download_ok', name), false);
    },
    [rawRows, setModsMsg, t],
  );

  const downloadAll = useCallback(async () => {
    setModsMsg(t('mod_list_download_preparing'), false);
    await downloadBlob('/api/mods/download-all', modsArchiveDownloadName(instanceName));
    setModsMsg(t('mod_list_download_all_ok'), false);
  }, [instanceName, setModsMsg, t]);

  const removeMod = useCallback(
    async (name: string) => {
      const row = rawRows.find((x) => x.name === name);
      if (!row) return;
      if (row.is_builtin) {
        setModsMsg(t('mod_list_cannot_remove_builtin'), true);
        return;
      }
      if (serverProcessBusy) {
        setModsMsg(t('server_running_mutate_blocked'), true);
        return;
      }
      openFccConfirmModal({
        title: t('mod_list_remove_mod_btn'),
        message: t('mod_list_remove_confirm', row.display_name || row.name || name),
        confirmLabel: t('mod_list_remove_mod_btn'),
        cancelLabel: t('cancel'),
        variant: 'danger',
        onConfirm: async () => {
          await api('/api/mods/remove', { method: 'POST', body: JSON.stringify({ name }) });
          setModsMsg(t('updated_successfully'), false);
          await reload();
        },
      });
    },
    [rawRows, reload, serverProcessBusy, setModsMsg, t],
  );

  const showChangelog = useCallback(
    async (row: ModRow) => {
      if (!row.name || row.is_builtin) return;
      try {
        const j = await api<{ ok?: boolean; error?: string; text?: string }>(
          `/api/mods/changelog?name=${encodeURIComponent(row.name)}`,
        );
        if (!j || j.ok === false) throw new Error(String(j?.error || 'changelog_not_found'));
        const txt = String(j.text || '').trim();
        if (!txt) throw new Error('changelog_not_found');
        modals.open({
          title: t('mod_list_changelog_title', row.display_name || row.name),
          size: 'auto',
          classNames: {
            content: 'fu-modal fu-modal--changelog',
            body: 'changelog-modal__body',
          },
          children: createElement('pre', { className: 'changelog-pre' }, txt),
        });
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        setModsMsg(raw === 'changelog_not_found' ? t('mod_list_changelog_not_found') : raw, true);
      }
    },
    [setModsMsg, t],
  );

  const handleError = useCallback(
    (e: unknown) => {
      const text = e instanceof Error ? e.message : String(e);
      setModsMsg(text, true);
    },
    [setModsMsg],
  );

  return {
    rows,
    rawRows: displayRows,
    loading: query.isLoading,
    search,
    setSearch,
    selectedMod,
    setSelectedMod,
    sortColumn,
    sortAsc,
    toggleSort,
    serverBusy,
    serverProcessBusy,
    blockUpdates,
    hasPortalMods,
    portalUsername,
    allNonBuiltinDisabled,
    removeOldZips,
    setRemoveOldZipsPref,
    activeModpack,
    reload,
    toggleEnabled,
    toggleAllEnabled,
    setVersion,
    downloadMod,
    downloadAll,
    removeMod,
    showChangelog,
    handleError,
    modJob,
    installInput,
    setInstallInput,
    installBlink,
    installFromUrl,
    uploadArchives,
    previewFromSave,
    fromSaveState,
    closeFromSaveDialog,
    confirmFromSaveDialog,
    updateSelected,
    updateAll,
    checkUpdates,
    modsCheckRunning,
  };
}

export type ModsApi = ReturnType<typeof useMods>;
