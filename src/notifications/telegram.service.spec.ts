import { TelegramService } from './telegram.service';

describe('TelegramService', () => {
  let service: TelegramService;
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    service = new TelegramService();
    originalFetch = global.fetch;
  });

  afterEach(() => {
    service.onModuleDestroy();
    global.fetch = originalFetch;
  });

  describe('sendMessage', () => {
    it('does nothing if botToken, chatId or text is missing', async () => {
      const mockFetch = jest.fn();
      global.fetch = mockFetch;

      await service.sendMessage('', '123', 'hello');
      await service.sendMessage('token', '', 'hello');
      await service.sendMessage('token', '123', '');

      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('sends POST request to Telegram API with correct payload', async () => {
      const mockFetch = jest
        .fn<Promise<Response>, [string, RequestInit?]>()
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ ok: true }),
        } as unknown as Response);
      global.fetch = mockFetch;

      await service.sendMessage('my-bot-token', 'chat-777', '<b>Hello!</b>');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe('https://api.telegram.org/botmy-bot-token/sendMessage');
      expect(options?.method).toBe('POST');
      expect(options?.headers).toEqual({ 'Content-Type': 'application/json' });

      const rawBody = typeof options?.body === 'string' ? options.body : '{}';
      const body = JSON.parse(rawBody) as Record<string, unknown>;
      expect(body.chat_id).toBe('chat-777');
      expect(body.text).toBe('<b>Hello!</b>');
      expect(body.parse_mode).toBe('HTML');
      expect(body.disable_web_page_preview).toBe(true);
      expect(body.disable_notification).toBeUndefined();
    });

    it('sets disable_notification: true when silent is true', async () => {
      const mockFetch = jest
        .fn<Promise<Response>, [string, RequestInit?]>()
        .mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ ok: true }),
        } as unknown as Response);
      global.fetch = mockFetch;

      await service.sendMessage(
        'my-bot-token',
        'chat-777',
        'Silent notification',
        true,
      );

      const [, options] = mockFetch.mock.calls[0];
      const rawBody = typeof options?.body === 'string' ? options.body : '{}';
      const body = JSON.parse(rawBody) as Record<string, unknown>;
      expect(body.disable_notification).toBe(true);
    });

    it('handles HTTP error responses safely without throwing', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: () => Promise.resolve('Bad Request: chat not found'),
      });

      await expect(
        service.sendMessage('token', 'bad-chat', 'msg'),
      ).resolves.toBeUndefined();
    });

    it('handles network exceptions safely without throwing', async () => {
      global.fetch = jest
        .fn()
        .mockRejectedValue(new Error('Connection timed out'));

      await expect(
        service.sendMessage('token', 'chat', 'msg'),
      ).resolves.toBeUndefined();
    });
  });

  describe('message formatters', () => {
    it('escapes HTML special characters in inputs', () => {
      const msg = service.fmtChatRelay(
        'Server <1>',
        'Player & Co',
        '1 < 2 > 0 & fun',
      );
      expect(msg).toContain('Server &lt;1&gt;');
      expect(msg).toContain('Player &amp; Co');
      expect(msg).toContain('1 &lt; 2 &gt; 0 &amp; fun');
    });

    it('fmtServerStarted formats server online message', () => {
      const text = service.fmtServerStarted('Space Exploration');
      expect(text).toContain('🟢 <b>Server Online</b>');
      expect(text).toContain('<b>Space Exploration</b> is now running.');
    });

    it('fmtServerStopped formats server offline message', () => {
      const text = service.fmtServerStopped('Vanilla 2.0');
      expect(text).toContain('🔴 <b>Server Offline</b>');
      expect(text).toContain('<b>Vanilla 2.0</b> has stopped.');
    });

    it('fmtServerCrash formats crash message with exit code', () => {
      const text = service.fmtServerCrash('Modded Server', 1);
      expect(text).toContain('💥 <b>Server Crashed</b>');
      expect(text).toContain('<code>1</code>');
    });

    it('fmtStartFailed formats startup failure message', () => {
      const text = service.fmtStartFailed('Broken Server', 127);
      expect(text).toContain('⚠️ <b>Server Failed to Start</b>');
      expect(text).toContain('<code>127</code>');
    });

    it('fmtPlayerJoin and fmtPlayerLeave format player events', () => {
      expect(service.fmtPlayerJoin('S1', 'Alice')).toContain(
        '<b>Alice</b> joined <b>S1</b>',
      );
      expect(service.fmtPlayerLeave('S1', 'Bob')).toContain(
        '<b>Bob</b> left <b>S1</b>',
      );
    });

    it('fmtMaintenance formats maintenance notice', () => {
      const text = service.fmtMaintenance('Primary Node');
      expect(text).toContain('🔧 <b>Maintenance</b>');
      expect(text).toContain('Primary Node');
    });

    it('fmtFactorioUpdate formats single server and multi-server updates', () => {
      const single = service.fmtFactorioUpdate('2.0.10', [
        { name: 'Main Server', currentVersion: '2.0.9' },
      ]);
      expect(single).toContain('2.0.10');
      expect(single).toContain('Main Server');
      expect(single).toContain('installed: <code>2.0.9</code>');

      const multi = service.fmtFactorioUpdate('2.0.10', [
        { name: 'Server 1', currentVersion: '2.0.8' },
        { name: 'Server 2' },
      ]);
      expect(multi).toContain('<b>Servers:</b>');
      expect(multi).toContain(
        '• <b>Server 1</b> (installed: <code>2.0.8</code>)',
      );
      expect(multi).toContain('• <b>Server 2</b>');
    });

    it('fmtLowUps formats low UPS warning with duration and threshold', () => {
      const msg1 = service.fmtLowUps('MegaBase', 45.2, 1, 55);
      expect(msg1).toContain('📉 <b>Low UPS Warning</b>');
      expect(msg1).toContain('<b>45.2</b>');
      expect(msg1).toContain('(threshold: 55).');

      const msg2 = service.fmtLowUps('MegaBase', 30.0, 5);
      expect(msg2).toContain('for 5 consecutive minutes.');
    });

    it('fmtModeration formats different moderation actions and emoji', () => {
      const ban = service.fmtModeration(
        'Server1',
        'BAN',
        'Griefer',
        'Admin',
        'Bad behavior',
      );
      expect(ban).toContain('🔨 <b>Moderation: BAN</b>');
      expect(ban).toContain('Player: <b>Griefer</b>');
      expect(ban).toContain('By: <b>Admin</b>');
      expect(ban).toContain('Reason: <i>Bad behavior</i>');

      const kick = service.fmtModeration(
        'Server1',
        'KICK',
        'AFKPlayer',
        'System',
      );
      expect(kick).toContain('👢 <b>Moderation: KICK</b>');

      const mute = service.fmtModeration('Server1', 'MUTE', 'Spammer', 'Mod');
      expect(mute).toContain('🔇 <b>Moderation: MUTE</b>');

      const unban = service.fmtModeration(
        'Server1',
        'UNBAN',
        'Forgiven',
        'Admin',
      );
      expect(unban).toContain('🤝 <b>Moderation: UNBAN</b>');

      const whitelist = service.fmtModeration(
        'Server1',
        'WHITELIST_ADD',
        'Friend',
        'Admin',
      );
      expect(whitelist).toContain('📋➕ <b>Moderation: WHITELIST ADD</b>');
    });

    it('fmtTest returns test notification text', () => {
      expect(service.fmtTest()).toContain('✅ <b>Test Notification</b>');
    });
  });

  describe('polling', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('starts and stops polling interval cleanly', () => {
      const cb = jest.fn();
      service.startPolling('test-token', '12345', cb, 3000);
      service.stopPolling();

      jest.advanceTimersByTime(10000);
      expect(cb).not.toHaveBeenCalled();
    });
  });
});
