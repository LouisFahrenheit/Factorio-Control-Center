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
  Res,
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
import { existsSync, unlinkSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { extname, join } from 'path';
import type { Request, Response } from 'express';
import { AuthGuard, AUTH_USER_KEY } from '../../auth/auth.guard';
import { SessionUser } from '../../common/types';
import { ApiBridgeService } from '../api-bridge.service';

function safeStr(val: unknown, fallback = ''): string {
  return typeof val === 'string' && val.trim() ? val.trim() : fallback;
}

@ApiTags('Mods')
@ApiBearerAuth('bearer')
@Controller('api')
@UseGuards(AuthGuard)
export class ModsController {
  constructor(private readonly bridge: ApiBridgeService) {}

  private me(req: Request): SessionUser | undefined {
    return (req as Request & { [AUTH_USER_KEY]?: SessionUser })[AUTH_USER_KEY];
  }

  private explicitInstanceId(val?: string): string | undefined {
    const s = typeof val === 'string' ? val.trim() : '';
    return s || undefined;
  }

  @Get('mods')
  @ApiOperation({ summary: 'Get list of installed mods with details' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Mods list with metadata' })
  mods(@Req() req: Request, @Query('instance_id') instanceId?: string) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'mods_list',
      { ui_lang: req.headers['x-fcc-ui-lang'] },
      iid,
    );
  }

  @Get('files/mod-list')
  @ApiTags('Files')
  @ApiOperation({ summary: 'Read mod-list.json' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Mod list JSON' })
  modList(@Query('instance_id') instanceId?: string) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit('read_mod_list', {}, iid);
  }

  @Put('files/mod-list')
  @ApiTags('Files')
  @ApiOperation({ summary: 'Write mod-list.json' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Mod list saved' })
  modListWrite(
    @Body() body: unknown,
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'write_mod_list',
      {
        data: body,
        actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Put('mods/prefs')
  @ApiOperation({
    summary: 'Set mod manager preferences (e.g. remove old zips)',
  })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Preferences saved' })
  modsPrefs(
    @Req() req: Request,
    @Body() body: { remove_old_zips?: boolean },
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'mods_set_prefs',
      {
        ...body,
        web_actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Post('mods/check-updates')
  @ApiOperation({ summary: 'Start checking for mod updates' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Update check started' })
  modsCheckUpdates(
    @Body() body: Record<string, unknown>,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit('mods_check_updates_start', body, iid);
  }

  @Get('mods/check-updates')
  @ApiOperation({ summary: 'Get mod update check status' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Update check status' })
  modsCheckUpdatesStatus(@Query('instance_id') instanceId?: string) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit('mods_check_updates_status', {}, iid);
  }

  @Post('mods/toggle')
  @ApiOperation({ summary: 'Enable or disable a specific mod' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Mod enabled/disabled' })
  modsToggle(
    @Body() body: { name?: string; enabled?: boolean },
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'mods_set_enabled',
      {
        ...body,
        actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Post('mods/toggle-all')
  @ApiOperation({ summary: 'Enable or disable all mods at once' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'All mods toggled' })
  modsToggleAll(
    @Body() body: { enabled?: boolean },
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'mods_set_all_enabled',
      {
        enabled: body?.enabled,
        actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Post('mods/disable-conflicts')
  @ApiOperation({ summary: 'Disable mods that conflict with each other' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Conflicting mods disabled' })
  modsDisableConflicts(
    @Body() body: { names?: string[] },
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'mods_disable_conflicts',
      {
        names: body?.names,
        actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Get('mods/changelog')
  @ApiOperation({ summary: 'Get changelog for a specific mod' })
  @ApiQuery({ name: 'name', description: 'Mod internal name' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Mod changelog text' })
  modsChangelog(
    @Query('name') name: string,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit('mods_get_changelog', { name }, iid);
  }

  @Post('mods/version')
  @ApiOperation({ summary: 'Switch to a specific version of a mod' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Mod version switched' })
  modsVersion(
    @Body() body: { name?: string; version?: string },
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'mods_set_version',
      {
        ...body,
        actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Post('mods/remove')
  @ApiOperation({ summary: 'Remove one or more mods' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Mods removed' })
  modsRemove(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'mods_remove',
      {
        ...body,
        actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Post('mods/upload')
  @ApiOperation({ summary: 'Upload a mod .zip or mod-settings.dat file' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Mod .zip or mod-settings.dat file',
        },
        confirm_replace: {
          type: 'string',
          description: 'Set to "1" to replace existing mod',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Mod uploaded' })
  @UseInterceptors(FileInterceptor('file'))
  async modsUpload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @Body('confirm_replace') confirmReplace?: string,
    @Query('instance_id') instanceId?: string,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('File is required');
    }
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
    writeFileSync(tmp, file.buffer);
    try {
      const iid = this.explicitInstanceId(instanceId);
      if (isSettings) {
        return await this.bridge.submit(
          'upload_mod_settings_dat',
          {
            tmp_path: tmp,
            confirm_replace: confirmFlag,
            actor: this.bridge.webActor(this.me(req)),
          },
          iid,
        );
      }
      const uploadName = lowerName.endsWith('.zip')
        ? rawName
        : `${rawName}.zip`;
      return await this.bridge.submit(
        'upload_mod_archive',
        {
          tmp_path: tmp,
          name: uploadName,
          actor: this.bridge.webActor(this.me(req)),
        },
        iid,
      );
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }

  @Post('mods/import-save/preview')
  @ApiOperation({
    summary: 'Preview which mods are used in a save file (upload to inspect)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Factorio save .zip file',
        },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Mod list from the save file' })
  @UseInterceptors(FileInterceptor('file'))
  async modsImportSavePreview(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('File is required');
    }
    const lang = String(req.headers['x-fcc-ui-lang'] || '').slice(0, 12);
    const tmp = join(
      tmpdir(),
      `fcc-save-prev-${randomBytes(8).toString('hex')}.zip`,
    );
    writeFileSync(tmp, file.buffer);
    try {
      const iid = this.explicitInstanceId(instanceId);
      return await this.bridge.submit(
        'inspect_uploaded_save_mods',
        {
          tmp_path: tmp,
          ui_lang: lang,
        },
        iid,
      );
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }

  @Get('mods/download-all')
  @ApiOperation({ summary: 'Download all mods as a ZIP archive' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'ZIP archive with all mods' })
  @ApiResponse({ status: 404, description: 'Archive could not be built' })
  async modsDownloadAll(
    @Res() res: Response,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    const data = (await this.bridge.submit('build_mods_archive', {}, iid)) as {
      path?: string;
      name?: string;
    };
    const path = safeStr(data?.path);
    if (!path || !existsSync(path))
      return res.status(404).json({ ok: false, error: 'not_found' });
    return res.download(path, safeStr(data?.name, 'mods.zip'));
  }

  @Get('mods/:name/download')
  @ApiOperation({ summary: 'Download a single mod .zip file' })
  @ApiParam({ name: 'name', description: 'Mod internal name' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Mod .zip file' })
  @ApiResponse({ status: 404, description: 'Mod not found' })
  async modDownload(
    @Param('name') name: string,
    @Res() res: Response,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    const data = (await this.bridge.submit(
      'get_mod_download_path',
      { name },
      iid,
    )) as { path?: string; name?: string };
    const path = safeStr(data?.path);
    if (!path || !existsSync(path))
      return res.status(404).json({ ok: false, error: 'not_found' });
    return res.download(path, safeStr(data?.name, name));
  }

  @Post('mods/install-plan')
  @ApiOperation({
    summary: 'Get install plan for a single mod (dependencies, conflicts)',
  })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Install plan' })
  modsInstallPlan(
    @Body() body: { mod?: string; version?: string },
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'mods_install_plan',
      {
        mod: body?.mod,
        version: body?.version,
      },
      iid,
    );
  }

  @Get('mods/portal-releases/:name')
  @ApiOperation({ summary: 'Get all portal releases for a mod' })
  @ApiParam({ name: 'name', description: 'Mod internal name' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Portal releases' })
  modsPortalReleases(
    @Param('name') name: string,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit('get_mod_portal_releases', { name }, iid);
  }

  @Post('mods/install-plan-batch')
  @ApiOperation({ summary: 'Get install plan for multiple mods at once' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Batch install plan' })
  modsInstallPlanBatch(
    @Body() body: { mods?: unknown },
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'mods_install_plan_batch',
      { mods: body?.mods },
      iid,
    );
  }

  @Get('mods/update-all-plan')
  @ApiOperation({ summary: 'Get update plan for all installed mods' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Update plan for all mods' })
  modsUpdateAllPlan(@Query('instance_id') instanceId?: string) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit('mods_update_all_plan', {}, iid);
  }

  @Post('mods/job/start-install')
  @ApiOperation({ summary: 'Start a mod install job' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Install job started' })
  modsJobInstall(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'mods_job_start',
      {
        mode: 'install',
        ...body,
        actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Post('mods/job/start-install-save')
  @ApiOperation({
    summary: 'Start a mod install-many job (from save mod list)',
  })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Install-save job started' })
  modsJobInstallSave(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'mods_job_start',
      {
        mode: 'install_many',
        ...body,
        actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Post('mods/job/start-update')
  @ApiOperation({ summary: 'Start an update job for a single mod' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Update job started' })
  modsJobUpdate(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'mods_job_start',
      {
        mode: 'update_one',
        ...body,
        actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Post('mods/job/start-update-all')
  @ApiOperation({ summary: 'Start an update-all job for all outdated mods' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Update-all job started' })
  modsJobUpdateAll(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'mods_job_start',
      {
        mode: 'update_all',
        ...body,
        actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Get('mods/job/status')
  @ApiOperation({ summary: 'Get current mod job status' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({
    status: 200,
    description: 'Job status (running, done, error, idle)',
  })
  modsJobStatus(@Query('instance_id') instanceId?: string) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit('mods_job_status', {}, iid);
  }

  @Post('mods/job/stop')
  @ApiOperation({ summary: 'Stop the current mod job' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Job stopped' })
  modsJobStop(@Query('instance_id') instanceId?: string) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit('mods_job_stop', {}, iid);
  }

  @Get('mod-settings/json')
  @ApiOperation({ summary: 'Read mod-settings.json' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Mod settings JSON' })
  modSettingsGet(@Query('instance_id') instanceId?: string) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit('mod_settings_read_json', {}, iid);
  }

  @Put('mod-settings/json')
  @ApiOperation({ summary: 'Write mod-settings.json' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Mod settings saved' })
  modSettingsPut(
    @Body() body: unknown,
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'mod_settings_write_json',
      {
        data: body,
        actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Get('mod-settings/schema')
  @ApiOperation({ summary: 'Get mod settings schema' })
  @ApiQuery({ name: 'refresh', required: false })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Mod settings schema' })
  modSettingsSchema(
    @Req() req: Request,
    @Query('refresh') refresh?: string,
    @Query('instance_id') instanceId?: string,
  ) {
    const lang = String(req.headers['x-fcc-ui-lang'] || '').slice(0, 12);
    const force =
      String(refresh || '').trim() === '1' ||
      String(refresh || '').toLowerCase() === 'true';
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'mod_settings_schema',
      {
        ui_lang: lang,
        refresh: force,
      },
      iid,
    );
  }

  @Get('mod-settings/schema/status')
  @ApiOperation({ summary: 'Get mod settings schema generation status' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Schema status' })
  modSettingsSchemaStatus(@Query('instance_id') instanceId?: string) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit('mod_settings_schema_status', {}, iid);
  }

  @Get('modpacks')
  @ApiOperation({ summary: 'List saved modpacks' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'List of modpacks' })
  modpacksList(@Query('instance_id') instanceId?: string) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit('modpack_list', {}, iid);
  }

  @Get('modpacks/:name/import-download-plan')
  @ApiOperation({ summary: 'Get download plan for imported modpack' })
  @ApiParam({ name: 'name', description: 'Modpack name' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Download plan' })
  modpackImportDownloadPlan(
    @Param('name') name: string,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit('modpack_import_download_plan', { name }, iid);
  }

  @Post('modpacks/:name/import-download-append-deps')
  @ApiOperation({
    summary: 'Append missing dependencies to import download plan',
  })
  @ApiParam({ name: 'name', description: 'Modpack name' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Dependencies appended' })
  modpackImportAppendDeps(
    @Param('name') name: string,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'modpack_import_append_dependencies',
      { name },
      iid,
    );
  }

  @Post('modpacks/:name/import-download')
  @ApiOperation({ summary: 'Start download of missing mods for modpack' })
  @ApiParam({ name: 'name', description: 'Modpack name' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Download started' })
  modpackImportDownload(
    @Param('name') name: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'modpack_import_start_download',
      {
        name,
        ...body,
        actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Get('modpacks/:name/export')
  @ApiOperation({ summary: 'Export modpack file (.fcc or .zip)' })
  @ApiParam({ name: 'name', description: 'Modpack name' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Modpack file download' })
  async modpackExport(
    @Param('name') name: string,
    @Res() res: Response,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    const data = (await this.bridge.submit(
      'modpack_export_prepare',
      { name },
      iid,
    )) as { path?: string; name?: string };
    const path = safeStr(data?.path);
    if (!path || !existsSync(path))
      return res.status(404).json({ ok: false, error: 'not_found' });
    return res.download(path, safeStr(data?.name, `${name}.fcc`));
  }

  @Post('modpacks/reset')
  @ApiOperation({ summary: 'Reset active modpack to default base game' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Modpack reset' })
  modpackReset(@Req() req: Request, @Query('instance_id') instanceId?: string) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'modpack_reset',
      {
        actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Post('modpacks/import-upload')
  @ApiOperation({ summary: 'Upload modpack file (.fcc or .zip) for import' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'instance_id', required: false })
  @UseInterceptors(FileInterceptor('file'))
  async modpackImportUpload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('File is required');
    }
    const ext = extname(String(file.originalname || '')).toLowerCase();
    const tmp = join(
      tmpdir(),
      `fcc-modpack-${randomBytes(8).toString('hex')}${ext}`,
    );
    writeFileSync(tmp, file.buffer);
    try {
      const iid = this.explicitInstanceId(instanceId);
      return await this.bridge.submit(
        'modpack_import_upload',
        {
          tmp_path: tmp,
          actor: this.bridge.webActor(this.me(req)),
        },
        iid,
      );
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }

  @Get('modpacks/:name')
  @ApiOperation({ summary: 'Get details of a saved modpack' })
  @ApiParam({ name: 'name', description: 'Modpack name' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Modpack details' })
  modpackGet(
    @Param('name') name: string,
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const lang = String(req.headers['x-fcc-ui-lang'] || '').slice(0, 12);
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit('modpack_get', { name, ui_lang: lang }, iid);
  }

  @Post('modpacks')
  @ApiOperation({ summary: 'Save current active mods as a modpack' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Modpack saved' })
  modpackSave(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'modpack_save_current',
      {
        ...body,
        actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Post('modpacks/:name/activate')
  @ApiOperation({ summary: 'Activate a saved modpack' })
  @ApiParam({ name: 'name', description: 'Modpack name' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Modpack activated' })
  modpackActivate(
    @Param('name') name: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'modpack_activate',
      {
        name,
        ...body,
        actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Post('modpacks/:name/rename')
  @ApiOperation({ summary: 'Rename a saved modpack' })
  @ApiParam({ name: 'name', description: 'Modpack name' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Modpack renamed' })
  modpackRename(
    @Param('name') name: string,
    @Body() body: { new_name?: string },
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'modpack_rename',
      {
        name,
        new_name: body?.new_name || '',
        actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Delete('modpacks/:name')
  @ApiOperation({ summary: 'Delete a saved modpack' })
  @ApiParam({ name: 'name', description: 'Modpack name' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Modpack deleted' })
  modpackDelete(
    @Param('name') name: string,
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'modpack_delete',
      {
        name,
        actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Get('map-presets')
  @ApiOperation({ summary: 'List saved map generation presets' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'List of map presets' })
  mapPresetsList(@Query('instance_id') instanceId?: string) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit('map_preset_list', {}, iid);
  }

  @Post('map-presets')
  @ApiOperation({ summary: 'Save map generation preset' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Map preset saved' })
  mapPresetSave(
    @Body() body: { name?: string; state?: unknown },
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'map_preset_save',
      {
        name: body?.name || '',
        state: body?.state,
      },
      iid,
    );
  }

  @Delete('map-presets/:id')
  @ApiOperation({ summary: 'Delete a saved map preset' })
  @ApiParam({ name: 'id', description: 'Preset ID' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Map preset deleted' })
  mapPresetDelete(
    @Param('id') id: string,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit('map_preset_delete', { id }, iid);
  }

  @Post('map-presets/import-upload')
  @ApiOperation({ summary: 'Upload map preset file (.fcc) for import' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'instance_id', required: false })
  @UseInterceptors(FileInterceptor('file'))
  async mapPresetImportUpload(
    @UploadedFile() file: Express.Multer.File,
    @Body() body: { name?: string },
    @Query('instance_id') instanceId?: string,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('File is required');
    }
    const tmp = join(
      tmpdir(),
      `fcc-map-preset-${randomBytes(8).toString('hex')}.fcc`,
    );
    writeFileSync(tmp, file.buffer);
    try {
      const iid = this.explicitInstanceId(instanceId);
      return await this.bridge.submit(
        'map_preset_import_upload',
        {
          tmp_path: tmp,
          name: body?.name || '',
        },
        iid,
      );
    } finally {
      try {
        unlinkSync(tmp);
      } catch {
        /* ignore */
      }
    }
  }

  @Post('map-presets/import-batch')
  @ApiOperation({ summary: 'Import multiple map presets at once' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Presets imported' })
  mapPresetImportBatch(
    @Body() body: { presets?: { name?: string; state?: unknown }[] },
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'map_preset_import_batch',
      {
        presets: Array.isArray(body?.presets) ? body.presets : [],
      },
      iid,
    );
  }

  @Get('map-presets/:id/export')
  @ApiOperation({ summary: 'Export map preset to .fcc file' })
  @ApiParam({ name: 'id', description: 'Preset ID' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Map preset file download' })
  async mapPresetExport(
    @Param('id') id: string,
    @Res() res: Response,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    const data = (await this.bridge.submit(
      'map_preset_export_prepare',
      { id },
      iid,
    )) as { path?: string; name?: string };
    const path = safeStr(data?.path);
    if (!path || !existsSync(path))
      return res.status(404).json({ ok: false, error: 'not_found' });
    return res.download(path, safeStr(data?.name, 'map-preset.fcc'));
  }
}
