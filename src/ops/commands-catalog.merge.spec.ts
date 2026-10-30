import {
  emptyBaseDoc,
  emptyTranslationsDoc,
  parseBaseDoc,
  parseTranslationsDoc,
  mergeCatalog,
  splitMergedCatalog,
  baseCategoryOrder,
  serializeBaseDoc,
  serializeTranslationsDoc,
} from './commands-catalog.merge';

describe('commands-catalog.merge', () => {
  describe('empty documents', () => {
    it('returns empty base doc with default 2.0 version', () => {
      expect(emptyBaseDoc()).toEqual({ version: '2.0', categories: {} });
    });

    it('returns empty translations doc', () => {
      expect(emptyTranslationsDoc()).toEqual({ categories: {}, commands: {} });
    });
  });

  describe('parseBaseDoc', () => {
    it('returns empty base doc for invalid input', () => {
      expect(parseBaseDoc(null)).toEqual(emptyBaseDoc());
      expect(parseBaseDoc('invalid')).toEqual(emptyBaseDoc());
      expect(parseBaseDoc([])).toEqual(emptyBaseDoc());
    });

    it('parses valid base doc and strips commands appropriately', () => {
      const raw = {
        version: '2.1',
        categories: {
          admin: {
            commands: [
              {
                id: 'kick',
                command: '/kick {player}',
                has_player: true,
                has_boolean: true,
                default_value: 'true',
                has_item: true,
                items: { iron_plate: 10 },
                has_count: true,
                has_quality: true,
                default_quality: 'normal',
                requires_value: false,
              },
              {
                id: 'give',
                command: '/give {value}',
                has_value: true,
                default_value: '100',
              },
              {
                id: '   ', // invalid id
                command: '/invalid',
              },
            ],
          },
        },
      };

      const parsed = parseBaseDoc(raw);
      expect(parsed.version).toBe('2.1');
      expect(parsed.categories.admin.commands.length).toBe(2);
      expect(parsed.categories.admin.commands[0]).toEqual({
        id: 'kick',
        command: '/kick {player}',
        has_player: true,
        has_boolean: true,
        default_value: 'true',
        has_item: true,
        items: { iron_plate: 10 },
        has_count: true,
        has_quality: true,
        default_quality: 'normal',
        requires_value: false,
      });
      expect(parsed.categories.admin.commands[1]).toEqual({
        id: 'give',
        command: '/give {value}',
        has_value: true,
        default_value: '100',
      });
    });
  });

  describe('parseTranslationsDoc', () => {
    it('returns empty translations doc on invalid input', () => {
      expect(parseTranslationsDoc(null)).toEqual(emptyTranslationsDoc());
      expect(parseTranslationsDoc([])).toEqual(emptyTranslationsDoc());
    });

    it('parses categories and command translations', () => {
      const raw = {
        categories: {
          admin: 'Администрирование',
        },
        commands: {
          kick: {
            name: 'Исключить игрока',
            description: 'Выгоняет игрока с сервера',
          },
        },
      };

      const parsed = parseTranslationsDoc(raw);
      expect(parsed.categories.admin).toBe('Администрирование');
      expect(parsed.commands.kick).toEqual({
        name: 'Исключить игрока',
        description: 'Выгоняет игрока с сервера',
      });
    });
  });

  describe('mergeCatalog & splitMergedCatalog', () => {
    it('merges base doc with translations doc', () => {
      const base = {
        version: '2.0',
        categories: {
          admin: {
            commands: [
              {
                id: 'kick',
                command: '/kick {player}',
                has_player: true,
              },
            ],
          },
        },
      };

      const translations = {
        categories: { admin: 'Admin Category' },
        commands: {
          kick: { name: 'Kick', description: 'Kick player' },
        },
      };

      const merged = mergeCatalog(base, translations);
      expect(merged.version).toBe('2.0');
      expect(merged.categories.admin.name).toBe('Admin Category');
      expect(merged.categories.admin.commands[0]).toEqual({
        id: 'kick',
        command: '/kick {player}',
        has_player: true,
        name: 'Kick',
        description: 'Kick player',
      });
    });

    it('splits merged catalog back into base and translations docs', () => {
      const merged = {
        version: '2.0',
        categories: {
          server: {
            name: 'Server Management',
            commands: [
              {
                id: 'save',
                command: '/server-save',
                name: 'Save',
                description: 'Saves the current game',
              },
            ],
          },
        },
      };

      const { base, translations } = splitMergedCatalog(merged);
      expect(base.categories.server.commands[0]).toEqual({
        id: 'save',
        command: '/server-save',
      });
      expect(translations.categories.server).toBe('Server Management');
      expect(translations.commands.save).toEqual({
        name: 'Save',
        description: 'Saves the current game',
      });
    });

    it('splitMergedCatalog handles invalid inputs', () => {
      const { base, translations } = splitMergedCatalog(null);
      expect(base).toEqual(emptyBaseDoc());
      expect(translations).toEqual(emptyTranslationsDoc());
    });
  });

  describe('serialization and ordering', () => {
    const base = {
      version: '2.0',
      categories: {
        catB: {
          commands: [{ id: 'cmdB', command: '/b' }],
        },
        catA: {
          commands: [{ id: 'cmdA', command: '/a' }],
        },
      },
    };

    it('baseCategoryOrder returns category keys in order', () => {
      expect(baseCategoryOrder(base)).toEqual(['catB', 'catA']);
    });

    it('serializeBaseDoc returns cloned structure', () => {
      const serialized = serializeBaseDoc(base);
      expect(serialized).toEqual(base);
      expect(serialized).not.toBe(base);
    });

    it('serializeTranslationsDoc aligns categories and commands with base doc order', () => {
      const translations = {
        categories: {
          catA: 'Category A',
          catB: 'Category B',
          extraCat: 'Extra',
        },
        commands: {
          cmdA: { name: 'A', description: 'Desc A' },
          cmdB: { name: 'B', description: 'Desc B' },
          extraCmd: { name: 'Extra', description: 'Extra Desc' },
        },
      };

      const serializedTr = serializeTranslationsDoc(translations, base);
      expect(Object.keys(serializedTr.categories)).toEqual([
        'catB',
        'catA',
        'extraCat',
      ]);
      expect(Object.keys(serializedTr.commands)).toEqual([
        'cmdB',
        'cmdA',
        'extraCmd',
      ]);
    });
  });
});
