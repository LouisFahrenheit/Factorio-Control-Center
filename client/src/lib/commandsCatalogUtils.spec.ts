import { describe, it, expect } from 'vitest';
import {
  normalizeCatalog,
  cloneCatalog,
  slugifyCommandId,
  uniqueCommandId,
  sortedCategoryKeys,
  categoryOrderKeys,
  reorderCategories,
  moveCategory,
  findCommandLocation,
  getSelectedCommand,
  stripEmptyFlags,
  serializeCatalogForSave,
  newCommandDef,
} from './commandsCatalogUtils';
import type { CommandsCatalogDoc } from '../types/commandsCatalog';

describe('commandsCatalogUtils', () => {
  const sampleCatalog: CommandsCatalogDoc = {
    version: '2.0',
    categories: {
      items: {
        name: 'Items & Inventory',
        commands: [
          {
            id: 'give_iron',
            name: 'Give Iron Plate',
            command: '/c game.player.insert{name="iron-plate", count=100}',
            description: 'Give 100 iron plates',
            has_player: true,
            has_item: true,
            items: { 'iron-plate': 100 },
          },
          {
            id: 'give_copper',
            name: 'Give Copper Plate',
            command: '/c game.player.insert{name="copper-plate", count=50}',
            description: 'Give 50 copper plates',
            has_player: true,
          },
        ],
      },
      cheats: {
        name: 'Cheats',
        commands: [
          {
            id: 'always_day',
            name: 'Always Day',
            command: '/c game.player.surface.always_day = true',
            description: 'Enable permanent daylight',
            has_boolean: true,
            default_value: 'true',
          },
        ],
      },
      debug: {
        name: 'Debug',
        commands: [
          {
            id: 'kill_biters',
            name: 'Kill All Enemies',
            command: '/c game.forces["enemy"].kill_all_units()',
            description: 'Eliminates all biter entities',
          },
        ],
      },
    },
  };

  describe('normalizeCatalog', () => {
    it('handles empty or non-object inputs safely', () => {
      expect(normalizeCatalog(null)).toEqual({ version: '2.0', categories: {} });
      expect(normalizeCatalog(undefined)).toEqual({ version: '2.0', categories: {} });
      expect(normalizeCatalog('bad string')).toEqual({ version: '2.0', categories: {} });
      expect(normalizeCatalog([])).toEqual({ version: '2.0', categories: {} });
    });

    it('normalizes commands and items properly', () => {
      const raw = {
        version: '2.1',
        categories: {
          misc: {
            name: 'Misc',
            commands: [
              {
                id: 'custom_cmd',
                command: '/custom',
                items: { iron: '10', invalid: 'not-a-number' },
                has_boolean: 1,
              },
            ],
          },
        },
      };

      const result = normalizeCatalog(raw);
      expect(result.version).toBe('2.1');
      expect(result.categories.misc.name).toBe('Misc');
      expect(result.categories.misc.commands[0].id).toBe('custom_cmd');
      expect(result.categories.misc.commands[0].items).toEqual({ iron: 10 });
      expect(result.categories.misc.commands[0].has_boolean).toBe(true);
    });
  });

  describe('cloneCatalog', () => {
    it('creates an independent deep copy of the catalog', () => {
      const clone = cloneCatalog(sampleCatalog);
      expect(clone).toEqual(sampleCatalog);
      expect(clone).not.toBe(sampleCatalog);
      clone.categories.items.name = 'Modified Name';
      expect(sampleCatalog.categories.items.name).toBe('Items & Inventory');
    });
  });

  describe('slugifyCommandId', () => {
    it('creates url/id safe slugs from command names', () => {
      expect(slugifyCommandId('Give Iron Plate')).toBe('give_iron_plate');
      expect(slugifyCommandId('  ---Test!!Special***---  ')).toBe('test_special');
      expect(slugifyCommandId('', 'fallback_cmd')).toBe('fallback_cmd');
    });
  });

  describe('uniqueCommandId', () => {
    it('generates unique command id without colliding with existing ids', () => {
      expect(uniqueCommandId(sampleCatalog, 'new_action')).toBe('new_action');
      expect(uniqueCommandId(sampleCatalog, 'give_iron')).toBe('give_iron_2');
    });
  });

  describe('category ordering and reordering', () => {
    it('sortedCategoryKeys returns alphabetically sorted category keys by display name', () => {
      const sorted = sortedCategoryKeys(sampleCatalog);
      expect(sorted).toEqual(['cheats', 'debug', 'items']);
    });

    it('categoryOrderKeys returns keys in catalog declaration order', () => {
      const order = categoryOrderKeys(sampleCatalog);
      expect(order).toEqual(['items', 'cheats', 'debug']);
    });

    it('reorderCategories returns catalog with reordered category keys', () => {
      const reordered = reorderCategories(sampleCatalog, ['debug', 'items', 'cheats']);
      expect(categoryOrderKeys(reordered)).toEqual(['debug', 'items', 'cheats']);
    });

    it('moveCategory handles reordering a category to a new target index', () => {
      // Move 'debug' (index 2) to index 0
      const moved = moveCategory(sampleCatalog, 'debug', 0);
      expect(categoryOrderKeys(moved)).toEqual(['debug', 'items', 'cheats']);

      // Move 'items' (index 0) to index 2
      const movedEnd = moveCategory(sampleCatalog, 'items', 3);
      expect(categoryOrderKeys(movedEnd)).toEqual(['cheats', 'debug', 'items']);

      // No-op moves
      expect(moveCategory(sampleCatalog, 'nonexistent', 0)).toBe(sampleCatalog);
      expect(moveCategory(sampleCatalog, 'items', 0)).toBe(sampleCatalog);
    });
  });

  describe('findCommandLocation and getSelectedCommand', () => {
    it('finds command categoryKey and index', () => {
      expect(findCommandLocation(sampleCatalog, 'give_copper')).toEqual({
        categoryKey: 'items',
        index: 1,
      });
      expect(findCommandLocation(sampleCatalog, 'always_day')).toEqual({
        categoryKey: 'cheats',
        index: 0,
      });
      expect(findCommandLocation(sampleCatalog, 'non_existent')).toBeNull();
    });

    it('getSelectedCommand returns command definition or null', () => {
      const cmd = getSelectedCommand(sampleCatalog, 'always_day');
      expect(cmd?.name).toBe('Always Day');
      expect(getSelectedCommand(sampleCatalog, 'unknown_id')).toBeNull();
    });
  });

  describe('stripEmptyFlags and serializeCatalogForSave', () => {
    it('stripEmptyFlags omits false boolean flags', () => {
      const stripped = stripEmptyFlags({
        id: 'test',
        name: 'Test',
        command: '/test',
        description: 'desc',
        has_player: false,
        has_value: false,
        has_boolean: true,
        default_value: 'true',
      });
      expect(stripped.has_boolean).toBe(true);
      expect('has_player' in stripped).toBe(false);
      expect('has_value' in stripped).toBe(false);
    });

    it('serializeCatalogForSave strips empty flags across all commands', () => {
      const serialized = serializeCatalogForSave(sampleCatalog);
      expect(serialized.version).toBe('2.0');
      expect(serialized.categories.cheats.commands[0].has_boolean).toBe(true);
      expect('has_player' in serialized.categories.cheats.commands[0]).toBe(false);
    });
  });

  describe('newCommandDef', () => {
    it('generates a clean new command definition with unique id', () => {
      const cmd = newCommandDef(sampleCatalog);
      expect(cmd.id.startsWith('new_command')).toBe(true);
      expect(cmd.command).toBe('/c ');
    });
  });
});

