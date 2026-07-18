import { useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { isNetworkFetchError, notifyApiError } from '../lib/networkErrors';
import { notifyErr, notifyOk } from '../lib/notify';
import { localizeModSettingsError, parseModSettingsDocument } from '../lib/modSettingsUtils';
import type {
  ModSettingsDocument,
  ModSettingsReadResponse,
  ModSettingsSchemaProgress,
  ModSettingsSchemaResponse,
  ModSettingsSchemaStatusResponse,
  ModSettingsSection,
  ModSettingSchemaEntry,
} from '../types/modSettings';

const SCHEMA_POLL_MS = 300;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchModSettingsSchema(
  refresh: boolean,
  onProgress: (progress: ModSettingsSchemaProgress | null) => void,
): Promise<{ settings: Record<string, ModSettingSchemaEntry>; groupTitles: Record<string, string>; cached: boolean }> {
  const url = refresh ? '/api/mod-settings/schema?refresh=1' : '/api/mod-settings/schema';
  const first = await api<ModSettingsSchemaResponse>(url);
  if (!first.ok) throw new Error(String(first.error || 'mod_settings_load_error'));
  if (!first.pending) {
    onProgress({ phase: 'done' });
    return {
      settings: first.settings || {},
      groupTitles: first.group_titles || {},
      cached: !!first.cached,
    };
  }

  onProgress(first.progress || { phase: 'preparing' });
  while (true) {
    await sleep(SCHEMA_POLL_MS);
    const st = await api<ModSettingsSchemaStatusResponse>('/api/mod-settings/schema/status');
    if (st.progress) onProgress(st.progress);
    if (st.running) continue;
    if (!st.ok) throw new Error(String(st.error || 'mod_settings_load_error'));
    if (st.ready) {
      onProgress({ phase: 'done' });
      return {
        settings: st.settings || {},
        groupTitles: st.group_titles || {},
        cached: !!st.cached,
      };
    }
  }
}

export function useModSettings(
  enabled: boolean,
  serverBusy: boolean,
  t: (key: string, ...args: (string | number)[]) => string,
) {
  const qc = useQueryClient();
  const [doc, setDoc] = useState<ModSettingsDocument | null>(null);
  const [missingFile, setMissingFile] = useState(false);
  const [activeSection, setActiveSection] = useState<ModSettingsSection>('startup');
  const [filter, setFilter] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [schemaProgress, setSchemaProgress] = useState<ModSettingsSchemaProgress | null>(null);
  const [schemaRefresh, setSchemaRefresh] = useState(0);

  const dataQuery = useQuery({
    queryKey: ['mod-settings'],
    queryFn: async () => {
      const res = await api<ModSettingsReadResponse>('/api/mod-settings/json');
      if (!res.ok || !res.json_text) {
        throw new Error(String(res.error || 'mod_settings_load_error'));
      }
      return {
        doc: parseModSettingsDocument(res.json_text),
        missingFile: !!res.missing_file,
      };
    },
    enabled,
    staleTime: 0,
  });

  const schemaQuery = useQuery({
    queryKey: ['mod-settings', 'schema', schemaRefresh],
    queryFn: async () => {
      setSchemaProgress({ phase: 'preparing' });
      const refresh = schemaRefresh > 0;
      return fetchModSettingsSchema(refresh, setSchemaProgress);
    },
    enabled,
    staleTime: 0,
  });

  useEffect(() => {
    if (!dataQuery.data) return;
    setDoc(dataQuery.data.doc);
    setMissingFile(dataQuery.data.missingFile);
    setDirty(false);
  }, [dataQuery.data]);

  const reload = useCallback(async (forceSchema = true) => {
    if (forceSchema) setSchemaRefresh((n) => n + 1);
    await qc.invalidateQueries({ queryKey: ['mod-settings'] });
    if (!forceSchema) return;
    await qc.invalidateQueries({ queryKey: ['mod-settings', 'schema'] });
  }, [qc]);

  const updateEntry = useCallback((section: ModSettingsSection, key: string, entry: unknown) => {
    setDoc((prev) => {
      if (!prev) return prev;
      const next = structuredClone(prev);
      next.data[section][key] = entry;
      return next;
    });
    setDirty(true);
  }, []);

  const save = useCallback(async () => {
    if (!doc || serverBusy) return;
    setSaving(true);
    try {
      await api('/api/mod-settings/json', {
        method: 'PUT',
        body: JSON.stringify(doc),
      });
      setMissingFile(false);
      setDirty(false);
      notifyOk(t('mod_settings_editor_title'), t('save_btn'));
      await reload(true);
    } catch (e) {
      if (isNetworkFetchError(e)) {
        notifyApiError(t('mod_settings_editor_title'), e, t);
      } else {
        const raw = e instanceof Error ? e.message : String(e);
        const line = t('mod_settings_save_error', localizeModSettingsError(raw, t));
        notifyErr(t('mod_settings_editor_title'), line !== 'mod_settings_save_error' ? line : raw);
      }
      throw e;
    } finally {
      setSaving(false);
    }
  }, [doc, reload, serverBusy, t]);

  const settingsMeta = schemaQuery.data?.settings || {};
  const groupTitles = schemaQuery.data?.groupTitles || {};
  const readOnly = serverBusy;

  return useMemo(
    () => ({
      doc,
      missingFile,
      activeSection,
      setActiveSection,
      filter,
      setFilter,
      dirty,
      readOnly,
      loading: dataQuery.isLoading || schemaQuery.isLoading,
      schemaLoading: schemaQuery.isLoading,
      schemaProgress,
      schemaCached: !!schemaQuery.data?.cached,
      error:
        (dataQuery.error instanceof Error ? dataQuery.error.message : dataQuery.error ? String(dataQuery.error) : '') ||
        (schemaQuery.error instanceof Error ? schemaQuery.error.message : schemaQuery.error ? String(schemaQuery.error) : ''),
      settingsMeta: settingsMeta as Record<string, ModSettingSchemaEntry>,
      groupTitles,
      reload,
      updateEntry,
      save,
      saving,
    }),
    [
      activeSection,
      dataQuery.error,
      dataQuery.isLoading,
      dirty,
      doc,
      filter,
      groupTitles,
      missingFile,
      readOnly,
      reload,
      save,
      saving,
      schemaProgress,
      schemaQuery.data?.cached,
      schemaQuery.error,
      schemaQuery.isLoading,
      settingsMeta,
      updateEntry,
    ],
  );
}

export type ModSettingsApi = ReturnType<typeof useModSettings>;
