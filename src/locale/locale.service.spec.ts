import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs';
import { LocaleService } from './locale.service';
import { PathsService } from '../config/paths.service';
import { FccConfigService } from '../config/fcc-config.service';
import { CommandsCatalogService } from '../ops/commands-catalog.service';

jest.mock('fs', () => ({
  ...jest.requireActual<Record<string, unknown>>('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  readdirSync: jest.fn(),
}));

describe('LocaleService', () => {
  let service: LocaleService;
  let mockPaths: { localeDir: string };
  let mockConfig: { langCode: string };
  let mockCommandsCatalog: {
    read: jest.Mock;
  };

  const mockExistsSync = fs.existsSync as unknown as jest.Mock;
  const mockReadFileSync = fs.readFileSync as unknown as jest.Mock;
  const mockReaddirSync = fs.readdirSync as unknown as jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPaths = { localeDir: '/app/locale' };
    mockConfig = { langCode: 'ru' };
    mockCommandsCatalog = {
      read: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LocaleService,
        { provide: PathsService, useValue: mockPaths },
        { provide: FccConfigService, useValue: mockConfig },
        { provide: CommandsCatalogService, useValue: mockCommandsCatalog },
      ],
    }).compile();

    service = module.get<LocaleService>(LocaleService);
  });

  describe('readLang', () => {
    it('reads and parses locale JSON when candidate exists', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(
        JSON.stringify({ greeting: 'Привет', cancel: 'Отмена' }),
      );

      const result = service.readLang('ru');
      expect(result).toEqual({ greeting: 'Привет', cancel: 'Отмена' });
    });

    it('returns null when no candidate file exists', () => {
      mockExistsSync.mockReturnValue(false);

      const result = service.readLang('de');
      expect(result).toBeNull();
    });

    it('continues and returns null if file contains invalid JSON', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue('invalid json {');

      const result = service.readLang('ru');
      expect(result).toBeNull();
    });
  });

  describe('getLocale', () => {
    it('returns requested language strings when available', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ ok: 'ОК' }));

      const res = service.getLocale('ru');
      expect(res).toEqual({
        ok: true,
        lang: 'ru',
        strings: { ok: 'ОК' },
      });
    });

    it('falls back to default "en" if requested language is not found', () => {
      mockExistsSync.mockImplementation((p: unknown) => {
        return String(p).includes('server_lang_en.json');
      });
      mockReadFileSync.mockReturnValue(JSON.stringify({ ok: 'OK' }));

      const res = service.getLocale('fr');
      expect(res).toEqual({
        ok: true,
        lang: 'en',
        strings: { ok: 'OK' },
      });
    });

    it('uses config.langCode if lang parameter is omitted', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockReturnValue(JSON.stringify({ ok: 'ОК' }));

      const res = service.getLocale();
      expect(res.lang).toBe('ru');
    });
  });

  describe('listAvailableLanguages', () => {
    it('lists available language codes parsed from locale folder filenames', () => {
      mockReaddirSync.mockReturnValue([
        'server_lang_en.json',
        'server_lang_ru.json',
        'server_lang_zh-cn.json',
        'other_file.txt',
      ]);

      const langs = service.listAvailableLanguages();
      expect(langs).toEqual(['en', 'ru', 'zh-cn']);
    });

    it('falls back to ["en"] if reading directory throws an error', () => {
      mockReaddirSync.mockImplementation(() => {
        throw new Error('EACCES');
      });

      const langs = service.listAvailableLanguages();
      expect(langs).toEqual(['en']);
    });
  });

  describe('readCommands', () => {
    it('returns command catalog data when commandsCatalog.read succeeds', () => {
      mockCommandsCatalog.read.mockReturnValue({
        ok: true,
        data: { categories: { admin: {} } },
      });

      const data = service.readCommands('ru');
      expect(data).toEqual({ categories: { admin: {} } });
      expect(mockCommandsCatalog.read).toHaveBeenCalledWith('ru');
    });

    it('returns null if commandsCatalog.read returns failure', () => {
      mockCommandsCatalog.read.mockReturnValue({
        ok: false,
      });

      const data = service.readCommands('ru');
      expect(data).toBeNull();
    });
  });
});
