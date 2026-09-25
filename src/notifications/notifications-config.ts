/** Types and interfaces for the notifications / integrations subsystem. */

/** Events that can trigger notifications. */
export type NotifEvent =
  | 'server_started'
  | 'server_stopped'
  | 'server_crash'
  | 'server_start_failed'
  | 'player_join'
  | 'player_leave'
  | 'chat_relay'
  | 'maintenance'
  | 'factorio_update_available'
  | 'low_ups'
  | 'moderation';

export const ALL_NOTIF_EVENTS: NotifEvent[] = [
  'server_started',
  'server_stopped',
  'server_crash',
  'server_start_failed',
  'player_join',
  'player_leave',
  'chat_relay',
  'maintenance',
  'factorio_update_available',
  'low_ups',
  'moderation',
];

/** One configured generic webhook target. */
export interface WebhookTarget {
  url: string;
  /** Optional Authorization header value (e.g. "Bearer token") */
  secret?: string;
  /** If present, only these events trigger this webhook. Absent = all enabled events. */
  events?: NotifEvent[];
  enabled?: boolean;
}

/** Global notification configuration (stored in DB, keyed by `notifications.*`). */
export interface GlobalNotifConfig {
  // Telegram
  telegram_enabled: boolean;
  telegram_bot_token: string;
  telegram_chat_id: string;

  // Generic webhooks (JSON-array of WebhookTarget stored as string)
  webhook_targets: string;

  // Server scope: 'all' = apply to all servers, 'selected' = only specified instances
  notif_instances_mode: 'all' | 'selected';
  /** JSON-array of instance IDs enabled when notif_instances_mode === 'selected' */
  notif_selected_instance_ids: string;

  // Event toggles
  notif_server_started: boolean;
  notif_server_stopped: boolean;
  notif_server_crash: boolean;
  notif_server_start_failed: boolean;
  notif_player_join: boolean;
  notif_player_leave: boolean;
  notif_chat_relay: boolean;
  notif_maintenance: boolean;
  notif_factorio_update_available: boolean;
  notif_low_ups: boolean;
  notif_low_ups_threshold: number;
  notif_moderation: boolean;
  /** JSON-array of NotifEvent sent silently without sound/vibration */
  notif_silent_events: string;
}

/** Per-instance override — partial, null fields fall back to global. */
export interface InstanceNotifOverride {
  /** Explicitly enable or disable notifications for this server (null = inherit from scope) */
  enabled?: boolean | null;

  telegram_chat_id?: string | null;
  webhook_targets?: string | null;
  notif_silent_events?: string | null;

  notif_server_started?: boolean | null;
  notif_server_stopped?: boolean | null;
  notif_server_crash?: boolean | null;
  notif_server_start_failed?: boolean | null;
  notif_player_join?: boolean | null;
  notif_player_leave?: boolean | null;
  notif_chat_relay?: boolean | null;
  notif_maintenance?: boolean | null;
  notif_factorio_update_available?: boolean | null;
  notif_low_ups?: boolean | null;
  notif_low_ups_threshold?: number | null;
  notif_moderation?: boolean | null;
}

/** Resolved config for a specific instance (global merged with override). */
export interface ResolvedNotifConfig {
  /** Whether notifications are active for this server */
  enabled: boolean;

  telegram_enabled: boolean;
  telegram_bot_token: string;
  telegram_chat_id: string;
  webhook_targets: WebhookTarget[];
  notif_silent_events: NotifEvent[];

  notif_server_started: boolean;
  notif_server_stopped: boolean;
  notif_server_crash: boolean;
  notif_server_start_failed: boolean;
  notif_player_join: boolean;
  notif_player_leave: boolean;
  notif_chat_relay: boolean;
  notif_maintenance: boolean;
  notif_factorio_update_available: boolean;
  notif_low_ups: boolean;
  notif_low_ups_threshold: number;
  notif_moderation: boolean;
}

export function parseSilentEvents(raw: string): NotifEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[]).filter(
      (e): e is NotifEvent =>
        typeof e === 'string' && (ALL_NOTIF_EVENTS as string[]).includes(e),
    );
  } catch {
    return [];
  }
}

