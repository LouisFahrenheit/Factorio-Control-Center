import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { FccConfigService } from './fcc-config.service';
import { SystemPreference } from './system-preference.entity';
import { encryptString } from '../common/crypto.util';

describe('FccConfigService', () => {
  let service: FccConfigService;
  let repo: Repository<SystemPreference>;
  let configService: jest.Mocked<ConfigService>;
  let mockFind: jest.Mock;
  let mockSave: jest.Mock;
  let mockUpsert: jest.Mock;

  const testSecret = 'test-app-secret-12345';
  let mockPreferences: SystemPreference[] = [];
  let envValues: Record<string, string | undefined> = {};

  beforeEach(async () => {
    mockPreferences = [];
    envValues = {
      APP_SECRET: testSecret,
    };

    mockFind = jest
      .fn()
      .mockImplementation(() => Promise.resolve([...mockPreferences]));
    mockSave = jest
      .fn()
      .mockImplementation((pref: Partial<SystemPreference>) => {
        const existingIdx = mockPreferences.findIndex(
          (p) => p.key === pref.key,
        );
        const item: SystemPreference = {
          key: pref.key || '',
          value: pref.value ?? null,
          updatedAt: new Date(),
        };
        if (existingIdx >= 0) {
          mockPreferences[existingIdx] = item;
        } else {
          mockPreferences.push(item);
        }
        return Promise.resolve(item);
      });
    mockUpsert = jest
      .fn()
      .mockImplementation((pref: Partial<SystemPreference>) => {
        const existingIdx = mockPreferences.findIndex(
          (p) => p.key === pref.key,
        );
        const item: SystemPreference = {
          key: pref.key || '',
          value: pref.value ?? null,
          updatedAt: new Date(),
        };
        if (existingIdx >= 0) {
          mockPreferences[existingIdx] = item;
        } else {
          mockPreferences.push(item);
        }
        return Promise.resolve({ identifiers: [], generatedMaps: [], raw: [] });
      });

    repo = {
      find: mockFind,
      save: mockSave,
      upsert: mockUpsert,
    } as unknown as Repository<SystemPreference>;

    configService = {
      get: jest.fn().mockImplementation((key: string) => envValues[key]),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FccConfigService,
        {
          provide: getRepositoryToken(SystemPreference),
          useValue: repo,
        },
        {
          provide: ConfigService,
          useValue: configService,
        },
      ],
    }).compile();

    service = module.get<FccConfigService>(FccConfigService);
  });

  describe('onModuleInit and reload', () => {
    it('loads regular preferences and decrypts .global_token preferences', async () => {
      const encryptedToken = encryptString(
        'my-secret-factorio-token',
        testSecret,
      );
      mockPreferences = [
        { key: 'web_panel.listen_port', value: '9090', updatedAt: new Date() },
        {
          key: 'web_panel.global_token',
          value: encryptedToken,
          updatedAt: new Date(),
        },
      ];

      await service.onModuleInit();

      const section = service.section('web_panel');
      expect(section.listen_port).toBe('9090');
      expect(section.global_token).toBe('my-secret-factorio-token');
    });
  });

  describe('updatePreferences', () => {
    it('encrypts web_panel.global_token before saving and reloads cache', async () => {
      await service.updatePreferences({
        'web_panel.listen_port': '8081',
        'web_panel.global_token': 'new-plain-token',
      });

      expect(mockSave).toHaveBeenCalledTimes(2);

      // Verify encrypted token was passed to mockSave
      const saveCalls = mockSave.mock.calls as [Partial<SystemPreference>][];
      const tokenCall = saveCalls.find(
        (call) => call[0].key === 'web_panel.global_token',
      );
      expect(tokenCall).toBeDefined();
      expect(tokenCall?.[0].value?.startsWith('enc:')).toBe(true);

      // Verify service cache decrypted it back
      expect(service.webPanel.global_token).toBe('new-plain-token');
      expect(service.webPanel.listen_port).toBe(8081);
    });
  });

  describe('webPanel getter', () => {
    it('reads api_token and debug_logs strictly from .env', async () => {
      envValues = {
        APP_SECRET: testSecret,
        API_TOKEN: 'strict-env-token',
        DEBUG_LOGS: 'true',
      };
      await service.reload();

      expect(service.webPanel.api_token).toBe('strict-env-token');
      expect(service.webPanel.debug_logs).toBe(true);
    });

    it('falls back to default network settings when DB and env are empty', async () => {
      await service.reload();
      expect(service.webPanel.listen_host).toBe('0.0.0.0');
      expect(service.webPanel.listen_port).toBe(8080);
      expect(service.webPanel.tls_enabled).toBe(false);
    });

    it('prefers DB network settings when .env is unset or empty string', async () => {
      mockPreferences = [
        {
          key: 'web_panel.listen_host',
          value: '127.0.0.1',
          updatedAt: new Date(),
        },
        { key: 'web_panel.listen_port', value: '3000', updatedAt: new Date() },
        { key: 'web_panel.tls_enabled', value: '1', updatedAt: new Date() },
      ];
      envValues = {
        APP_SECRET: testSecret,
        HOST: '', // empty env override should be ignored
        PORT: '',
      };
      await service.reload();

      expect(service.webPanel.listen_host).toBe('127.0.0.1');
      expect(service.webPanel.listen_port).toBe(3000);
      expect(service.webPanel.tls_enabled).toBe(true);
    });

    it('overrides DB network settings when .env is explicitly provided', async () => {
      mockPreferences = [
        { key: 'web_panel.listen_port', value: '3000', updatedAt: new Date() },
      ];
      envValues = {
        APP_SECRET: testSecret,
        PORT: '8888',
      };
      await service.reload();

      expect(service.webPanel.listen_port).toBe(8888);
    });

    it('clamps mod_download_concurrency between 1 and 8', async () => {
      mockPreferences = [
        {
          key: 'web_panel.mod_download_concurrency',
          value: '99',
          updatedAt: new Date(),
        },
      ];
      await service.reload();
      expect(service.webPanel.mod_download_concurrency).toBe(8);

      mockPreferences = [
        {
          key: 'web_panel.mod_download_concurrency',
          value: '0',
          updatedAt: new Date(),
        },
      ];
      await service.reload();
      expect(service.webPanel.mod_download_concurrency).toBe(1);
    });
  });

  describe('langCode getter', () => {
    it('uses DB language code when env is empty, defaulting to "en"', async () => {
      await service.reload();
      expect(service.langCode).toBe('en');

      mockPreferences = [
        { key: 'language.code', value: 'ru', updatedAt: new Date() },
      ];
      await service.reload();
      expect(service.langCode).toBe('ru');
    });

    it('overrides DB language code when PANEL_LANGUAGE is non-empty in env', async () => {
      mockPreferences = [
        { key: 'language.code', value: 'ru', updatedAt: new Date() },
      ];
      envValues = {
        APP_SECRET: testSecret,
        PANEL_LANGUAGE: 'uk',
      };
      await service.reload();
      expect(service.langCode).toBe('uk');
    });
  });

  describe('sharedTheme getter', () => {
    it('uses DB theme when env is empty, defaulting to "fcc_classic"', async () => {
      await service.reload();
      expect(service.sharedTheme).toBe('fcc_classic');

      mockPreferences = [
        { key: 'shared.theme', value: 'dark_space', updatedAt: new Date() },
      ];
      await service.reload();
      expect(service.sharedTheme).toBe('dark_space');
    });

    it('overrides DB theme when PANEL_THEME is non-empty in env', async () => {
      mockPreferences = [
        { key: 'shared.theme', value: 'dark_space', updatedAt: new Date() },
      ];
      envValues = {
        APP_SECRET: testSecret,
        PANEL_THEME: 'vulcanus',
      };
      await service.reload();
      expect(service.sharedTheme).toBe('vulcanus');
    });
  });

  describe('firewallUdpRuleDone', () => {
    it('reads and updates firewall UDP rule flag', async () => {
      await service.reload();
      expect(service.firewallUdpRuleDone).toBe(false);

      await service.setFirewallUdpRuleDone(true);
      expect(service.firewallUdpRuleDone).toBe(true);

      await service.setFirewallUdpRuleDone(false);
      expect(service.firewallUdpRuleDone).toBe(false);
    });
  });

  describe('notifications getter', () => {
    it('reads notification settings from DB and env', async () => {
      mockPreferences = [
        {
          key: 'notifications.telegram_enabled',
          value: '1',
          updatedAt: new Date(),
        },
        {
          key: 'notifications.telegram_chat_id',
          value: 'db-chat-id',
          updatedAt: new Date(),
        },
      ];
      envValues = {
        APP_SECRET: testSecret,
        TELEGRAM_BOT_TOKEN: 'env-bot-token',
      };
      await service.reload();

      const notifs = service.notifications;
      expect(notifs.telegram_enabled).toBe(true);
      expect(notifs.telegram_bot_token).toBe('env-bot-token');
      expect(notifs.telegram_chat_id).toBe('db-chat-id');
    });
  });
});
