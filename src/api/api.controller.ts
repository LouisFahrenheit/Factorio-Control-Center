import * as fs from 'fs';
import { join } from 'path';
import {
  getModDetailsCached,
  modPackagePathsForInternalName,
} from '../ops/mod-display-titles.util';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
  Headers,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
  ApiBody,
  ApiHeader,
} from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { AuthGuard, AUTH_USER_KEY } from '../auth/auth.guard';
import { requestBearerToken } from '../auth/auth.util';
import { SessionService } from '../auth/session.service';
import { InstancesService } from '../instances/instances.service';
import { WebPanelEventLogService } from '../logging/web-panel-event-log.service';
import { resolveAppBuild } from '../common/app-build.util';
import { APP_VERSION } from '../constants/fcc.constants';
import { ApiBridgeService } from './api-bridge.service';
import { LocaleService } from '../locale/locale.service';
import { FccConfigService } from '../config/fcc-config.service';
import { UsersService } from '../auth/users.service';
import { SessionUser } from '../common/types';
import {
  RconDto,
  ChatSendDto,
  SelectInstanceDto,
  ServerActionDto,
  AnnouncementsWriteDto,
  MaintenanceSetDto,
} from '../common/dto/api.dto';

const WEB_TLS_CFG_KEYS = [
  'tls_enabled',
  'tls_certfile',
  'tls_keyfile',
  'tls_key_password',
  'public_host',
  'public_port',
] as const;

const LOG_ROTATION_CFG_KEYS = [
  'log_rotation_max_mb',
  'log_rotation_interval_hours',
  'log_rotation_backup_count',
  'log_write_instance',
  'log_write_web',
  'log_write_maintenance',
  'log_write_audit',
  'log_reformat_timestamps',
] as const;

const ADMIN_ONLY_INSTANCE_PANEL_KEYS = [
  'sync_bans_across_instances',
  'sync_admins_across_instances',
  'sync_whitelist_across_instances',
  'require_unique_instance_game_ports',
  'server_settings_default_public_off',
  'server_settings_apply_global_credentials',
  'public_page_enabled',
  'public_page_route',
] as const;

@ApiTags('Health')
@Controller('api')
export class ApiController {
  private readonly downloadRateLimits = new Map<string, number[]>();

  constructor(
    private readonly bridge: ApiBridgeService,
    private readonly locale: LocaleService,
    private readonly config: FccConfigService,
    private readonly users: UsersService,
    private readonly sessions: SessionService,
    private readonly instances: InstancesService,
    private readonly eventLog: WebPanelEventLogService,
  ) {}

  private me(req: Request): SessionUser {
    return (req as Request & { [AUTH_USER_KEY]: SessionUser })[AUTH_USER_KEY];
  }

  private explicitInstanceId(raw?: string): string | undefined {
    const id = String(raw || '').trim();
    return id || undefined;
  }

  private isAdmin(req: Request): boolean {
    return String(this.me(req)?.role || '') === 'administrator';
  }

  private filterProgramSettingsForUser(
    data: Record<string, unknown>,
    admin: boolean,
  ): Record<string, unknown> {
    if (admin || !data || typeof data !== 'object') return data;
    const out = { ...data };
    delete out.global_username;
    delete out.global_token;
    for (const k of WEB_TLS_CFG_KEYS) delete out[k];
    for (const k of ADMIN_ONLY_INSTANCE_PANEL_KEYS) delete out[k];
    for (const k of LOG_ROTATION_CFG_KEYS) delete out[k];
    return out;
  }

  private sanitizeProgramSettingsPayload(
    body: Record<string, unknown>,
    admin: boolean,
  ): Record<string, unknown> {
    const payload = { ...body };
    if (admin) return payload;
    if ('global_username' in payload || 'global_token' in payload) {
      throw new ForbiddenException('admin_required');
    }
    if (WEB_TLS_CFG_KEYS.some((k) => k in payload)) {
      throw new ForbiddenException('admin_required');
    }
    if (LOG_ROTATION_CFG_KEYS.some((k) => k in payload)) {
      throw new ForbiddenException('admin_required');
    }
    if (ADMIN_ONLY_INSTANCE_PANEL_KEYS.some((k) => k in payload)) {
      throw new ForbiddenException('admin_required');
    }
    delete payload.global_username;
    delete payload.global_token;
    for (const k of WEB_TLS_CFG_KEYS) delete payload[k];
    for (const k of LOG_ROTATION_CFG_KEYS) delete payload[k];
    return payload;
  }

