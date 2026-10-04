import { TelegramService } from './telegram.service';
import {
  NotificationsService,
  FactorioUpdateCandidate,
} from './notifications.service';
import type { FccConfigService } from '../config/fcc-config.service';
import type { InstancesService } from '../instances/instances.service';
import type { WebhookService } from './webhook.service';
import type { PathsService } from '../config/paths.service';
import { join } from 'path';
import { tmpdir } from 'os';
import { mkdtempSync, rmSync, existsSync } from 'fs';

describe('Factorio Update Notifications', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'fcc-notif-test-'));
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('TelegramService.fmtFactorioUpdate', () => {
    const telegram = new TelegramService();

    it('formats single server update correctly', () => {
      const msg = telegram.fmtFactorioUpdate('2.0.15', [
        { name: 'Server Alpha', currentVersion: '2.0.14' },
      ]);
      expect(msg).toContain('Factorio Update Available');
      expect(msg).toContain('Server: <b>Server Alpha</b>');
      expect(msg).toContain('<code>2.0.15</code>');
      expect(msg).toContain('(installed: <code>2.0.14</code>)');
      expect(msg).not.toContain('<b>Servers:</b>');
    });

    it('formats multiple servers update with server list', () => {
      const msg = telegram.fmtFactorioUpdate('2.0.15', [
        { name: 'Server 1', currentVersion: '2.0.14' },
        { name: 'Server 2', currentVersion: '2.0.13' },
      ]);
      expect(msg).toContain('Factorio Update Available');
      expect(msg).toContain(
        'A new version of Factorio is available: <code>2.0.15</code>',
      );
      expect(msg).toContain('<b>Servers:</b>');
      expect(msg).toContain(
        '• <b>Server 1</b> (installed: <code>2.0.14</code>)',
      );
      expect(msg).toContain(
        '• <b>Server 2</b> (installed: <code>2.0.13</code>)',
      );
    });
  });

  describe('NotificationsService - Deduplication and Batching', () => {
    let mockConfig: Partial<FccConfigService>;
    let mockInstances: Partial<InstancesService>;
    let mockTelegram: Partial<TelegramService>;
    let mockWebhooks: Partial<WebhookService>;
    let mockPaths: Partial<PathsService>;
    let service: NotificationsService;
    let sentMessages: Array<{
      botToken: string;
      chatId: string;
      text: string;
      silent?: boolean;
    }>;

    beforeEach(() => {
      sentMessages = [];

      mockConfig = {
        notifications: {
          telegram_enabled: true,
          telegram_bot_token: 'bot-token-xyz',
          telegram_chat_id: 'chat-1001',
          webhook_targets: '[]',
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
          if (id === 'inst-1')
            return { id: 'inst-1', name: 'Main Server' } as any;
          if (id === 'inst-2')
            return { id: 'inst-2', name: 'Secondary Server' } as any;
          return null;
        },
      };

      mockTelegram = {
        fmtFactorioUpdate: new TelegramService().fmtFactorioUpdate.bind(
          new TelegramService(),
        ),
        sendMessage: jest.fn(
          async (
            botToken: string,
            chatId: string,
            text: string,
            silent?: boolean,
          ) => {
            sentMessages.push({ botToken, chatId, text, silent });
          },
        ),
      };

      mockWebhooks = {
        dispatch: jest.fn(async () => {}),
      };

      mockPaths = {
        dataDir: tempDir,
        notificationsStatePath: join(tempDir, 'notifications_state.json'),
      };

      service = new NotificationsService(
        mockConfig as FccConfigService,
        mockInstances as InstancesService,
        mockTelegram as TelegramService,
        mockWebhooks as WebhookService,
        mockPaths as PathsService,
      );
    });

    it('sends ONE message listing multiple servers when updates are batched', async () => {
      const candidates: FactorioUpdateCandidate[] = [
        {
          instanceId: 'inst-1',
          instanceName: 'Main Server',
          currentVersion: '2.0.14',
          targetVersion: '2.0.15',
        },
        {
          instanceId: 'inst-2',
          instanceName: 'Secondary Server',
          currentVersion: '2.0.13',
          targetVersion: '2.0.15',
        },
      ];

      await service.onFactorioUpdatesBatch(candidates);

      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].chatId).toBe('chat-1001');
      expect(sentMessages[0].text).toContain('<b>Servers:</b>');
      expect(sentMessages[0].text).toContain(
        '• <b>Main Server</b> (installed: <code>2.0.14</code>)',
      );
      expect(sentMessages[0].text).toContain(
        '• <b>Secondary Server</b> (installed: <code>2.0.13</code>)',
      );
    });

    it('does NOT send duplicate notification for the same version on subsequent checks ("раз в версию")', async () => {
      const candidates: FactorioUpdateCandidate[] = [
        {
          instanceId: 'inst-1',
          instanceName: 'Main Server',
          currentVersion: '2.0.14',
          targetVersion: '2.0.15',
        },
        {
          instanceId: 'inst-2',
          instanceName: 'Secondary Server',
          currentVersion: '2.0.13',
          targetVersion: '2.0.15',
        },
      ];

      // First check sends notification
      await service.onFactorioUpdatesBatch(candidates);
      expect(sentMessages).toHaveLength(1);

      // Subsequent check (e.g. 6 hours later or next run) - MUST NOT send again
      await service.onFactorioUpdatesBatch(candidates);
      expect(sentMessages).toHaveLength(1); // Still 1, no duplicate sent!
    });

    it('preserves notification state on service restart and suppresses duplicates', async () => {
      const candidates: FactorioUpdateCandidate[] = [
        {
          instanceId: 'inst-1',
          instanceName: 'Main Server',
          currentVersion: '2.0.14',
          targetVersion: '2.0.15',
        },
      ];

      // Service instance 1 sends notification
      await service.onFactorioUpdatesBatch(candidates);
      expect(sentMessages).toHaveLength(1);

      // Simulate FCC restart by creating new NotificationsService with same paths
      const restartedService = new NotificationsService(
        mockConfig as FccConfigService,
        mockInstances as InstancesService,
        mockTelegram as TelegramService,
        mockWebhooks as WebhookService,
        mockPaths as PathsService,
      );

      // Check after restart
      await restartedService.onFactorioUpdatesBatch(candidates);
      expect(sentMessages).toHaveLength(1); // Still 1, state was loaded from disk!
    });

    it('sends new notification when a newer Factorio version is detected', async () => {
      // First version 2.0.15
      await service.onFactorioUpdatesBatch([
        {
          instanceId: 'inst-1',
          instanceName: 'Main Server',
          currentVersion: '2.0.14',
          targetVersion: '2.0.15',
        },
      ]);
      expect(sentMessages).toHaveLength(1);
      expect(sentMessages[0].text).toContain('<code>2.0.15</code>');

      // Later version 2.0.16 is released
      await service.onFactorioUpdatesBatch([
        {
          instanceId: 'inst-1',
          instanceName: 'Main Server',
          currentVersion: '2.0.14',
          targetVersion: '2.0.16',
        },
      ]);
      expect(sentMessages).toHaveLength(2);
      expect(sentMessages[1].text).toContain('<code>2.0.16</code>');
    });
  });
});
