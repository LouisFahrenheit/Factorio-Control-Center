import {
  Controller,
  Post,
  Get,
  Delete,
  Put,
  Body,
  Param,
  Req,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  ForbiddenException,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam, ApiConsumes } from "@nestjs/swagger";
import type { Request, Response } from "express";
import { AuthGuard, AUTH_USER_KEY } from "../auth/auth.guard";
import type { SessionUser } from "../common/types";
import { BackupService } from './backup.service';
import type { BackupOptions, RestoreOptions } from './backup.service';
import { BackupSchedulerService } from './backup-scheduler.service';

@ApiTags("Backup")
@ApiBearerAuth("bearer")
@UseGuards(AuthGuard)
@Controller("api/backup")
export class BackupController {
  constructor(
    private readonly backups: BackupService,
    private readonly scheduler: BackupSchedulerService,
  ) {}

  private requireAdmin(req: Request) {
    const user = (req as any)[AUTH_USER_KEY] as SessionUser | undefined;
    if (String(user?.role ?? "") !== "administrator")
      throw new ForbiddenException("admin_required");
  }

  @Get("list")
  @ApiOperation({ summary: "List all backups" })
  async list() {
    const items = await this.backups.listBackups();
    return { ok: true, items };
  }

  @Get("status")
  @ApiOperation({ summary: "Get current backup creation status" })
  status() {
    return { ok: true, creating: this.backups.isCreating };
  }

  @Post("create")
  @ApiOperation({ summary: "Create a new panel backup" })
  async create(@Req() req: Request, @Body() body: BackupOptions) {
    this.requireAdmin(req);
    const entry = await this.backups.createBackup({
      includeMetrics: !!body.includeMetrics,
      includeLogs: !!body.includeLogs,
      type: body.type === "auto" ? "auto" : "manual",
    });
    return { ok: true, entry };
  }

  @Post("upload")
  @UseInterceptors(FileInterceptor("file"))
  @ApiOperation({ summary: "Upload a backup ZIP file" })
  @ApiConsumes("multipart/form-data")
  async upload(@Req() req: Request, @UploadedFile() file?: any) {
    this.requireAdmin(req);
    if (!file) throw new BadRequestException("backup_upload_empty");
    const entry = await this.backups.saveUploadedBackup(file);
    return { ok: true, entry };
  }

  @Get(":id/download")
  @ApiOperation({ summary: "Download a backup ZIP file" })
  @ApiParam({ name: "id", description: "Backup filename" })
  download(@Param("id") id: string, @Res() res: Response) {
    const p = this.backups.getBackupPath(id);
    return res.download(p, id);
  }

  @Delete(":id")
  @ApiOperation({ summary: "Delete a backup" })
  @ApiParam({ name: "id", description: "Backup filename" })
  remove(@Req() req: Request, @Param("id") id: string) {
    this.requireAdmin(req);
    this.backups.deleteBackup(id);
    return { ok: true };
  }

  @Post(":id/restore")
  @ApiOperation({ summary: "Restore panel from a backup (triggers restart)" })
  @ApiParam({ name: "id", description: "Backup filename" })
  async restore(
    @Req() req: Request,
    @Param("id") id: string,
    @Body() body: RestoreOptions,
  ) {
    this.requireAdmin(req);
    await this.backups.restoreBackup(id, { mode: body.mode });
    // Schedule graceful exit so Docker / PM2 restarts the process
    setTimeout(() => process.exit(0), 1500);
    return { ok: true, restarting: true };
  }

  @Get("settings")
  @ApiOperation({ summary: "Get auto-backup settings" })
  getSettings() {
    return { ok: true, settings: this.scheduler.getSettings() };
  }

  @Put("settings")
  @ApiOperation({ summary: "Update auto-backup settings" })
  async putSettings(@Req() req: Request, @Body() body: Record<string, unknown>) {
    this.requireAdmin(req);
    const s = this.scheduler.getSettings();
    const bool = (v: unknown, def: boolean) =>
      v === undefined ? def : !!v;
    const num = (v: unknown, def: number, min: number, max: number) => {
      const n = parseInt(String(v ?? ""), 10);
      return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : def;
    };
    await this.scheduler.saveSettings({
      enabled: bool(body.enabled, s.enabled),
      intervalHours: num(body.intervalHours, s.intervalHours, 1, 8760),
      maxCount: num(body.maxCount, s.maxCount, 1, 100),
      includeMetrics: bool(body.includeMetrics, s.includeMetrics),
      includeLogs: bool(body.includeLogs, s.includeLogs),
    });
    return { ok: true, settings: this.scheduler.getSettings() };
  }
}
