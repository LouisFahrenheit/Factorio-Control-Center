import type { ActiveBan, HistoryEvent } from '../types/players';
import { formatPanelActorName } from './actorUtils';
import { formatPanelDateTime } from './datetimeUtils';

export function localizeBanApiError(err: string, t: (k: string) => string): string {
  const k = String(err || '').trim();
  if (!k) return '';
  if (k === 'invalid_ban_player') return t('web_ban_invalid_input');
  if (/^\{.*"detail"\s*:\s*"invalid_ban_player".*\}$/i.test(k)) return t('web_ban_invalid_input');
  return k;
}

export function localizePlayersChatApiError(err: string, t: (k: string) => string): string {
  const k = String(err || '').trim();
  if (!k) return '';
  if (k === 'commands_not_allowed') return t('players_send_message_no_commands');
  if (/^\{.*"detail"\s*:\s*"commands_not_allowed".*\}$/i.test(k)) return t('players_send_message_no_commands');
  if (k === 'message_too_long') return t('players_send_message_too_long');
  if (/^\{.*"detail"\s*:\s*"message_too_long".*\}$/i.test(k)) return t('players_send_message_too_long');
  return k;
}

export function parseActiveBan(b: ActiveBan | string): { player: string; reason: string; ip: string } {
  if (b && typeof b === 'object') {
    return {
      player: String(b.player || b.username || '').trim(),
      reason: String(b.reason || '').trim(),
      ip: String(b.address || b.ip || '').trim(),
    };
  }
  return { player: String(b || '').trim(), reason: '', ip: '' };
}

function looksLikeActor(s: string): boolean {
  return /^web(?::|\b)|^server manager\b|^admin\b/i.test(String(s || '').trim());
}

export function formatBanHistoryRow(ev: HistoryEvent, t: (k: string) => string) {
  const action = String(ev.action || '').toUpperCase();
  const actionLabel = ev.action || '';
  const rawBanDate = action === 'UNBAN' ? ev.unban_date || '' : ev.date || '';
  const actionDate = formatPanelDateTime(String(rawBanDate).replace(/^\[(.+)\]$/, '$1'), '');
  const actionClass = action === 'UNBAN' ? 'cell-online' : action === 'BAN' ? 'cell-offline' : '';
  let reasonVal = String(ev.reason || '');
  let actorVal =
    action === 'UNBAN'
      ? String(ev.unbanned_by || ev.banned_by || '')
      : String(ev.banned_by || '');
  if (looksLikeActor(reasonVal) && !looksLikeActor(actorVal)) {
    [reasonVal, actorVal] = [actorVal, reasonVal];
  }
  actorVal = formatPanelActorName(actorVal, t);
  if (String(ev.source || '') === 'instance_sync') {
    const fromName = String(ev.sync_from || '').trim();
    const syncLabel = fromName || t('ban_history_source_instance_sync');
    actorVal = actorVal ? `${actorVal} (${syncLabel})` : `(${syncLabel})`;
  }
  return { actionLabel, actionClass, reasonVal, actorVal, actionDate };
}

export function formatWhitelistHistoryRow(ev: HistoryEvent, t: (k: string) => string) {
  const rawAct = String(ev.action || '').toUpperCase();
  let actionLabel = String(ev.action || '');
  let actionClass = '';
  if (rawAct === 'WHITELIST_ADD') {
    actionLabel = t('whitelist_action_add');
    actionClass = 'cell-online';
  } else if (rawAct === 'WHITELIST_REMOVE') {
    actionLabel = t('whitelist_action_remove');
    actionClass = 'cell-offline';
  } else if (rawAct === 'WHITELIST_CLEAR') {
    actionLabel = t('whitelist_action_clear');
    actionClass = 'cell-offline';
  }
  const playerCell =
    String(ev.player || '').trim() === '*' ? t('whitelist_history_all_players') : String(ev.player || '');
  let actorVal = formatPanelActorName(ev.actor, t);
  if (String(ev.source || '') === 'instance_sync') {
    const fromName = String(ev.sync_from || '').trim();
    const syncLabel = fromName || t('ban_history_source_instance_sync');
    actorVal = actorVal ? `${actorVal} (${syncLabel})` : `(${syncLabel})`;
  }
  const date = formatPanelDateTime(String(ev.date || '').replace(/^\[(.+)\]$/, '$1'), '');
  return { actionLabel, actionClass, playerCell, actorVal, date };
}
