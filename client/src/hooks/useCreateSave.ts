import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import {
  fetchMapGenSchema,
  mapGenSchemaQueryKey,
} from '../lib/spaceAgeQuery';
import {
  applyPresetToUi,
  buildMapGenSettingsFromUi,
  buildMapSettingsFromUi,
  defaultMapGenUiState,
  mapSettingsDifferFromDefault,
  mapGenSettingsToUi,
} from '../lib/mapGen/buildSettings';
import {
  compositeAnnotatedMapPreviewBase64,
  downloadPngBase64,
  downloadPngDataUrl,
  mapPreviewFilename,
} from '../lib/mapGen/downloadPreview';
import type {
  MapPreviewAnnotationDrawOptions,
  MapPreviewAnnotations,
} from '../lib/mapGen/previewAnnotations';
import {
  MAP_PREVIEW_DOWNLOAD_DEFAULT,
  type MapPreviewDownloadSize,
} from '../lib/mapGen/previewSizes';
import {
  mapGenUiStateWithoutSeed,
  mapPresetRecordFromApi,
  parseUserPresetPickerValue,
  userPresetPickerValue,
  type MapGenUserPreset,
  type MapGenUserPresetApiRecord,
} from '../lib/mapGen/mapGenUserPresets';
import {
  buildMapPresetsFccFile,
  downloadFccFile,
  unwrapMapPresetsFromFile,
} from '../lib/fccFileFormat';
import { readFileAsText } from '../lib/modpackUtils';
import { pushSeedHistory, readSeedHistory } from '../lib/mapGen/seedHistory';
import { randomMapSeed } from '../lib/mapGen/sliderScale';
import { localizeCreateSaveError } from '../lib/saveUtils';
import type { MapGenUiState } from '../lib/mapGen/types';
import { MAP_GEN_PRESET_IDS } from '../lib/mapGen/types';

const PREVIEW_DEBOUNCE_MS = 400;

export type MapPresetImportCandidate = {
  key: string;
  name: string;
  state: Omit<MapGenUiState, 'seed'>;
  exists: boolean;
};

async function fetchMapPresetsFromApi(): Promise<MapGenUserPreset[]> {
  const r = await api<{ ok?: boolean; presets?: MapGenUserPresetApiRecord[]; error?: string }>(
    '/api/map-presets',
  );
  if (r?.ok === false) throw new Error(String(r.error || 'list_failed'));
  const rows = Array.isArray(r.presets) ? r.presets : [];
  return rows.map(mapPresetRecordFromApi);
}

function previewPayloadKey(
  mapGenUi: MapGenUiState,
  spaceAge: boolean,
  previewSize: number,
): string {
  const map_gen_settings = buildMapGenSettingsFromUi(mapGenUi, spaceAge);
  const seedRaw = String(mapGenUi.seed || '').trim();
  const seed = seedRaw ? Number.parseInt(seedRaw, 10) : undefined;
  return JSON.stringify({
    map_gen_settings,
    seed: Number.isFinite(seed) ? seed : null,
    preview_planet: mapGenUi.previewPlanet || 'nauvis',
    preview_size: previewSize,
  });
}

function buildPreviewRequestBody(
  mapGenUi: MapGenUiState,
  spaceAge: boolean,
  previewSize: number,
): Record<string, unknown> {
  const map_gen_settings = buildMapGenSettingsFromUi(mapGenUi, spaceAge);
  const seedRaw = String(mapGenUi.seed || '').trim();
  const seed = seedRaw ? Number.parseInt(seedRaw, 10) : undefined;
  const body: Record<string, unknown> = {
    map_gen_settings,
    preview_planet: mapGenUi.previewPlanet || 'nauvis',
    preview_size: previewSize,
    skip_map_settings: true,
  };
  if (seed != null && Number.isFinite(seed)) body.seed = seed;
  return body;
}

