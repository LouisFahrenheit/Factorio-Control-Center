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
  UseGuards,
  BadRequestException,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
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

const WEB_TLS_CFG_KEYS = [
  'tls_enabled',
  'tls_certfile',
  'tls_keyfile',
  'tls_key_password',
  'port_mode',
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
] as const;

@Controller('api')
export class ApiController {
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
  health() {
    const plat = process.platform;
    return {
      ok: true,
      version: APP_VERSION,
      build: resolveAppBuild(),
      host_os: plat.startsWith('win')
        ? 'windows'
        : plat.startsWith('linux')
          ? 'linux'
          : 'unix',
    };
  }

  @Get('locale-bootstrap')
  localeBootstrap(@Query('lang') lang?: string) {
    const loc = this.locale.getLocale(lang);
    const w = this.config.webPanel;
    return {
      ok: true,
      lang: loc.lang,
      strings: loc.strings,
      theme: this.config.sharedTheme,
      web_disable_effects: w.web_disable_effects,
      default_web_credentials: this.users.defaultAdminPasswordActive(),
      available_languages: this.locale.listAvailableLanguages(),
      default_toast_duration_sec: w.toast_duration_sec,
      panel_default_language: this.config.langCode,
    };
  }

  @UseGuards(AuthGuard)
  @Get('locale')
  getLocale(@Query('lang') lang?: string) {
    return this.locale.getLocale(lang);
  }

  @UseGuards(AuthGuard)
  @Get('status')
  status() {
    return this.bridge.submit('status');
  }

  @UseGuards(AuthGuard)
  @Get('instances')
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
  instancesAdd(@Body() body: Record<string, unknown>) {
    return this.bridge.submit('instances_add', body);
  }

  @UseGuards(AuthGuard)
  @Post('instances/select')
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
  instancesClone(
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.bridge.submit('instances_clone', { id, ...body });
  }

  @UseGuards(AuthGuard)
  @Delete('instances/:id')
  instancesRemove(
    @Param('id') id: string,
    @Query('deleteFromDisk') deleteFromDisk?: string,
    @Query('deleteData') deleteData?: string,
  ) {
    return this.bridge.submit('instances_remove', {
      id,
      deleteFromDisk: deleteFromDisk === '1' || deleteFromDisk === 'true',
      deleteData: deleteData === '1' || deleteData === 'true',
    });
  }

  @UseGuards(AuthGuard)
  @Post('server/start')
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
  async programConfig(@Req() req: Request) {
    const data = await this.bridge.submit('get_program_settings');
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return this.filterProgramSettingsForUser(data, this.isAdmin(req));
    }
    return data;
  }

  @UseGuards(AuthGuard)
  @Get('config/program/factorio-credentials-verify')
  async programFactorioCredentialsVerify(@Req() req: Request) {
    if (!this.isAdmin(req)) throw new ForbiddenException('admin_required');
    return this.bridge.submit('verify_factorio_credentials');
  }

  @UseGuards(AuthGuard)
  @Put('config/program')
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
  serverConfigGet(@Query('instance_id') instanceId?: string) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit('get_server_ini', {}, iid);
  }

  @UseGuards(AuthGuard)
  @Put('config/server')
  serverConfigSet(@Body() body: Record<string, unknown>) {
    return this.bridge.submit('set_server_ini', body);
  }

  @UseGuards(AuthGuard)
  @Get('saves')
  saves(@Query('instance_id') instanceId?: string) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit('list_saves', {}, iid);
  }

  @UseGuards(AuthGuard)
  @Get('files/server-settings')
  serverSettings() {
    return this.bridge.submit('read_server_settings');
  }

  @UseGuards(AuthGuard)
  @Put('files/server-settings')
  serverSettingsWrite(@Body() body: unknown, @Req() req: Request) {
    return this.bridge.submit('write_server_settings', {
      data: body,
      actor: this.bridge.webActor(this.me(req)),
    });
  }

  @UseGuards(AuthGuard)
  @Get('files/mod-list')
  modList() {
    return this.bridge.submit('read_mod_list');
  }

  @UseGuards(AuthGuard)
  @Put('files/mod-list')
  modListWrite(@Body() body: unknown, @Req() req: Request) {
    return this.bridge.submit('write_mod_list', {
      data: body,
      actor: this.bridge.webActor(this.me(req)),
    });
  }

  @UseGuards(AuthGuard)
  @Get('files/admin-list')
  adminList() {
    return this.bridge.submit('read_admin_list');
  }

  @UseGuards(AuthGuard)
  @Get('files/ban-list')
  banList() {
    return this.bridge.submit('read_ban_list');
  }

  @UseGuards(AuthGuard)
  @Get('mods')
  mods(@Req() req: Request) {
    return this.bridge.submit('mods_list', {
      ui_lang: req.headers['x-fcc-ui-lang'],
    });
  }

  @UseGuards(AuthGuard)
  @Get('players/summary')
  playersSummary() {
    return this.bridge.submit('players_summary');
  }

  @UseGuards(AuthGuard)
  @Get('maintenance')
  maintenanceGet() {
    return this.bridge.submit('maintenance_get');
  }

  @UseGuards(AuthGuard)
  @Put('maintenance')
  maintenanceSet(@Body() body: Record<string, unknown>) {
    return this.bridge.submit('maintenance_set', body);
  }

  @UseGuards(AuthGuard)
  @Get('maintenance/reports')
  maintenanceReports() {
    return this.bridge.submit('maintenance_reports');
  }

  @UseGuards(AuthGuard)
  @Get('announcements')
  announcements() {
    return this.bridge.submit('announcements_read');
  }

  @UseGuards(AuthGuard)
  @Put('announcements')
  announcementsWrite(@Body() body: { data?: unknown }) {
    return this.bridge.submit('announcements_write', {
      data: body.data ?? body,
    });
  }

  @UseGuards(AuthGuard)
  @Get('commands/catalog')
  commandsCatalog(@Req() req: Request) {
    const lang = String(req.headers['x-fcc-ui-lang'] || '').slice(0, 12);
    return this.bridge.submit('read_commands_catalog', { ui_lang: lang });
  }

  @UseGuards(AuthGuard)
  @Post('chat/send')
  chatSend(@Body() body: { message?: string }) {
    const msg = String(body.message || '').trim();
    if (!msg) throw new BadRequestException('empty_message');
    return this.bridge.submit('chat_send_text', { message: msg });
  }
}
