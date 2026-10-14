import { MapGenController } from './map-gen.controller';
import { MapGenOpsService } from '../../ops/map-gen/map-gen-ops.service';
import type { Response } from 'express';

describe('MapGenController', () => {
  let controller: MapGenController;
  let mockMapGen: {
    getSchema: jest.Mock;
    parseExchangeString: jest.Mock;
    exportExchangeString: jest.Mock;
    generatePreview: jest.Mock;
    generatePreviewProgressive: jest.Mock;
  };

  const mockResponse = () => {
    const written: string[] = [];
    const res: Record<string, unknown> = {};
    const setHeader = jest.fn();
    const write = jest.fn().mockImplementation((chunk: string) => {
      written.push(chunk);
      return true;
    });
    const status = jest.fn().mockReturnValue(res);
    const end = jest.fn().mockReturnValue(res);

    res.setHeader = setHeader;
    res.write = write;
    res.status = status;
    res.end = end;

    return {
      res: res as unknown as Response,
      written,
      setHeader,
      write,
      status,
      end,
    };
  };

  beforeEach(() => {
    mockMapGen = {
      getSchema: jest.fn().mockReturnValue({ type: 'object', properties: {} }),
      parseExchangeString: jest
        .fn()
        .mockReturnValue({ map_gen_settings: { seed: 123 } }),
      exportExchangeString: jest
        .fn()
        .mockReturnValue('>>>MAP_EXCHANGE_TEST<<<'),
      generatePreview: jest.fn().mockResolvedValue(Buffer.from('fake-png')),
      generatePreviewProgressive: jest
        .fn()
        .mockResolvedValue({ ok: true, seed: 12345 }),
    };

    controller = new MapGenController(
      mockMapGen as unknown as MapGenOpsService,
    );
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('mapGenSchema', () => {
    it('returns schema from MapGenOpsService', () => {
      const res = controller.mapGenSchema();
      expect(mockMapGen.getSchema).toHaveBeenCalled();
      expect(res).toEqual({ type: 'object', properties: {} });
    });
  });

  describe('mapGenParseExchange', () => {
    it('calls parseExchangeString with provided string', () => {
      const res = controller.mapGenParseExchange({
        map_exchange_string: '>>>EXCHANGE<<<',
      });
      expect(mockMapGen.parseExchangeString).toHaveBeenCalledWith(
        '>>>EXCHANGE<<<',
      );
      expect(res).toEqual({ map_gen_settings: { seed: 123 } });
    });
  });

  describe('mapGenExportExchange', () => {
    it('calls exportExchangeString with settings', () => {
      const res = controller.mapGenExportExchange({
        map_gen_settings: { seed: 42 },
        map_settings: null,
        space_age: true,
      });
      expect(mockMapGen.exportExchangeString).toHaveBeenCalledWith(
        { seed: 42 },
        null,
        true,
      );
      expect(res).toBe('>>>MAP_EXCHANGE_TEST<<<');
    });
  });

  describe('mapGenPreview', () => {
    it('returns generated static preview data', async () => {
      const res = await controller.mapGenPreview({ seed: 555 });
      expect(mockMapGen.generatePreview).toHaveBeenCalledWith(
        {},
        555,
        undefined,
        undefined,
        { skipMapSettings: undefined, previewSize: undefined },
      );
      expect(res).toEqual(Buffer.from('fake-png'));
    });
  });

  describe('mapGenPreviewStream', () => {
    it('streams NDJSON frames and terminates with done', async () => {
      mockMapGen.generatePreviewProgressive.mockImplementation(
        (
          _settings: Record<string, unknown>,
          _seed: number | undefined,
          _planet: string | undefined,
          onFrame: (frame: Record<string, unknown>) => void,
        ) => {
          onFrame({ progress: 50 });
          return Promise.resolve({ ok: true, seed: 999 });
        },
      );

      const { res, setHeader, end, written } = mockResponse();
      await controller.mapGenPreviewStream({ seed: 999 }, res);

      expect(setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/x-ndjson; charset=utf-8',
      );
      expect(end).toHaveBeenCalled();
      expect(written.length).toBe(2);
      expect(JSON.parse(written[0] || '')).toEqual({
        ok: true,
        type: 'frame',
        progress: 50,
      });
      expect(JSON.parse(written[1] || '')).toEqual({
        ok: true,
        type: 'done',
        seed: 999,
      });
    });

    it('handles failure from generatePreviewProgressive', async () => {
      mockMapGen.generatePreviewProgressive.mockResolvedValue({
        ok: false,
        error: 'bad_seed',
      });

      const { res, status, written } = mockResponse();
      await controller.mapGenPreviewStream({ seed: 0 }, res);

      expect(status).toHaveBeenCalledWith(400);
      expect(JSON.parse(written[0] || '')).toEqual({
        ok: false,
        type: 'error',
        error: 'bad_seed',
      });
    });

    it('handles thrown exceptions during preview streaming', async () => {
      mockMapGen.generatePreviewProgressive.mockRejectedValue(
        new Error('generator_crashed'),
      );

      const { res, status, written } = mockResponse();
      await controller.mapGenPreviewStream({ seed: 0 }, res);

      expect(status).toHaveBeenCalledWith(500);
      expect(JSON.parse(written[0] || '')).toEqual({
        ok: false,
        type: 'error',
        error: 'generator_crashed',
      });
    });
  });
});
