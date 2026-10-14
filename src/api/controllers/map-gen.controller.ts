import { Body, Controller, Get, Post, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { AuthGuard } from '../../auth/auth.guard';
import { MapGenOpsService } from '../../ops/map-gen/map-gen-ops.service';

@ApiTags('Map')
@ApiBearerAuth('bearer')
@Controller('api/server/map-gen')
@UseGuards(AuthGuard)
export class MapGenController {
  constructor(private readonly mapGen: MapGenOpsService) {}

  @Get('schema')
  @ApiOperation({ summary: 'Get map generation JSON schema' })
  @ApiResponse({ status: 200, description: 'Map gen schema' })
  mapGenSchema() {
    return this.mapGen.getSchema();
  }

  @Post('parse-exchange')
  @ApiOperation({ summary: 'Parse a Factorio map exchange string' })
  @ApiResponse({ status: 200, description: 'Parsed map gen and map settings' })
  mapGenParseExchange(@Body() body: { map_exchange_string?: string }) {
    return this.mapGen.parseExchangeString(
      String(body?.map_exchange_string || ''),
    );
  }

  @Post('export-exchange')
  @ApiOperation({
    summary: 'Export map settings as a Factorio map exchange string',
  })
  @ApiResponse({ status: 200, description: 'Map exchange string' })
  mapGenExportExchange(
    @Body()
    body: {
      map_gen_settings?: Record<string, unknown>;
      map_settings?: Record<string, unknown> | null;
      space_age?: boolean;
    },
  ) {
    return this.mapGen.exportExchangeString(
      body?.map_gen_settings || {},
      body?.map_settings ?? null,
      body?.space_age !== false,
    );
  }

  @Post('preview-stream')
  @ApiOperation({
    summary: 'Stream map preview frames as NDJSON',
    description:
      'Returns a streaming NDJSON response with progressive map preview frames.',
  })
  @ApiResponse({ status: 200, description: 'NDJSON stream of preview frames' })
  async mapGenPreviewStream(
    @Body()
    body: {
      map_gen_settings?: Record<string, unknown>;
      seed?: number;
      preview_planet?: string;
      skip_map_settings?: boolean;
    },
    @Res() res: Response,
  ) {
    res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');

    const write = (payload: Record<string, unknown>) => {
      res.write(`${JSON.stringify(payload)}\n`);
      const flush = (res as Response & { flush?: () => void }).flush;
      if (typeof flush === 'function') flush.call(res);
    };

    try {
      const result = await this.mapGen.generatePreviewProgressive(
        body?.map_gen_settings || {},
        body?.seed,
        body?.preview_planet,
        (frame) => write({ ok: true, type: 'frame', ...frame }),
        { skipMapSettings: body?.skip_map_settings },
      );
      if (!result.ok) {
        write({
          ok: false,
          type: 'error',
          error: result.error || 'preview_failed',
        });
        res.status(400);
      } else {
        write({ ok: true, type: 'done', seed: result.seed ?? null });
      }
    } catch (e) {
      write({
        ok: false,
        type: 'error',
        error: e instanceof Error ? e.message : String(e),
      });
      res.status(500);
    }
    res.end();
  }

  @Post('preview')
  @ApiOperation({ summary: 'Generate a static map preview image' })
  @ApiResponse({ status: 200, description: 'Preview image data' })
  mapGenPreview(
    @Body()
    body: {
      map_gen_settings?: Record<string, unknown>;
      map_settings?: Record<string, unknown>;
      seed?: number;
      preview_planet?: string;
      skip_map_settings?: boolean;
      preview_size?: number;
    },
  ) {
    return this.mapGen.generatePreview(
      body?.map_gen_settings || {},
      body?.seed,
      body?.map_settings,
      body?.preview_planet,
      {
        skipMapSettings: body?.skip_map_settings,
        previewSize: body?.preview_size,
      },
    );
  }
}
