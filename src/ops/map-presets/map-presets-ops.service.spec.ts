import { MapPresetsOpsService } from './map-presets-ops.service';
import { PathsService } from '../../config/paths.service';
import { FccConfigService } from '../../config/fcc-config.service';
import { LocaleService } from '../../locale/locale.service';
import * as fs from 'fs';

jest.mock('fs', () => ({
  ...jest.requireActual<Record<string, unknown>>('fs'),
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
}));

describe('MapPresetsOpsService', () => {
  let service: MapPresetsOpsService;
  let mockPaths: jest.Mocked<PathsService>;
  let mockConfig: { langCode: string };
  let mockLocale: { readLang: jest.Mock };

  const mockFs = jest.mocked(fs);

  beforeEach(() => {
    jest.clearAllMocks();

    mockPaths = {
      mapPresetsDir: '/test/data/map-presets',
    } as unknown as jest.Mocked<PathsService>;

    mockConfig = {
      langCode: 'ru',
    };

    mockLocale = {
      readLang: jest.fn().mockReturnValue({ 'fcc.map_preset': 'Пресет карты' }),
    };

    mockFs.existsSync.mockReturnValue(false);

    service = new MapPresetsOpsService(
      mockPaths,
      mockConfig as unknown as FccConfigService,
      mockLocale as unknown as LocaleService,
    );
  });

  describe('list()', () => {
    it('returns empty array if index file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      const res = service.list();
      expect(res).toEqual({ ok: true, presets: [] });
    });

    it('returns parsed presets from index.json', () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readFileSync as unknown as jest.Mock).mockReturnValue(
        JSON.stringify({
          presets: [
            {
              id: 'p-1',
              name: 'Rail World',
              created_at: '2026-10-30',
              state: { frequency: 'very-low' },
            },
          ],
        }),
      );

      const res = service.list();
      expect(res.ok).toBe(true);
      expect(res['presets']).toHaveLength(1);
      const presets = res['presets'] as { name: string }[];
      expect(presets[0].name).toBe('Rail World');
    });

    it('recovers gracefully from corrupted index.json', () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readFileSync as unknown as jest.Mock).mockReturnValue(
        '{bad-json',
      );

      const res = service.list();
      expect(res).toEqual({ ok: true, presets: [] });
    });
  });

  describe('save()', () => {
    it('validates preset name and state', () => {
      expect(service.save('', { seed: 123 })).toEqual({
        ok: false,
        error: 'invalid_name',
      });
      expect(service.save('  ', { seed: 123 })).toEqual({
        ok: false,
        error: 'invalid_name',
      });
      expect(service.save('Good Preset', null)).toEqual({
        ok: false,
        error: 'invalid_state',
      });
      expect(service.save('Good Preset', 'string-state')).toEqual({
        ok: false,
        error: 'invalid_state',
      });
      expect(service.save('Good Preset', [1, 2, 3])).toEqual({
        ok: false,
        error: 'invalid_state',
      });
    });

    it('saves new preset and writes updated index', () => {
      mockFs.existsSync.mockReturnValue(false);

      const res = service.save('Death World Pro', { biters: 'hard' });
      expect(res.ok).toBe(true);
      expect(res['preset']).toMatchObject({
        name: 'Death World Pro',
        state: { biters: 'hard' },
      });
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });

    it('caps presets to MAX_PRESETS (30)', () => {
      const existingPresets = Array.from({ length: 30 }, (_, i) => ({
        id: `p-${i}`,
        name: `Preset ${i}`,
        created_at: '2026-10-30',
        state: { i },
      }));

      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readFileSync as unknown as jest.Mock).mockReturnValue(
        JSON.stringify({ presets: existingPresets }),
      );

      const res = service.save('New 31st Preset', { new: true });
      expect(res.ok).toBe(true);

      const writtenJson = mockFs.writeFileSync.mock.calls[0][1] as string;
      const parsed = JSON.parse(writtenJson) as { presets: unknown[] };
      expect(parsed.presets).toHaveLength(30);
      expect((parsed.presets[0] as { name: string }).name).toBe(
        'New 31st Preset',
      );
    });
  });

  describe('delete()', () => {
    it('validates id', () => {
      expect(service.delete('')).toEqual({ ok: false, error: 'invalid_id' });
    });

    it('returns not_found if preset does not exist', () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readFileSync as unknown as jest.Mock).mockReturnValue(
        JSON.stringify({ presets: [{ id: 'p-1', name: 'P1', state: {} }] }),
      );

      const res = service.delete('non-existent-id');
      expect(res).toEqual({ ok: false, error: 'not_found' });
    });

    it('deletes existing preset and updates index', () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readFileSync as unknown as jest.Mock).mockReturnValue(
        JSON.stringify({
          presets: [
            { id: 'p-1', name: 'P1', state: {} },
            { id: 'p-2', name: 'P2', state: {} },
          ],
        }),
      );

      const res = service.delete('p-1');
      expect(res).toEqual({ ok: true });
      expect(mockFs.writeFileSync).toHaveBeenCalled();

      const written = JSON.parse(
        mockFs.writeFileSync.mock.calls[0][1] as string,
      ) as {
        presets: { id: string }[];
      };
      expect(written.presets).toHaveLength(1);
      expect(written.presets[0].id).toBe('p-2');
    });
  });

  describe('exportPrepare()', () => {
    it('validates id and returns not_found if missing', () => {
      expect(service.exportPrepare('')).toEqual({
        ok: false,
        error: 'invalid_id',
      });

      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readFileSync as unknown as jest.Mock).mockReturnValue(
        JSON.stringify({ presets: [] }),
      );
      expect(service.exportPrepare('missing-id')).toEqual({
        ok: false,
        error: 'not_found',
      });
    });

    it('creates .fcc envelope file in tmpdir and returns path', () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readFileSync as unknown as jest.Mock).mockReturnValue(
        JSON.stringify({
          presets: [
            {
              id: 'p-100',
              name: 'My Special Map',
              created_at: '2026-10-30T12:00:00Z',
              state: { seed: '42' },
            },
          ],
        }),
      );

      const res = service.exportPrepare('p-100');
      expect(res.ok).toBe(true);
      expect(res['name']).toBe('My_Special_Map.fcc');
      expect(res['path']).toContain('My_Special_Map.fcc');
      expect(mockFs.writeFileSync).toHaveBeenCalled();
    });
  });

  describe('importUpload() and importBatch()', () => {
    it('returns error if tmp file does not exist', () => {
      mockFs.existsSync.mockReturnValue(false);
      const res = service.importUpload('/tmp/nonexistent.fcc');
      expect(res).toEqual({ ok: false, error: 'tmp_not_found' });
    });

    it('returns error if file format is invalid', () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readFileSync as unknown as jest.Mock).mockReturnValue(
        '{bad-json',
      );
      const res = service.importUpload('/tmp/bad.fcc');
      expect(res).toEqual({ ok: false, error: 'invalid_format' });
    });

    it('imports map presets from valid fcc envelope file', () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readFileSync as unknown as jest.Mock).mockReturnValue(
        JSON.stringify({
          format: 'fcc-file',
          format_version: 1,
          kind: 'map_preset',
          name: 'Imported Preset',
          data: {
            state: { water: 'none' },
          },
        }),
      );

      const res = service.importUpload('/tmp/valid.fcc');
      expect(res.ok).toBe(true);
      expect(res['imported_count']).toBe(1);
      const added = res['added'] as { name: string }[];
      expect(added).toHaveLength(1);
      expect(added[0].name).toBe('Imported Preset');
    });

    it('skips duplicate preset names during batch import', () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readFileSync as unknown as jest.Mock).mockReturnValue(
        JSON.stringify({
          presets: [
            {
              id: 'p-1',
              name: 'Existing Preset',
              state: {},
            },
          ],
        }),
      );

      const res = service.importBatch([
        { name: 'Existing Preset', state: { diff: 1 } },
        { name: 'Unique Preset', state: { diff: 2 } },
      ]);

      expect(res.ok).toBe(true);
      expect(res['imported_count']).toBe(1);
      expect(res['skipped_count']).toBe(1);
      expect(res['skipped']).toEqual(['Existing Preset']);
    });

    it('returns skipped summary when all items are duplicates', () => {
      mockFs.existsSync.mockReturnValue(true);
      (mockFs.readFileSync as unknown as jest.Mock).mockReturnValue(
        JSON.stringify({
          presets: [{ id: 'p-1', name: 'Existing Preset', state: {} }],
        }),
      );

      const res = service.importBatch([
        { name: 'Existing Preset', state: { diff: 1 } },
      ]);

      expect(res.ok).toBe(true);
      expect(res['imported_count']).toBe(0);
      expect(res['skipped_count']).toBe(1);
    });

    it('returns invalid_state when items list is empty or completely invalid', () => {
      const res = service.importBatch([]);
      expect(res).toEqual({ ok: false, error: 'invalid_state' });
    });
  });
});