export function parseWebhookTargets(raw: string): WebhookTarget[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as unknown[]).filter(
      (t): t is WebhookTarget =>
        !!t &&
        typeof t === 'object' &&
        typeof (t as Record<string, unknown>).url === 'string' &&
        !!(t as Record<string, unknown>).url,
    );
  } catch {
    return [];
  }
}

export function mergeNotifConfig(
  global: GlobalNotifConfig,
  override: InstanceNotifOverride | null,
  instanceId?: string,
): ResolvedNotifConfig {
  const o = override ?? {};

  // Scope check: 'all' vs 'selected'
  let enabled = true;
  const mode = global.notif_instances_mode || 'all';
  if (mode === 'selected' && instanceId) {
    try {
      const selected = JSON.parse(global.notif_selected_instance_ids || '[]');
      if (Array.isArray(selected) && !selected.includes(instanceId)) {
        enabled = false;
      }
    } catch {
      enabled = false;
    }
  }

  // Override can explicitly enable or disable this instance
  if (o.enabled !== undefined && o.enabled !== null) {
    enabled = Boolean(o.enabled);
  }

  const resolveStr = (
    key: keyof Pick<GlobalNotifConfig, 'telegram_chat_id' | 'webhook_targets'>,
  ): string => {
    const v = (o as Record<string, unknown>)[key];
    return v !== null && v !== undefined
      ? String(v)
      : String(global[key] ?? '');
  };

  const resolveBool = (
    key: keyof Pick<
      GlobalNotifConfig,
      | 'notif_server_started'
      | 'notif_server_stopped'
      | 'notif_server_crash'
      | 'notif_server_start_failed'
      | 'notif_player_join'
      | 'notif_player_leave'
      | 'notif_chat_relay'
      | 'notif_maintenance'
      | 'notif_factorio_update_available'
      | 'notif_low_ups'
      | 'notif_moderation'
    >,
  ): boolean => {
    const v = (o as Record<string, unknown>)[key];
    if (v !== null && v !== undefined) return Boolean(v);
    return Boolean(global[key]);
  };

  const resolveNum = (
    key: keyof Pick<GlobalNotifConfig, 'notif_low_ups_threshold'>,
    defaultVal: number,
  ): number => {
    const v = (o as Record<string, unknown>)[key];
    if (v !== null && v !== undefined && !isNaN(Number(v))) return Number(v);
    const g = global[key];
    if (g !== null && g !== undefined && !isNaN(Number(g))) return Number(g);
    return defaultVal;
  };

  const webhookRaw =
    o.webhook_targets !== null && o.webhook_targets !== undefined
      ? String(o.webhook_targets)
      : String(global.webhook_targets ?? '');

  const silentRaw =
    o.notif_silent_events !== null && o.notif_silent_events !== undefined
      ? String(o.notif_silent_events)
      : String(global.notif_silent_events ?? '[]');

  return {
    enabled,
    telegram_enabled: Boolean(global.telegram_enabled),
    telegram_bot_token: String(global.telegram_bot_token ?? ''),
    telegram_chat_id: resolveStr('telegram_chat_id'),
    webhook_targets: parseWebhookTargets(webhookRaw),
    notif_silent_events: parseSilentEvents(silentRaw),

    notif_server_started: resolveBool('notif_server_started'),
    notif_server_stopped: resolveBool('notif_server_stopped'),
    notif_server_crash: resolveBool('notif_server_crash'),
    notif_server_start_failed: resolveBool('notif_server_start_failed'),
    notif_player_join: resolveBool('notif_player_join'),
    notif_player_leave: resolveBool('notif_player_leave'),
    notif_chat_relay: resolveBool('notif_chat_relay'),
    notif_maintenance: resolveBool('notif_maintenance'),
    notif_factorio_update_available: resolveBool(
      'notif_factorio_update_available',
    ),
    notif_low_ups: resolveBool('notif_low_ups'),
    notif_low_ups_threshold: resolveNum('notif_low_ups_threshold', 55),
    notif_moderation: resolveBool('notif_moderation'),
  };
}
