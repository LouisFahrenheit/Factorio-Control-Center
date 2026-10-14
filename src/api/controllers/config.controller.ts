import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  Query,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomBytes } from 'crypto';
import { unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import type { Request } from 'express';
import { AuthGuard, AUTH_USER_KEY } from '../../auth/auth.guard';
import { SessionUser } from '../../common/types';
import { FccConfigService } from '../../config/fcc-config.service';
import { InstancesService } from '../../instances/instances.service';
import { NotificationsService } from '../../notifications/notifications.service';
import { ApiBridgeService } from '../api-bridge.service';

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

@ApiTags('Config')
@ApiBearerAuth('bearer')
@Controller('api/config')
@UseGuards(AuthGuard)
export class ConfigController {
  constructor(
    private readonly bridge: ApiBridgeService,
    private readonly config: FccConfigService,
    private readonly instances: InstancesService,
    private readonly notificationsService: NotificationsService,
  ) {}

  private me(req: Request): SessionUser {
    return (req as Request & { [AUTH_USER_KEY]: SessionUser })[AUTH_USER_KEY];
  }

  private isAdmin(req: Request): boolean {
    return String(this.me(req)?.role || '') === 'administrator';
  }

  private explicitInstanceId(raw?: string): string | undefined {
    const id = String(raw || '').trim();
    return id || undefined;
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

  @Get('program')
  @ApiOperation({
    summary: 'Get program settings',
    description:
      'Non-admin users receive a filtered view without TLS and admin-only settings.',
  })
  @ApiResponse({ status: 200, description: 'Program settings object' })
  async programConfig(@Req() req: Request): Promise<Record<string, unknown>> {
    const data = await this.bridge.submit('get_program_settings');
    if (data && typeof data === 'object' && !Array.isArray(data)) {
      return this.filterProgramSettingsForUser(data, this.isAdmin(req));
    }
    return data;
  }

  @Get('program/factorio-credentials-verify')
  @ApiOperation({ summary: 'Verify Factorio credentials (admin only)' })
  @ApiResponse({ status: 200, description: 'Credential verification result' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  programFactorioCredentialsVerify(
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    if (!this.isAdmin(req)) throw new ForbiddenException('admin_required');
    return this.bridge.submit('verify_factorio_credentials');
  }

  @Put('program')
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
  programConfigSet(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const payload = this.sanitizeProgramSettingsPayload(
      body,
      this.isAdmin(req),
    );
    return this.bridge.submit('set_program_settings', {
      ...payload,
      web_actor: this.bridge.webActor(this.me(req)),
    });
  }

  @Get('server')
  @ApiOperation({ summary: 'Get server.ini configuration' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'server.ini key-value pairs' })
  serverConfigGet(
    @Query('instance_id') instanceId?: string,
  ): Promise<Record<string, unknown>> {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit('get_server_ini', {}, iid);
  }

  @Put('server')
  @ApiOperation({ summary: 'Update server.ini configuration' })
  @ApiResponse({ status: 200, description: 'Config saved' })
  serverConfigSet(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ): Promise<Record<string, unknown>> {
    const iid = this.explicitInstanceId(
      typeof body?.instance_id === 'string' ? body.instance_id : undefined,
    );
    return this.bridge.submit(
      'set_server_ini',
      {
        ...body,
        web_actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Get('notifications')
  @ApiTags('Notifications')
  @ApiOperation({
    summary: 'Get global notification/integration settings (admin only)',
  })
  @ApiResponse({ status: 200, description: 'Global notification config' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  getNotificationsConfig(@Req() req: Request): Record<string, unknown> {
    if (!this.isAdmin(req)) throw new ForbiddenException('admin_required');
    const cfg = this.config.notifications;
    return {
      ok: true,
      ...cfg,
    };
  }

  @Put('notifications')
  @ApiTags('Notifications')
  @ApiOperation({
    summary: 'Save global notification/integration settings (admin only)',
  })
  @ApiResponse({ status: 200, description: 'Settings saved' })
  @ApiResponse({ status: 403, description: 'Admin role required' })
  async setNotificationsConfig(
    @Req() req: Request,
    @Body() body: Record<string, unknown>,
  ): Promise<{ ok: boolean }> {
    if (!this.isAdmin(req)) throw new ForbiddenException('admin_required');

    const allowedKeys = [
      'telegram_enabled',
      'telegram_bot_token',
      'telegram_chat_id',
      'webhook_targets',
      'notif_instances_mode',
      'notif_selected_instance_ids',
      'notif_server_started',
      'notif_server_stopped',
      'notif_server_crash',
      'notif_server_start_failed',
      'notif_player_join',
      'notif_player_leave',
      'notif_chat_relay',
      'notif_maintenance',
      'notif_factorio_update_available',
      'notif_low_ups',
      'notif_low_ups_threshold',
      'notif_moderation',
      'notif_silent_events',
    ] as const;

    const updates: Record<string, unknown> = {};
    for (const key of allowedKeys) {
      if (key in body) {
        if (key === 'telegram_bot_token' && body[key] === '***') {
          continue;
        }
        updates[key] = body[key];
      }
    }

    await this.config.saveNotificationsKeys(updates);
    return { ok: true };
  }

  @Get('notifications/instance/:instanceId')
  @ApiTags('Notifications')
  @ApiParam({ name: 'instanceId', required: true })
  @ApiOperation({
    summary: 'Get per-instance notification override (admin only)',
  })
  getInstanceNotifOverride(
    @Req() req: Request,
    @Param('instanceId') instanceId: string,
  ): { ok: boolean; override: unknown } {
    if (!this.isAdmin(req)) throw new ForbiddenException('admin_required');
    const item = this.instances.getById(instanceId);
    if (!item) throw new NotFoundException('instance_not_found');
    const raw = item.notifOverride;
    let override: unknown = null;
    try {
      if (raw) override = JSON.parse(raw) as unknown;
    } catch {
      /* ignore */
    }
    return { ok: true, override };
  }

  @Put('notifications/instance/:instanceId')
  @ApiTags('Notifications')
  @ApiParam({ name: 'instanceId', required: true })
  @ApiOperation({
    summary: 'Save per-instance notification override (admin only)',
  })
  async setInstanceNotifOverride(
    @Req() req: Request,
    @Param('instanceId') instanceId: string,
    @Body() body: Record<string, unknown>,
  ): Promise<{ ok: boolean }> {
    if (!this.isAdmin(req)) throw new ForbiddenException('admin_required');
    const item = this.instances.getById(instanceId);
    if (!item) throw new NotFoundException('instance_not_found');
    const override = body.override !== undefined ? body.override : null;
    const raw = override !== null ? JSON.stringify(override) : null;
    await this.instances.update(instanceId, {
      notifOverride: raw,
    });
    return { ok: true };
  }

  @Post('notifications/test')
  @ApiTags('Notifications')
  @ApiOperation({
    summary: 'Send a test notification to all configured channels (admin only)',
  })
  @ApiResponse({ status: 200, description: 'Test notification result' })
  testNotifications(
    @Req() req: Request,
    @Body() body: { instanceId?: string },
  ): Promise<Record<string, unknown>> {
    if (!this.isAdmin(req)) throw new ForbiddenException('admin_required');
    return this.notificationsService.sendTest(body?.instanceId);
  }

  @Post('notifications/webhook/test')
  @ApiTags('Notifications')
  @ApiOperation({ summary: 'Test a single webhook target (admin only)' })
  @ApiResponse({ status: 200, description: 'Webhook test result' })
  testWebhook(
    @Req() req: Request,
    @Body() body: { url: string; secret?: string; instanceId?: string },
  ): Promise<Record<string, unknown>> {
    if (!this.isAdmin(req)) throw new ForbiddenException('admin_required');
    if (!body?.url || typeof body.url !== 'string') {
      throw new BadRequestException('URL is required');
    }
    return this.notificationsService.testWebhook(
      { url: body.url.trim(), secret: body.secret },
      body.instanceId,
    );
  }

  @Post('web/restart')
  @ApiOperation({ summary: 'Restart the FCC web panel process' })
  @ApiResponse({ status: 200, description: 'Restart initiated' })
  webRestart() {
    return this.bridge.submit('restart_web_panel');
  }

  @Post('web-tls/upload')
  @ApiOperation({ summary: 'Upload TLS certificate or key file' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        kind: {
          type: 'string',
          enum: ['cert', 'key'],
          description: 'File type',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'TLS file uploaded' })
  @UseInterceptors(FileInterceptor('file'))
  async webTlsUpload(
    @UploadedFile() file: Express.Multer.File,
    @Body('kind') kind: string,
  ): Promise<Record<string, unknown>> {
    const k = String(kind || '')
      .trim()
      .toLowerCase();
    if (k !== 'cert' && k !== 'key')
      return { ok: false, error: 'tls_upload_invalid_kind' };
    const rawName = String(file?.originalname || '')
      .trim()
      .toLowerCase();
    if (rawName && !/\.(pem|crt|cer|key|chain)$/.test(rawName)) {
      return { ok: false, error: 'tls_upload_bad_extension' };
    }
    const tmp = join(tmpdir(), `fcc-tls-${randomBytes(8).toString('hex')}.dat`);
    writeFileSync(tmp, file.buffer);
    try {
      return await this.bridge.submit('upload_web_tls_file', {
        tmp_path: tmp,
        kind: k,
      });
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }
}
