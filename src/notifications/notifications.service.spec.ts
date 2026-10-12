import { NotificationsService } from './notifications.service';
import type { FccConfigService } from '../config/fcc-config.service';
import type { InstancesService } from '../instances/instances.service';
import type { TelegramService } from './telegram.service';
import type { WebhookService } from './webhook.service';
import type { PathsService } from '../config/paths.service';
import type { InstanceItem } from '../common/types';

describe('NotificationsService - sendTest', () => {
  let mockConfig: Partial<FccConfigService>;
  let mockInstances: Partial<InstancesService>;
  let mockTelegram: Partial<TelegramService>;
  let mockWebhooks: Partial<WebhookService>;
  let mockPaths: Partial<PathsService>;
  let service: NotificationsService;

  beforeEach(() => {
    mockConfig = {
      notifications: {
        telegram_enabled: true,
        telegram_bot_token: 'bot-token',
        telegram_chat_id: 'chat-id-123',
        webhook_targets: JSON.stringify([
          { url: 'https://example.com/webhook', enabled: true },
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
      },
    } as unknown as FccConfigService;

    mockInstances = {
      getById: (id: string) => {
        if (id === 'inst-1') {
          return {
            id: 'inst-1',
            name: 'Server 1',
          } as unknown as InstanceItem;
        }
        return undefined;
      },
    };

    mockTelegram = {
      sendMessage: jest.fn().mockResolvedValue(undefined),
      fmtTest: jest.fn().mockReturnValue('Test telegram message'),
    };

    mockWebhooks = {
      dispatch: jest.fn().mockResolvedValue(undefined),
    };

    mockPaths = {
      dataDir: 'fake-data-dir',
      notificationsStatePath: 'fake-path',
    };

    service = new NotificationsService(
      mockConfig as FccConfigService,
      mockInstances as InstancesService,
      mockTelegram as TelegramService,
      mockWebhooks as WebhookService,
      mockPaths as PathsService,
    );
  });

  it('sends test notification to both Telegram and Webhooks when both are configured', async () => {
    const result = await service.sendTest();

    expect(result.ok).toBe(true);
    expect(result.sent).toEqual(['telegram', 'webhooks']);
    expect(mockTelegram.sendMessage).toHaveBeenCalledWith(
      'bot-token',
      'chat-id-123',
      'Test telegram message',
    );
    expect(mockWebhooks.dispatch).toHaveBeenCalledWith(
      [{ url: 'https://example.com/webhook', enabled: true }],
      'test',
      'global',
      'Factorio Control Center',
      { message: 'Test notification from Factorio Control Center' },
    );
  });

  it('sends only to Telegram if no webhooks are configured', async () => {
    mockConfig.notifications!.webhook_targets = '[]';

    const result = await service.sendTest();

    expect(result.ok).toBe(true);
    expect(result.sent).toEqual(['telegram']);
    expect(mockTelegram.sendMessage).toHaveBeenCalledTimes(1);
    expect(mockWebhooks.dispatch).not.toHaveBeenCalled();
  });

  it('sends only to Webhooks if Telegram is disabled', async () => {
    mockConfig.notifications!.telegram_enabled = false;

    const result = await service.sendTest();

    expect(result.ok).toBe(true);
    expect(result.sent).toEqual(['webhooks']);
    expect(mockTelegram.sendMessage).not.toHaveBeenCalled();
    expect(mockWebhooks.dispatch).toHaveBeenCalledTimes(1);
  });

  it('returns empty sent array if neither Telegram nor Webhooks are configured', async () => {
    mockConfig.notifications!.telegram_enabled = false;
    mockConfig.notifications!.webhook_targets = '[]';

    const result = await service.sendTest();

    expect(result.ok).toBe(true);
    expect(result.sent).toEqual([]);
    expect(mockTelegram.sendMessage).not.toHaveBeenCalled();
    expect(mockWebhooks.dispatch).not.toHaveBeenCalled();
  });

  it('dispatches test for a specific instance using its resolved config and name', async () => {
    const result = await service.sendTest('inst-1');

    expect(result.ok).toBe(true);
    expect(result.sent).toEqual(['telegram', 'webhooks']);
    expect(mockWebhooks.dispatch).toHaveBeenCalledWith(
      [{ url: 'https://example.com/webhook', enabled: true }],
      'test',
      'inst-1',
      'Server 1',
      { message: 'Test notification from Factorio Control Center' },
    );
  });
});
