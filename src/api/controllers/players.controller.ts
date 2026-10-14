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
import { BanPlayerDto, PlayerActionDto } from '../../common/dto/api.dto';

@ApiTags('Players & Moderation')
@ApiBearerAuth('bearer')
@Controller('api')
@UseGuards(AuthGuard)
export class PlayersController {
  constructor(private readonly bridge: ApiBridgeService) {}

  private user(req: Request): SessionUser {
    return (req as Request & { [AUTH_USER_KEY]: SessionUser })[AUTH_USER_KEY];
  }

  @Get('players/summary')
  @ApiTags('Server')
  @ApiOperation({ summary: 'Get summary of online and recent players' })
  @ApiResponse({ status: 200, description: 'Players summary' })
  playersSummary() {
    return this.bridge.submit('players_summary');
  }

  @Get('files/admin-list')
  @ApiTags('Files')
  @ApiOperation({ summary: 'Read admins.txt admin list' })
  @ApiResponse({ status: 200, description: 'Admin list' })
  adminList() {
    return this.bridge.submit('read_admin_list');
  }

  @Put('files/admin-list')
  @ApiTags('Files')
  @ApiOperation({ summary: 'Write the admin-list (admins.txt)' })
  @ApiResponse({ status: 200, description: 'Admin list saved' })
  adminListPut(@Body() body: unknown) {
    return this.bridge.submit('write_admin_list', { data: body });
  }

  @Get('files/ban-list')
  @ApiTags('Files')
  @ApiOperation({ summary: 'Read ban-list.json' })
  @ApiResponse({ status: 200, description: 'Ban list' })
  banList() {
    return this.bridge.submit('read_ban_list');
  }

  @Post('bans/sync')
  @ApiTags('Moderation')
  @ApiOperation({ summary: 'Sync ban list across all instances' })
  @ApiResponse({ status: 200, description: 'Bans synced' })
  bansSync() {
    return this.bridge.submit('sync_bans');
  }

  @Post('bans/ban')
  @ApiTags('Moderation')
  @ApiOperation({ summary: 'Ban a player' })
  @ApiBody({ type: BanPlayerDto })
  @ApiResponse({ status: 200, description: 'Player banned' })
  ban(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('ban_player', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('bans/unban')
  @ApiTags('Moderation')
  @ApiOperation({ summary: 'Unban a player' })
  @ApiBody({ type: PlayerActionDto })
  @ApiResponse({ status: 200, description: 'Player unbanned' })
  unban(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('unban_player', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('moderation/mute')
  @ApiTags('Moderation')
  @ApiOperation({ summary: 'Mute a player (suppress in-game chat)' })
  @ApiBody({ type: PlayerActionDto })
  @ApiResponse({ status: 200, description: 'Player muted' })
  mute(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('mute_player', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('moderation/unmute')
  @ApiTags('Moderation')
  @ApiOperation({ summary: 'Unmute a player' })
  @ApiBody({ type: PlayerActionDto })
  @ApiResponse({ status: 200, description: 'Player unmuted' })
  unmute(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('unmute_player', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('moderation/kick')
  @ApiTags('Moderation')
  @ApiOperation({ summary: 'Kick a player from the server' })
  @ApiBody({ type: PlayerActionDto })
  @ApiResponse({ status: 200, description: 'Player kicked' })
  kick(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('kick_player', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('moderation/purge')
  @ApiTags('Moderation')
  @ApiOperation({ summary: 'Purge all chat messages by a player' })
  @ApiBody({ type: PlayerActionDto })
  @ApiResponse({ status: 200, description: 'Player messages purged' })
  purge(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('purge_player', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('whitelist/add')
  @ApiTags('Moderation')
  @ApiOperation({ summary: 'Add a player to the whitelist' })
  @ApiBody({ type: PlayerActionDto })
  @ApiResponse({ status: 200, description: 'Player added to whitelist' })
  wlAdd(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('whitelist_add', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('whitelist/remove')
  @ApiTags('Moderation')
  @ApiOperation({ summary: 'Remove a player from the whitelist' })
  @ApiBody({ type: PlayerActionDto })
  @ApiResponse({ status: 200, description: 'Player removed from whitelist' })
  wlRemove(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('whitelist_remove', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('whitelist/clear')
  @ApiTags('Moderation')
  @ApiOperation({ summary: 'Clear the entire whitelist' })
  @ApiResponse({ status: 200, description: 'Whitelist cleared' })
  wlClear(@Req() req: Request) {
    return this.bridge.submit('whitelist_clear', {
      actor: this.bridge.webActor(this.user(req)),
    });
  }
}
