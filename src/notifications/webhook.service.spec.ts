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

    it('formats Discord payload cleanly for factorio_update_available', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200 });

      const discordTarget: WebhookTarget = {
        url: 'https://discord.com/api/webhooks/12345/abcdef',
        enabled: true,
      };

      await service.dispatch(
        [discordTarget],
        'factorio_update_available',
        'inst-1',
        'Space Exploration',
        {
          latest_version: '2.1.21',
          current_version: '2.1.8',
          servers: [
            {
              id: 'inst-1',
              name: 'Space Exploration',
              current_version: '2.1.8',
            },
          ],
        },
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const call = fetchMock.mock.calls[0];
      const parsedBody = JSON.parse(call[1].body) as {
        embeds: Array<{
          title: string;
          description: string;
          fields?: Array<{ name: string; value: string; inline?: boolean }>;
        }>;
      };

      expect(parsedBody.embeds[0].title).toBe('🚀 Factorio Update Available');
      expect(parsedBody.embeds[0].description).toContain('Space Exploration');
      expect(parsedBody.embeds[0].fields).toEqual([
        { name: 'Server', value: 'Space Exploration', inline: true },
        { name: 'Installed', value: '`2.1.8`', inline: true },
        { name: 'Available', value: '`2.1.21`', inline: true },
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

  describe('testTarget', () => {
    it('returns ok: true and status code on successful delivery', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 204 });

      const target: WebhookTarget = {
        url: 'https://example.com/target-test',
        enabled: true,
      };

      const result = await service.testTarget(target, 'inst-1', 'Server Alpha');
      expect(result).toEqual({ ok: true, status: 204 });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('returns ok: false and HTTP status on non-ok response', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 404 });

      const target: WebhookTarget = {
        url: 'https://example.com/target-404',
        enabled: true,
      };

      const result = await service.testTarget(target);
      expect(result).toEqual({ ok: false, status: 404, error: 'HTTP 404' });
    });

    it('returns ok: false and error message on network rejection', async () => {
      fetchMock.mockRejectedValue(new Error('DNS lookup failed'));

      const target: WebhookTarget = {
        url: 'https://example.com/target-error',
        enabled: true,
      };

      const result = await service.testTarget(target);
      expect(result).toEqual({ ok: false, error: 'DNS lookup failed' });
    });
  });
});
