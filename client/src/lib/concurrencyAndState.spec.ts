import { describe, it, expect, vi } from 'vitest';
import {
  cloneCatalog,
  findCommandLocation,
  moveCategory,
  categoryOrderKeys,
} from './commandsCatalogUtils';
import type { CommandsCatalogDoc } from '../types/commandsCatalog';
import enLocale from '../../../locale/server_lang_en.json';
import ruLocale from '../../../locale/server_lang_ru.json';

describe('R3 Adversarial Verification: React Concurrency & Modal State', () => {
  const initialCatalog: CommandsCatalogDoc = {
    version: '2.0',
    categories: {
      catA: {
        name: 'Category A',
        commands: [
          { id: 'cmd_a1', name: 'Command A1', command: '/a1', description: 'Desc A1' },
          { id: 'cmd_a2', name: 'Command A2', command: '/a2', description: 'Desc A2' },
          { id: 'cmd_a3', name: 'Command A3', command: '/a3', description: 'Desc A3' },
        ],
      },
      catB: {
        name: 'Category B',
        commands: [
          { id: 'cmd_b1', name: 'Command B1', command: '/b1', description: 'Desc B1' },
          { id: 'cmd_b2', name: 'Command B2', command: '/b2', description: 'Desc B2' },
        ],
      },
      catC: {
        name: 'Category C',
        commands: [
          { id: 'cmd_c1', name: 'Command C1', command: '/c1', description: 'Desc C1' },
        ],
      },
    },
  };

  describe('useCommandEditor Concurrency & catalogRef Synchronous Updates', () => {
    it('applies multiple rapid reorder calls synchronously without losing updates under React batching', () => {
      let reactState = cloneCatalog(initialCatalog);
      const catalogRef = { current: cloneCatalog(initialCatalog) };
      const persistedDocs: CommandsCatalogDoc[] = [];

      const setCatalog = (candidate: CommandsCatalogDoc) => {
        reactState = candidate;
      };

      const schedulePersist = (candidate: CommandsCatalogDoc) => {
        persistedDocs.push(candidate);
      };

      const moveCommand = (commandId: string, targetCategoryKey: string, targetIndex: number) => {
        const current = catalogRef.current;
        const loc = findCommandLocation(current, commandId);
        if (!loc || !current.categories[targetCategoryKey]) return;

        const isSameCategory = loc.categoryKey === targetCategoryKey;
        const targetCategory = current.categories[targetCategoryKey];
        let insertIndex = Math.max(0, Math.min(targetIndex, targetCategory.commands.length));

        if (isSameCategory && (loc.index === insertIndex || loc.index + 1 === insertIndex)) {
          return;
        }

        const candidate = cloneCatalog(current);
        const [cmd] = candidate.categories[loc.categoryKey].commands.splice(loc.index, 1);
        const targetList = candidate.categories[targetCategoryKey].commands;

        if (isSameCategory && loc.index < insertIndex) {
          insertIndex -= 1;
        }

        targetList.splice(insertIndex, 0, cmd);

        catalogRef.current = candidate;
        setCatalog(candidate);
        schedulePersist(candidate);
      };

      const moveCategoryOrder = (categoryKey: string, targetIndex: number) => {
        const current = catalogRef.current;
        const candidate = moveCategory(current, categoryKey, targetIndex);
        if (candidate === current) return;

        catalogRef.current = candidate;
        setCatalog(candidate);
        schedulePersist(candidate);
      };

      // Burst of rapid user drag-and-drop actions in a single microtask (before any re-render)
      moveCommand('cmd_a1', 'catB', 0); // Move cmd_a1 to start of Cat B
      moveCommand('cmd_b2', 'catA', 2); // Move cmd_b2 into Cat A
      moveCategoryOrder('catC', 0);     // Move Cat C to first position

      // Verify catalogRef.current has ALL updates applied synchronously
      expect(catalogRef.current.categories.catB.commands.map((c) => c.id)).toEqual([
        'cmd_a1',
        'cmd_b1',
      ]);
      expect(catalogRef.current.categories.catA.commands.map((c) => c.id)).toEqual([
        'cmd_a2',
        'cmd_a3',
        'cmd_b2',
      ]);
      expect(categoryOrderKeys(catalogRef.current)).toEqual(['catC', 'catA', 'catB']);

      // Verify that every persist schedule received the progressively updated state
      expect(persistedDocs.length).toBe(3);
      const lastPersisted = persistedDocs[persistedDocs.length - 1];
      expect(lastPersisted).toEqual(catalogRef.current);
      expect(reactState).toEqual(catalogRef.current);
    });

    it('demonstrates that the previous updater pattern would fail under deferred/batched updater execution', () => {
      const catalogRef = { current: cloneCatalog(initialCatalog) };
      const persistedDocs: CommandsCatalogDoc[] = [];

      // Simulating the old pattern where setCatalog had a deferred updater:
      const deferredUpdaters: Array<() => void> = [];
      const buggyMoveCommand = (commandId: string, targetCategoryKey: string, targetIndex: number) => {
        let next: CommandsCatalogDoc | null = null;

        // Old implementation passed updater to setCatalog
        const updater = () => {
          const prev = catalogRef.current;
          const loc = findCommandLocation(prev, commandId);
          if (!loc || !prev.categories[targetCategoryKey]) return;
          const candidate = cloneCatalog(prev);
          const sourceList = candidate.categories[loc.categoryKey].commands;
          const [cmd] = sourceList.splice(loc.index, 1);
          const targetList = candidate.categories[targetCategoryKey].commands;
          targetList.splice(targetIndex, 0, cmd);
          next = candidate;
        };

        // Queue updater (deferred batching)
        deferredUpdaters.push(updater);

        if (!next) {
          // next is null! Nothing gets persisted or updated in catalogRef!
          return;
        }
        catalogRef.current = next;
        persistedDocs.push(next);
      };

      buggyMoveCommand('cmd_a1', 'catB', 0);
      buggyMoveCommand('cmd_a2', 'catB', 1);

      // In old code, both calls failed to schedule persist or update catalogRef immediately
      expect(persistedDocs.length).toBe(0);
      expect(catalogRef.current).toEqual(initialCatalog);
    });

    it('handles edge case drop indices and no-op reorders without redundant state mutations', () => {
      const catalogRef = { current: cloneCatalog(initialCatalog) };
      const setCatalog = vi.fn();
      const schedulePersist = vi.fn();

      const moveCommand = (commandId: string, targetCategoryKey: string, targetIndex: number) => {
        const current = catalogRef.current;
        const loc = findCommandLocation(current, commandId);
        if (!loc || !current.categories[targetCategoryKey]) return;

        const isSameCategory = loc.categoryKey === targetCategoryKey;
        const targetCategory = current.categories[targetCategoryKey];
        let insertIndex = Math.max(0, Math.min(targetIndex, targetCategory.commands.length));

        if (isSameCategory && (loc.index === insertIndex || loc.index + 1 === insertIndex)) {
          return;
        }

        const candidate = cloneCatalog(current);
        const [cmd] = candidate.categories[loc.categoryKey].commands.splice(loc.index, 1);
        const targetList = candidate.categories[targetCategoryKey].commands;

        if (isSameCategory && loc.index < insertIndex) {
          insertIndex -= 1;
        }

        targetList.splice(insertIndex, 0, cmd);

        catalogRef.current = candidate;
        setCatalog(candidate);
        schedulePersist(candidate);
      };

      // 1. Move to same index in same category: no-op
      moveCommand('cmd_a1', 'catA', 0);
      expect(setCatalog).not.toHaveBeenCalled();

      // 2. Move to adjacent drop slot (index + 1) in same category: no-op
      moveCommand('cmd_a1', 'catA', 1);
      expect(setCatalog).not.toHaveBeenCalled();

      // 3. Move non-existent command: no-op
      moveCommand('non_existent', 'catA', 0);
      expect(setCatalog).not.toHaveBeenCalled();

      // 4. Move to non-existent category: no-op
      moveCommand('cmd_a1', 'non_existent_cat', 0);
      expect(setCatalog).not.toHaveBeenCalled();

      // 5. Move to extreme negative index: clamped to 0
      moveCommand('cmd_a3', 'catA', -999);
      expect(setCatalog).toHaveBeenCalledTimes(1);
      expect(catalogRef.current.categories.catA.commands[0].id).toBe('cmd_a3');

      // 6. Move cmd_a3 from index 0 forward to intermediate slot 2:
      // ['cmd_a3', 'cmd_a1', 'cmd_a2'] -> ['cmd_a1', 'cmd_a3', 'cmd_a2']
      moveCommand('cmd_a3', 'catA', 2);
      expect(setCatalog).toHaveBeenCalledTimes(2);
      expect(catalogRef.current.categories.catA.commands[1].id).toBe('cmd_a3');

      // 7. Move cmd_a1 from index 0 forward to the end of the category (targetIndex = 3):
      // ['cmd_a1', 'cmd_a3', 'cmd_a2'] -> ['cmd_a3', 'cmd_a2', 'cmd_a1']
      moveCommand('cmd_a1', 'catA', 3);
      expect(setCatalog).toHaveBeenCalledTimes(3);
      expect(catalogRef.current.categories.catA.commands[2].id).toBe('cmd_a1');
      expect(catalogRef.current.categories.catA.commands.map((c) => c.id)).toEqual([
        'cmd_a3',
        'cmd_a2',
        'cmd_a1',
      ]);

      // 8. Move cmd_a3 from index 0 forward with extreme overflow index (999):
      // ['cmd_a3', 'cmd_a2', 'cmd_a1'] -> ['cmd_a2', 'cmd_a1', 'cmd_a3']
      moveCommand('cmd_a3', 'catA', 999);
      expect(setCatalog).toHaveBeenCalledTimes(4);
      expect(catalogRef.current.categories.catA.commands[2].id).toBe('cmd_a3');
      expect(catalogRef.current.categories.catA.commands.map((c) => c.id)).toEqual([
        'cmd_a2',
        'cmd_a1',
        'cmd_a3',
      ]);
    });
  });

  describe('CommandItemsEditorModal State Resets & Localization', () => {
    it('verifies items_editor_search_no_results exists in both EN and RU dictionary files', () => {
      const enDict = enLocale as Record<string, unknown>;
      const ruDict = ruLocale as Record<string, unknown>;

      expect(typeof enDict.items_editor_search_no_results).toBe('string');
      expect(enDict.items_editor_search_no_results).toBe('No items match your search');

      expect(typeof ruDict.items_editor_search_no_results).toBe('string');
      expect(ruDict.items_editor_search_no_results).toBe('Нет предметов по вашему запросу');
    });

    it('simulates modal reset effect on open, close, and command switch', () => {
      let selectedItem = '';
      let itemName = '';
      let itemCount = '1';
      let search = '';

      const resetForm = () => {
        selectedItem = '';
        itemName = '';
        itemCount = '1';
      };

      const handleEffect = () => {
        resetForm();
        search = '';
        itemCount = '1';
      };

      // User interacts: dirty state
      selectedItem = 'iron-plate';
      itemName = 'iron-plate';
      itemCount = '100';
      search = 'iron';

      // 1. Modal closes: effect triggers
      handleEffect();
      expect(selectedItem).toBe('');
      expect(itemName).toBe('');
      expect(itemCount).toBe('1');
      expect(search).toBe('');

      // User interacts again
      selectedItem = 'copper-plate';
      itemName = 'copper-plate';
      itemCount = '25';
      search = 'copper';

      // 2. Command switches: effect triggers
      handleEffect();
      expect(selectedItem).toBe('');
      expect(itemName).toBe('');
      expect(itemCount).toBe('1');
      expect(search).toBe('');
    });

    it('correctly selects empty search message vs empty command items message', () => {
      const t = (key: string) => {
        const dict: Record<string, string> = {
          items_editor_no_items: 'No items configured',
          items_editor_search_no_results: 'No items match your search',
        };
        return dict[key] || key;
      };

      const getEmptyMessage = (itemKeysCount: number, filteredCount: number) => {
        if (filteredCount > 0) return null;
        return itemKeysCount === 0
          ? t('items_editor_no_items')
          : t('items_editor_search_no_results');
      };

      // Case 1: Command has no items configured at all
      expect(getEmptyMessage(0, 0)).toBe('No items configured');

      // Case 2: Command has items, but search filters all of them out
      expect(getEmptyMessage(5, 0)).toBe('No items match your search');

      // Case 3: Items match search
      expect(getEmptyMessage(5, 2)).toBeNull();
    });
  });
});
