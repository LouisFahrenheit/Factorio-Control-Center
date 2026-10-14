import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthGuard, AUTH_USER_KEY } from '../../auth/auth.guard';
import { requestBearerToken } from '../../auth/auth.util';
import { SessionService } from '../../auth/session.service';
import { SelectInstanceDto } from '../../common/dto/api.dto';
import { safeStr } from '../../common/trim.util';
import { SessionUser } from '../../common/types';
import { InstancesService } from '../../instances/instances.service';
import { WebPanelEventLogService } from '../../logging/web-panel-event-log.service';
import { ApiBridgeService } from '../api-bridge.service';

@ApiTags('Instances')
@ApiBearerAuth('bearer')
@Controller('api/instances')
@UseGuards(AuthGuard)
export class InstancesController {
  constructor(
    private readonly bridge: ApiBridgeService,
    private readonly sessions: SessionService,
    private readonly instances: InstancesService,
    private readonly eventLog: WebPanelEventLogService,
  ) {}

  private me(req: Request): SessionUser {
    return (req as Request & { [AUTH_USER_KEY]: SessionUser })[AUTH_USER_KEY];
  }

  @Get()
  @ApiOperation({ summary: 'List all accessible Factorio server instances' })
  @ApiResponse({
    status: 200,
    description: 'List of instances with selected instance ID',
  })
  async instancesList(@Req() req: Request): Promise<Record<string, unknown>> {
    const data = await this.bridge.submit('instances_list');
    const user = this.me(req);
    const token = requestBearerToken(req);
    const allowed = user.instance_ids || [];
    const items = Array.isArray(data.items)
      ? (data.items as Record<string, unknown>[])
      : [];
    const filtered = allowed.includes('*')
      ? items
      : items.filter((it) => allowed.includes(safeStr(it.id)));
    let selectedId = token ? this.sessions.getSelectedInstanceId(token) : '';
    if (selectedId && !allowed.includes('*') && !allowed.includes(selectedId)) {
      selectedId = '';
    }
    if (selectedId && !filtered.some((it) => safeStr(it.id) === selectedId)) {
      selectedId = '';
    }
    return { ...data, items: filtered, selectedId };
  }

  @Post()
  @ApiOperation({ summary: 'Add a new server instance' })
  @ApiResponse({ status: 200, description: 'Instance created successfully' })
  instancesAdd(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    return this.bridge.submit('instances_add', {
      ...body,
      web_actor: this.bridge.webActor(this.me(req)),
    });
  }

  @Post('select')
  @ApiOperation({ summary: 'Select an active instance for this session' })
  @ApiBody({ type: SelectInstanceDto })
  @ApiResponse({ status: 200, description: 'Instance selected' })
  @ApiResponse({ status: 400, description: 'Instance not found or forbidden' })
  instancesSelect(
    @Req() req: Request,
    @Body() body: { id?: string },
  ): { ok: boolean } {
    const iid = String(body.id || '').trim();
    const allowed = this.me(req).instance_ids || [];
    if (!allowed.includes('*') && iid && !allowed.includes(iid)) {
      throw new BadRequestException('forbidden_instance');
    }
    if (iid && !this.instances.getById(iid)) {
      throw new BadRequestException('not_found');
    }
    const token = requestBearerToken(req);
    if (!token) throw new UnauthorizedException('Missing bearer token');
    this.sessions.setSelectedInstanceId(token, iid);
    this.eventLog.logDispatchOp(
      'instances_select',
      { id: iid, web_actor: this.bridge.webActor(this.me(req)) },
      { ok: true },
    );
    return { ok: true };
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update instance configuration' })
  @ApiParam({ name: 'id', description: 'Instance ID' })
  @ApiResponse({ status: 200, description: 'Instance updated' })
  instancesUpdate(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    return this.bridge.submit('instances_update', {
      id,
      ...body,
      web_actor: this.bridge.webActor(this.me(req)),
    });
  }

  @Post(':id/clone')
  @ApiOperation({ summary: 'Clone an existing instance' })
  @ApiParam({ name: 'id', description: 'Source instance ID' })
  @ApiResponse({ status: 200, description: 'Instance cloned' })
  instancesClone(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    return this.bridge.submit('instances_clone', {
      id,
      ...body,
      web_actor: this.bridge.webActor(this.me(req)),
    });
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove an instance' })
  @ApiParam({ name: 'id', description: 'Instance ID to remove' })
  @ApiQuery({
    name: 'deleteFromDisk',
    required: false,
    description: 'Also delete server files from disk (1 or true)',
  })
  @ApiQuery({
    name: 'deleteData',
    required: false,
    description: 'Also delete save/mod data (1 or true)',
  })
  @ApiResponse({ status: 200, description: 'Instance removed' })
  instancesRemove(
    @Param('id') id: string,
    @Req() req: Request,
    @Query('deleteFromDisk') deleteFromDisk?: string,
    @Query('deleteData') deleteData?: string,
  ): Promise<Record<string, unknown>> {
    return this.bridge.submit('instances_remove', {
      id,
      deleteFromDisk: deleteFromDisk === '1' || deleteFromDisk === 'true',
      deleteData: deleteData === '1' || deleteData === 'true',
      web_actor: this.bridge.webActor(this.me(req)),
    });
  }

  @Post('bootstrap/start')
  @ApiOperation({ summary: 'Start instance bootstrap process' })
  @ApiResponse({ status: 200, description: 'Bootstrap started' })
  bootstrapStart(
    @Body() body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    return this.bridge.submit('instance_bootstrap_start', body);
  }

  @Get('bootstrap/status')
  @ApiOperation({ summary: 'Get instance bootstrap progress and status' })
  @ApiResponse({ status: 200, description: 'Bootstrap status' })
  bootstrapStatus(): Promise<Record<string, unknown>> {
    return this.bridge.submit('instance_bootstrap_status');
  }

  @Post('bootstrap/stop')
  @ApiOperation({ summary: 'Stop instance bootstrap process' })
  @ApiResponse({ status: 200, description: 'Bootstrap stopped' })
  bootstrapStop(): Promise<Record<string, unknown>> {
    return this.bridge.submit('instance_bootstrap_stop');
  }
}
