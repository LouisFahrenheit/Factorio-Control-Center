import { useCallback, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { modals } from '@mantine/modals';
import { api } from '../api/client';
import { canEditServerAdminList } from '../lib/permissions';
import {
  localizeBanApiError,
  localizePlayersChatApiError,
} from '../lib/playerUtils';
import { isNetworkFetchError, notifyNetworkFetchError } from '../lib/networkErrors';
import { notifyErr, notifyWarn } from '../lib/notify';
import type { AuthUser } from '../types/instance';
import type { PlayersSummary } from '../types/players';

export function usePlayers(
  enabled: boolean,
  user: AuthUser | null | undefined,
  t: (key: string, ...args: (string | number)[]) => string,
  options?: { historyOnly?: boolean },
) {
  const qc = useQueryClient();
  const historyOnly = options?.historyOnly === true;
  const [moderationPlayer, setModerationPlayer] = useState('');
  const [moderationPlayerBlink, setModerationPlayerBlink] = useState(false);
  const [moderationReason, setModerationReason] = useState('');
  const [whitelistPlayer, setWhitelistPlayer] = useState('');
  const [chatMessage, setChatMessage] = useState('');
  const [adminNew, setAdminNew] = useState('');

  const canEditAdmins = canEditServerAdminList(user);

  const accessPollMs = enabled && !historyOnly ? 2000 : false;

  const summaryQuery = useQuery({
    queryKey: ['players', 'summary'],
    queryFn: () => api<PlayersSummary>('/api/players/summary'),
    enabled,
    refetchInterval: accessPollMs ?? (enabled ? 3000 : false),
    refetchIntervalInBackground: true,
  });

  const chatQuery = useQuery({
    queryKey: ['players', 'chat'],
    queryFn: () => api<{ lines?: string[] }>('/api/chat-log?tail=500'),
    enabled: enabled && !historyOnly,
    refetchInterval: accessPollMs,
    refetchIntervalInBackground: true,
  });

  const summary = summaryQuery.data;
  const admins = (summary?.admins ?? []).map((x) => String(x));

  const playersTitle = t('players_btn');

  useEffect(() => {
    if (!enabled || !chatQuery.isError) return;
    notifyNetworkFetchError(playersTitle, chatQuery.error, t);
  }, [enabled, chatQuery.isError, chatQuery.error, playersTitle, t]);

  const chatText = chatQuery.isError
    ? isNetworkFetchError(chatQuery.error)
      ? ''
      : t(
          'chat_log_reload_failed',
          chatQuery.error instanceof Error ? chatQuery.error.message : String(chatQuery.error),
        )
    : (chatQuery.data?.lines || []).join('\n');

  const reload = useCallback(async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['players'] }),
      qc.invalidateQueries({ queryKey: ['panel', 'status'] }),
    ]);
  }, [qc]);

  const handleModError = useCallback(
    (e: unknown) => {
      if (notifyNetworkFetchError(playersTitle, e, t)) return;
      const raw = e instanceof Error ? e.message : String(e);
      notifyErr(playersTitle, localizeBanApiError(raw, t));
    },
    [playersTitle, t],
  );

  const blinkModerationPlayer = useCallback(() => {
    setModerationPlayerBlink(false);
    requestAnimationFrame(() => {
      setModerationPlayerBlink(true);
      document.getElementById('moderationPlayer')?.focus();
    });
    window.setTimeout(() => setModerationPlayerBlink(false), 1200);
  }, []);

  useEffect(() => {
    if (moderationPlayer.trim()) setModerationPlayerBlink(false);
  }, [moderationPlayer]);

  const moderation = useCallback(
    async (endpoint: string, body: Record<string, unknown>, clearFields = true) => {
      try {
        await api(endpoint, { method: 'POST', body: JSON.stringify(body) });
        if (clearFields) {
          setModerationPlayer('');
          setModerationReason('');
        }
        await reload();
      } catch (e) {
        handleModError(e);
      }
    },
    [handleModError, reload],
  );

  const kick = useCallback(() => {
    const player = moderationPlayer.trim();
    if (!player) {
      blinkModerationPlayer();
      return;
    }
    void moderation('/api/moderation/kick', { player, reason: moderationReason.trim() });
  }, [blinkModerationPlayer, moderation, moderationPlayer, moderationReason]);

  const ban = useCallback(() => {
    const player = moderationPlayer.trim();
    if (!player) {
      blinkModerationPlayer();
      return;
    }
    void moderation('/api/bans/ban', { player, reason: moderationReason.trim() });
  }, [blinkModerationPlayer, moderation, moderationPlayer, moderationReason]);

  const unban = useCallback(() => {
    const player = moderationPlayer.trim();
    if (!player) {
      blinkModerationPlayer();
      return;
    }
    void moderation('/api/bans/unban', { player }, true);
  }, [blinkModerationPlayer, moderation, moderationPlayer]);

  const mute = useCallback(() => {
    const player = moderationPlayer.trim();
    if (!player) {
      blinkModerationPlayer();
      return;
    }
    void moderation('/api/moderation/mute', { player }, false);
  }, [blinkModerationPlayer, moderation, moderationPlayer]);

  const unmute = useCallback(() => {
    const player = moderationPlayer.trim();
    if (!player) {
      blinkModerationPlayer();
      return;
    }
    void moderation('/api/moderation/unmute', { player }, false);
  }, [blinkModerationPlayer, moderation, moderationPlayer]);

  const purge = useCallback(() => {
    const player = moderationPlayer.trim();
    if (!player) {
      blinkModerationPlayer();
      return;
    }
    void moderation('/api/moderation/purge', { player }, false);
  }, [blinkModerationPlayer, moderation, moderationPlayer]);

  const sendChat = useCallback(async () => {
    const message = chatMessage.trim();
    if (!message) return;
    try {
      const r = await api<{ ok?: boolean; error?: string }>('/api/chat/send', {
        method: 'POST',
        body: JSON.stringify({ message }),
      });
      if (r?.ok === false) throw new Error(String(r.error || 'send_failed'));
      setChatMessage('');
      await qc.invalidateQueries({ queryKey: ['players', 'chat'] });
    } catch (e) {
      const raw = e instanceof Error ? e.message : String(e);
      notifyErr(t('players_send_message_btn'), localizePlayersChatApiError(raw, t));
    }
  }, [chatMessage, qc, t]);

  const whitelistAdd = useCallback(async () => {
    const player = whitelistPlayer.trim();
    if (!player) return;
    try {
      const r = await api<{ needs_restart?: boolean }>('/api/whitelist/add', {
        method: 'POST',
        body: JSON.stringify({ player }),
      });
      setWhitelistPlayer('');
      if (r?.needs_restart) notifyWarn(t('whitelist_tab'), t('whitelist_restart_required'));
      await reload();
    } catch (e) {
      handleModError(e);
    }
  }, [handleModError, reload, t, whitelistPlayer]);

  const whitelistRemove = useCallback(
    async (player: string) => {
      const pn = String(player || '').trim();
      if (!pn) return;
      try {
        const r = await api<{ needs_restart?: boolean }>('/api/whitelist/remove', {
          method: 'POST',
          body: JSON.stringify({ player: pn }),
        });
        if (r?.needs_restart) notifyWarn(t('whitelist_tab'), t('whitelist_restart_required'));
        await reload();
      } catch (e) {
        handleModError(e);
      }
    },
    [handleModError, reload, t],
  );

  const whitelistClear = useCallback(async () => {
    modals.openConfirmModal({
      title: t('whitelist_clear_confirm_title'),
      children: t('whitelist_clear_confirm_message'),
      labels: { confirm: t('ok'), cancel: t('cancel') },
      confirmProps: { className: 'btn btn--danger' },
      onConfirm: async () => {
        try {
          const r = await api<{ needs_restart?: boolean }>('/api/whitelist/clear', {
            method: 'POST',
            body: JSON.stringify({}),
          });
          if (r?.needs_restart) notifyWarn(t('whitelist_tab'), t('whitelist_restart_required'));
          await reload();
        } catch (e) {
          handleModError(e);
        }
      },
    });
  }, [handleModError, reload, t]);

  const commitAdmins = useCallback(
    async (next: string[], previous: string[]) => {
      qc.setQueryData(['players', 'summary'], (old: PlayersSummary | undefined) =>
        old ? { ...old, admins: next } : old,
      );
      try {
        await api('/api/files/admin-list', { method: 'PUT', body: JSON.stringify(next) });
        await qc.invalidateQueries({ queryKey: ['players', 'summary'] });
      } catch (e) {
        qc.setQueryData(['players', 'summary'], (old: PlayersSummary | undefined) =>
          old ? { ...old, admins: previous } : old,
        );
        handleModError(e);
      }
    },
    [handleModError, qc],
  );

  const addAdmin = useCallback(() => {
    if (!canEditAdmins) return;
    const v = adminNew.trim();
    if (!v || admins.includes(v)) return;
    setAdminNew('');
    const previous = admins.slice();
    const next = [...admins, v];
    void commitAdmins(next, previous);
  }, [adminNew, admins, canEditAdmins, commitAdmins]);

  const removeAdmin = useCallback(
    (name: string) => {
      if (!canEditAdmins) return;
      const previous = admins.slice();
      const next = admins.filter((n) => n !== name);
      void commitAdmins(next, previous);
    },
    [admins, canEditAdmins, commitAdmins],
  );

  return {
    summary,
    loading: summaryQuery.isLoading,
    chatText,
    admins,
    canEditAdmins,
    moderationPlayer,
    moderationPlayerBlink,
    setModerationPlayer,
    moderationReason,
    setModerationReason,
    whitelistPlayer,
    setWhitelistPlayer,
    chatMessage,
    setChatMessage,
    adminNew,
    setAdminNew,
    kick,
    ban,
    unban,
    mute,
    unmute,
    purge,
    sendChat,
    whitelistAdd,
    whitelistRemove,
    whitelistClear,
    addAdmin,
    removeAdmin,
    reload,
  };
}

export type PlayersApi = ReturnType<typeof usePlayers>;
