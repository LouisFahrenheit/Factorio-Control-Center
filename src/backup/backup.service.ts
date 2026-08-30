import {
  Injectable,
  Logger,
  BadRequestException,
  NotFoundException,
} from "@nestjs/common";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
  createWriteStream,
  readFileSync,
} from "fs";
import { join, basename, dirname } from "path";
import { createHash } from "crypto";
import { PathsService } from '../config/paths.service';
import { APP_VERSION } from '../constants/fcc.constants';

const archiver = require('archiver');
const unzipper = require('unzipper');

function createZipArchive(options: Record<string, unknown> = {}) {
  if (typeof archiver === 'function') {
    return archiver('zip', options);
  }
  if (archiver && archiver.ZipArchive) {
    return new archiver.ZipArchive(options);
  }
  if (archiver && typeof archiver.create === 'function') {
    return archiver.create('zip', options);
  }
  if (archiver && typeof archiver.default === 'function') {
    return archiver.default('zip', options);
  }
  throw new Error('Failed to instantiate archiver');
}

export interface BackupOptions {
  includeMetrics?: boolean;
  includeLogs?: boolean;
  type?: "manual" | "auto" | "uploaded";
}

export interface BackupEntry {
  id: string;
  filename: string;
  createdAt: string;
  sizeBytes: number;
  sections: string[];
  fccVersion: string;
  type: "manual" | "auto" | "uploaded";
}

export interface BackupManifest {
  fccVersion: string;
  createdAt: string;
  type?: "manual" | "auto" | "uploaded";
  sections: string[];
  sha256: Record<string, string>;
}

export interface RestoreOptions {
  mode?: "all" | "db_only" | "files_only";
}

@Injectable()
export class BackupService {
  private readonly log = new Logger(BackupService.name);
  private creating = false;

  constructor(private readonly paths: PathsService) {}

  get isCreating(): boolean {
    return this.creating;
  }

  async createBackup(opts: BackupOptions = {}): Promise<BackupEntry> {
    if (this.creating) throw new BadRequestException("backup_already_running");
    this.creating = true;

    const backupType: "manual" | "auto" = opts.type === "auto" ? "auto" : "manual";
    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
    const filename = `fcc-backup-${backupType}-${ts}.zip`;
    const destPath = join(this.paths.backupsDir, filename);
    const tmpPath = destPath + ".tmp";
    const sections: string[] = [];
    const sha256: Record<string, string> = {};

    try {
      await new Promise<void>((resolve, reject) => {
        const output = createWriteStream(tmpPath);
        const archive = createZipArchive({ zlib: { level: 6 } });

        output.on('close', resolve);
        archive.on('error', reject);
        archive.pipe(output);

        // .env
        const envPath = this.paths.envFilePath;
        if (existsSync(envPath)) {
          archive.file(envPath, { name: "env/.env" });
          sections.push("env");
          sha256["env/.env"] = this.hashFile(envPath);
        }

        // Main DB
        const dbPath = this.paths.databasePath;
        if (existsSync(dbPath)) {
          archive.file(dbPath, { name: "database/fcc_database.sqlite" });
          sections.push("database");
          sha256["database/fcc_database.sqlite"] = this.hashFile(dbPath);
        }

        // Metrics DB (optional)
        if (opts.includeMetrics) {
          const metPath = this.paths.metricsDatabasePath;
          if (existsSync(metPath)) {
            archive.file(metPath, { name: "database/fcc_metrics.sqlite" });
            if (!sections.includes("metrics")) sections.push("metrics");
          }
        }

        const hasFiles = (dirPath: string): boolean => {
          if (!existsSync(dirPath)) return false;
          try {
            return readdirSync(dirPath).length > 0;
          } catch { return false; }
        };

        // Security / TLS (only if not empty)
        if (hasFiles(this.paths.tlsDir)) {
          archive.directory(this.paths.tlsDir, "security/tls");
          sections.push("tls");
        }

        // Storage: Map presets (only if not empty)
        if (hasFiles(this.paths.mapPresetsDir)) {
          archive.directory(this.paths.mapPresetsDir, "storage/map_presets");
          sections.push("map_presets");
        }

        // Storage: Announcements (only if not empty)
        if (hasFiles(this.paths.announcementsDir)) {
          archive.directory(this.paths.announcementsDir, "storage/announcements");
          sections.push("announcements");
        }

        // Logs: Instance logs (optional, only if not empty)
        if (opts.includeLogs && hasFiles(this.paths.instanceLogsDir)) {
          archive.directory(this.paths.instanceLogsDir, "logs/instances");
          sections.push("instance_logs");
        }

        // Manifest
        const manifest: BackupManifest = {
          fccVersion: APP_VERSION,
          createdAt: new Date().toISOString(),
          type: backupType,
          sections,
          sha256,
        };
        archive.append(JSON.stringify(manifest, null, 2), { name: "manifest.json" });

        void archive.finalize();
      });

      renameSync(tmpPath, destPath);
      const stat = statSync(destPath);
      const manifest = await this.readManifest(destPath);
      this.log.log(`Backup created: ${filename} (${stat.size} bytes, type=${backupType})`);

      return {
        id: filename,
        filename,
        createdAt: manifest?.createdAt ?? new Date().toISOString(),
        sizeBytes: stat.size,
        sections: manifest?.sections ?? sections,
        fccVersion: manifest?.fccVersion ?? APP_VERSION,
        type: manifest?.type ?? backupType,
      };
    } catch (err) {
      if (existsSync(tmpPath)) {
        try { unlinkSync(tmpPath); } catch { /* */ }
      }
      this.log.error("Backup creation failed", err);
      throw err;
    } finally {
      this.creating = false;
    }
  }

