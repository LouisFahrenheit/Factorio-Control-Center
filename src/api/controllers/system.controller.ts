import * as fs from 'fs';
import { join } from 'path';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiHeader,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthGuard, AUTH_USER_KEY } from '../../auth/auth.guard';
import { UsersService } from '../../auth/users.service';
import { resolveAppBuild } from '../../common/app-build.util';
import { getDockerVolumes, isDockerContainer } from '../../common/docker.util';
import { AnnouncementsWriteDto, ChatSendDto } from '../../common/dto/api.dto';
import { safeStr } from '../../common/trim.util';
import { SessionUser } from '../../common/types';
import { FccConfigService } from '../../config/fcc-config.service';
import { APP_VERSION } from '../../constants/fcc.constants';
import { InstancesService } from '../../instances/instances.service';
import { LocaleService } from '../../locale/locale.service';
import {
  getModDetailsCached,
  modPackagePathsForInternalName,
} from '../../ops/mod-display-titles.util';
import { listHostIPv4 } from '../../http/lan-address.util';
import { ApiBridgeService } from '../api-bridge.service';

@ApiTags('System')
@Controller('api')
export class SystemController {
  private readonly downloadRateLimits = new Map<string, number[]>();

  constructor(
    private readonly bridge: ApiBridgeService,
    private readonly locale: LocaleService,
    private readonly config: FccConfigService,
    private readonly users: UsersService,
    private readonly instances: InstancesService,
  ) {}

  private user(req: Request): SessionUser {
    return (req as Request & { [AUTH_USER_KEY]: SessionUser })[AUTH_USER_KEY];
  }

  @Get('health')
  @ApiOperation({
    summary: 'Check API and panel health',
    description: 'Returns status, version, platform and runtime info',
  })
  @ApiResponse({ status: 200, description: 'Panel is healthy' })
  health() {
    const plat = process.platform;
    const is_docker = isDockerContainer();
    const docker_volumes = is_docker ? getDockerVolumes() : [];

    return {
      ok: true,
      version: APP_VERSION,
      build: resolveAppBuild(),
      host_os: plat.startsWith('win')
        ? 'windows'
        : plat.startsWith('linux')
          ? 'linux'
          : 'unix',
      is_docker,
      docker_volumes,
      host_ips: listHostIPv4(),
    };
  }

  @Get('host-ips')
  @ApiOperation({
    summary: 'List host network IPv4 addresses',
    description:
      'Returns list of non-loopback IPv4 addresses available on the host machine',
  })
  @ApiResponse({ status: 200, description: 'List of host IPv4 addresses' })
  hostIps() {
    return {
      ok: true,
      host_ips: listHostIPv4(),
    };
  }

  @Get('locale-bootstrap')
  @ApiOperation({
    summary: 'Bootstrap locale and UI config',
    description:
      'Returns locale strings, theme, panel settings. No authentication required.',
  })
  @ApiQuery({
    name: 'lang',
    required: false,
    description: 'Preferred language code (e.g. en, ru, uk)',
  })
  @ApiResponse({ status: 200, description: 'Locale and bootstrap data' })
  async localeBootstrap(@Query('lang') lang?: string) {
    const loc = this.locale.getLocale(lang);
    const w = this.config.webPanel;
    return {
      ok: true,
      lang: loc.lang,
      strings: loc.strings,
      theme: this.config.sharedTheme,
      web_disable_effects: w.web_disable_effects,
      needs_setup: !(await this.users.hasAnyUser()),
      available_languages: this.locale.listAvailableLanguages(),
      default_toast_duration_sec: w.toast_duration_sec,
      panel_default_language: this.config.langCode,
      public_page_enabled: w.public_page_enabled,
      public_page_route: w.public_page_route,
      public_page_title: w.public_page_title || '',
      public_page_subtitle: w.public_page_subtitle || '',
      public_page_theme: w.public_page_theme || '',
      public_page_hide_title: w.public_page_hide_title || false,
      public_page_hide_subtitle: w.public_page_hide_subtitle || false,
      public_page_allow_mod_downloads: w.public_page_allow_mod_downloads,
      public_page_show_players: w.public_page_show_players,
      public_page_contact_link: w.public_page_contact_link || '',
    };
  }

  @UseGuards(AuthGuard)
  @Get('locale')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get locale strings for authenticated session' })
  @ApiQuery({
    name: 'lang',
    required: false,
    description: 'Language code override',
  })
  @ApiResponse({ status: 200, description: 'Locale data' })
  getLocale(@Query('lang') lang?: string) {
    return this.locale.getLocale(lang);
  }

