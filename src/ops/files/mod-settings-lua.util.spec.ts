import {
  parseLuaListLiteralInner,
  extractAllowedValuesFromLuaText,
  extractSettingNamesFromLuaText,
  extractLuaModSettingUiStrings,
  ingestSettingsLuaText,
  modSettingValuesEqual,
  rowShouldUseChoiceCombo,
  modSettingChoiceLocaleKeys,
  isSettingsLuaMember,
  type LuaSettingUiRefs,
} from './mod-settings-lua.util';

describe('mod-settings-lua.util', () => {
  describe('parseLuaListLiteralInner', () => {
    it('returns empty array on empty or whitespace string', () => {
      expect(parseLuaListLiteralInner('')).toEqual([]);
      expect(parseLuaListLiteralInner('   ')).toEqual([]);
    });

    it('parses string literals with single and double quotes and escaped chars', () => {
      const res = parseLuaListLiteralInner(
        '"first", \'second\', "escaped \\"quote\\""',
      );
      expect(res).toEqual(['first', 'second', 'escaped "quote"']);
    });

    it('parses booleans, numbers, and integers', () => {
      const res = parseLuaListLiteralInner('true, false, 42, -15, 3.14, 1e2');
      expect(res).toEqual([true, false, 42, -15, 3.14, 100]);
    });

    it('handles mixed lists with extra whitespace and trailing commas', () => {
      const res = parseLuaListLiteralInner('  "option-a" , 10 , true , ');
      expect(res).toEqual(['option-a', 10, true]);
    });
  });

  describe('extractAllowedValuesFromLuaText', () => {
    it('extracts allowed_values tables tied to setting name', () => {
      const lua = `
        data:extend({
          {
            type = "string-setting",
            name = "my-mode-setting",
            setting_type = "runtime-global",
            default_value = "normal",
            allowed_values = { "easy", "normal", "hard" },
          }
        })
      `;

      const result = extractAllowedValuesFromLuaText(lua);
      expect(result['my-mode-setting']).toEqual(['easy', 'normal', 'hard']);
    });

    it('returns empty record when no allowed_values are present', () => {
      const lua = `
        data:extend({
          {
            type = "bool-setting",
            name = "enable-feature",
            default_value = true,
          }
        })
      `;

      expect(extractAllowedValuesFromLuaText(lua)).toEqual({});
    });
  });

  describe('extractSettingNamesFromLuaText', () => {
    it('finds setting names with name before or after type', () => {
      const lua = `
        {
          type = "int-setting",
          name = "speed-multiplier",
        },
        {
          name = "enable-extra-ore",
          type = "bool-setting",
        }
      `;

      const names = extractSettingNamesFromLuaText(lua);
      expect(names.has('speed-multiplier')).toBe(true);
      expect(names.has('enable-extra-ore')).toBe(true);
    });

    it('ignores non-setting entries', () => {
      const lua = `
        {
          type = "item",
          name = "iron-plate",
        }
      `;

      const names = extractSettingNamesFromLuaText(lua);
      expect(names.has('iron-plate')).toBe(false);
    });
  });

  describe('extractLuaModSettingUiStrings', () => {
    let refs: LuaSettingUiRefs;

    beforeEach(() => {
      refs = {
        titles: {},
        descriptions: {},
        titleRefs: {},
        descRefs: {},
      };
    });

    it('extracts literal localised_name and localised_description', () => {
      const lua = `
        {
          type = "bool-setting",
          name = "fancy-toggle",
          localised_name = "Fancy Toggle Option",
          localised_description = "Enables fancy animations and effects",
        }
      `;

      extractLuaModSettingUiStrings(lua, refs);
      expect(refs.titles['fancy-toggle']).toBe('Fancy Toggle Option');
      expect(refs.descriptions['fancy-toggle']).toBe(
        'Enables fancy animations and effects',
      );
    });

    it('extracts 2-tuple localised references', () => {
      const lua = `
        {
          type = "string-setting",
          name = "custom-palette",
          localised_name = { "mod-gui", "palette-title" },
          localised_description = { "mod-gui", "palette-desc" },
        }
      `;

      extractLuaModSettingUiStrings(lua, refs);
      expect(refs.titleRefs['custom-palette']).toEqual([
        'mod-gui',
        'palette-title',
      ]);
      expect(refs.descRefs['custom-palette']).toEqual([
        'mod-gui',
        'palette-desc',
      ]);
    });

    it('extracts nested localised array references', () => {
      const lua = `
        {
          type = "string-setting",
          name = "nested-title-setting",
          localised_name = { "", { "sub-cat", "sub-title" } },
          localised_description = { { "desc-cat", "desc-key" } },
        }
      `;

      extractLuaModSettingUiStrings(lua, refs);
      expect(refs.titleRefs['nested-title-setting']).toEqual([
        'sub-cat',
        'sub-title',
      ]);
      expect(refs.descRefs['nested-title-setting']).toEqual([
        'desc-cat',
        'desc-key',
      ]);
    });

    it('extracts dotted 1-element string references', () => {
      const lua = `
        {
          type = "string-setting",
          name = "dotted-setting",
          localised_name = { "locale-category.my-title" },
          localised_description = { "locale-category.my-desc" },
        }
      `;

      extractLuaModSettingUiStrings(lua, refs);
      expect(refs.titleRefs['dotted-setting']).toEqual([
        'locale-category',
        'my-title',
      ]);
      expect(refs.descRefs['dotted-setting']).toEqual([
        'locale-category',
        'my-desc',
      ]);
    });
  });

  describe('ingestSettingsLuaText', () => {
    it('aggregates ownerMod, allowedValues, and UI metadata from lua text', () => {
      const ownerMod: Record<string, string> = {};
      const allowedValues: Record<string, unknown[]> = {};
      const ui: LuaSettingUiRefs = {
        titles: {},
        descriptions: {},
        titleRefs: {},
        descRefs: {},
      };

      const lua = `
        {
          type = "string-setting",
          name = "difficulty-mode",
          allowed_values = { "peaceful", "hostile" },
          localised_name = "Difficulty Mode",
        }
      `;

      ingestSettingsLuaText(lua, 'my-mod', ownerMod, allowedValues, ui);
      expect(ownerMod['difficulty-mode']).toBe('my-mod');
      expect(allowedValues['difficulty-mode']).toEqual(['peaceful', 'hostile']);
      expect(ui.titles['difficulty-mode']).toBe('Difficulty Mode');
    });
  });

  describe('modSettingValuesEqual', () => {
    it('returns true for strictly equal values', () => {
      expect(modSettingValuesEqual('hello', 'hello')).toBe(true);
      expect(modSettingValuesEqual(true, true)).toBe(true);
      expect(modSettingValuesEqual(false, false)).toBe(true);
      expect(modSettingValuesEqual(10, 10)).toBe(true);
    });

    it('compares floats with epsilon tolerance', () => {
      expect(modSettingValuesEqual(0.1 + 0.2, 0.3)).toBe(true);
      expect(modSettingValuesEqual(1.00000000001, 1.0)).toBe(true);
      expect(modSettingValuesEqual(1.01, 1.0)).toBe(false);
    });

    it('returns false for different types including booleans vs numbers', () => {
      expect(modSettingValuesEqual(true, 1)).toBe(false);
      expect(modSettingValuesEqual(false, 0)).toBe(false);
      expect(modSettingValuesEqual('10', 10)).toBe(false);
    });
  });

  describe('rowShouldUseChoiceCombo', () => {
    it('returns false if allowed array is empty', () => {
      expect(rowShouldUseChoiceCombo('opt', [])).toBe(false);
    });

    it('returns true when value type matches all allowed item types', () => {
      expect(rowShouldUseChoiceCombo('opt1', ['opt1', 'opt2'])).toBe(true);
      expect(rowShouldUseChoiceCombo(true, [true, false])).toBe(true);
      expect(rowShouldUseChoiceCombo(10, [5, 10, 15])).toBe(true);
    });

    it('returns false when types mismatch', () => {
      expect(rowShouldUseChoiceCombo('10', [10, 20])).toBe(false);
      expect(rowShouldUseChoiceCombo(10, ['10', '20'])).toBe(false);
    });
  });

  describe('modSettingChoiceLocaleKeys', () => {
    it('generates keys for boolean choices', () => {
      expect(modSettingChoiceLocaleKeys('my-bool', true)).toEqual([
        'my-bool-true',
      ]);
      expect(modSettingChoiceLocaleKeys('my-bool', false)).toEqual([
        'my-bool-false',
      ]);
    });

    it('generates keys for string choices', () => {
      expect(modSettingChoiceLocaleKeys('my-str', 'easy')).toEqual([
        'my-str-easy',
      ]);
    });

    it('generates keys for integer and float numbers without duplicate entries', () => {
      const intKeys = modSettingChoiceLocaleKeys('my-num', 5);
      expect(intKeys).toContain('my-num-5');

      const floatKeys = modSettingChoiceLocaleKeys('my-float', 2.5);
      expect(floatKeys).toContain('my-float-2.5');
    });
  });

  describe('isSettingsLuaMember', () => {
    it('returns true for root settings files', () => {
      expect(isSettingsLuaMember('settings.lua')).toBe(true);
      expect(isSettingsLuaMember('settings-updates.lua')).toBe(true);
      expect(isSettingsLuaMember('sub/SETTINGS.LUA')).toBe(true);
    });

    it('returns true for files in settings directory', () => {
      expect(isSettingsLuaMember('mod/settings/runtime.lua')).toBe(true);
      expect(isSettingsLuaMember('mods/my-mod/settings/startup.lua')).toBe(
        true,
      );
      expect(isSettingsLuaMember('mods\\my-mod\\settings\\startup.lua')).toBe(
        true,
      );
    });

    it('returns false for non-setting files', () => {
      expect(isSettingsLuaMember('data.lua')).toBe(false);
      expect(isSettingsLuaMember('control.lua')).toBe(false);
      expect(isSettingsLuaMember('settings.txt')).toBe(false);
    });
  });
});
