import { describe, expect, it } from 'vitest';
import {
  buildSectionGroups,
  choiceLabelText,
  ensureModSettingsDocument,
  groupSortKey,
  inferSettingValueKind,
  localizeModSettingsError,
  matchesSettingsFilter,
  modSettingValuesEqual,
  parseModSettingsDocument,
  rowShouldUseChoiceCombo,
  schemaProgressMessage,
  schemaProgressPercent,
} from './modSettingsUtils';
import {
  MOD_SETTINGS_OTHER_GROUP,
  type ModSettingSchemaEntry,
  type ModSettingsDocument,
} from '../types/modSettings';

const identityT = (key: string, ...args: (string | number)[]) =>
  args.length ? `${key}:${args.join(',')}` : key;

describe('modSettingsUtils', () => {
  describe('parseModSettingsDocument & ensureModSettingsDocument', () => {
    it('parses valid ModSettings JSON and initializes missing sections', () => {
      const raw = JSON.stringify({
        '!type': 'ModSettings',
        version: [2, 0, 32, 0],
        has_quality: true,
        data: {
          startup: { 'my-bool': { value: true } },
          'runtime-global': ['corrupted-array'],
        },
      });

      const doc = parseModSettingsDocument(raw);
      expect(doc['!type']).toBe('ModSettings');
      expect(doc.data.startup).toEqual({ 'my-bool': { value: true } });
      expect(doc.data['runtime-global']).toEqual({});
      expect(doc.data['runtime-per-user']).toEqual({});
    });

    it('throws expected_mod_settings_root when !type is missing or wrong', () => {
      expect(() =>
        parseModSettingsDocument(JSON.stringify({ '!type': 'Other' })),
      ).toThrow('expected_mod_settings_root');

      const fixed = ensureModSettingsDocument({
        '!type': 'ModSettings',
        version: [2, 0, 0, 0],
        has_quality: false,
      } as unknown as ModSettingsDocument);
      expect(fixed.data.startup).toEqual({});
    });
  });

  describe('inferSettingValueKind', () => {
    it('classifies Factorio ModSettings entry shapes', () => {
      expect(inferSettingValueKind({ value: true })).toEqual({
        kind: 'bool',
        value: true,
      });
      expect(inferSettingValueKind({ value: 42 })).toEqual({
        kind: 'int',
        value: 42,
      });
      expect(inferSettingValueKind({ value: 3.14 })).toEqual({
        kind: 'float',
        value: 3.14,
      });
      expect(inferSettingValueKind({ value: 'fast' })).toEqual({
        kind: 'string',
        value: 'fast',
      });
      expect(
        inferSettingValueKind({
          value: { '!pt': 'uint64', v: '9007199254740993' },
        }),
      ).toEqual({
        kind: 'uint64',
        value: { '!pt': 'uint64', v: '9007199254740993' },
      });
      expect(
        inferSettingValueKind({ value: { r: 1, g: 0.5, b: 0, a: 1 } }),
      ).toEqual({
        kind: 'color',
        value: { r: 1, g: 0.5, b: 0, a: 1 },
      });
      expect(inferSettingValueKind({ value: { nested: 'custom' } })).toEqual({
        kind: 'json_value',
        value: { nested: 'custom' },
      });
      expect(inferSettingValueKind({ value: 1, extra: true })).toEqual({
        kind: 'json_entry',
      });
    });
  });

  describe('value comparison and combo eligibility', () => {
    it('compares floats within epsilon and rejects cross-type equality', () => {
      expect(modSettingValuesEqual(0.1 + 0.2, 0.3)).toBe(true);
      expect(modSettingValuesEqual(1.0, 1.0001)).toBe(false);
      expect(modSettingValuesEqual(true, 1)).toBe(false);
      expect(modSettingValuesEqual('abc', 'abc')).toBe(true);
    });

    it('detects homogeneous allowed choice lists', () => {
      expect(rowShouldUseChoiceCombo('a', ['a', 'b'])).toBe(true);
      expect(rowShouldUseChoiceCombo(10, [10, 20, 30])).toBe(true);
      expect(rowShouldUseChoiceCombo(true, [true, false])).toBe(true);
      expect(rowShouldUseChoiceCombo('a', [])).toBe(false);
      expect(rowShouldUseChoiceCombo('a', ['a', 1])).toBe(false);
      expect(rowShouldUseChoiceCombo(Number.NaN, [1, 2])).toBe(false);
    });

    it('localizes choice labels and mod settings errors with fallbacks', () => {
      expect(choiceLabelText('yes', identityT)).toBe('Yes');
      expect(choiceLabelText('no', identityT)).toBe('No');
      expect(
        choiceLabelText('yes', (k) =>
          k === 'mod_settings_choice_yes' ? 'Да' : k,
        ),
      ).toBe('Да');
      expect(
        localizeModSettingsError('server_running', (k) =>
          k === 'server_running_mutate_blocked' ? 'Stop server first' : k,
        ),
      ).toBe('Stop server first');
      expect(
        localizeModSettingsError('expected_mod_settings_root', identityT),
      ).toBe('mod_settings_not_modsettings');
    });
  });

  describe('grouping, filtering, and schema progress', () => {
    const meta: Record<string, ModSettingSchemaEntry> = {
      'z-solar': {
        display_name: '[color=yellow]Solar Multiplier[/color]',
        description: 'Boosts [font=default-bold]daytime[/font] output',
        group: 'krastorio',
      },
      'a-solar': {
        display_name: 'Accumulator Cap',
        description: '',
        group: 'krastorio',
      },
    };
    const groupTitles = { krastorio: 'Krastorio 2' };

    it('groups keys by mod, sorts case-insensitively, and places Other group last', () => {
      const section = {
        'z-solar': { value: 1 },
        orphan: { value: true },
        'a-solar': { value: 2 },
      };
      const groups = buildSectionGroups(section, meta);
      expect(groups.get('krastorio')).toEqual(['a-solar', 'z-solar']);
      expect(groups.get(MOD_SETTINGS_OTHER_GROUP)).toEqual(['orphan']);

      const sortedGroups = [...groups.keys()].sort((a, b) =>
        groupSortKey(a, groupTitles, identityT).localeCompare(
          groupSortKey(b, groupTitles, identityT),
        ),
      );
      expect(sortedGroups).toEqual(['krastorio', MOD_SETTINGS_OTHER_GROUP]);
    });

    it('matches filter against stripped rich text, description, and group title', () => {
      expect(
        matchesSettingsFilter(
          'z-solar',
          meta['z-solar'],
          groupTitles,
          'solar multiplier',
          identityT,
        ),
      ).toBe(true);
      expect(
        matchesSettingsFilter(
          'z-solar',
          meta['z-solar'],
          groupTitles,
          'daytime output',
          identityT,
        ),
      ).toBe(true);
      expect(
        matchesSettingsFilter(
          'z-solar',
          meta['z-solar'],
          groupTitles,
          'krastorio 2',
          identityT,
        ),
      ).toBe(true);
      expect(
        matchesSettingsFilter(
          'z-solar',
          meta['z-solar'],
          groupTitles,
          'unrelated',
          identityT,
        ),
      ).toBe(false);
    });

    it('calculates schema scan progress percentage and messages', () => {
      expect(schemaProgressPercent(null)).toBeNull();
      expect(schemaProgressPercent({ phase: 'preparing' })).toBe(5);
      expect(
        schemaProgressPercent({ phase: 'scan', mod_done: 5, mod_total: 10 }),
      ).toBe(28);
      expect(schemaProgressPercent({ phase: 'done' })).toBe(100);
      expect(
        schemaProgressMessage(
          { phase: 'scan', mod: 'space-age', mod_done: 2, mod_total: 4 },
          identityT,
        ),
      ).toBe('mod_settings_progress_scan:space-age,2,4');
    });
  });
});
