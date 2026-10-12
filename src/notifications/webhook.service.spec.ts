import { WebhookService } from './webhook.service';
import type { WebhookTarget } from './notifications-config';

describe('WebhookService', () => {
  let service: WebhookService;
  let fetchMock: jest.Mock<
    Promise<{ ok: boolean; status: number }>,
    [string, { method: string; body: string }]
  >;

  beforeEach(() => {
    service = new WebhookService();
    fetchMock = jest.fn<
      Promise<{ ok: boolean; status: number }>,
      [string, { method: string; body: string }]
    >();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('dispatch', () => {
    it('dispatches to enabled targets and filters events correctly for regular events', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200 });

      const targets: WebhookTarget[] = [
        { url: 'https://example.com/all', enabled: true },
        {
          url: 'https://example.com/crash-only',
          enabled: true,
          events: ['server_crash'],
        },
        {
          url: 'https://example.com/start-only',
          enabled: true,
          events: ['server_started'],
        },
        { url: 'https://example.com/disabled', enabled: false },
        { url: '', enabled: true },
      ];

      await service.dispatch(
        targets,
        'server_started',
        'inst-1',
        'Alpha Server',
      );

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const urls = fetchMock.mock.calls.map((c) => c[0]);
      expect(urls).toContain('https://example.com/all');
      expect(urls).toContain('https://example.com/start-only');
    });

    it('bypasses event filter when event is test', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200 });

      const targets: WebhookTarget[] = [
        {
          url: 'https://example.com/hook1',
          enabled: true,
          events: ['server_crash'],
        },
        {
          url: 'https://example.com/hook2',
          enabled: true,
          events: ['player_join'],
        },
        { url: 'https://example.com/hook-disabled', enabled: false },
      ];

      await service.dispatch(
        targets,
        'test',
        'global',
        'Factorio Control Center',
        { message: 'Test message' },
      );

      expect(fetchMock).toHaveBeenCalledTimes(2);
      const call1 = fetchMock.mock.calls[0];
      const call2 = fetchMock.mock.calls[1];
      expect(call1[0]).toBe('https://example.com/hook1');
      expect(call1[1].body).toContain('"event":"test"');
      expect(call2[0]).toBe('https://example.com/hook2');
      expect(call2[1].body).toContain('"event":"test"');
    });

    it('formats Discord payload for discord.com webhook URLs', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200 });

      const discordTarget: WebhookTarget = {
        url: 'https://discord.com/api/webhooks/12345/abcdef',
        enabled: true,
      };

      await service.dispatch(
        [discordTarget],
        'test',
        'global',
        'Factorio Control Center',
        { status: 'online' },
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const call = fetchMock.mock.calls[0];
      const parsedBody = JSON.parse(call[1].body) as {
        username: string;
        embeds: Array<{
          title: string;
          fields?: Array<{ name: string; value: string }>;
        }>;
      };

      expect(parsedBody.username).toBe('Factorio Control Center');
      expect(parsedBody.embeds[0].title).toBe('🔔 Test Notification');
      expect(parsedBody.embeds[0].fields).toEqual([
        { name: 'status', value: 'online', inline: true },
      ]);
    });

    it('handles network failure gracefully without throwing', async () => {
      fetchMock.mockRejectedValue(new Error('Connection timeout'));

      const target: WebhookTarget = {
        url: 'https://example.com/fail',
        enabled: true,
      };

      await expect(
        service.dispatch([target], 'test', 'global', 'FCC'),
      ).resolves.not.toThrow();
    });
  });
});
