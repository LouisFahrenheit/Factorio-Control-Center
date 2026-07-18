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
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { AuthGuard, AUTH_USER_KEY } from '../auth/auth.guard';
import { SessionUser } from '../common/types';
import { ApiBridgeService } from './api-bridge.service';
import { LOG_HISTORY_DEFAULT_TAIL } from '../ops/ops-utils';
import { LocaleService } from '../locale/locale.service';
import { FccConfigService } from '../config/fcc-config.service';
import { UsersService } from '../auth/users.service';
import { MapGenOpsService } from '../ops/map-gen/map-gen-ops.service';
import { hasFactorioExecutable } from '../ops/path-manager';
import type {
  MapGenSettingsJson,
  MapSettingsJson,
} from '../ops/map-gen/map-gen-presets';

@Controller('api')
@UseGuards(AuthGuard)
export class ApiFullController {
  constructor(
    private readonly bridge: ApiBridgeService,
    private readonly locale: LocaleService,
    private readonly config: FccConfigService,
    private readonly users: UsersService,
    private readonly mapGen: MapGenOpsService,
  ) {}

  private user(req: Request): SessionUser {
    return (req as Request & { [AUTH_USER_KEY]: SessionUser })[AUTH_USER_KEY];
  }

  private iid(q?: string): string | undefined {
    const s = String(q || '').trim();
    return s || undefined;
  }

