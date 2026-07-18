import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api/client';
import { getLocalLanguageOverride } from '../i18n/locale';
import { feedbackMsg } from '../lib/apiFeedback';
import {
  buildCommandText,
  defaultCommandParams,
  flattenCommands,
  groupCommandsByCategory,
} from '../lib/commandUtils';
import { resolveStatusKind, type PanelStatus } from '../types/panel';

export function useCommands(
  enabled: boolean,
  status: PanelStatus | null | undefined,
  t: (key: string, ...args: (string | number)[]) => string,
) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [params, setParams] = useState<Record<string, string>>({});
  const [quiet, setQuiet] = useState(true);
  const [preview, setPreview] = useState('');
  const previewDirtyRef = useRef(false);

  const commandsTitle = t('commands_btn');
  const running = resolveStatusKind(status) === 'running';

  const uiLang = getLocalLanguageOverride();

  const catalogQuery = useQuery({
    queryKey: ['commands', 'catalog', uiLang],
    queryFn: async () => {
      const j = await api<unknown>('/api/commands/catalog');
      return flattenCommands(j);
    },
    enabled,
    staleTime: 30_000,
  });

  const playersQuery = useQuery({
    queryKey: ['players', 'online-names'],
    queryFn: async () => {
      const j = await api<{ online?: { name?: string }[]; players?: { name?: string }[] }>('/api/players/summary');
      const list = j.online || j.players || [];
      return list.map((p) => String(p?.name || '').trim()).filter(Boolean);
    },
    enabled: enabled && running,
    staleTime: 15_000,
  });

  const onlinePlayers = useMemo(() => playersQuery.data ?? [], [playersQuery.data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = catalogQuery.data || [];
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.category_name.toLowerCase().includes(q),
    );
  }, [catalogQuery.data, search]);

  const grouped = useMemo(() => groupCommandsByCategory(filtered), [filtered]);

  const selected = useMemo(() => {
    if (!filtered.length) return null;
    if (selectedId) {
      const found = filtered.find((x) => x.id === selectedId);
      if (found) return found;
    }
    return filtered[0] || null;
  }, [filtered, selectedId]);

  useEffect(() => {
    if (!filtered.length) {
      if (selectedId) setSelectedId('');
      return;
    }
    if (!filtered.some((x) => x.id === selectedId)) {
      setSelectedId(filtered[0].id);
    }
  }, [filtered, selectedId]);

  const selectedCommandId = selected?.id || '';
  const onlinePlayersKey = onlinePlayers.join('\0');
  const filteredRef = useRef(filtered);
  const onlinePlayersRef = useRef(onlinePlayers);
  filteredRef.current = filtered;
  onlinePlayersRef.current = onlinePlayers;

  useEffect(() => {
    previewDirtyRef.current = false;
  }, [selectedCommandId]);

  useEffect(() => {
    const rows = filteredRef.current;
    const row =
      (selectedCommandId ? rows.find((entry) => entry.id === selectedCommandId) : null) || rows[0] || null;
    if (!row) {
      setParams((prev) => (Object.keys(prev).length ? {} : prev));
      setPreview((prev) => (prev ? '' : prev));
      return;
    }
    const nextParams = defaultCommandParams(row, onlinePlayersRef.current);
    setParams(nextParams);
    setPreview(buildCommandText(row, nextParams));
  }, [selectedCommandId, onlinePlayersKey]);

  useEffect(() => {
    if (!selected || previewDirtyRef.current) return;
    setPreview(buildCommandText(selected, params));
  }, [selected?.id, params, selected]);

  const setParam = useCallback((key: string, value: string) => {
    setParams((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setPreviewText = useCallback((value: string) => {
    previewDirtyRef.current = true;
    setPreview(value);
  }, []);

  const execute = useCallback(async () => {
    if (!running) {
      feedbackMsg(commandsTitle, t('server_not_running_msg'), true);
      return;
    }
    let text = preview.trim();
    if (!text) return;
    if (quiet) {
      if (!/^\/sc\b/i.test(text) && /^\/c\b/i.test(text)) {
        text = text.replace(/^\/c\b/i, '/sc');
      }
    }
    try {
      const r = await api<{ ok?: boolean; error?: string; response?: string; output?: string }>('/api/rcon', {
        method: 'POST',
        body: JSON.stringify({
          command: text,
          source: 'commands_tab',
          command_id: selected?.id,
          command_name: selected?.name,
        }),
      });
      void qc.invalidateQueries({ queryKey: ['players'] });
      if (r?.ok === false) {
        feedbackMsg(commandsTitle, `${t('error_title')}: ${r.error || 'rcon_failed'}`, true);
      } else {
        feedbackMsg(
          commandsTitle,
          r.response || r.output || t('cmd_execute_done_named', selected?.name || t('default_command_name')),
        );
      }
    } catch (e) {
      feedbackMsg(commandsTitle, e instanceof Error ? e.message : String(e), true, false, t);
    }
  }, [running, preview, quiet, selected, commandsTitle, t, qc]);

  const handleError = useCallback(
    (e: unknown) => {
      const text = e instanceof Error ? e.message : String(e);
      feedbackMsg(commandsTitle, text, true, false, t);
    },
    [commandsTitle, t],
  );

  return {
    search,
    setSearch,
    grouped,
    selected,
    selectedId,
    setSelectedId,
    params,
    setParam,
    preview,
    setPreview: setPreviewText,
    quiet,
    setQuiet,
    running,
    loading: catalogQuery.isLoading,
    reload: () => catalogQuery.refetch(),
    execute,
    handleError,
    onlinePlayers,
  };
}

export type CommandsApi = ReturnType<typeof useCommands>;