  async listBackups(): Promise<BackupEntry[]> {
    const dir = this.paths.backupsDir;
    if (!existsSync(dir)) return [];
    const files = readdirSync(dir)
      .filter((f) => f.endsWith(".zip") && f.startsWith("fcc-backup-"))
      .sort()
      .reverse();

    const entries: BackupEntry[] = [];
    for (const filename of files) {
      const fullPath = join(dir, filename);
      let sizeBytes = 0;
      let createdAt = "";
      try {
        const s = statSync(fullPath);
        sizeBytes = s.size;
        createdAt = s.mtime.toISOString();
      } catch { /* */ }

      let sections: string[] = [];
      let fccVersion = "";

      const manifest = await this.readManifest(fullPath);
      if (manifest) {
        if (Array.isArray(manifest.sections)) sections = [...manifest.sections];
        fccVersion = manifest.fccVersion || "";
        if (manifest.createdAt) createdAt = manifest.createdAt;
      }

      let type: "manual" | "auto" | "uploaded" = "manual";
      if (filename.includes("-uploaded-")) {
        type = "uploaded";
      } else if (filename.includes("-auto-")) {
        type = "auto";
      } else if (filename.includes("-manual-")) {
        type = "manual";
      } else if (manifest?.type) {
        type = manifest.type;
      }

      // If sections is missing/empty or we need to verify actual files
      try {
        const zip = await unzipper.Open.file(fullPath);
        const actualFiles = zip.files
          .filter((f: any) => f.type !== "Directory")
          .map((f: any) => String(f.path).replace(/\\/g, "/"));

        // If manifest didn't have sections, build them
        if (!sections.length) {
          if (actualFiles.some((p: string) => p.includes("fcc_database.sqlite"))) sections.push("database");
          if (actualFiles.some((p: string) => p.includes("fcc_metrics.sqlite"))) sections.push("metrics");
          if (actualFiles.some((p: string) => p.startsWith("logs/instances") || p.startsWith("instance_logs"))) sections.push("instance_logs");
          if (actualFiles.some((p: string) => p.includes("map_presets/"))) sections.push("map_presets");
          if (actualFiles.some((p: string) => p.includes("announcements/"))) sections.push("announcements");
          if (actualFiles.some((p: string) => p.includes(".env"))) sections.push("env");
        }

        // Only keep 'tls' if there are actual non-directory files inside tls
        const hasTlsFiles = actualFiles.some((p: string) => p.startsWith("security/tls/") || p.startsWith("tls/"));
        if (!hasTlsFiles) {
          sections = sections.filter((s) => s !== "tls");
        } else if (!sections.includes("tls")) {
          sections.push("tls");
        }
      } catch { /* */ }

      entries.push({ id: filename, filename, createdAt, sizeBytes, sections, fccVersion, type });
    }

    // Sort strictly by createdAt date (newest first)
    entries.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime() || 0;
      const timeB = new Date(b.createdAt).getTime() || 0;
      return timeB - timeA;
    });

    return entries;
  }

  async saveUploadedBackup(file: { originalname: string; buffer: Buffer }): Promise<BackupEntry> {
    if (!file || !file.buffer || !file.buffer.length) {
      throw new BadRequestException("backup_upload_empty");
    }

    const dir = this.paths.backupsDir;
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

    // Validate ZIP and manifest
    let manifest: BackupManifest | null = null;
    let sections: string[] = [];
    try {
      const zip = await unzipper.Open.buffer(file.buffer);
      const manifestEntry = zip.files.find((f: any) => f.path === "manifest.json");
      if (!manifestEntry) {
        throw new BadRequestException("backup_invalid_manifest");
      }
      const buf = await (manifestEntry as any).buffer();
      manifest = JSON.parse(buf.toString("utf-8")) as BackupManifest;
      if (manifest && Array.isArray(manifest.sections)) {
        sections = [...manifest.sections];
      }
    } catch (e) {
      if (e instanceof BadRequestException) throw e;
      throw new BadRequestException("backup_invalid_zip");
    }

    // Determine target filename with uploaded prefix
    const cleanOrig = basename(file.originalname).replace(/[^a-zA-Z0-9_\-\.]/g, "");
    let ts = "";
    const match = cleanOrig.match(/\d{4}-\d{2}-\d{2}T[\d\-]+Z?/i);
    if (match) {
      ts = match[0];
    } else if (manifest?.createdAt) {
      ts = new Date(manifest.createdAt).toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
    } else {
      ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
    }

    let filename = `fcc-backup-uploaded-${ts}.zip`;
    if (existsSync(join(dir, filename))) {
      const nowTs = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "Z";
      filename = `fcc-backup-uploaded-${nowTs}.zip`;
    }

    const destPath = join(dir, filename);
    writeFileSync(destPath, file.buffer);
    const stat = statSync(destPath);
    this.log.log(`Uploaded backup saved: ${filename} (${stat.size} bytes)`);

    return {
      id: filename,
      filename,
      createdAt: manifest?.createdAt ?? new Date().toISOString(),
      sizeBytes: stat.size,
      sections,
      fccVersion: manifest?.fccVersion ?? APP_VERSION,
      type: "uploaded",
    };
  }

  getBackupPath(id: string): string {
    this.validateId(id);
    const p = join(this.paths.backupsDir, id);
    if (!existsSync(p)) throw new NotFoundException("backup_not_found");
    return p;
  }

  deleteBackup(id: string): void {
    const p = this.getBackupPath(id);
    unlinkSync(p);
    this.log.log(`Backup deleted: ${id}`);
  }

  async pruneOldBackups(maxCount: number): Promise<void> {
    if (maxCount <= 0) return;
    const dir = this.paths.backupsDir;
    if (!existsSync(dir)) return;

    // Prune ONLY auto-backups; manual backups are preserved indefinitely
    const allBackups = await this.listBackups();
    const autoBackups = allBackups
      .filter((b) => b.type === "auto")
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); // oldest first

    while (autoBackups.length > maxCount) {
      const old = autoBackups.shift()!;
      try {
        unlinkSync(join(dir, old.filename));
        this.log.log(`Pruned old auto-backup: ${old.filename}`);
      } catch { /* */ }
    }
  }

  async restoreBackup(id: string, opts: RestoreOptions = {}): Promise<void> {
    const zipPath = this.getBackupPath(id);
    const mode = opts.mode ?? "all";
    this.log.warn(`Starting restore from ${id}, mode=${mode}`);

    const zip = await unzipper.Open.file(zipPath);
    const manifestEntry = zip.files.find((f: any) => f.path === "manifest.json");
    if (!manifestEntry) throw new BadRequestException("backup_invalid_manifest");

    for (const file of zip.files as any[]) {
      if (file.path === "manifest.json") continue;
      if (file.type === "Directory") continue;

      const pathStr = file.path.replace(/\\/g, "/");
      const topSection = pathStr.split("/")[0];
      const isDb = topSection === "database";

      if (mode === "db_only" && !isDb) continue;
      if (mode === "files_only" && isDb) continue;

      let destPath: string;
      if (pathStr.startsWith("env/")) {
        destPath = this.paths.envFilePath;
      } else if (isDb) {
        destPath = join(this.paths.dbDir, basename(pathStr) + ".restore");
      } else if (pathStr.startsWith("security/tls/") || pathStr.startsWith("tls/")) {
        destPath = join(this.paths.tlsDir, pathStr.replace(/^(security\/tls|tls)\//, ""));
      } else if (pathStr.startsWith("storage/map_presets/") || pathStr.startsWith("map_presets/")) {
        destPath = join(this.paths.mapPresetsDir, pathStr.replace(/^(storage\/map_presets|map_presets)\//, ""));
      } else if (pathStr.startsWith("storage/announcements/") || pathStr.startsWith("announcements/")) {
        destPath = join(this.paths.announcementsDir, pathStr.replace(/^(storage\/announcements|announcements)\//, ""));
      } else if (pathStr.startsWith("logs/instances/") || pathStr.startsWith("instance_logs/")) {
        destPath = join(this.paths.instanceLogsDir, pathStr.replace(/^(logs\/instances|instance_logs)\//, ""));
      } else {
        continue;
      }

      const dir = dirname(destPath);
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
      const buf = await file.buffer();
      writeFileSync(destPath, buf);
    }
    this.log.warn(`Restore complete from ${id}. Panel will exit to restart.`);
  }

  private hashFile(filePath: string): string {
    try {
      const hash = createHash("sha256");
      hash.update(readFileSync(filePath));
      return hash.digest("hex");
    } catch { return ""; }
  }

  private async readManifest(zipPath: string): Promise<BackupManifest | null> {
    try {
      const zip = await unzipper.Open.file(zipPath);
      const entry = zip.files.find((f: any) => f.path === "manifest.json");
      if (!entry) return null;
      const buf = await (entry as any).buffer();
      return JSON.parse(buf.toString("utf-8")) as BackupManifest;
    } catch { return null; }
  }

  private validateId(id: string): void {
    if (!/^fcc-backup-[\w\-.]+\.zip$/.test(id))
      throw new BadRequestException("backup_invalid_id");
  }
}