  @Get('health')
  @ApiOperation({
    summary: 'Health check',
    description:
      'Returns panel version, OS info and Docker status. No authentication required.',
  })
  @ApiResponse({ status: 200, description: 'Panel is healthy' })
  health() {
    const plat = process.platform;
    let is_docker = false;
    const docker_volumes: string[] = [];

    if (plat === 'linux') {
      try {
        if (fs.existsSync('/.dockerenv')) {
          is_docker = true;
          const mounts = fs.readFileSync('/proc/mounts', 'utf8');
          const ignorePrefixes = [
            '/proc',
            '/sys',
            '/dev',
            '/etc',
            '/run',
            '/tmp',
            '/var/lib/docker',
          ];
          const lines = mounts.split('\n');
          for (const line of lines) {
            const parts = line.split(' ');
            if (parts.length >= 2) {
              const target = parts[1];
              if (target === '/') continue;
              if (ignorePrefixes.some((p) => target.startsWith(p))) continue;
              if (!docker_volumes.includes(target)) {
                docker_volumes.push(target);
              }
            }
          }
        }
      } catch (e) {
        // ignore
      }
    }

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
      default_web_credentials: await this.users.defaultAdminPasswordActive(),
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
                const sp = String(it.serverPath || '');
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

    const path = String(data.path || '');
    if (!path || !fs.existsSync(path)) {
      throw new NotFoundException('Mods archive not found');
    }

    return res.download(path, String(data.name || 'mods.zip'));
  }