  @Post('server/save')
  serverSave(@Req() req: Request) {
    return this.bridge.submit('save_game', {
      web_actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('server/backup')
  serverBackup(@Req() req: Request) {
    return this.bridge.submit('backup', {
      web_actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('server/restart')
  serverRestart(@Req() req: Request) {
    return this.bridge.submit('restart_server', {
      web_actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('server/create-save')
  serverCreateSave(
    @Body()
    body: {
      name?: string;
      mode?: string;
      preset?: string;
      seed?: number;
      map_gen_settings?: Record<string, unknown>;
      map_settings?: Record<string, unknown>;
      map_exchange_string?: string;
    },
  ) {
    return this.bridge.submit('create_save', {
      name: body.name || '',
      mode: body.mode,
      preset: body.preset,
      seed: body.seed,
      map_gen_settings: body.map_gen_settings,
      map_settings: body.map_settings,
      map_exchange_string: body.map_exchange_string,
    });
  }

  @Get('server/map-gen/schema')
  mapGenSchema() {
    return this.mapGen.getSchema();
  }

  @Post('server/map-gen/parse-exchange')
  mapGenParseExchange(@Body() body: { map_exchange_string?: string }) {
    return this.mapGen.parseExchangeString(
      String(body.map_exchange_string || ''),
    );
  }

  @Post('server/map-gen/export-exchange')
  mapGenExportExchange(
    @Body()
    body: {
      map_gen_settings?: Record<string, unknown>;
      map_settings?: Record<string, unknown> | null;
      space_age?: boolean;
    },
  ) {
    return this.mapGen.exportExchangeString(
      body.map_gen_settings || {},
      body.map_settings ?? null,
      body.space_age !== false,
    );
  }

  @Post('server/map-gen/preview-stream')
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
        body.map_gen_settings || {},
        body.seed,
        body.preview_planet,
        (frame) => write({ ok: true, type: 'frame', ...frame }),
        { skipMapSettings: body.skip_map_settings },
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

  @Post('server/map-gen/preview')
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
      body.map_gen_settings || {},
      body.seed,
      body.map_settings,
      body.preview_planet,
      {
        skipMapSettings: body.skip_map_settings,
        previewSize: body.preview_size,
      },
    );
  }

  @Get('factorio/update/check')
  factorioCheck() {
    return this.bridge.submit('factorio_update_check');
  }

  @Get('factorio/update/check-all')
  factorioCheckAll() {
    return this.bridge.submit('factorio_update_check_all');
  }

  @Get('factorio/releases')
  factorioReleases() {
    return this.bridge.submit('factorio_releases');
  }

  @Post('factorio/update')
  factorioUpdate(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('factorio_update', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Get('factorio/update/status')
  factorioUpdateStatus() {
    return this.bridge.submit('factorio_update_status');
  }

  @Post('factorio/update/stop')
  factorioUpdateStop() {
    return this.bridge.submit('factorio_update_stop');
  }

  @Get('config/server')
  configServerGet() {
    return this.bridge.submit('get_server_ini');
  }

  @Put('config/server')
  configServerPut(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('set_server_ini', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('config/web/restart')
  webRestart() {
    return this.bridge.submit('restart_web_panel');
  }

  @Post('config/web-tls/upload')
  @UseInterceptors(FileInterceptor('file'))
  async webTlsUpload(
    @UploadedFile() file: Express.Multer.File,
    @Body('kind') kind: string,
  ) {
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
    const { writeFileSync, unlinkSync } = await import('fs');
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

  @Get('saves/:name/download')
  async saveDownload(@Param('name') name: string, @Res() res: Response) {
    const data = await this.bridge.submit('get_save_download_path', { name });
    const path = String(data.path || '');
    if (!path || !existsSync(path))
      return res.status(404).json({ ok: false, error: 'not_found' });
    return res.download(path, String(data.name || name));
  }

  @Get('saves/:name/inspect')
  saveInspect(@Param('name') name: string, @Req() req: Request) {
    const lang = String(req.headers['x-fcc-ui-lang'] || '').slice(0, 12);
    return this.bridge.submit('inspect_save', { name, ui_lang: lang });
  }

  @Post('saves/:name/rename')
  saveRename(
    @Param('name') name: string,
    @Body() body: { new_name?: string },
    @Req() req: Request,
  ) {
    return this.bridge.submit('rename_save', {
      name,
      new_name: body.new_name || '',
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Delete('saves/:name')
  saveDelete(@Param('name') name: string, @Req() req: Request) {
    return this.bridge.submit('delete_save', {
      name,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('saves/:name/duplicate')
  saveDuplicate(@Param('name') name: string, @Req() req: Request) {
    return this.bridge.submit('duplicate_save', {
      name,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('saves/set-launch')
  saveSetLaunch(@Body() body: { name?: string }, @Req() req: Request) {
    return this.bridge.submit('set_launch_save', {
      name: body.name || '',
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('saves/upload')
  @UseInterceptors(FileInterceptor('file'))
  async saveUpload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @Body('filename') filename?: string,
  ) {
    const tmp = join(
      tmpdir(),
      `fcc-save-${randomBytes(8).toString('hex')}.zip`,
    );
    const { writeFileSync, unlinkSync } = await import('fs');
    writeFileSync(tmp, file.buffer);
    try {
      const uploadName = String(filename || file.originalname || '').trim();
      return await this.bridge.submit('upload_save_archive', {
        tmp_path: tmp,
        name: uploadName,
        actor: this.bridge.webActor(this.user(req)),
      });
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }

  @Post('files/server-settings/create-from-example')
  serverSettingsExample() {
    return this.bridge.submit('create_server_settings_from_example');
  }

  @Put('files/admin-list')
  adminListPut(@Body() body: unknown) {
    return this.bridge.submit('write_admin_list', { data: body });
  }

  @Put('mods/prefs')
  modsPrefs(@Req() req: Request, @Body() body: { remove_old_zips?: boolean }) {
    return this.bridge.submit('mods_set_prefs', {
      ...body,
      web_actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('mods/check-updates')
  modsCheckUpdates(@Body() body: Record<string, unknown>) {
    return this.bridge.submit('mods_check_updates_start', body);
  }

  @Get('mods/check-updates')
  modsCheckUpdatesStatus() {
    return this.bridge.submit('mods_check_updates_status');
  }

  @Post('mods/toggle')
  modsToggle(
    @Body() body: { name?: string; enabled?: boolean },
    @Req() req: Request,
  ) {
    return this.bridge.submit('mods_set_enabled', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('mods/toggle-all')
  modsToggleAll(@Body() body: { enabled?: boolean }, @Req() req: Request) {
    return this.bridge.submit('mods_set_all_enabled', {
      enabled: body?.enabled,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('mods/disable-conflicts')
  modsDisableConflicts(
    @Body() body: { names?: string[] },
    @Req() req: Request,
  ) {
    return this.bridge.submit('mods_disable_conflicts', {
      names: body?.names,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Get('mods/changelog')
  modsChangelog(@Query('name') name: string) {
    return this.bridge.submit('mods_get_changelog', { name });
  }

  @Post('mods/version')
  modsVersion(@Body() body: { name?: string; version?: string }) {
    return this.bridge.submit('mods_set_version', body);
  }

  @Post('mods/remove')
  modsRemove(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('mods_remove', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('mods/upload')
  @UseInterceptors(FileInterceptor('file'))
  async modsUpload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @Body('confirm_replace') confirmReplace?: string,
  ) {
    const rawName = String(file.originalname || '').trim();
    const lowerName = rawName.toLowerCase();
    const isSettings =
      lowerName === 'mod-settings.dat' || lowerName.endsWith('.dat');
    const confirmFlag = ['1', 'true', 'yes', 'on'].includes(
      String(confirmReplace || '')
        .trim()
        .toLowerCase(),
    );
    const tmp = join(
      tmpdir(),
      isSettings
        ? `fcc-modset-${randomBytes(8).toString('hex')}.dat`
        : `fcc-mod-${randomBytes(8).toString('hex')}.zip`,
    );
    const { writeFileSync, unlinkSync } = await import('fs');
    writeFileSync(tmp, file.buffer);
    try {
      if (isSettings) {
        return await this.bridge.submit('upload_mod_settings_dat', {
          tmp_path: tmp,
          confirm_replace: confirmFlag,
          actor: this.bridge.webActor(this.user(req)),
        });
      }
      const uploadName = lowerName.endsWith('.zip')
        ? rawName
        : `${rawName}.zip`;
      return await this.bridge.submit('upload_mod_archive', {
        tmp_path: tmp,
        name: uploadName,
        actor: this.bridge.webActor(this.user(req)),
      });
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }

  @Post('mods/import-save/preview')
  @UseInterceptors(FileInterceptor('file'))
  async modsImportSavePreview(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
  ) {
    const lang = String(req.headers['x-fcc-ui-lang'] || '').slice(0, 12);
    const tmp = join(
      tmpdir(),
      `fcc-save-prev-${randomBytes(8).toString('hex')}.zip`,
    );
    const { writeFileSync, unlinkSync } = await import('fs');
    writeFileSync(tmp, file.buffer);
    try {
      return await this.bridge.submit('inspect_uploaded_save_mods', {
        tmp_path: tmp,
        ui_lang: lang,
      });
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }

  @Get('mods/download-all')
  async modsDownloadAll(@Res() res: Response) {
    const data = await this.bridge.submit('build_mods_archive');
    const path = String(data.path || '');
    if (!path || !existsSync(path))
      return res.status(404).json({ ok: false, error: 'not_found' });
    return res.download(path, String(data.name || 'mods.zip'));
  }

  @Get('mods/:name/download')
  async modDownload(@Param('name') name: string, @Res() res: Response) {
    const data = await this.bridge.submit('get_mod_download_path', { name });
    const path = String(data.path || '');
    if (!path || !existsSync(path))
      return res.status(404).json({ ok: false, error: 'not_found' });
    return res.download(path, String(data.name || name));
  }

  @Post('mods/install-plan')
  modsInstallPlan(@Body() body: { mod?: string }) {
    return this.bridge.submit('mods_install_plan', { mod: body.mod });
  }

  @Post('mods/install-plan-batch')
  modsInstallPlanBatch(@Body() body: { mods?: unknown }) {
    return this.bridge.submit('mods_install_plan_batch', { mods: body.mods });
  }

  @Get('mods/update-all-plan')
  modsUpdateAllPlan() {
    return this.bridge.submit('mods_update_all_plan');
  }

  @Post('mods/job/start-install')
  modsJobInstall(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('mods_job_start', {
      mode: 'install',
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('mods/job/start-install-save')
  modsJobInstallSave(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.bridge.submit('mods_job_start', {
      mode: 'install_many',
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('mods/job/start-update')
  modsJobUpdate(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('mods_job_start', {
      mode: 'update_one',
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('mods/job/start-update-all')
  modsJobUpdateAll(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('mods_job_start', {
      mode: 'update_all',
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Get('mods/job/status')
  modsJobStatus() {
    return this.bridge.submit('mods_job_status');
  }

  @Post('mods/job/stop')
  modsJobStop() {
    return this.bridge.submit('mods_job_stop');
  }

  @Post('bans/sync')
  bansSync() {
    return this.bridge.submit('sync_bans');
  }

  @Post('bans/ban')
  ban(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('ban_player', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('bans/unban')
  unban(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('unban_player', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('moderation/mute')
  mute(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('mute_player', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('moderation/unmute')
  unmute(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('unmute_player', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('moderation/kick')
  kick(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('kick_player', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('moderation/purge')
  purge(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('purge_player', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('whitelist/add')
  wlAdd(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('whitelist_add', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('whitelist/remove')
  wlRemove(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('whitelist_remove', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('whitelist/clear')
  wlClear(@Req() req: Request) {
    return this.bridge.submit('whitelist_clear', {
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Put('commands/catalog')
  commandsPut(@Body() body: unknown, @Req() req: Request) {
    const lang = String(req.headers['x-fcc-ui-lang'] || '').slice(0, 12);
    return this.bridge.submit('write_commands_catalog', {
      data: body,
      ui_lang: lang,
      web_actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Get('logs/history')
  logsHistory(
    @Query('tail') tail?: string,
    @Query('instance_id') instanceId?: string,
    @Query('full') full?: string,
  ) {
    return this.bridge.submit('log_file_history', {
      tail: parseInt(tail || String(LOG_HISTORY_DEFAULT_TAIL), 10),
      instance_id: instanceId,
      full: full === '1' || full === 'true',
    });
  }

  @Get('logs/program')
  logsProgram(
    @Query('kind') kind?: string,
    @Query('tail') tail?: string,
    @Query('full') full?: string,
  ) {
    return this.bridge.submit('program_log_history', {
      kind: String(kind || ''),
      tail: parseInt(tail || String(LOG_HISTORY_DEFAULT_TAIL), 10),
      full: full === '1' || full === 'true',
    });
  }

  @Get('chat-log')
  chatLog(@Query('tail') tail?: string) {
    return this.bridge.submit('chat_log_tail', {
      tail: parseInt(tail || '500', 10),
    });
  }

  @Post('chat/send-announcement')
  chatAnnouncement(@Body() body: { message?: string }) {
    return this.bridge.submit('chat_send_text', { message: body.message });
  }

  @Get('mod-settings/json')
  modSettingsGet() {
    return this.bridge.submit('mod_settings_read_json');
  }

  @Put('mod-settings/json')
  modSettingsPut(@Body() body: unknown, @Req() req: Request) {
    return this.bridge.submit('mod_settings_write_json', {
      data: body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Get('mod-settings/schema')
  modSettingsSchema(@Req() req: Request, @Query('refresh') refresh?: string) {
    const lang = String(req.headers['x-fcc-ui-lang'] || '').slice(0, 12);
    const force =
      String(refresh || '').trim() === '1' ||
      String(refresh || '').toLowerCase() === 'true';
    return this.bridge.submit('mod_settings_schema', {
      ui_lang: lang,
      refresh: force,
    });
  }

  @Get('mod-settings/schema/status')
  modSettingsSchemaStatus() {
    return this.bridge.submit('mod_settings_schema_status');
  }

  @Get('modpacks')
  modpacksList() {
    return this.bridge.submit('modpack_list');
  }

  @Get('modpacks/:name')
  modpackGet(@Param('name') name: string, @Req() req: Request) {
    const lang = String(req.headers['x-fcc-ui-lang'] || '').slice(0, 12);
    return this.bridge.submit('modpack_get', { name, ui_lang: lang });
  }

  @Post('modpacks')
  modpackSave(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('modpack_save_current', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('modpacks/:name/activate')
  modpackActivate(
    @Param('name') name: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.bridge.submit('modpack_activate', {
      name,
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('modpacks/:name/rename')
  modpackRename(@Param('name') name: string, @Body() body: { new?: string }) {
    return this.bridge.submit('modpack_rename', { old: name, new: body.new });
  }

  @Delete('modpacks/:name')
  modpackDelete(@Param('name') name: string) {
    return this.bridge.submit('modpack_delete', { name });
  }

  @Post('modpacks/reset')
  modpackReset() {
    return this.bridge.submit('modpack_reset');
  }

  @Post('modpacks/import-upload')
  @UseInterceptors(FileInterceptor('file'))
  async modpackImportUpload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { name?: string; apply_settings?: string },
  ) {
    const tmp = join(
      tmpdir(),
      `fcc-modpack-${randomBytes(8).toString('hex')}.fcc`,
    );
    const { writeFileSync, unlinkSync } = await import('fs');
    writeFileSync(tmp, file.buffer);
    try {
      const apply =
        String(body.apply_settings || '').toLowerCase() === '1' ||
        String(body.apply_settings || '').toLowerCase() === 'true';
      return await this.bridge.submit('modpack_import_upload', {
        tmp_path: tmp,
        name: body.name || '',
        apply_settings: apply,
      });
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }

  @Get('modpacks/:name/import-download-plan')
  modpackImportDownloadPlan(@Param('name') name: string) {
    return this.bridge.submit('modpack_import_download_plan', { name });
  }

  @Post('modpacks/:name/import-download-append-deps')
  modpackImportAppendDeps(@Param('name') name: string) {
    return this.bridge.submit('modpack_import_append_dependencies', { name });
  }

  @Post('modpacks/:name/import-download')
  modpackImportDownload(
    @Param('name') name: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.bridge.submit('modpack_import_start_download', {
      name,
      ...body,
    });
  }

  @Get('modpacks/:name/export')
  async modpackExport(
    @Param('name') name: string,
    @Res() res: Response,
    @Query('include_settings') includeSettings = '0',
  ) {
    const includeFlag =
      ['1', 'true', 'yes', 'on'].includes(
        String(includeSettings || '')
          .trim()
          .toLowerCase(),
      ) || Number(includeSettings || 0) > 0;
    const data = await this.bridge.submit('modpack_export_prepare', {
      name,
      include_settings: includeFlag,
      description: '',
    });
    const path = String(data.path || '');
    if (!path || !existsSync(path))
      return res.status(404).json({ ok: false, error: 'not_found' });
    return res.download(path, String(data.name || `${name}.fcc`));
  }

  @Get('map-presets')
  mapPresetsList() {
    return this.bridge.submit('map_preset_list');
  }

  @Post('map-presets')
  mapPresetSave(@Body() body: { name?: string; state?: unknown }) {
    return this.bridge.submit('map_preset_save', {
      name: body.name || '',
      state: body.state,
    });
  }

  @Delete('map-presets/:id')
  mapPresetDelete(@Param('id') id: string) {
    return this.bridge.submit('map_preset_delete', { id });
  }

  @Post('map-presets/import-upload')
  @UseInterceptors(FileInterceptor('file'))
  async mapPresetImportUpload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { name?: string },
  ) {
    const tmp = join(
      tmpdir(),
      `fcc-map-preset-${randomBytes(8).toString('hex')}.fcc`,
    );
    const { writeFileSync, unlinkSync } = await import('fs');
    writeFileSync(tmp, file.buffer);
    try {
      return await this.bridge.submit('map_preset_import_upload', {
        tmp_path: tmp,
        name: body.name || '',
      });
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }

  @Post('map-presets/import-batch')
  mapPresetImportBatch(
    @Body() body: { presets?: { name?: string; state?: unknown }[] },
  ) {
    return this.bridge.submit('map_preset_import_batch', {
      presets: Array.isArray(body.presets) ? body.presets : [],
    });
  }

  @Get('map-presets/:id/export')
  async mapPresetExport(@Param('id') id: string, @Res() res: Response) {
    const data = await this.bridge.submit('map_preset_export_prepare', { id });
    const path = String(data.path || '');
    if (!path || !existsSync(path))
      return res.status(404).json({ ok: false, error: 'not_found' });
    return res.download(path, String(data.name || 'map-preset.fcc'));
  }

  @Post('maintenance/run')
  maintenanceRun(@Body() body: { task_id?: string }, @Req() req: Request) {
    return this.bridge.submit('maintenance_run_now', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('maintenance/clear-manual')
  maintenanceClear(@Body() body: Record<string, unknown>, @Req() req: Request) {
    return this.bridge.submit('maintenance_clear_manual', {
      ...body,
      actor: this.bridge.webActor(this.user(req)),
    });
  }

  @Post('instances/bootstrap/start')
  bootstrapStart(@Body() body: Record<string, unknown>) {
    return this.bridge.submit('instance_bootstrap_start', body);
  }

  @Get('instances/bootstrap/status')
  bootstrapStatus() {
    return this.bridge.submit('instance_bootstrap_status');
  }

  @Post('instances/bootstrap/stop')
  bootstrapStop() {
    return this.bridge.submit('instance_bootstrap_stop');
  }

  @Get('fs/dirs')
  fsDirs(@Query('path') path?: string) {
    return this.fsBrowse(String(path || ''));
  }

  @Get('fs/path-info')
  fsPathInfo(@Query('path') path?: string) {
    return this.fsPathInfoImpl(String(path || ''));
  }

  @Post('fs/mkdir')
  fsMkdir(@Body() body: { path?: string; name?: string }) {
    return this.fsMkdirImpl(String(body.path || ''), String(body.name || ''));
  }

  private fsBrowse(raw: string): Record<string, unknown> {
    const { readdirSync, existsSync, statSync } =
      require('fs') as typeof import('fs');
    const { join, resolve, dirname } = require('path') as typeof import('path');
    if (!raw.trim()) {
      if (process.platform === 'win32') {
        const items = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
          .split('')
          .map((l) => `${l}:\\`)
          .filter((drive) => existsSync(drive))
          .map((drive) => ({ name: drive, path: drive, isDir: true }));
        return { ok: true, current: '', parent: '', items };
      }
      return {
        ok: true,
        current: '',
        parent: '',
        items: [{ name: '/', path: '/', isDir: true }],
      };
    }
    let cur = resolve(raw);
    if (!existsSync(cur)) return { ok: false, error: 'path_not_found' };
    const st = statSync(cur);
    if (!st.isDirectory()) cur = dirname(cur);
    const parent = resolve(cur, '..') === cur ? '' : dirname(cur);
    const items = readdirSync(cur, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => ({ name: d.name, path: join(cur, d.name), isDir: true }))
      .sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }),
      );
    return { ok: true, current: cur, parent, items };
  }

  private fsMkdirImpl(baseRaw: string, name: string): Record<string, unknown> {
    const { mkdirSync, existsSync, statSync } =
      require('fs') as typeof import('fs');
    const { join, resolve, dirname } = require('path') as typeof import('path');
    if (!name || name === '.' || name === '..')
      return { ok: false, error: 'folder_name_invalid' };
    if (/[/\\]/.test(name)) return { ok: false, error: 'folder_name_invalid' };
    let base = resolve(baseRaw || '.');
    if (!existsSync(base)) return { ok: false, error: 'path_not_found' };
    if (!statSync(base).isDirectory()) base = dirname(base);
    const created = join(base, name);
    if (existsSync(created)) return { ok: false, error: 'folder_exists' };
    mkdirSync(created);
    return { ok: true, path: created };
  }

  private fsPathInfoImpl(raw: string): Record<string, unknown> {
    const { existsSync, statSync, readdirSync } =
      require('fs') as typeof import('fs');
    const { resolve, join } = require('path') as typeof import('path');
    const path = String(raw || '').trim();
    if (!path) return { ok: false, error: 'path_required' };
    const full = resolve(path);
    if (!existsSync(full)) {
      return {
        ok: true,
        path: full,
        exists: false,
        is_dir: false,
        is_empty: true,
        is_factorio_server: false,
        has_factorio_executable: false,
      };
    }
    let isDir = false;
    try {
      isDir = statSync(full).isDirectory();
    } catch {
      return { ok: false, error: 'path_invalid' };
    }
    if (!isDir) return { ok: false, error: 'path_invalid' };
    let entries: string[] = [];
    try {
      entries = readdirSync(full);
    } catch {
      return { ok: false, error: 'path_invalid' };
    }
    return {
      ok: true,
      path: full,
      exists: true,
      is_dir: true,
      is_empty: entries.length === 0,
      is_factorio_server: existsSync(join(full, 'data', 'base', 'info.json')),
      has_factorio_executable: hasFactorioExecutable(full),
    };
  }
}
