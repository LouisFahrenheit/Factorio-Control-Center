import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from '../../auth/auth.guard';
import { LOG_HISTORY_DEFAULT_TAIL } from '../../ops/ops-utils';
import { ApiBridgeService } from '../api-bridge.service';

@ApiTags('Logs')
@ApiBearerAuth('bearer')
@Controller('api/logs')
@UseGuards(AuthGuard)
export class LogsController {
  constructor(private readonly bridge: ApiBridgeService) {}

  @Get()
  @ApiOperation({ summary: 'Get recent Factorio server log tail' })
  @ApiQuery({
    name: 'tail',
    required: false,
    description: 'Number of lines to return (default: 400)',
  })
  @ApiQuery({
    name: 'instance_id',
    required: false,
    description: 'Instance ID override',
  })
  @ApiResponse({ status: 200, description: 'Log lines array' })
  logs(
    @Query('tail') tail?: string,
    @Query('instance_id') instanceId?: string,
  ): Promise<Record<string, unknown>> {
    return this.bridge.submit('log_tail', {
      tail: parseInt(tail || '400', 10),
      instance_id: instanceId,
    });
  }

  @Get('history')
  @ApiOperation({ summary: 'Get historical Factorio server log from file' })
  @ApiQuery({
    name: 'tail',
    required: false,
    description: 'Number of lines (default varies)',
  })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiQuery({
    name: 'full',
    required: false,
    description: 'Return full log (1 or true)',
  })
  @ApiResponse({ status: 200, description: 'Log history lines' })
  logsHistory(
    @Query('tail') tail?: string,
    @Query('instance_id') instanceId?: string,
    @Query('full') full?: string,
  ): Promise<Record<string, unknown>> {
    return this.bridge.submit('log_file_history', {
      tail: parseInt(tail || String(LOG_HISTORY_DEFAULT_TAIL), 10),
      instance_id: instanceId,
      full: full === '1' || full === 'true',
    });
  }

  @Get('program')
  @ApiOperation({
    summary: 'Get FCC panel program log (web, audit, maintenance)',
  })
  @ApiQuery({
    name: 'kind',
    required: false,
    description: 'Log kind: web, audit, maintenance',
  })
  @ApiQuery({ name: 'tail', required: false })
  @ApiQuery({
    name: 'full',
    required: false,
    description: 'Return full log (1 or true)',
  })
  @ApiResponse({ status: 200, description: 'Panel log lines' })
  logsProgram(
    @Query('kind') kind?: string,
    @Query('tail') tail?: string,
    @Query('full') full?: string,
  ): Promise<Record<string, unknown>> {
    return this.bridge.submit('program_log_history', {
      kind: String(kind || ''),
      tail: parseInt(tail || String(LOG_HISTORY_DEFAULT_TAIL), 10),
      full: full === '1' || full === 'true',
    });
  }
}