  @UseGuards(AuthGuard)
  @Get('instances')
  @ApiTags('Instances')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'List all accessible Factorio server instances' })
  @ApiResponse({
    status: 200,
    description: 'List of instances with selected instance ID',
  })
  async instancesList(@Req() req: Request) {
    const data = await this.bridge.submit('instances_list');
    const user = this.me(req);
    const token = requestBearerToken(req);
    const allowed = user.instance_ids || [];
    const items = Array.isArray(data.items)
      ? (data.items as Record<string, unknown>[])
      : [];
    const filtered = allowed.includes('*')
      ? items
      : items.filter((it) => allowed.includes(String(it.id || '')));
    let selectedId = token ? this.sessions.getSelectedInstanceId(token) : '';
    if (selectedId && !allowed.includes('*') && !allowed.includes(selectedId)) {
      selectedId = '';
    }
    if (
      selectedId &&
      !filtered.some((it) => String(it.id || '') === selectedId)
    ) {
      selectedId = '';
    }
    return { ...data, items: filtered, selectedId };
  }

  @UseGuards(AuthGuard)
  @Post('instances')
  @ApiTags('Instances')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Add a new server instance' })
  @ApiResponse({ status: 200, description: 'Instance created successfully' })
  instancesAdd(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('instances_add', {
      ...body,
      web_actor: this.bridge.webActor(this.me(req)),
    });
  }

  @UseGuards(AuthGuard)
  @Post('instances/select')
  @ApiTags('Instances')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Select an active instance for this session' })
  @ApiBody({ type: SelectInstanceDto })
  @ApiResponse({ status: 200, description: 'Instance selected' })
  @ApiResponse({ status: 400, description: 'Instance not found or forbidden' })
  async instancesSelect(@Req() req: Request, @Body() body: { id?: string }) {
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

  @UseGuards(AuthGuard)
  @Put('instances/:id')
  @ApiTags('Instances')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update instance configuration' })
  @ApiParam({ name: 'id', description: 'Instance ID' })
  @ApiResponse({ status: 200, description: 'Instance updated' })
  instancesUpdate(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.bridge.submit('instances_update', {
      id,
      ...body,
      web_actor: this.bridge.webActor(this.me(req)),
    });
  }

  @UseGuards(AuthGuard)
  @Post('instances/:id/clone')
  @ApiTags('Instances')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Clone an existing instance' })
  @ApiParam({ name: 'id', description: 'Source instance ID' })
  @ApiResponse({ status: 200, description: 'Instance cloned' })
  instancesClone(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.bridge.submit('instances_clone', {
      id,
      ...body,
      web_actor: this.bridge.webActor(this.me(req)),
    });
  }

  @UseGuards(AuthGuard)
  @Delete('instances/:id')
  @ApiTags('Instances')
  @ApiBearerAuth('bearer')
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
  ) {
    return this.bridge.submit('instances_remove', {
      id,
      deleteFromDisk: deleteFromDisk === '1' || deleteFromDisk === 'true',
      deleteData: deleteData === '1' || deleteData === 'true',
      web_actor: this.bridge.webActor(this.me(req)),
    });
  }

  @UseGuards(AuthGuard)
  @Post('server/start')
  @ApiTags('Server')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Start the Factorio game server' })
  @ApiBody({ type: ServerActionDto })
  @ApiResponse({ status: 200, description: 'Start command dispatched' })
  serverStart(@Req() req: Request, @Body() body?: { instance_id?: string }) {
    const iid = this.explicitInstanceId(body?.instance_id);
    return this.bridge.submit(
      'start_server',
      { web_actor: this.bridge.webActor(this.me(req)) },
      iid,
    );
  }

  @UseGuards(AuthGuard)
  @Post('server/stop')
  @ApiTags('Server')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Stop the Factorio game server gracefully' })
  @ApiBody({ type: ServerActionDto })
  @ApiResponse({ status: 200, description: 'Stop command dispatched' })
  serverStop(@Req() req: Request, @Body() body?: { instance_id?: string }) {
    const iid = this.explicitInstanceId(body?.instance_id);
    return this.bridge.submit(
      'stop_server',
      { web_actor: this.bridge.webActor(this.me(req)) },
      iid,
    );
  }

  @UseGuards(AuthGuard)
  @Post('server/restart')
  @ApiTags('Server')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Restart the Factorio game server' })
  @ApiBody({ type: ServerActionDto })
  @ApiResponse({ status: 200, description: 'Restart command dispatched' })
  serverRestart(@Req() req: Request, @Body() body?: { instance_id?: string }) {
    const iid = this.explicitInstanceId(body?.instance_id);
    return this.bridge.submit(
      'restart_server',
      { web_actor: this.bridge.webActor(this.me(req)) },
      iid,
    );
  }

  @UseGuards(AuthGuard)
  @Post('server/kill')
  @ApiTags('Server')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Force-kill the Factorio game server process' })
  @ApiBody({ type: ServerActionDto })
  @ApiResponse({ status: 200, description: 'Kill signal sent' })
  serverKill(@Req() req: Request, @Body() body?: { instance_id?: string }) {
    const iid = this.explicitInstanceId(body?.instance_id);
    return this.bridge.submit(
      'kill_server',
      { web_actor: this.bridge.webActor(this.me(req)) },
      iid,
    );
  }

  @UseGuards(AuthGuard)
  @Post('rcon')
  @ApiTags('Server')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Execute an RCON command on the server' })
  @ApiBody({ type: RconDto })
  @ApiResponse({ status: 200, description: 'RCON response from server' })
  rcon(
    @Req() req: Request,
    @Body()
    body: {
      command?: string;
      source?: string;
      command_id?: string;
      command_name?: string;
    },
  ) {
    return this.bridge.submit('rcon_exec', {
      command: body.command,
      source: body.source,
      command_id: body.command_id,
      command_name: body.command_name,
      web_actor: this.bridge.webActor(this.me(req)),
    });
  }

  @UseGuards(AuthGuard)
  @Get('logs')
  @ApiTags('Logs')
  @ApiBearerAuth('bearer')
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
  ) {
    return this.bridge.submit('log_tail', {
      tail: parseInt(tail || '400', 10),
      instance_id: instanceId,
    });
  }

  @UseGuards(AuthGuard)
  @Get('config/program')
  @ApiTags('Config')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Get program settings',
    description:
      'Non-admin users receive a filtered view without TLS and admin-only settings.',
  })
  @ApiResponse({ status: 200, description: 'Program settings object' })
  async programConfig(@Req() req: Request) {
    const data = await this.bridge.submit('get_program_settings');
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return this.filterProgramSettingsForUser(data, this.isAdmin(req));
    }
    return data;
  }

  @UseGuards(AuthGuard)
  @Get('config/program/factorio-credentials-verify')
  @ApiTags('Config')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Verify Factorio credentials (admin only)' })
  @ApiResponse({ status: 200, description: 'Credential verification result' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  async programFactorioCredentialsVerify(@Req() req: Request) {
    if (!this.isAdmin(req)) throw new ForbiddenException('admin_required');
    return this.bridge.submit('verify_factorio_credentials');
  }

  @UseGuards(AuthGuard)
  @Put('config/program')
  @ApiTags('Config')
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Update program settings',
    description:
      'Non-admins cannot change TLS, credentials or log rotation settings.',
  })
  @ApiResponse({ status: 200, description: 'Settings updated' })
  @ApiResponse({
    status: 403,
    description: 'Attempted to change admin-only settings',
  })
  programConfigSet(@Req() req: Request, @Body() body: Record<string, unknown>) {
    const payload = this.sanitizeProgramSettingsPayload(
      body,
      this.isAdmin(req),
    );
    return this.bridge.submit('set_program_settings', {
      ...payload,
      web_actor: this.bridge.webActor(this.me(req)),
    });
  }

  @UseGuards(AuthGuard)
  @Get('config/server')
  @ApiTags('Config')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get server.ini configuration' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'server.ini key-value pairs' })
  serverConfigGet(@Query('instance_id') instanceId?: string) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit('get_server_ini', {}, iid);
  }

  @UseGuards(AuthGuard)
  @Put('config/server')
  @ApiTags('Config')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update server.ini configuration' })
  @ApiResponse({ status: 200, description: 'Config saved' })
  serverConfigSet(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('set_server_ini', {
      ...body,
      web_actor: this.bridge.webActor(this.me(req)),
    });
  }

  @UseGuards(AuthGuard)
  @Get('saves')
  @ApiTags('Saves')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'List available save files' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'List of save files' })
  saves(@Query('instance_id') instanceId?: string) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit('list_saves', {}, iid);
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
      actor: this.bridge.webActor(this.me(req)),
    });
  }

  @UseGuards(AuthGuard)
  @Get('files/mod-list')
  @ApiTags('Files')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Read mod-list.json' })
  @ApiResponse({ status: 200, description: 'Mod list JSON' })
  modList() {
    return this.bridge.submit('read_mod_list');
  }

  @UseGuards(AuthGuard)
  @Put('files/mod-list')
  @ApiTags('Files')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Write mod-list.json' })
  @ApiResponse({ status: 200, description: 'Mod list saved' })
  modListWrite(@Body() body: unknown, @Req() req: Request) {
    return this.bridge.submit('write_mod_list', {
      data: body,
      actor: this.bridge.webActor(this.me(req)),
    });
  }

  @UseGuards(AuthGuard)
  @Get('files/admin-list')
  @ApiTags('Files')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Read admins.txt admin list' })
  @ApiResponse({ status: 200, description: 'Admin list' })
  adminList() {
    return this.bridge.submit('read_admin_list');
  }

  @UseGuards(AuthGuard)
  @Get('files/ban-list')
  @ApiTags('Files')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Read ban-list.json' })
  @ApiResponse({ status: 200, description: 'Ban list' })
  banList() {
    return this.bridge.submit('read_ban_list');
  }

  @UseGuards(AuthGuard)
  @Get('mods')
  @ApiTags('Mods')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get list of installed mods with details' })
  @ApiResponse({ status: 200, description: 'Mods list with metadata' })
  mods(@Req() req: Request) {
    return this.bridge.submit('mods_list', {
      ui_lang: req.headers['x-fcc-ui-lang'],
    });
  }

  @UseGuards(AuthGuard)
  @Get('players/summary')
  @ApiTags('Server')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get summary of online and recent players' })
  @ApiResponse({ status: 200, description: 'Players summary' })
  playersSummary() {
    return this.bridge.submit('players_summary');
  }

  @UseGuards(AuthGuard)
  @Get('maintenance')
  @ApiTags('Maintenance')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get maintenance schedule configuration' })
  @ApiResponse({ status: 200, description: 'Maintenance config' })
  maintenanceGet() {
    return this.bridge.submit('maintenance_get');
  }

  @UseGuards(AuthGuard)
  @Put('maintenance')
  @ApiTags('Maintenance')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Update maintenance schedule configuration' })
  @ApiBody({ type: MaintenanceSetDto })
  @ApiResponse({ status: 200, description: 'Maintenance config saved' })
  maintenanceSet(@Body() body: Record<string, unknown>) {
    return this.bridge.submit('maintenance_set', body);
  }

  @UseGuards(AuthGuard)
  @Get('maintenance/reports')
  @ApiTags('Maintenance')
  @ApiBearerAuth('bearer')
  @ApiOperation({ summary: 'Get maintenance task execution reports' })
  @ApiResponse({ status: 200, description: 'Maintenance reports list' })
  maintenanceReports() {
    return this.bridge.submit('maintenance_reports');
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
}
