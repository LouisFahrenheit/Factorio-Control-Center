import {
  mergeNotifConfig,
  parseWebhookTargets,
  parseSilentEvents,
  GlobalNotifConfig,
  InstanceNotifOverride,
} from './notifications-config';

describe('NotificationsConfig', () => {
  const defaultGlobal: GlobalNotifConfig = {
    telegram_enabled: true,
    telegram_bot_token: 'global-tg-token',
    telegram_chat_id: '-100999999',
    webhook_targets: JSON.stringify([
      { url: 'https://example.com/hook1', enabled: true },
    ]),
    notif_instances_mode: 'all',
    notif_selected_instance_ids: '[]',
    notif_server_started: true,
    notif_server_stopped: true,
    notif_server_crash: true,
    notif_server_start_failed: true,
    notif_player_join: true,
    notif_player_leave: true,
    notif_chat_relay: false,
    notif_maintenance: true,
    notif_factorio_update_available: true,
    notif_low_ups: true,
    notif_low_ups_threshold: 55,
    notif_moderation: true,
    notif_silent_events: '[]',
  };

  describe('parseSilentEvents', () => {
    it('returns empty array on empty or invalid string', () => {
      expect(parseSilentEvents('')).toEqual([]);
      expect(parseSilentEvents('not json')).toEqual([]);
      expect(parseSilentEvents('{"not": "an array"}')).toEqual([]);
    });

    it('filters out invalid events', () => {
      const input = JSON.stringify([
        'player_join',
        'invalid_event',
        123,
        'player_leave',
      ]);
      const res = parseSilentEvents(input);
      expect(res).toEqual(['player_join', 'player_leave']);
    });
  });

  describe('parseWebhookTargets', () => {
    it('returns empty array on empty or invalid string', () => {
      expect(parseWebhookTargets('')).toEqual([]);
      expect(parseWebhookTargets('not json')).toEqual([]);
      expect(parseWebhookTargets('{"not": "an array"}')).toEqual([]);
    });

    it('filters out invalid targets', () => {
      const input = JSON.stringify([
        { url: 'https://valid.com', secret: 'abc' },
        { url: '' },
        null,
        123,
        { missingUrl: true },
      ]);
      const res = parseWebhookTargets(input);
      expect(res).toHaveLength(1);
      expect(res[0].url).toBe('https://valid.com');
      expect(res[0].secret).toBe('abc');
    });
  });

  describe('mergeNotifConfig', () => {
    it('returns global settings when override is null or empty', () => {
      const merged = mergeNotifConfig(defaultGlobal, null);
      expect(merged.telegram_chat_id).toBe('-100999999');
      expect(merged.telegram_bot_token).toBe('global-tg-token');
      expect(merged.notif_server_started).toBe(true);
      expect(merged.notif_chat_relay).toBe(false);
      expect(merged.webhook_targets).toHaveLength(1);
      expect(merged.notif_silent_events).toEqual([]);
      expect(merged.enabled).toBe(true);
    });

    it('overrides specified fields while preserving global defaults', () => {
      const override: InstanceNotifOverride = {
        notif_chat_relay: true,
        notif_server_stopped: false,
        telegram_chat_id: '-100111111',
        notif_silent_events: JSON.stringify(['player_join', 'player_leave']),
      };

      const merged = mergeNotifConfig(defaultGlobal, override);
      expect(merged.telegram_chat_id).toBe('-100111111');
      expect(merged.notif_chat_relay).toBe(true);
      expect(merged.notif_server_stopped).toBe(false);
      expect(merged.notif_server_started).toBe(true);
      expect(merged.notif_silent_events).toEqual(['player_join', 'player_leave']);
      // Global token should not be overridable by instance
      expect(merged.telegram_bot_token).toBe('global-tg-token');
    });

    it('handles selected instances scope filtering', () => {
      const selectedScopeGlobal: GlobalNotifConfig = {
        ...defaultGlobal,
        notif_instances_mode: 'selected',
        notif_selected_instance_ids: JSON.stringify(['inst-1', 'inst-2']),
      };

      // inst-1 is in the selected list
      const merged1 = mergeNotifConfig(selectedScopeGlobal, null, 'inst-1');
      expect(merged1.enabled).toBe(true);

      // inst-3 is NOT in the selected list
      const merged3 = mergeNotifConfig(selectedScopeGlobal, null, 'inst-3');
      expect(merged3.enabled).toBe(false);

      // inst-3 with explicit override enabled: true overrides scope
      const mergedOverride = mergeNotifConfig(
        selectedScopeGlobal,
        { enabled: true },
        'inst-3',
      );
      expect(mergedOverride.enabled).toBe(true);

      // inst-1 with explicit override enabled: false overrides scope
      const mergedDisabled = mergeNotifConfig(
        selectedScopeGlobal,
        { enabled: false },
        'inst-1',
      );
      expect(mergedDisabled.enabled).toBe(false);
    });
  });
});