  @UseGuards(AuthGuard)
  @Get('status')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get current Factorio server status and all instance states',
  })
  @ApiResponse({ status: 200, description: 'Server status data' })
  status() {
    return this.bridge.submit('status');
  }

  @Get('public-servers')
  @ApiTags('Public')
  @ApiOperation({
    summary: 'Get list of public Factorio servers',
    description:
      'Returns servers marked as public. No authentication required. Requires public page to be enabled in settings.',
  })
  @ApiHeader({
    name: 'x-fcc-ui-lang',
    required: false,
    description: 'UI language code for mod title translation',
  })
  @ApiResponse({ status: 200, description: 'List of public servers' })
  @ApiResponse({ status: 403, description: 'Public page is disabled' })
  async publicServers(@Headers('x-fcc-ui-lang') uiLang?: string) {
    if (!this.config.webPanel.public_page_enabled) {
      throw new ForbiddenException('Public servers page is disabled');
    }
    const data = (await this.bridge.submit('instances_list')) as {
      ok: boolean;
      items?: Record<string, unknown>[];
    };
    if (!data.ok || !Array.isArray(data.items)) {
      return { ok: false, items: [] };
    }
    const lang = uiLang || this.config.langCode || 'en';
    const publicItems = data.items
      .filter((it) => it.isPublic)
      .map((it) => {
        const publicMods = Array.isArray(it.publicMods)
          ? it.publicMods.map(
              (m: { name: string; title: string; version?: string }) => {
                const sp = safeStr(it.serverPath);
                if (!sp) return m;
                const modsDir = join(sp, 'mods');
                const packages = modPackagePathsForInternalName(
                  modsDir,
                  m.name,
                );
                const details =
                  packages.length > 0
                    ? getModDetailsCached(packages[0], lang)
                    : { title: m.title, version: m.version };
                return {
                  name: m.name,
                  title: details.title,
                  version: details.version,
                };
              },
            )
          : [];
        return {
          id: it.id,
          name: it.name,
          publicDescription: it.publicDescription,
          publicConnectionAddress:
            it.publicConnectionAddress ||
            this.config.webPanel.public_host ||
            '',
          status: it.status,
          ip: it.ip,
          port: it.port,
          gameVersion: it.gameVersion,
          hasSpaceAge: it.hasSpaceAge,
          modBadges: it.modBadges,
          modsCount: it.modsCount,
          publicMods,
          onlineCount: it.onlineCount,
          publicPlayers: this.config.webPanel.public_page_show_players
            ? it.publicPlayers
            : [],
          uptimeSeconds: it.uptimeSeconds,
          requireUserVerification: it.requireUserVerification,
          serverSettingsName: it.serverSettingsName,
          serverSettingsDesc: it.serverSettingsDesc,
          serverSettingsAutoPause: it.serverSettingsAutoPause,
          serverSettingsMaxPlayers: it.serverSettingsMaxPlayers,
          serverSettingsAfkAutokick: it.serverSettingsAfkAutokick,
        };
      });
    return { ok: true, items: publicItems };
  }

  @Get('public-servers/:id/download-mods')
  @ApiTags('Public')
  @ApiOperation({
    summary: 'Download mods archive for a public server',
    description:
      'Rate limited: 3 requests per 15 minutes per IP. Requires public mod downloads to be enabled.',
  })
  @ApiParam({ name: 'id', description: 'Public server instance ID' })
  @ApiResponse({ status: 200, description: 'ZIP file with server mods' })
  @ApiResponse({
    status: 403,
    description:
      'Public page or mod downloads disabled, or rate limit exceeded',
  })
  @ApiResponse({ status: 404, description: 'Server not found or not public' })
  async downloadInstanceModsPublic(
    @Param('id') id: string,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    if (!this.config.webPanel.public_page_enabled) {
      throw new ForbiddenException('Public page is disabled');
    }
    if (!this.config.webPanel.public_page_allow_mod_downloads) {
      throw new ForbiddenException('Public mod downloads are disabled');
    }

    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const windowMs = 15 * 60 * 1000;
    const maxRequests = 3;

    let timestamps = this.downloadRateLimits.get(ip) || [];
    timestamps = timestamps.filter((t) => now - t < windowMs);
    if (timestamps.length >= maxRequests) {
      throw new ForbiddenException(
        'Rate limit exceeded. Please try again in 15 minutes.',
      );
    }
    timestamps.push(now);
    this.downloadRateLimits.set(ip, timestamps);

    const inst = this.instances.getById(id);
    if (!inst || !inst.isPublic) {
      throw new NotFoundException('Public server not found');
    }

    const data = await this.instances.withInstance(id, () =>
      this.bridge.submit('build_mods_archive'),
    );

    const path = safeStr(data.path);
    if (!path || !fs.existsSync(path)) {
      throw new NotFoundException('Mods archive not found');
    }

    return res.download(path, safeStr(data.name, 'mods.zip'));
  }

  @UseGuards(AuthGuard)
  @Get('files/server-settings')
  @ApiTags('Files')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Read server-settings.json' })
  @ApiResponse({ status: 200, description: 'Server settings JSON' })
  serverSettings() {
    return this.bridge.submit('read_server_settings');
  }

  @UseGuards(AuthGuard)
  @Put('files/server-settings')
  @ApiTags('Files')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Write server-settings.json' })
  @ApiResponse({ status: 200, description: 'Settings saved' })
  serverSettingsWrite(@Body() body: unknown, @Req() req: Request) {
    return this.bridge.submit('write_server_settings', {
      data: body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @UseGuards(AuthGuard)
  @Get('announcements')
  @ApiTags('Server')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Read server announcements' })
  @ApiResponse({ status: 200, description: 'Announcements data' })
  announcements() {
    return this.bridge.submit('announcements_read');
  }

  @UseGuards(AuthGuard)
  @Put('announcements')
  @ApiTags('Server')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Write server announcements' })
  @ApiBody({ type: AnnouncementsWriteDto })
  @ApiResponse({ status: 200, description: 'Announcements saved' })
  announcementsWrite(@Body() body: { data?: unknown }) {
    return this.bridge.submit('announcements_write', {
      data: body.data ?? body,
    });
  }

  @UseGuards(AuthGuard)
  @Post('chat/send')
  @ApiTags('Server')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Send a message to the in-game chat' })
  @ApiBody({ type: ChatSendDto })
  @ApiResponse({ status: 200, description: 'Message sent' })
  @ApiResponse({ status: 400, description: 'Empty message' })
  chatSend(@Body() body: { message?: string }) {
    const msg = String(body.message || '').trim();
    if (!msg) throw new BadRequestException('empty_message');
    return this.bridge.submit('chat_send_text', { message: msg });
  }

  @UseGuards(AuthGuard)
  @Post('chat/send-announcement')
  @ApiTags('Server')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Send an announcement message to in-game chat' })
  @ApiResponse({ status: 200, description: 'Announcement sent' })
  chatAnnouncement(@Body() body: { message?: string }) {
    return this.bridge.submit('chat_send_text', { message: body.message });
  }

  @UseGuards(AuthGuard)
  @Get('chat-log')
  @ApiTags('Logs')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get recent in-game chat log' })
  @ApiQuery({
    name: 'tail',
    required: false,
    description: 'Number of lines (default: 500)',
  })
  @ApiResponse({ status: 200, description: 'Chat log lines' })
  chatLog(@Query('tail') tail?: string) {
    return this.bridge.submit('chat_log_tail', {
      tail: parseInt(tail || '500', 10),
    });
  }

  @UseGuards(AuthGuard)
  @Get('commands/catalog')
  @ApiTags('Server')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get RCON commands catalog' })
  @ApiResponse({ status: 200, description: 'Commands catalog' })
  commandsCatalog(@Req() req: Request) {
    const lang = String(req.headers['x-fcc-ui-lang'] || '').slice(0, 12);
    return this.bridge.submit('read_commands_catalog', { ui_lang: lang });
  }

  @UseGuards(AuthGuard)
  @Put('commands/catalog')
  @ApiTags('Server')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Save the RCON commands catalog' })
  @ApiResponse({ status: 200, description: 'Catalog saved' })
  commandsPut(@Body() body: unknown, @Req() req: Request) {
    const lang = String(req.headers['x-fcc-ui-lang'] || '').slice(0, 12);
    return this.bridge.submit('write_commands_catalog', {
      data: body,
      ui_lang: lang,
      web_actor: this.bridge.webActor(this.user(req)),
    });
  }

  @UseGuards(AuthGuard)
  @Get('factorio/update/check')
  @ApiTags('Factorio')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Check for Factorio updates for the current instance',
  })
  @ApiResponse({ status: 200, description: 'Update availability info' })
  factorioCheck() {
    return this.bridge.submit('factorio_update_check');
  }

  @UseGuards(AuthGuard)
  @Get('factorio/update/check-all')
  @ApiTags('Factorio')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Check for Factorio updates across all instances' })
  @ApiResponse({
    status: 200,
    description: 'Update availability info for all instances',
  })
  factorioCheckAll() {
    return this.bridge.submit('factorio_update_check_all');
  }

  @UseGuards(AuthGuard)
  @Get('factorio/releases')
  @ApiTags('Factorio')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get list of available Factorio releases' })
  @ApiResponse({ status: 200, description: 'Factorio releases list' })
  factorioReleases() {
    return this.bridge.submit('factorio_releases');
  }

  @UseGuards(AuthGuard)
  @Post('factorio/update')
  @ApiTags('Factorio')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Start Factorio update process' })
  @ApiResponse({ status: 200, description: 'Update started' })
  factorioUpdate(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('factorio_update', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @UseGuards(AuthGuard)
  @Get('factorio/update/status')
  @ApiTags('Factorio')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get Factorio update process status' })
  @ApiResponse({ status: 200, description: 'Update status' })
  factorioUpdateStatus() {
    return this.bridge.submit('factorio_update_status');
  }

  @UseGuards(AuthGuard)
  @Post('factorio/update/stop')
  @ApiTags('Factorio')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Stop the Factorio update process' })
  @ApiResponse({ status: 200, description: 'Update stopped' })
  factorioUpdateStop() {
    return this.bridge.submit('factorio_update_stop');
  }
}
