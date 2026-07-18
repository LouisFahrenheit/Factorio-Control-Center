import { useCallback, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { api } from '../api/client';
import {
  collectReleaseVersions,
  editorFormFromItem,
  emptyEditorForm,
  mergeReleaseVersionList,
  type BootstrapStatus,
  type InstanceEditorForm,
  type ReleaseVersions,
} from '../lib/instanceEditorUtils';
import { findInstanceByServerPath, localizeInstanceError } from '../lib/instanceUtils';
import { localizeApiError } from '../lib/apiErrorUtils';
import type { InstanceItem } from '../types/instance';

interface InstanceApiErrorPayload {
  ok?: boolean;
  error?: string;
  errorArgs?: (string | number)[];
  addedId?: string;
}

function instanceApiErrorMessage(
  payload: (InstanceApiErrorPayload & { error_args?: (string | number)[] }) | null | undefined,
  fallback: string,
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  const args = payload?.errorArgs || payload?.error_args || [];
  return localizeApiError(String(payload?.error || fallback), t, args);
}

export type InstanceEditorMode = 'add' | 'edit';

export interface FsDirItem {
  name?: string;
  path?: string;
}

export interface InstanceEditorApi {
  open: boolean;
  mode: InstanceEditorMode;
  form: InstanceEditorForm;
  setForm: Dispatch<SetStateAction<InstanceEditorForm>>;
  saving: boolean;
  hasFactorioCredentials: boolean;
  showPackageBuild: boolean;
  versionOptions: { value: string; label: string }[];
  showCustomVersion: boolean;
  downloadOptionsExpanded: boolean;
  pathBrowserOpen: boolean;
  pathBrowseCurrent: string;
  pathBrowseParent: string;
  pathBrowseItems: FsDirItem[];
  pathBrowseLoading: boolean;
  pathBrowseFactorioOk: boolean | null;
  pathBrowseCreateOpen: boolean;
  pathBrowseCreateName: string;
  pathBrowseCreateError: string;
  pathBrowseCreateSaving: boolean;
  bootstrapOpen: boolean;
  bootstrapStatus: BootstrapStatus | null;
  bootstrapCanClose: boolean;
  bootstrapStopRequested: boolean;
  stopBootstrap: () => Promise<void>;
  openAdd: () => void;
  openEdit: (item: InstanceItem) => void;
  close: () => void;
  save: () => Promise<void>;
  openPathBrowser: () => void;
  closePathBrowser: () => void;
  pathBrowseUp: () => void;
  pathBrowseRoot: () => void;
  pathBrowseEnter: (path: string) => void;
  pathBrowseSelect: () => void;
  openPathBrowseCreate: () => void;
  closePathBrowseCreate: () => void;
  setPathBrowseCreateName: (name: string) => void;
  submitPathBrowseCreate: () => Promise<void>;
  closeBootstrap: () => void;
}

interface UseInstanceEditorOpts {
  rows: InstanceItem[];
  t: (key: string, ...args: (string | number)[]) => string;
  reload: () => Promise<unknown>;
  setInstanceMsg: (text: string, isErr?: boolean) => void;
  setInstanceMsgTimed: (text: string, isErr?: boolean, ttlMs?: number) => void;
}

export function useInstanceEditor({
  rows,
  t,
  reload,
  setInstanceMsg,
  setInstanceMsgTimed,
}: UseInstanceEditorOpts): InstanceEditorApi {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<InstanceEditorMode>('add');
  const [editId, setEditId] = useState('');
  const [form, setForm] = useState<InstanceEditorForm>(() => emptyEditorForm(rows));
  const [saving, setSaving] = useState(false);
  const [hasFactorioCredentials, setHasFactorioCredentials] = useState(false);
  const [hostOs, setHostOs] = useState('');
  const [releases, setReleases] = useState<ReleaseVersions>({ stable: [], experimental: [] });

  const [pathBrowserOpen, setPathBrowserOpen] = useState(false);
  const [pathBrowseCurrent, setPathBrowseCurrent] = useState('');
  const [pathBrowseParent, setPathBrowseParent] = useState('');
  const [pathBrowseItems, setPathBrowseItems] = useState<FsDirItem[]>([]);
  const [pathBrowseLoading, setPathBrowseLoading] = useState(false);
  const [pathBrowseFactorioOk, setPathBrowseFactorioOk] = useState<boolean | null>(null);
  const [pathBrowseCreateOpen, setPathBrowseCreateOpen] = useState(false);
  const [pathBrowseCreateName, setPathBrowseCreateName] = useState('');
  const [pathBrowseCreateError, setPathBrowseCreateError] = useState('');
  const [pathBrowseCreateSaving, setPathBrowseCreateSaving] = useState(false);

  const [bootstrapOpen, setBootstrapOpen] = useState(false);
  const [bootstrapStatus, setBootstrapStatus] = useState<BootstrapStatus | null>(null);
  const [bootstrapCanClose, setBootstrapCanClose] = useState(false);
  const [bootstrapStopRequested, setBootstrapStopRequested] = useState(false);
  const bootstrapPollRef = useRef<number | null>(null);

  const showPackageBuild = hostOs === 'windows';

  const versionOptions = useMemo(() => {
    const { merged, expSet } = mergeReleaseVersionList(
      releases.stable,
      releases.experimental,
      form.showExperimental,
    );
    const opts: { value: string; label: string }[] = [
      { value: 'latest', label: t('latest_version') },
    ];
    merged.forEach((v) => {
      opts.push({
        value: v,
        label: form.showExperimental && expSet.has(v) ? t('instances_download_version_experimental', v) : v,
      });
    });
    opts.push({ value: '__custom__', label: t('instances_download_version_custom') });
    return opts;
  }, [form.showExperimental, releases, t]);

  const showCustomVersion =
    form.downloadServerPackage && form.packageVersion === '__custom__' && mode === 'add';
  const downloadOptionsExpanded = mode === 'add' && form.downloadServerPackage && hasFactorioCredentials;

  const loadEditorBootstrap = useCallback(async (): Promise<boolean> => {
    const [health, program, rel] = await Promise.all([
      api<{ host_os?: string }>('/api/health').catch(() => ({ host_os: '' })),
      api<{ factorio_global_credentials_present?: boolean }>('/api/config/program').catch(() => ({
        factorio_global_credentials_present: false,
      })),
      api<{ ok?: boolean; releases?: unknown; error?: string }>('/api/factorio/releases').catch(() => ({
        ok: false as const,
      })),
    ]);
    setHostOs(String(health.host_os || '').toLowerCase());
    const hasCreds = !!program.factorio_global_credentials_present;
    setHasFactorioCredentials(hasCreds);
    if (rel && rel.ok !== false) {
      setReleases(collectReleaseVersions(rel.releases || {}));
    } else {
      setReleases({ stable: [], experimental: [] });
    }
    return hasCreds;
  }, []);

  const openAdd = useCallback(() => {
    setMode('add');
    setEditId('');
    setForm(emptyEditorForm(rows));
    setOpen(true);
    void loadEditorBootstrap().then((hasCreds) => {
      if (!hasCreds) setInstanceMsgTimed(t('instances_download_creds_settings_hint'), false, 6500);
    });
  }, [loadEditorBootstrap, rows, setInstanceMsgTimed, t]);

  const openEdit = useCallback(
    (item: InstanceItem) => {
      setMode('edit');
      setEditId(String(item.id || ''));
      setForm(editorFormFromItem(item));
      setOpen(true);
      void loadEditorBootstrap();
    },
    [loadEditorBootstrap],
  );

  const close = useCallback(() => {
    setOpen(false);
  }, []);

  const stopBootstrapPoll = useCallback(() => {
    if (bootstrapPollRef.current) {
      window.clearInterval(bootstrapPollRef.current);
      bootstrapPollRef.current = null;
    }
  }, []);

  const closeBootstrap = useCallback(() => {
    stopBootstrapPoll();
    setBootstrapOpen(false);
    setBootstrapStatus(null);
    setBootstrapCanClose(false);
    setBootstrapStopRequested(false);
  }, [stopBootstrapPoll]);

  const stopBootstrap = useCallback(async () => {
    if (bootstrapStopRequested) return;
    setBootstrapStopRequested(true);
    try {
      await api('/api/instances/bootstrap/stop', { method: 'POST' });
    } catch {
      setBootstrapStopRequested(false);
    }
  }, [bootstrapStopRequested]);

  const pollBootstrap = useCallback((): Promise<BootstrapStatus> => {
    stopBootstrapPoll();
    setBootstrapOpen(true);
    setBootstrapCanClose(false);
    setBootstrapStopRequested(false);
    setBootstrapStatus({ phase: 'prepare' });
    return new Promise((resolve, reject) => {
      let ticks = 0;
      bootstrapPollRef.current = window.setInterval(() => {
        void (async () => {
          try {
            ticks += 1;
            const st = await api<BootstrapStatus>('/api/instances/bootstrap/status');
            if (!st || st.ok === false) {
              stopBootstrapPoll();
              setBootstrapStatus({ phase: 'error', error: st?.error || 'instance_template_download_failed', error_args: st?.error_args });
              setBootstrapCanClose(true);
              reject(new Error(instanceApiErrorMessage(
                { error: st?.error, errorArgs: st?.error_args },
                'instance_template_download_failed',
                t,
              )));
              return;
            }
            setBootstrapStatus(st);
            const phase = String(st.phase || 'idle');
            if (phase === 'done') {
              stopBootstrapPoll();
              setBootstrapCanClose(true);
              resolve(st);
              return;
            }
            if (phase === 'error') {
              stopBootstrapPoll();
              setBootstrapCanClose(true);
              reject(new Error(instanceApiErrorMessage(
                { error: st.error, errorArgs: st.error_args },
                'instance_template_download_failed',
                t,
              )));
              return;
            }
            if (phase === 'cancelled') {
              stopBootstrapPoll();
              setBootstrapCanClose(true);
              reject(new Error('cancelled'));
              return;
            }
            if (ticks >= 7200) {
              stopBootstrapPoll();
              setBootstrapStatus({ phase: 'error', error: 'instance_template_download_failed' });
              setBootstrapCanClose(true);
              reject(new Error(localizeInstanceError('instance_template_download_failed', t)));
            }
          } catch (e) {
            stopBootstrapPoll();
            const msg = e instanceof Error ? e.message : String(e);
            setBootstrapStatus({ phase: 'error', error: msg });
            setBootstrapCanClose(true);
            reject(e);
          }
        })();
      }, 700);
    });
  }, [stopBootstrapPoll, t]);

  const resolvePackageBuild = useCallback(async (): Promise<string> => {
    if (hostOs === 'linux') return 'headless';
    return (form.packageBuild || 'alpha').trim() || 'alpha';
  }, [form.packageBuild, hostOs]);

  const save = useCallback(async () => {
    const name = form.name.trim();
    const serverPath = form.serverPath.trim();
    const serverPortNum = Number(form.port.trim());
    const rconPortNum = Number(form.rconPort.trim());
    const rconPassword = form.rconPassword.trim();
    const ip = form.ip.trim() || '0.0.0.0';

    if (!name) {
      setInstanceMsg(t('instances_error_name_required'), true);
      return;
    }
    if (!serverPath) {
      setInstanceMsg(t('instances_error_path_required'), true);
      return;
    }
    if (!Number.isInteger(serverPortNum) || serverPortNum < 1 || serverPortNum > 65535) {
      setInstanceMsg(t('instances_error_invalid_port'), true);
      return;
    }
    if (!Number.isInteger(rconPortNum) || rconPortNum < 1 || rconPortNum > 65535) {
      setInstanceMsg(t('instances_error_invalid_rcon_port'), true);
      return;
    }
    if (!rconPassword) {
      setInstanceMsg(t('instances_error_invalid_rcon_password'), true);
      return;
    }

    const excludeId = mode === 'edit' ? editId : undefined;
    const duplicate = findInstanceByServerPath(rows, serverPath, hostOs, excludeId);
    if (duplicate) {
      setInstanceMsg(t('instances_error_path_exists', String(duplicate.name || '').trim() || '?'), true);
      return;
    }

    const packageVersionRaw =
      form.packageVersion === '__custom__' ? form.packageVersionCustom.trim() : form.packageVersion.trim();
    const packageVersion = packageVersionRaw || 'latest';

    setSaving(true);
    try {
      const packageBuild = await resolvePackageBuild();
      let serverPathForCreate = serverPath;
      let bootstrapAddedId = '';
      let shouldDownloadPackage = mode === 'add' && form.downloadServerPackage;

      const loadPathInfo = async (path: string) => {
        const info = await api<{
          ok?: boolean;
          error?: string;
          is_empty?: boolean;
          is_factorio_server?: boolean;
          has_factorio_executable?: boolean;
        }>(`/api/fs/path-info?path=${encodeURIComponent(path)}`);
        if (!info || info.ok === false) {
          throw new Error(localizeInstanceError(info?.error || 'instance_path_invalid', t));
        }
        return info;
      };

      const assertExecutableForManualAdd = async (path: string) => {
        const info = await loadPathInfo(path);
        if (!info.has_factorio_executable) {
          throw new Error(localizeInstanceError('instance_executable_missing', t));
        }
      };

      if (shouldDownloadPackage) {
        const pathInfo = await loadPathInfo(serverPath);
        const isEmpty = !!pathInfo.is_empty;
        const isFactorioServer = !!pathInfo.is_factorio_server;
        if (!isEmpty) {
          if (isFactorioServer) {
            if (!pathInfo.has_factorio_executable) {
              throw new Error(localizeInstanceError('instance_executable_missing', t));
            }
            shouldDownloadPackage = false;
            setForm((f) => ({ ...f, downloadServerPackage: false }));
            setInstanceMsgTimed(t('instances_download_existing_server_disable_package'), false, 5000);
          } else {
            throw new Error(localizeInstanceError('instance_path_not_empty', t));
          }
        }
      }

      if (mode === 'add' && !shouldDownloadPackage) {
        await assertExecutableForManualAdd(serverPath);
      }

      if (shouldDownloadPackage) {
        const started = await api<InstanceApiErrorPayload>('/api/instances/bootstrap/start', {
          method: 'POST',
          body: JSON.stringify({
            name,
            serverPath,
            ip,
            port: serverPortNum,
            rconPort: rconPortNum,
            rconPassword,
            autostartServer: form.autostartServer,
            autoEnterPanel: form.autoEnterPanel,
            blockUpdates: form.blockUpdates,
            experimentalUpdates: form.experimentalUpdates,
            packageBuild,
            packageVersion,
            showExperimental: form.showExperimental,
          }),
        });
        if (!started || started.ok === false) {
          setInstanceMsg(instanceApiErrorMessage(started, 'instance_template_download_failed', t), true);
          return;
        }
        const bootStatus = await pollBootstrap();
        if (bootStatus.server_path) {
          serverPathForCreate = String(bootStatus.server_path).trim() || serverPath;
          setForm((f) => ({ ...f, serverPath: serverPathForCreate }));
        }
        bootstrapAddedId = String(bootStatus.added_id || '').trim();
        closeBootstrap();
      }

      if (mode === 'edit' && editId) {
        const j = await api<InstanceApiErrorPayload>(
          `/api/instances/${encodeURIComponent(editId)}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              name,
              serverPath,
              ip,
              port: serverPortNum,
              autostartServer: form.autostartServer,
              autoEnterPanel: form.autoEnterPanel,
              blockUpdates: form.blockUpdates,
              experimentalUpdates: form.experimentalUpdates,
              rconPort: rconPortNum,
              rconPassword,
            }),
          },
        );
        if (!j || j.ok === false) {
          setInstanceMsg(instanceApiErrorMessage(j, 'update_failed', t), true);
          return;
        }
        setInstanceMsgTimed(t('instances_updated_ok'), false, 3500);
      } else {
        if (mode === 'add' && shouldDownloadPackage && bootstrapAddedId) {
          if (bootstrapAddedId) {
            try {
              await api('/api/instances/select', { method: 'POST', body: JSON.stringify({ id: bootstrapAddedId }) });
            } catch {
              /* ignore */
            }
          }
          setInstanceMsgTimed(t('instances_added_ok'), false, 3500);
          await reload();
          setOpen(false);
          return;
        }
        const j = await api<InstanceApiErrorPayload>('/api/instances', {
          method: 'POST',
          body: JSON.stringify({
            name,
            serverPath: serverPathForCreate,
            ip,
            port: serverPortNum,
            rconPort: rconPortNum,
            rconPassword,
            autostartServer: form.autostartServer,
            autoEnterPanel: form.autoEnterPanel,
            blockUpdates: form.blockUpdates,
            experimentalUpdates: form.experimentalUpdates,
            downloadServerPackage: false,
            packageBuild,
            packageVersion,
          }),
        });
        if (!j || j.ok === false) {
          setInstanceMsg(instanceApiErrorMessage(j, 'create_failed', t), true);
          return;
        }
        const addedId = String(j.addedId || '').trim();
        if (addedId) {
          try {
            await api('/api/instances/select', { method: 'POST', body: JSON.stringify({ id: addedId }) });
          } catch {
            /* ignore */
          }
        }
        setInstanceMsgTimed(t('instances_added_ok'), false, 3500);
      }
      await reload();
      setOpen(false);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      if (raw === 'cancelled') {
        setInstanceMsg(localizeInstanceError('cancelled', t), false);
        return;
      }
      setInstanceMsg(localizeInstanceError(raw, t), true);
    } finally {
      setSaving(false);
    }
  }, [
    closeBootstrap,
    editId,
    form,
    hostOs,
    mode,
    pollBootstrap,
    reload,
    resolvePackageBuild,
    rows,
    setInstanceMsg,
    setInstanceMsgTimed,
    t,
  ]);

  const loadPathBrowser = useCallback(async (path: string) => {
    setPathBrowseLoading(true);
    try {
      const q = String(path || '').trim();
      const url = q ? `/api/fs/dirs?path=${encodeURIComponent(q)}` : '/api/fs/dirs';
      const j = await api<{ ok?: boolean; current?: string; parent?: string; items?: FsDirItem[]; error?: string }>(
        url,
      );
      if (!j || j.ok === false) throw new Error(String(j?.error || 'browse_failed'));
      const cur = String(j.current || '');
      setPathBrowseCurrent(cur);
      setPathBrowseParent(String(j.parent || ''));
      setPathBrowseItems(Array.isArray(j.items) ? j.items : []);
      if (cur) {
        try {
          const info = await api<{
            ok?: boolean;
            is_factorio_server?: boolean;
            has_factorio_executable?: boolean;
          }>(`/api/fs/path-info?path=${encodeURIComponent(cur)}`);
          setPathBrowseFactorioOk(
            !!(info?.ok && (info.is_factorio_server || info.has_factorio_executable)),
          );
        } catch {
          setPathBrowseFactorioOk(false);
        }
      } else {
        setPathBrowseFactorioOk(null);
      }
    } finally {
      setPathBrowseLoading(false);
    }
  }, []);

  const openPathBrowser = useCallback(() => {
    setPathBrowserOpen(true);
    void loadPathBrowser('').catch((e) => {
      setInstanceMsg(localizeInstanceError(e instanceof Error ? e.message : String(e), t), true);
      setPathBrowserOpen(false);
    });
  }, [loadPathBrowser, setInstanceMsg, t]);

  const closePathBrowseCreate = useCallback(() => {
    setPathBrowseCreateOpen(false);
    setPathBrowseCreateName('');
    setPathBrowseCreateError('');
    setPathBrowseCreateSaving(false);
  }, []);

  const closePathBrowser = useCallback(() => {
    setPathBrowserOpen(false);
    setPathBrowseCurrent('');
    setPathBrowseParent('');
    setPathBrowseItems([]);
    setPathBrowseFactorioOk(null);
    closePathBrowseCreate();
  }, [closePathBrowseCreate]);

  const pathBrowseUp = useCallback(() => {
    if (!pathBrowseParent) return;
    void loadPathBrowser(pathBrowseParent).catch((e) => {
      setInstanceMsg(localizeInstanceError(e instanceof Error ? e.message : String(e), t), true);
    });
  }, [loadPathBrowser, pathBrowseParent, setInstanceMsg, t]);

  const pathBrowseRoot = useCallback(() => {
    void loadPathBrowser('').catch((e) => {
      setInstanceMsg(localizeInstanceError(e instanceof Error ? e.message : String(e), t), true);
    });
  }, [loadPathBrowser, setInstanceMsg, t]);

  const pathBrowseEnter = useCallback(
    (path: string) => {
      void loadPathBrowser(path).catch((e) => {
        setInstanceMsg(localizeInstanceError(e instanceof Error ? e.message : String(e), t), true);
      });
    },
    [loadPathBrowser, setInstanceMsg, t],
  );

  const pathBrowseSelect = useCallback(() => {
    if (pathBrowseCurrent) {
      setForm((f) => ({ ...f, serverPath: pathBrowseCurrent }));
    }
    closePathBrowser();
  }, [closePathBrowser, pathBrowseCurrent]);

  const openPathBrowseCreate = useCallback(() => {
    const cur = pathBrowseCurrent.trim();
    if (!cur) {
      setInstanceMsg(t('instances_path_not_found'), true);
      return;
    }
    setPathBrowseCreateName('');
    setPathBrowseCreateError('');
    setPathBrowseCreateOpen(true);
  }, [pathBrowseCurrent, setInstanceMsg, t]);

  const submitPathBrowseCreate = useCallback(async () => {
    const cur = pathBrowseCurrent.trim();
    if (!cur) {
      setPathBrowseCreateError(t('instances_path_not_found'));
      return;
    }
    const folderName = pathBrowseCreateName.trim();
    if (!folderName) {
      setPathBrowseCreateError(t('instances_path_create_name_required'));
      return;
    }
    setPathBrowseCreateSaving(true);
    setPathBrowseCreateError('');
    try {
      const j = await api<{ ok?: boolean; path?: string; error?: string }>('/api/fs/mkdir', {
        method: 'POST',
        body: JSON.stringify({ path: cur, name: folderName }),
      });
      if (!j || j.ok === false) {
        throw new Error(localizeInstanceError(j?.error || 'folder_create_failed', t));
      }
      await loadPathBrowser(String(j.path || cur));
      closePathBrowseCreate();
      setInstanceMsgTimed(t('instances_path_create_ok', folderName), false, 3500);
    } catch (e) {
      setPathBrowseCreateError(localizeInstanceError(e instanceof Error ? e.message : String(e), t));
    } finally {
      setPathBrowseCreateSaving(false);
    }
  }, [
    closePathBrowseCreate,
    loadPathBrowser,
    pathBrowseCreateName,
    pathBrowseCurrent,
    setInstanceMsgTimed,
    t,
  ]);

  return {
    open,
    mode,
    form,
    setForm,
    saving,
    hasFactorioCredentials,
    showPackageBuild,
    versionOptions,
    showCustomVersion,
    downloadOptionsExpanded,
    pathBrowserOpen,
    pathBrowseCurrent,
    pathBrowseParent,
    pathBrowseItems,
    pathBrowseLoading,
    pathBrowseFactorioOk,
    pathBrowseCreateOpen,
    pathBrowseCreateName,
    pathBrowseCreateError,
    pathBrowseCreateSaving,
    bootstrapOpen,
    bootstrapStatus,
    bootstrapCanClose,
    bootstrapStopRequested,
    stopBootstrap,
    openAdd,
    openEdit,
    close,
    save,
    openPathBrowser,
    closePathBrowser,
    pathBrowseUp,
    pathBrowseRoot,
    pathBrowseEnter,
    pathBrowseSelect,
    openPathBrowseCreate,
    closePathBrowseCreate,
    setPathBrowseCreateName,
    submitPathBrowseCreate,
    closeBootstrap,
  };
}
