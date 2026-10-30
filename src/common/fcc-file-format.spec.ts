import {
  FCC_FILE_FORMAT,
  FCC_FILE_VERSION,
  fccFileKindContainsLabel,
  buildFccFileEnvelope,
  parseJsonObject,
  unwrapModpackPayload,
  unwrapMapPresetPayload,
  unwrapMapPresetsFromFile,
} from './fcc-file-format';

describe('fcc-file-format', () => {
  describe('fccFileKindContainsLabel', () => {
    it('returns default labels for kinds', () => {
      expect(fccFileKindContainsLabel('modpack')).toBe('Modpack');
      expect(fccFileKindContainsLabel('map_preset')).toBe('Map preset');
      expect(fccFileKindContainsLabel('map_presets')).toBe('Map presets');
    });

    it('returns localized string if key exists in dictionary', () => {
      const strings = {
        fcc_file_contains_modpack: 'Набор модов',
        fcc_file_contains_map_preset: 'Шаблон карты',
      };
      expect(fccFileKindContainsLabel('modpack', strings)).toBe('Набор модов');
      expect(fccFileKindContainsLabel('map_preset', strings)).toBe(
        'Шаблон карты',
      );
      expect(fccFileKindContainsLabel('map_presets', strings)).toBe(
        'Map presets',
      );
    });
  });

  describe('buildFccFileEnvelope', () => {
    it('builds standard envelope with format and version', () => {
      const envelope = buildFccFileEnvelope('modpack', 'My Pack', {
        mods: ['base'],
      });

      expect(envelope).toEqual({
        format: FCC_FILE_FORMAT,
        format_version: FCC_FILE_VERSION,
        kind: 'modpack',
        contains: 'Modpack',
        name: 'My Pack',
        data: { mods: ['base'] },
      });
    });

    it('includes optional description, created_at, and custom contains label', () => {
      const envelope = buildFccFileEnvelope(
        'map_preset',
        'Deathworld',
        { difficulty: 'hard' },
        {
          description: 'Hard settings',
          created_at: '2026-10-30T20:00:00Z',
          contains: 'Custom Contains',
        },
      );

      expect(envelope.description).toBe('Hard settings');
      expect(envelope.created_at).toBe('2026-10-30T20:00:00Z');
      expect(envelope.contains).toBe('Custom Contains');
    });
  });

  describe('parseJsonObject', () => {
    it('returns null on invalid JSON string', () => {
      expect(parseJsonObject('not json')).toBeNull();
      expect(parseJsonObject('')).toBeNull();
    });

    it('returns null if JSON is array or primitive', () => {
      expect(parseJsonObject('[1, 2, 3]')).toBeNull();
      expect(parseJsonObject('"string"')).toBeNull();
      expect(parseJsonObject('123')).toBeNull();
      expect(parseJsonObject('null')).toBeNull();
    });

    it('returns parsed record for valid JSON object', () => {
      expect(parseJsonObject('{"key": "value"}')).toEqual({ key: 'value' });
    });
  });

  describe('unwrapModpackPayload', () => {
    it('returns null for non-objects or arrays', () => {
      expect(unwrapModpackPayload(null)).toBeNull();
      expect(unwrapModpackPayload('text')).toBeNull();
      expect(unwrapModpackPayload([])).toBeNull();
    });

    it('returns null if format or kind does not match modpack', () => {
      expect(
        unwrapModpackPayload({
          format: 'wrong-format',
          kind: 'modpack',
          data: {},
        }),
      ).toBeNull();
      expect(
        unwrapModpackPayload({
          format: FCC_FILE_FORMAT,
          kind: 'other_kind',
          data: {},
        }),
      ).toBeNull();
    });

    it('returns null if data is not an object or is an array', () => {
      expect(
        unwrapModpackPayload({
          format: FCC_FILE_FORMAT,
          kind: 'modpack',
          data: 'invalid',
        }),
      ).toBeNull();
      expect(
        unwrapModpackPayload({
          format: FCC_FILE_FORMAT,
          kind: 'modpack',
          data: [1, 2],
        }),
      ).toBeNull();
    });

    it('unwraps modpack data object successfully', () => {
      const payload = {
        format: FCC_FILE_FORMAT,
        kind: 'modpack',
        name: 'Space Age Modpack',
        data: { mods: [{ name: 'space-age', enabled: true }] },
      };

      expect(unwrapModpackPayload(payload)).toEqual({
        mods: [{ name: 'space-age', enabled: true }],
      });
    });
  });

  describe('unwrapMapPresetPayload', () => {
    it('returns null for invalid or non-preset payload', () => {
      expect(unwrapMapPresetPayload(null)).toBeNull();
      expect(
        unwrapMapPresetPayload({
          format: FCC_FILE_FORMAT,
          kind: 'modpack',
          data: {},
        }),
      ).toBeNull();
    });

    it('returns null if data.state is missing or invalid', () => {
      expect(
        unwrapMapPresetPayload({
          format: FCC_FILE_FORMAT,
          kind: 'map_preset',
          data: { name: 'Preset1' },
        }),
      ).toBeNull();
      expect(
        unwrapMapPresetPayload({
          format: FCC_FILE_FORMAT,
          kind: 'map_preset',
          data: { name: 'Preset1', state: 'bad_state' },
        }),
      ).toBeNull();
    });

    it('returns null if preset name is missing in both obj and data', () => {
      expect(
        unwrapMapPresetPayload({
          format: FCC_FILE_FORMAT,
          kind: 'map_preset',
          data: { state: { seed: 123 } },
        }),
      ).toBeNull();
    });

    it('unwraps valid map preset payload', () => {
      const payload = {
        format: FCC_FILE_FORMAT,
        kind: 'map_preset',
        name: 'Rail World',
        description: 'Rich resources far away',
        data: {
          state: { water: 'high', seed: 42 },
        },
      };

      expect(unwrapMapPresetPayload(payload)).toEqual({
        name: 'Rail World',
        description: 'Rich resources far away',
        state: { water: 'high', seed: 42 },
      });
    });
  });

  describe('unwrapMapPresetsFromFile', () => {
    it('unwraps single preset as an array of 1 item', () => {
      const singlePayload = {
        format: FCC_FILE_FORMAT,
        kind: 'map_preset',
        name: 'Single',
        data: { state: { peaceful: true } },
      };

      expect(unwrapMapPresetsFromFile(singlePayload)).toEqual([
        { name: 'Single', state: { peaceful: true } },
      ]);
    });

    it('returns null for non-matching multi-preset envelope', () => {
      expect(unwrapMapPresetsFromFile(null)).toBeNull();
      expect(
        unwrapMapPresetsFromFile({
          format: FCC_FILE_FORMAT,
          kind: 'unknown',
          data: {},
        }),
      ).toBeNull();
      expect(
        unwrapMapPresetsFromFile({
          format: FCC_FILE_FORMAT,
          kind: 'map_presets',
          data: { presets: 'not-an-array' },
        }),
      ).toBeNull();
      expect(
        unwrapMapPresetsFromFile({
          format: FCC_FILE_FORMAT,
          kind: 'map_presets',
          data: { presets: [] },
        }),
      ).toBeNull();
    });

    it('unwraps multiple presets and skips invalid entries', () => {
      const multiPayload = {
        format: FCC_FILE_FORMAT,
        kind: 'map_presets',
        data: {
          presets: [
            { name: 'Preset 1', state: { seed: 1 } },
            'invalid row',
            { name: 'No state' },
            { state: { seed: 2 } }, // missing name -> null
            { name: 'Preset 2', state: { seed: 3 } },
          ],
        },
      };

      expect(unwrapMapPresetsFromFile(multiPayload)).toEqual([
        { name: 'Preset 1', state: { seed: 1 } },
        { name: 'Preset 2', state: { seed: 3 } },
      ]);
    });
  });
});
