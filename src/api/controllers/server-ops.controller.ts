import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { AuthGuard, AUTH_USER_KEY } from '../../auth/auth.guard';
import { SessionUser } from '../../common/types';
import {
  CreateSaveDto,
  RconDto,
  ServerActionDto,
} from '../../common/dto/api.dto';
import { ApiBridgeService } from '../api-bridge.service';

@ApiTags('Server')
@ApiBearerAuth('bearer')
@Controller('api')
@UseGuards(AuthGuard)
export class ServerOpsController {
  constructor(private readonly bridge: ApiBridgeService) {}

  private me(req: Request): SessionUser | undefined {
    return (req as Request & { [AUTH_USER_KEY]?: SessionUser })[AUTH_USER_KEY];
  }

  private explicitInstanceId(val?: string): string | undefined {
    const s = typeof val === 'string' ? val.trim() : '';
    return s || undefined;
  }

  @Post('server/start')
  @ApiOperation({ summary: 'Start the Factorio game server' })
  @ApiBody({ type: ServerActionDto })
  @ApiResponse({ status: 200, description: 'Start command dispatched' })
  serverStart(@Req() req: Request, @Body() body?: ServerActionDto) {
    const iid = this.explicitInstanceId(body?.instance_id);
    return this.bridge.submit(
      'start_server',
      { web_actor: this.bridge.webActor(this.me(req)) },
      iid,
    );
  }

  @Post('server/stop')
  @ApiOperation({ summary: 'Stop the Factorio game server gracefully' })
  @ApiBody({ type: ServerActionDto })
  @ApiResponse({ status: 200, description: 'Stop command dispatched' })
  serverStop(@Req() req: Request, @Body() body?: ServerActionDto) {
    const iid = this.explicitInstanceId(body?.instance_id);
    return this.bridge.submit(
      'stop_server',
      { web_actor: this.bridge.webActor(this.me(req)) },
      iid,
    );
  }

  @Post('server/restart')
  @ApiOperation({ summary: 'Restart the Factorio game server' })
  @ApiBody({ type: ServerActionDto })
  @ApiResponse({ status: 200, description: 'Restart command dispatched' })
  serverRestart(@Req() req: Request, @Body() body?: ServerActionDto) {
    const iid = this.explicitInstanceId(body?.instance_id);
    return this.bridge.submit(
      'restart_server',
      { web_actor: this.bridge.webActor(this.me(req)) },
      iid,
    );
  }

  @Post('server/kill')
  @ApiOperation({ summary: 'Force-kill the Factorio game server process' })
  @ApiBody({ type: ServerActionDto })
  @ApiResponse({ status: 200, description: 'Kill signal sent' })
  serverKill(@Req() req: Request, @Body() body?: ServerActionDto) {
    const iid = this.explicitInstanceId(body?.instance_id);
    return this.bridge.submit(
      'kill_server',
      { web_actor: this.bridge.webActor(this.me(req)) },
      iid,
    );
  }

  @Post('server/save')
  @ApiOperation({ summary: 'Save the current game to disk' })
  @ApiBody({ type: ServerActionDto })
  @ApiResponse({ status: 200, description: 'Save command dispatched' })
  serverSave(@Req() req: Request, @Body() body?: ServerActionDto) {
    const iid = this.explicitInstanceId(body?.instance_id);
    return this.bridge.submit(
      'save_game',
      { web_actor: this.bridge.webActor(this.me(req)) },
      iid,
    );
  }

  @Post('server/backup')
  @ApiOperation({ summary: 'Create a backup of the current save' })
  @ApiBody({ type: ServerActionDto })
  @ApiResponse({ status: 200, description: 'Backup command dispatched' })
  serverBackup(@Req() req: Request, @Body() body?: ServerActionDto) {
    const iid = this.explicitInstanceId(body?.instance_id);
    return this.bridge.submit(
      'backup',
      { web_actor: this.bridge.webActor(this.me(req)) },
      iid,
    );
  }

  @Post('server/create-save')
  @ApiTags('Saves')
  @ApiOperation({ summary: 'Generate a new Factorio save file' })
  @ApiBody({ type: CreateSaveDto })
  @ApiResponse({ status: 200, description: 'Save creation started' })
  serverCreateSave(
    @Req() req: Request,
    @Body()
    body?: CreateSaveDto & {
      instance_id?: string;
      map_gen_settings?: Record<string, unknown>;
      map_settings?: Record<string, unknown>;
      map_exchange_string?: string;
    },
  ) {
    const iid = this.explicitInstanceId(body?.instance_id);
    return this.bridge.submit(
      'create_save',
      {
        name: body?.name || '',
        mode: body?.mode,
        preset: body?.preset,
        seed: body?.seed,
        map_gen_settings: body?.map_gen_settings,
        map_settings: body?.map_settings,
        map_exchange_string: body?.map_exchange_string,
        web_actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Post('files/server-settings/create-from-example')
  @ApiOperation({
    summary: 'Create server-settings.json from the Factorio example template',
  })
  @ApiResponse({ status: 200, description: 'server-settings.json created' })
  serverSettingsExample(@Req() req: Request, @Body() body?: ServerActionDto) {
    const iid = this.explicitInstanceId(body?.instance_id);
    return this.bridge.submit(
      'create_server_settings_from_example',
      { actor: this.bridge.webActor(this.me(req)) },
      iid,
    );
  }

  @Post('rcon')
  @ApiOperation({ summary: 'Execute an RCON command on the server' })
  @ApiBody({ type: RconDto })
  @ApiResponse({ status: 200, description: 'RCON response from server' })
  rcon(
    @Req() req: Request,
    @Body()
    body: RconDto & {
      instance_id?: string;
    },
  ) {
    const iid = this.explicitInstanceId(body?.instance_id);
    return this.bridge.submit(
      'rcon_exec',
      {
        command: body?.command,
        source: body?.source,
        command_id: body?.command_id,
        command_name: body?.command_name,
        web_actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }
}