export function useCreateSave(
  instanceId: string,
  serverBusy: boolean,
  onCreated: () => Promise<void>,
  setSavesMsg: (text: string, isErr?: boolean) => void,
  t: (key: string, ...args: (string | number)[]) => string,
) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [exchangeString, setExchangeString] = useState('');
  const [mapGenUi, setMapGenUi] = useState<MapGenUiState>(() => defaultMapGenUiState(false));
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewRefining, setPreviewRefining] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const [downloadPreviewSize, setDownloadPreviewSize] =
    useState<MapPreviewDownloadSize>(MAP_PREVIEW_DOWNLOAD_DEFAULT);
  const [downloadPreviewLoading, setDownloadPreviewLoading] = useState(false);
  const [downloadPreviewError, setDownloadPreviewError] = useState('');
  const [downloadAnnotatedLoading, setDownloadAnnotatedLoading] = useState(false);
  const [downloadAnnotatedError, setDownloadAnnotatedError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [saveNameDialogOpen, setSaveNameDialogOpen] = useState(false);
  const [saveFileName, setSaveFileName] = useState('');
  const [saveNameError, setSaveNameError] = useState('');
  const [exchangeDialog, setExchangeDialog] = useState<'import' | 'export' | null>(null);
  const [exchangeDialogBusy, setExchangeDialogBusy] = useState(false);
  const [exchangeDialogError, setExchangeDialogError] = useState('');
  const [initialPreviewReady, setInitialPreviewReady] = useState(false);
  const [seedHistory, setSeedHistory] = useState<string[]>(() => readSeedHistory());
  const [userPresets, setUserPresets] = useState<MapGenUserPreset[]>([]);
  const [userPresetsLoading, setUserPresetsLoading] = useState(false);
  const [selectedPresetValue, setSelectedPresetValue] = useState<string>('default');
  const [savePresetDialogOpen, setSavePresetDialogOpen] = useState(false);
  const [savePresetName, setSavePresetName] = useState('');
  const [savePresetError, setSavePresetError] = useState('');
  const [presetImportOpen, setPresetImportOpen] = useState(false);
  const [presetImportCandidates, setPresetImportCandidates] = useState<MapPresetImportCandidate[]>([]);
  const [presetImportSelected, setPresetImportSelected] = useState<string[]>([]);
  const [presetImportError, setPresetImportError] = useState('');
  const [presetImportBusy, setPresetImportBusy] = useState(false);
  const [presetExportOpen, setPresetExportOpen] = useState(false);
  const [presetExportSelected, setPresetExportSelected] = useState<string[]>([]);
  const [presetExportError, setPresetExportError] = useState('');
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previewAbort = useRef<AbortController | null>(null);
  const previewSeq = useRef(0);
  const lastPreviewKey = useRef('');

  const schemaQuery = useQuery({
    queryKey: mapGenSchemaQueryKey(instanceId),
    queryFn: fetchMapGenSchema,
    enabled: open && !!instanceId,
    staleTime: 0,
  });

  const spaceAge = !!schemaQuery.data?.space_age;

  useEffect(() => {
    if (!open) return;
    setMapGenUi((prev) => {
      const fresh = defaultMapGenUiState(spaceAge);
      return { ...prev, planets: fresh.planets };
    });
  }, [open, spaceAge]);

  const openDialog = useCallback(async () => {
    if (serverBusy) {
      setSavesMsg(t('server_running_mutate_blocked'), true);
      return;
    }
    setExchangeString('');
    setPreviewUrl('');
    setPreviewLoading(true);
    setPreviewError('');
    setInitialPreviewReady(false);
    setError('');
    lastPreviewKey.current = '';

    let sa = false;
    if (instanceId) {
      try {
        const data = await qc.fetchQuery({
          queryKey: mapGenSchemaQueryKey(instanceId),
          queryFn: fetchMapGenSchema,
          staleTime: 0,
        });
        sa = !!data?.space_age;
      } catch {
        sa = false;
      }
    }
    setMapGenUi({ ...defaultMapGenUiState(sa), seed: randomMapSeed() });
    setSelectedPresetValue('default');
    setSeedHistory(readSeedHistory());
    setUserPresetsLoading(true);
    try {
      setUserPresets(await fetchMapPresetsFromApi());
    } catch {
      setUserPresets([]);
    } finally {
      setUserPresetsLoading(false);
    }
    setOpen(true);
  }, [instanceId, qc, serverBusy, setSavesMsg, t]);

  const closeDialog = useCallback(() => {
    if (submitting) return;
    setOpen(false);
    setSaveNameDialogOpen(false);
    setSaveFileName('');
    setSaveNameError('');
    setExchangeDialog(null);
    setExchangeDialogError('');
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewAbort.current?.abort();
    setPreviewLoading(false);
    setInitialPreviewReady(false);
  }, [submitting]);

  const markInitialPreviewReady = useCallback(() => {
    setInitialPreviewReady(true);
  }, []);

  const closeSaveNameDialog = useCallback(() => {
    if (submitting) return;
    setSaveNameDialogOpen(false);
    setSaveFileName('');
    setSaveNameError('');
  }, [submitting]);

  const openSaveNameDialog = useCallback(() => {
    setSaveNameError('');
    setSaveFileName('');
    setSaveNameDialogOpen(true);
  }, []);

  const closeExchangeDialog = useCallback(() => {
    if (exchangeDialogBusy) return;
    setExchangeDialog(null);
    setExchangeDialogError('');
  }, [exchangeDialogBusy]);

  const randomizeSeed = useCallback(() => {
    setMapGenUi((p) => ({ ...p, seed: randomMapSeed() }));
  }, []);

  const applySeed = useCallback((seed: string) => {
    const trimmed = String(seed || '').trim();
    if (!trimmed) return;
    setMapGenUi((p) => ({ ...p, seed: trimmed }));
  }, []);

  useEffect(() => {
    if (!open) return;
    const trimmed = String(mapGenUi.seed || '').trim();
    if (!trimmed || !/^\d+$/.test(trimmed)) return;
    setSeedHistory((current) => {
      const next = pushSeedHistory(trimmed);
      return JSON.stringify(current) === JSON.stringify(next) ? current : next;
    });
  }, [open, mapGenUi.seed]);

  const resetMapGenSettings = useCallback(() => {
    setMapGenUi((prev) => {
      const next = applyPresetToUi(prev, 'default');
      return next;
    });
    setSelectedPresetValue('default');
    lastPreviewKey.current = '';
  }, []);

  const setPreset = useCallback(
    (value: string) => {
      const userPresetId = parseUserPresetPickerValue(value);
      if (userPresetId) {
        const preset = userPresets.find((p) => p.id === userPresetId);
        if (!preset) return;
        setMapGenUi((prev) => ({
          ...preset.state,
          seed: prev.seed,
          previewPlanet: prev.previewPlanet,
        }));
        setSelectedPresetValue(value);
        lastPreviewKey.current = '';
        return;
      }
      setMapGenUi((prev) => applyPresetToUi(prev, value as (typeof MAP_GEN_PRESET_IDS)[number]));
      setSelectedPresetValue(value);
      lastPreviewKey.current = '';
    },
    [userPresets],
  );

  const openSavePresetDialog = useCallback(() => {
    setSavePresetError('');
    setSavePresetName('');
    setSavePresetDialogOpen(true);
  }, []);

  const closeSavePresetDialog = useCallback(() => {
    setSavePresetDialogOpen(false);
    setSavePresetName('');
    setSavePresetError('');
  }, []);

  const confirmSaveUserPreset = useCallback(async () => {
    const trimmed = String(savePresetName || '').trim();
    if (!trimmed) {
      setSavePresetError(t('map_gen_user_preset_name_required'));
      return;
    }
    try {
      const r = await api<{ ok?: boolean; preset?: MapGenUserPresetApiRecord; error?: string }>(
        '/api/map-presets',
        {
          method: 'POST',
          body: JSON.stringify({
            name: trimmed,
            state: mapGenUiStateWithoutSeed(mapGenUi),
          }),
        },
      );
      if (r?.ok === false) throw new Error(String(r.error || 'save_failed'));
      const created = r.preset ? mapPresetRecordFromApi(r.preset) : null;
      const next = await fetchMapPresetsFromApi();
      setUserPresets(next);
      if (created) setSelectedPresetValue(userPresetPickerValue(created.id));
      closeSavePresetDialog();
      setSavesMsg(t('map_gen_user_preset_saved'), false);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSavePresetError(
        msg === 'invalid_name' ? t('map_gen_user_preset_name_required') : localizeCreateSaveError(msg, t),
      );
    }
  }, [savePresetName, mapGenUi, closeSavePresetDialog, setSavesMsg, t]);

  const removeUserPreset = useCallback(
    async (id: string) => {
      try {
        const r = await api<{ ok?: boolean; error?: string }>(
          `/api/map-presets/${encodeURIComponent(id)}`,
          { method: 'DELETE' },
        );
        if (r?.ok === false) throw new Error(String(r.error || 'delete_failed'));
        const next = await fetchMapPresetsFromApi();
        setUserPresets(next);
        if (selectedPresetValue === userPresetPickerValue(id)) {
          setSelectedPresetValue('default');
        }
        setSavesMsg(t('map_gen_user_preset_deleted'), false);
      } catch (e) {
        setSavesMsg(localizeCreateSaveError(e instanceof Error ? e.message : String(e), t), true);
      }
    },
    [selectedPresetValue, setSavesMsg, t],
  );

  const existingPresetNamesLower = useCallback(() => {
    return new Set(userPresets.map((p) => p.name.trim().toLowerCase()));
  }, [userPresets]);

  const openPresetExportDialog = useCallback(() => {
    if (!userPresets.length) {
      setSavesMsg(t('map_gen_preset_export_empty'), true);
      return;
    }
    setPresetExportError('');
    setPresetExportSelected(userPresets.map((p) => p.id));
    setPresetExportOpen(true);
  }, [setSavesMsg, t, userPresets]);

  const closePresetExportDialog = useCallback(() => {
    setPresetExportOpen(false);
    setPresetExportError('');
  }, []);

  const togglePresetExportSelection = useCallback((id: string, checked: boolean) => {
    setPresetExportSelected((current) => {
      if (checked) return current.includes(id) ? current : [...current, id];
      return current.filter((value) => value !== id);
    });
  }, []);

  const confirmPresetExport = useCallback(() => {
    const selected = userPresets.filter((p) => presetExportSelected.includes(p.id));
    if (!selected.length) {
      setPresetExportError(t('map_gen_preset_pick_none'));
      return;
    }
    const envelope = buildMapPresetsFccFile(
      selected.map((preset) => ({
        name: preset.name,
        state: preset.state as Record<string, unknown>,
      })),
      t('map_gen_preset_export_collection_name'),
      t,
    );
    downloadFccFile(envelope);
    closePresetExportDialog();
    setSavesMsg(t('map_gen_preset_exported_count', selected.length), false);
  }, [closePresetExportDialog, presetExportSelected, setSavesMsg, t, userPresets]);

  const closePresetImportDialog = useCallback(() => {
    if (presetImportBusy) return;
    setPresetImportOpen(false);
    setPresetImportCandidates([]);
    setPresetImportSelected([]);
    setPresetImportError('');
  }, [presetImportBusy]);

  const togglePresetImportSelection = useCallback((key: string, checked: boolean) => {
    setPresetImportSelected((current) => {
      if (checked) return current.includes(key) ? current : [...current, key];
      return current.filter((value) => value !== key);
    });
  }, []);

  const handlePresetImportFile = useCallback(
    async (file: File) => {
      try {
        const text = await readFileAsText(file);
        const parsed = JSON.parse(text) as unknown;
        const entries = unwrapMapPresetsFromFile(parsed);
        if (!entries?.length) throw new Error('invalid_format');
        const existing = existingPresetNamesLower();
        const candidates: MapPresetImportCandidate[] = entries.map((entry, index) => {
          const name = entry.name.trim();
          const key = `${index}:${name.toLowerCase()}`;
          return {
            key,
            name,
            state: entry.state as Omit<MapGenUiState, 'seed'>,
            exists: existing.has(name.toLowerCase()),
          };
        });
        setPresetImportError('');
        setPresetImportCandidates(candidates);
        setPresetImportSelected(candidates.map((c) => c.key));
        setPresetImportOpen(true);
      } catch (e) {
        setSavesMsg(localizeCreateSaveError(e instanceof Error ? e.message : String(e), t), true);
      }
    },
    [existingPresetNamesLower, setSavesMsg, t],
  );

  const confirmPresetImport = useCallback(async () => {
    const selected = presetImportCandidates.filter((c) => presetImportSelected.includes(c.key));
    if (!selected.length) {
      setPresetImportError(t('map_gen_preset_pick_none'));
      return;
    }
    setPresetImportBusy(true);
    setPresetImportError('');
    try {
      const r = await api<{
        ok?: boolean;
        error?: string;
        imported_count?: number;
        skipped_count?: number;
        added?: MapGenUserPresetApiRecord[];
      }>('/api/map-presets/import-batch', {
        method: 'POST',
        body: JSON.stringify({
          presets: selected.map((item) => ({
            name: item.name,
            state: item.state,
          })),
        }),
      });
      if (r?.ok === false) throw new Error(String(r.error || 'import_failed'));
      const next = await fetchMapPresetsFromApi();
      setUserPresets(next);
      const imported = Number(r.imported_count || r.added?.length || 0);
      const skipped = Number(r.skipped_count || 0);
      closePresetImportDialog();
      if (imported > 0 && skipped > 0) {
        setSavesMsg(t('map_gen_preset_imported_partial', imported, skipped), false);
      } else if (imported > 0) {
        setSavesMsg(t('map_gen_preset_imported_count', imported), false);
      } else {
        setSavesMsg(t('map_gen_preset_imported_none', skipped), false);
      }
    } catch (e) {
      setPresetImportError(localizeCreateSaveError(e instanceof Error ? e.message : String(e), t));
    } finally {
      setPresetImportBusy(false);
    }
  }, [
    closePresetImportDialog,
    presetImportCandidates,
    presetImportSelected,
    setSavesMsg,
    t,
  ]);

  const schedulePreview = useCallback(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);

    const key = previewPayloadKey(mapGenUi, spaceAge, downloadPreviewSize);
    if (key === lastPreviewKey.current && previewUrl) {
      setPreviewLoading(false);
      return;
    }

    setPreviewLoading(true);
    setPreviewRefining(false);

    previewTimer.current = setTimeout(() => {
      void (async () => {
        previewAbort.current?.abort();
        const ac = new AbortController();
        previewAbort.current = ac;
        const seq = ++previewSeq.current;

        setPreviewError('');
        try {
          const r = await api<{
            ok?: boolean;
            error?: string;
            preview_png_base64?: string;
          }>('/api/server/map-gen/preview', {
            method: 'POST',
            body: JSON.stringify(buildPreviewRequestBody(mapGenUi, spaceAge, downloadPreviewSize)),
            signal: ac.signal,
          });
          if (ac.signal.aborted || seq !== previewSeq.current) return;
          if (r?.ok === false) {
            const err = String(r.error || '');
            if (err === 'preview_superseded') return;
            throw new Error(err || 'preview_failed');
          }
          const b64 = String(r.preview_png_base64 || '');
          if (b64) {
            setPreviewUrl(`data:image/png;base64,${b64}`);
            lastPreviewKey.current = key;
            setPreviewError('');
          }
        } catch (e) {
          if (ac.signal.aborted || seq !== previewSeq.current) return;
          const msg = e instanceof Error ? e.message : String(e);
          if (msg === 'preview_superseded') return;
          setPreviewError(msg);
        } finally {
          if (!ac.signal.aborted && seq === previewSeq.current) {
            setPreviewLoading(false);
            setPreviewRefining(false);
          }
        }
      })();
    }, PREVIEW_DEBOUNCE_MS);
  }, [mapGenUi, spaceAge, downloadPreviewSize, previewUrl]);

  useEffect(() => {
    if (!open) return;
    schedulePreview();
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [open, schedulePreview]);

  const applyExchangeImport = useCallback(async () => {
    setExchangeDialogError('');
    const raw = String(exchangeString || '').trim();
    if (!raw) {
      setExchangeDialogError(t('map_gen_exchange_empty'));
      return;
    }
    setExchangeDialogBusy(true);
    try {
      const r = await api<{
        ok?: boolean;
        error?: string;
        map_gen_settings?: Record<string, unknown>;
        map_settings?: Record<string, unknown> | null;
      }>('/api/server/map-gen/parse-exchange', {
        method: 'POST',
        body: JSON.stringify({ map_exchange_string: raw }),
      });
      if (r?.ok === false) throw new Error(String(r.error || 'parse_failed'));
      setMapGenUi(mapGenSettingsToUi(r.map_gen_settings || {}, r.map_settings, spaceAge));
      setSelectedPresetValue('default');
      lastPreviewKey.current = '';
      setExchangeDialog(null);
      setSavesMsg(t('map_gen_exchange_applied'), false);
    } catch (e) {
      setExchangeDialogError(e instanceof Error ? e.message : String(e));
    } finally {
      setExchangeDialogBusy(false);
    }
  }, [exchangeString, setSavesMsg, spaceAge, t]);

  const openExchangeImport = useCallback(() => {
    setExchangeDialogError('');
    setExchangeString('');
    setExchangeDialog('import');
  }, []);

  const openExchangeExport = useCallback(async () => {
    setExchangeDialogError('');
    setExchangeDialog('export');
    setExchangeDialogBusy(true);
    setExchangeString('');
    try {
      const map_gen_settings = buildMapGenSettingsFromUi(mapGenUi, spaceAge);
      const map_settings = mapSettingsDifferFromDefault(mapGenUi, spaceAge)
        ? buildMapSettingsFromUi(mapGenUi, spaceAge)
        : null;
      const r = await api<{
        ok?: boolean;
        error?: string;
        map_exchange_string?: string;
      }>('/api/server/map-gen/export-exchange', {
        method: 'POST',
        body: JSON.stringify({
          map_gen_settings,
          map_settings,
          space_age: spaceAge,
        }),
      });
      if (r?.ok === false) throw new Error(String(r.error || 'export_failed'));
      const out = String(r.map_exchange_string || '').trim();
      if (!out) throw new Error('export_empty');
      setExchangeString(out);
    } catch (e) {
      setExchangeDialogError(e instanceof Error ? e.message : String(e));
    } finally {
      setExchangeDialogBusy(false);
    }
  }, [mapGenUi, spaceAge]);

  const copyExchangeFromDialog = useCallback(async () => {
    const raw = String(exchangeString || '').trim();
    if (!raw) {
      setExchangeDialogError(t('map_gen_exchange_empty'));
      return;
    }
    try {
      await navigator.clipboard.writeText(raw);
      setSavesMsg(t('map_gen_exchange_exported'), false);
    } catch {
      setExchangeDialogError(t('map_gen_exchange_copy_failed'));
    }
  }, [exchangeString, setSavesMsg, t]);

  const confirmCreateSave = useCallback(async () => {
    const trimmed = String(saveFileName || '').trim();
    if (!trimmed) {
      setSaveNameError(t('create_save_prompt'));
      return;
    }
    setSubmitting(true);
    setSaveNameError('');
    setError('');
    try {
      const body: Record<string, unknown> = {
        name: trimmed,
        mode: 'custom',
        map_gen_settings: buildMapGenSettingsFromUi(mapGenUi, spaceAge),
      };
      if (mapSettingsDifferFromDefault(mapGenUi, spaceAge)) {
        body.map_settings = buildMapSettingsFromUi(mapGenUi, spaceAge);
      }
      const seedRaw = String(mapGenUi.seed || '').trim();
      if (seedRaw) body.seed = Number.parseInt(seedRaw, 10);
      const r = await api<{ ok?: boolean; error?: string }>('/api/server/create-save', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      if (r?.ok === false) throw new Error(String(r.error || 'create_save_failed'));
      setSaveNameDialogOpen(false);
      closeDialog();
      await onCreated();
      setSavesMsg(t('updated_successfully'), false);
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      setSaveNameError(localizeCreateSaveError(raw, t));
    } finally {
      setSubmitting(false);
    }
  }, [saveFileName, mapGenUi, spaceAge, closeDialog, onCreated, setSavesMsg, t]);

  const fetchPreviewBase64 = useCallback(async (): Promise<string> => {
    const key = previewPayloadKey(mapGenUi, spaceAge, downloadPreviewSize);
    if (previewUrl && key === lastPreviewKey.current) {
      const comma = previewUrl.indexOf(',');
      const cached = comma >= 0 ? previewUrl.slice(comma + 1) : previewUrl;
      if (cached) return cached;
    }

    const r = await api<{
      ok?: boolean;
      error?: string;
      preview_png_base64?: string;
    }>('/api/server/map-gen/preview', {
      method: 'POST',
      body: JSON.stringify(buildPreviewRequestBody(mapGenUi, spaceAge, downloadPreviewSize)),
    });
    if (r?.ok === false) throw new Error(String(r.error || 'preview_download_failed'));
    const b64 = String(r.preview_png_base64 || '');
    if (!b64) throw new Error('preview_download_empty');
    return b64;
  }, [mapGenUi, spaceAge, downloadPreviewSize, previewUrl]);

  const downloadPreview = useCallback(async () => {
    setDownloadPreviewError('');
    const planet = mapGenUi.previewPlanet || 'nauvis';
    const seedRaw = String(mapGenUi.seed || '').trim();
    const seed = seedRaw ? Number.parseInt(seedRaw, 10) : undefined;
    const filename = mapPreviewFilename(planet, seed, downloadPreviewSize);
    const key = previewPayloadKey(mapGenUi, spaceAge, downloadPreviewSize);

    if (previewUrl && key === lastPreviewKey.current) {
      downloadPngDataUrl(previewUrl, filename);
      return;
    }

    setDownloadPreviewLoading(true);
    try {
      const b64 = await fetchPreviewBase64();
      downloadPngBase64(b64, filename);
    } catch (e) {
      setDownloadPreviewError(e instanceof Error ? e.message : String(e));
    } finally {
      setDownloadPreviewLoading(false);
    }
  }, [mapGenUi, spaceAge, downloadPreviewSize, previewUrl, fetchPreviewBase64]);

  const downloadPreviewWithAnnotations = useCallback(
    async (
      annotations: MapPreviewAnnotations,
      drawOptions: MapPreviewAnnotationDrawOptions = {},
    ) => {
      setDownloadAnnotatedError('');
      const planet = mapGenUi.previewPlanet || 'nauvis';
      const seedRaw = String(mapGenUi.seed || '').trim();
      const seed = seedRaw ? Number.parseInt(seedRaw, 10) : undefined;
      const filename = mapPreviewFilename(planet, seed, downloadPreviewSize, true);

      setDownloadAnnotatedLoading(true);
      try {
        const b64 = await fetchPreviewBase64();
        const annotatedB64 = await compositeAnnotatedMapPreviewBase64(
          b64,
          annotations,
          drawOptions,
        );
        downloadPngBase64(annotatedB64, filename);
      } catch (e) {
        setDownloadAnnotatedError(e instanceof Error ? e.message : String(e));
      } finally {
        setDownloadAnnotatedLoading(false);
      }
    },
    [mapGenUi, downloadPreviewSize, fetchPreviewBase64],
  );

  return {
    open,
    openDialog,
    closeDialog,
    exchangeString,
    setExchangeString,
    mapGenUi,
    setMapGenUi,
    setPreset,
    resetMapGenSettings,
    randomizeSeed,
    applySeed,
    seedHistory,
    userPresets,
    userPresetsLoading,
    selectedPresetValue,
    savePresetDialogOpen,
    savePresetName,
    setSavePresetName,
    savePresetError,
    openSavePresetDialog,
    closeSavePresetDialog,
    confirmSaveUserPreset,
    removeUserPreset,
    presetImportOpen,
    presetImportCandidates,
    presetImportSelected,
    presetImportError,
    presetImportBusy,
    closePresetImportDialog,
    togglePresetImportSelection,
    handlePresetImportFile,
    confirmPresetImport,
    presetExportOpen,
    presetExportSelected,
    presetExportError,
    openPresetExportDialog,
    closePresetExportDialog,
    togglePresetExportSelection,
    confirmPresetExport,
    previewUrl,
    previewLoading,
    previewRefining,
    previewError,
    initialPreviewPending: !initialPreviewReady && !previewError,
    markInitialPreviewReady,
    downloadPreviewSize,
    setDownloadPreviewSize,
    downloadPreviewLoading,
    downloadPreviewError,
    downloadPreview,
    downloadAnnotatedLoading,
    downloadAnnotatedError,
    downloadPreviewWithAnnotations,
    exchangeDialog,
    exchangeDialogBusy,
    exchangeDialogError,
    openExchangeImport,
    openExchangeExport,
    closeExchangeDialog,
    applyExchangeImport,
    copyExchangeFromDialog,
    submitting,
    error,
    saveNameDialogOpen,
    saveFileName,
    setSaveFileName,
    saveNameError,
    openSaveNameDialog,
    closeSaveNameDialog,
    confirmCreateSave,
    presetIds: MAP_GEN_PRESET_IDS,
    spaceAge,
    schemaLoading: schemaQuery.isLoading,
    planets: schemaQuery.data?.planets || [],
  };
}

export type CreateSaveApi = ReturnType<typeof useCreateSave>;
