export interface PlayerStatRow {
  player?: string;
  sessions?: number;
  total_time?: string;
  current_session?: string;
  last_leave?: string;
  online?: boolean;
}

export interface OnlinePlayer {
  name?: string;
}

export interface ActiveBan {
  player?: string;
  username?: string;
  reason?: string;
  address?: string;
  ip?: string;
}

export interface OpsHistoryEvent {
  action?: string;
  date?: string;
  actor?: string;
  success?: boolean;
  error?: string;
  target?: string;
  changes?: { key: string; from: string; to: string }[];
  detail?: Record<string, unknown>;
}

export interface HistoryEvent {
  player?: string;
  action?: string;
  time?: string;
  date?: string;
  unban_date?: string;
  reason?: string;
  banned_by?: string;
  unbanned_by?: string;
  actor?: string;
  source?: string;
  sync_from?: string;
}

export interface PlayersSummary {
  ok?: boolean;
  player_stats_rows?: PlayerStatRow[];
  online?: OnlinePlayer[];
  admins?: string[];
  active_bans_available?: boolean;
  active_bans?: (ActiveBan | string)[];
  history?: HistoryEvent[];
  ban_history_tail?: HistoryEvent[];
  kick_history_tail?: HistoryEvent[];
  mute_history_tail?: HistoryEvent[];
  whitelist_history_tail?: HistoryEvent[];
  server_history_tail?: OpsHistoryEvent[];
  mods_history_tail?: OpsHistoryEvent[];
  commands_history_tail?: OpsHistoryEvent[];
  whitelist_players?: string[];
  whitelist_enabled?: boolean;
}
