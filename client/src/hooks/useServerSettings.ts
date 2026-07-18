import { useCallback, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import type { LocaleStrings } from '../i18n/locale';
import type { ProgramSettings } from '../types/programSettings';
import {
  extractEditableValues,
  isNotFoundApiError,
  localizeServerSettingsError,
  serializeSettingsForSave,
  validateFactorioServerSettingsCredentials,
} from '../lib/serverSettingsUtils';
import { notifyErr, notifyOk } from '../lib/notify';
import { resolveStatusKind, type PanelStatus } from '../types/panel';

interface ServerSettingsResponse {
  ok?: boolean;
  error?: string;
  data?: Record<string, unknown>;
  path?: string;
}

async function ensureServerSettingsFileSilently(): Promise<void> {
  try {
    const existing = await api<ServerSettingsResponse>('/api/files/server-settings');
    if (existing?.ok === false) {
      const exErr = String(existing.error || 'not_found').trim();
      if (isNotFoundApiError(exErr)) throw new Error('not_found');
      throw new Error(exErr);
    }
    return;
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    if (!isNotFoundApiError(err)) throw e;
  }

  const createdResp = await api<ServerSettingsResponse>('/api/files/server-settings/create-from-example', {
    method: 'POST',
  });
  if (createdResp?.ok === false) {
    throw new Error(String(createdResp.error || 'create_failed'));
  }

  let created: ServerSettingsResponse;
  try {
    created = await api<ServerSettingsResponse>('/api/files/server-settings');
    if (created?.ok === false) throw new Error(String(created.error || 'not_found'));
  } catch {
    return;
  }

  const data = created.data && typeof created.data === 'object' ? created.data : {};
  const vis = data.visibility && typeof data.visibility === 'object' ? (data.visibility as Record<string, unknown>) : {};
  if (vis.public === false) return;
  data.visibility = { ...vis, public: false };
  await api('/api/files/server-settings', { method: 'PUT', body: JSON.stringify(data) });
}

export function useServerSettings(
  enabled: boolean,
  status: PanelStatus | null | undefined,
  t: (key: string, ...args: (string | number)[]) => string,
  strings: LocaleStrings,
) {
  const qc = useQueryClient();
  const uploadRef = useRef<HTMLInputElement>(null);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [rawEntries, setRawEntries] = useState<[string, unknown][]>([]);
  const [fileMissing, setFileMissing] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<Record<string, unknown> | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const kind = resolveStatusKind(status);
  const locked = kind === 'running' || kind === 'starting' || kind === 'stopping' || kind === 'maintenance';
  const sourceTitle = t('settings_btn');

  const toast = useCallback(
    (text: string, isErr: boolean) => {
      const msg = isErr ? localizeServerSettingsError(text, t) : String(text || '');
      if (!msg) return;
      if (isErr) notifyErr(sourceTitle, msg);
      else notifyOk(sourceTitle, msg);
    },
    [sourceTitle, t],
  );

  const applyLoadedData = useCallback((data: Record<string, unknown>) => {
    setRawEntries(Object.entries(data));
    setValues(extractEditableValues(data));
    setFileMissing(false);
  }, []);

  const loadSettings = useCallback(async () => {
    try {
      await ensureServerSettingsFileSilently().catch(() => {});
      const j = await api<ServerSettingsResponse>('/api/files/server-settings');
      if (j?.ok === false) {
        const err = String(j.error || 'not_found').trim();
        if (isNotFoundApiError(err)) {
          await ensureServerSettingsFileSilently();
          const j2 = await api<ServerSettingsResponse>('/api/files/server-settings');
          if (j2?.ok === false) throw new Error(err);
          applyLoadedData(j2.data == null ? {} : j2.data);
          return j2;
        }
        throw new Error(err);
      }
      applyLoadedData(j.data == null ? {} : j.data);
      return j;
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      if (isNotFoundApiError(err)) {
        try {
          await ensureServerSettingsFileSilently();
          const j2 = await api<ServerSettingsResponse>('/api/files/server-settings');
          applyLoadedData(j2.data == null ? {} : j2.data);
          return j2;
        } catch {
          /* fall through */
        }
      }
      setFileMissing(true);
      setRawEntries([]);
      setValues({});
      throw e;
    }
  }, [applyLoadedData]);

  const query = useQuery({
    queryKey: ['server-settings'],
    queryFn: loadSettings,
    enabled,
    retry: false,
  });

  const programQuery = useQuery({
    queryKey: ['program', 'settings'],
    queryFn: () => api<ProgramSettings>('/api/config/program'),
    enabled,
    staleTime: 30_000,
  });

  const resetDefaultPublicOff = programQuery.data?.server_settings_default_public_off !== false;
  const resetApplyGlobalCredentials =
    programQuery.data?.server_settings_apply_global_credentials !== false &&
    !!programQuery.data?.factorio_global_credentials_present;

  const formData = Object.fromEntries(rawEntries);

  const setField = useCallback((key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  }, []);

  const checkVisibilityPublic = useCallback((): boolean => {
    const tok = String(values.token ?? '').trim();
    const pwd = String(values.password ?? '').trim();
    if (!tok && !pwd) {
      toast(t('server_settings_error_public_needs_auth'), true);
      return false;
    }
    return true;
  }, [t, toast, values.password, values.token]);

  const reload = useCallback(async () => {
    await qc.invalidateQueries({ queryKey: ['server-settings'] });
    toast('', false);
  }, [qc, toast]);

  const save = useCallback(async () => {
    const serialized = serializeSettingsForSave(rawEntries, values);
    if (!serialized.ok) {
      toast(serialized.error, true);
      return;
    }
    const credErr = validateFactorioServerSettingsCredentials(serialized.data, t);
    if (credErr) {
      toast(credErr, true);
      return;
    }
    try {
      await api('/api/files/server-settings', { method: 'PUT', body: JSON.stringify(serialized.data) });
      toast(t('updated_successfully'), false);
      await qc.invalidateQueries({ queryKey: ['status'] });
      await qc.invalidateQueries({ queryKey: ['server-settings'] });
      await qc.invalidateQueries({ queryKey: ['mods', 'list'] });
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    }
  }, [qc, rawEntries, t, toast, values]);

  const download = useCallback(async () => {
    try {
      const j = await api<ServerSettingsResponse>('/api/files/server-settings');
      const payload = j?.data != null ? j.data : {};
      const text = `${JSON.stringify(payload, null, 2)}\n`;
      const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'server-settings.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast(t('server_settings_download_ok'), false);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    }
  }, [t, toast]);

  const createFromExample = useCallback(async () => {
    try {
      await api('/api/files/server-settings/create-from-example', { method: 'POST' });
      await qc.invalidateQueries({ queryKey: ['server-settings'] });
      toast(t('create_success_msg'), false);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    }
  }, [qc, t, toast]);

  const confirmReset = useCallback(async () => {
    setResetOpen(false);
    await createFromExample();
  }, [createFromExample]);

  const pickUpload = useCallback(() => {
    uploadRef.current?.click();
  }, []);

  const onUploadPicked = useCallback(
    async (file: File | null) => {
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text) as Record<string, unknown>;
        setPendingUpload(data);
        setUploadOpen(true);
      } catch (e) {
        setPendingUpload(null);
        toast(e instanceof Error ? e.message : String(e), true);
      }
    },
    [toast],
  );

  const confirmUpload = useCallback(async () => {
    if (!pendingUpload) {
      setUploadOpen(false);
      return;
    }
    const data = pendingUpload;
    setPendingUpload(null);
    setUploadOpen(false);
    try {
      await api('/api/files/server-settings', { method: 'PUT', body: JSON.stringify(data) });
      await qc.invalidateQueries({ queryKey: ['server-settings'] });
      await qc.invalidateQueries({ queryKey: ['status'] });
      toast(t('server_settings_upload_ok'), false);
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), true);
    }
  }, [pendingUpload, qc, t, toast]);

  const cancelUpload = useCallback(() => {
    setPendingUpload(null);
    setUploadOpen(false);
  }, []);

  return {
    loading: query.isLoading,
    locked,
    fileMissing,
    formData,
    values,
    strings,
    uploadRef,
    uploadOpen,
    resetOpen,
    resetDefaultPublicOff,
    resetApplyGlobalCredentials,
    setUploadOpen,
    setResetOpen,
    setField,
    checkVisibilityPublic,
    reload,
    save,
    download,
    createFromExample,
    confirmReset,
    pickUpload,
    onUploadPicked,
    confirmUpload,
    cancelUpload,
  };
}

export type ServerSettingsApi = ReturnType<typeof useServerSettings>;
