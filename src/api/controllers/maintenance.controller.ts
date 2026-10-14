import {
  Body,
  Controller,
  Get,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthGuard, AUTH_USER_KEY } from '../../auth/auth.guard';
import { SessionUser } from '../../common/types';
import { ApiBridgeService } from '../api-bridge.service';
import { MaintenanceSetDto } from '../../common/dto/api.dto';

@ApiTags('Maintenance')
@ApiBearerAuth('bearer')
@Controller('api')
@UseGuards(AuthGuard)
export class MaintenanceController {
  constructor(private readonly bridge: ApiBridgeService) {}

  private user(req: Request): SessionUser {
    return (req as Request & { [AUTH_USER_KEY]: SessionUser })[AUTH_USER_KEY];
  }

  @Get('maintenance')
  @ApiOperation({ summary: 'Get maintenance schedule configuration' })
  @ApiResponse({ status: 200, description: 'Maintenance config' })
  maintenanceGet() {
    return this.bridge.submit('maintenance_get');
  }

  @Put('maintenance')
  @ApiOperation({ summary: 'Update maintenance schedule configuration' })
  @ApiBody({ type: MaintenanceSetDto })
  @ApiResponse({ status: 200, description: 'Maintenance config saved' })
  maintenanceSet(@Body() body: Record<string, unknown>) {
    return this.bridge.submit('maintenance_set', body);
  }

  @Get('maintenance/reports')
  @ApiOperation({ summary: 'Get maintenance task execution reports' })
  @ApiResponse({ status: 200, description: 'Maintenance reports list' })
  maintenanceReports() {
    return this.bridge.submit('maintenance_reports');
  }

  @Post('maintenance/run')
  @ApiOperation({ summary: 'Run a maintenance task immediately' })
  @ApiResponse({ status: 200, description: 'Maintenance task triggered' })
  maintenanceRun(@Body() body: { task_id?: string }, @Req() req: Request) {
    return this.bridge.submit('maintenance_run_now', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('maintenance/clear-manual')
  @ApiOperation({ summary: 'Clear manual maintenance state' })
  @ApiResponse({ status: 200, description: 'Manual maintenance state cleared' })
  maintenanceClear(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('maintenance_clear_manual', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }
}
