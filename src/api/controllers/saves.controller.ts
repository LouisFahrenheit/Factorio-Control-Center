import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
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
import { join } from 'path';
import type { Request, Response } from 'express';
import { AuthGuard, AUTH_USER_KEY } from '../../auth/auth.guard';
import { SessionUser } from '../../common/types';
import { ApiBridgeService } from '../api-bridge.service';

function safeStr(val: unknown, fallback = ''): string {
  return typeof val === 'string' && val.trim() ? val.trim() : fallback;
}

@ApiTags('Saves')
@ApiBearerAuth('bearer')
@Controller('api/saves')
@UseGuards(AuthGuard)
export class SavesController {
  constructor(private readonly bridge: ApiBridgeService) {}

  private me(req: Request): SessionUser | undefined {
    return (req as Request & { [AUTH_USER_KEY]?: SessionUser })[AUTH_USER_KEY];
  }

  private explicitInstanceId(val?: string): string | undefined {
    const s = typeof val === 'string' ? val.trim() : '';
    return s || undefined;
  }

  @Get('')
  @ApiOperation({ summary: 'List available save files' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'List of save files' })
  saves(@Query('instance_id') instanceId?: string) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit('list_saves', {}, iid);
  }

  @Post('set-launch')
  @ApiOperation({ summary: 'Set which save file to launch on server start' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Launch save set' })
  saveSetLaunch(
    @Body() body: { name?: string },
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'set_launch_save',
      {
        name: body.name || '',
        actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Post('upload')
  @ApiOperation({ summary: 'Upload a save file (.zip)' })
  @ApiConsumes('multipart/form-data')
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'Save .zip file',
        },
        filename: { type: 'string', description: 'Override file name' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Save uploaded' })
  @UseInterceptors(FileInterceptor('file'))
  async saveUpload(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: Request,
    @Body('filename') filename?: string,
    @Query('instance_id') instanceId?: string,
  ) {
    if (!file || !file.buffer) {
      throw new BadRequestException('File is required');
    }
    const tmp = join(
      tmpdir(),
      `fcc-save-${randomBytes(8).toString('hex')}.zip`,
    );
    writeFileSync(tmp, file.buffer);
    try {
      const uploadName = String(filename || file.originalname || '').trim();
      const iid = this.explicitInstanceId(instanceId);
      return await this.bridge.submit(
        'upload_save_archive',
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

  @Get(':name/download')
  @ApiOperation({ summary: 'Download a save file' })
  @ApiParam({
    name: 'name',
    description: 'Save file name (without .zip extension)',
  })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'ZIP file download' })
  @ApiResponse({ status: 404, description: 'Save not found' })
  async saveDownload(
    @Param('name') name: string,
    @Res() res: Response,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    const data = (await this.bridge.submit(
      'get_save_download_path',
      { name },
      iid,
    )) as { path?: string; name?: string };
    const filePath = safeStr(data?.path);
    if (!filePath || !existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: 'not_found' });
    }
    return res.download(filePath, safeStr(data?.name, name));
  }

  @Get(':name/inspect')
  @ApiOperation({ summary: 'Inspect a save file for metadata and mod list' })
  @ApiParam({ name: 'name', description: 'Save file name' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({
    status: 200,
    description: 'Save metadata including mods and version',
  })
  saveInspect(
    @Param('name') name: string,
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const lang = String(req.headers['x-fcc-ui-lang'] || '').slice(0, 12);
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit('inspect_save', { name, ui_lang: lang }, iid);
  }

  @Post(':name/rename')
  @ApiOperation({ summary: 'Rename a save file' })
  @ApiParam({ name: 'name', description: 'Current save file name' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Save renamed' })
  saveRename(
    @Param('name') name: string,
    @Body() body: { new_name?: string },
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'rename_save',
      {
        name,
        new_name: body.new_name || '',
        actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Post(':name/duplicate')
  @ApiOperation({ summary: 'Duplicate a save file' })
  @ApiParam({ name: 'name', description: 'Save file name to duplicate' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Save duplicated' })
  saveDuplicate(
    @Param('name') name: string,
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'duplicate_save',
      {
        name,
        actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Post(':name/transfer')
  @ApiOperation({ summary: 'Copy or move a save file to another server' })
  @ApiParam({ name: 'name', description: 'Save file name to transfer' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Save transferred' })
  saveTransfer(
    @Param('name') name: string,
    @Body()
    body: {
      target_server_id?: string;
      target_instance_id?: string;
      mode?: 'copy' | 'move';
      target_name?: string;
      overwrite?: boolean;
    },
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'transfer_save',
      {
        name,
        target_instance_id:
          body.target_instance_id || body.target_server_id || '',
        mode: body.mode || 'copy',
        target_name: body.target_name || '',
        overwrite: Boolean(body.overwrite),
        actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }

  @Delete(':name')
  @ApiOperation({ summary: 'Delete a save file' })
  @ApiParam({ name: 'name', description: 'Save file name to delete' })
  @ApiQuery({ name: 'instance_id', required: false })
  @ApiResponse({ status: 200, description: 'Save deleted' })
  saveDelete(
    @Param('name') name: string,
    @Req() req: Request,
    @Query('instance_id') instanceId?: string,
  ) {
    const iid = this.explicitInstanceId(instanceId);
    return this.bridge.submit(
      'delete_save',
      {
        name,
        actor: this.bridge.webActor(this.me(req)),
      },
      iid,
    );
  }
}
