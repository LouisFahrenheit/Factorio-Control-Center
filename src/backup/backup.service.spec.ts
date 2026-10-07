import { BadRequestException, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import AdmZip from 'adm-zip';
import { EventEmitter } from 'events';

// Mock archiver because archiver v8 is pure ESM and Jest runs in CJS mode
jest.mock('archiver', () => {
  return jest.fn().mockImplementation(() => {
    const emitter = new EventEmitter();
    const zip = new AdmZip();
    let targetStream: fs.WriteStream | null = null;

    return Object.assign(emitter, {
      pipe: (stream: fs.WriteStream) => {
        targetStream = stream;
        return stream;
      },
      file: (sourcePath: string, data: { name: string }) => {
        zip.addLocalFile(
          sourcePath,
          path.dirname(data.name),
          path.basename(data.name),
        );
      },
      directory: (sourceDir: string, destPrefix: string) => {
        zip.addLocalFolder(sourceDir, destPrefix);
      },
      append: (content: string | Buffer, data: { name: string }) => {
        zip.addFile(
          data.name,
          Buffer.isBuffer(content) ? content : Buffer.from(content),
        );
      },
      finalize: () => {
        const buffer = zip.toBuffer();
        if (targetStream) {
          targetStream.write(buffer);
          targetStream.end();
        }
        return Promise.resolve();
      },
    });
  });
});

import { BackupService, type BackupManifest } from './backup.service';
import { PathsService } from '../config/paths.service';

describe('BackupService', () => {
  let service: BackupService;
  let tempDir: string;
  let mockPaths: PathsService;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-backup-test-'));

    const backupsDir = path.join(tempDir, 'data', 'backups');
    const dbDir = path.join(tempDir, 'data', 'db');
    const storageDir = path.join(tempDir, 'data', 'storage');
    const tlsDir = path.join(tempDir, 'data', 'security', 'tls');
    const mapPresetsDir = path.join(storageDir, 'map_presets');
    const announcementsDir = path.join(storageDir, 'announcements');
    const instanceLogsDir = path.join(tempDir, 'data', 'logs', 'instances');
    const envFilePath = path.join(tempDir, '.env');
    const databasePath = path.join(dbDir, 'fcc_database.sqlite');
    const metricsDatabasePath = path.join(dbDir, 'fcc_metrics.sqlite');

    fs.mkdirSync(backupsDir, { recursive: true });
    fs.mkdirSync(dbDir, { recursive: true });
    fs.mkdirSync(tlsDir, { recursive: true });
    fs.mkdirSync(mapPresetsDir, { recursive: true });
    fs.mkdirSync(announcementsDir, { recursive: true });
    fs.mkdirSync(instanceLogsDir, { recursive: true });

    // Seed dummy files
    fs.writeFileSync(envFilePath, 'FCC_SECRET=test-secret\n');
    fs.writeFileSync(databasePath, 'sqlite-db-binary-mock');
    fs.writeFileSync(metricsDatabasePath, 'metrics-db-binary-mock');
    fs.writeFileSync(path.join(tlsDir, 'server.crt'), 'cert-data');
    fs.writeFileSync(path.join(mapPresetsDir, 'preset1.json'), '{"preset": 1}');
    fs.writeFileSync(
      path.join(announcementsDir, 'msg.json'),
      '{"msg": "hello"}',
    );
    fs.writeFileSync(path.join(instanceLogsDir, 'inst1.log'), 'factorio log 1');

    mockPaths = {
      backupsDir,
      dbDir,
      storageDir,
      tlsDir,
      mapPresetsDir,
      announcementsDir,
      instanceLogsDir,
      envFilePath,
      databasePath,
      metricsDatabasePath,
    } as unknown as PathsService;

    service = new BackupService(mockPaths);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe('createBackup', () => {
    it('should create a manual backup archive with manifest and correct sections', async () => {
      const entry = await service.createBackup({
        type: 'manual',
        includeMetrics: true,
        includeLogs: true,
      });

      expect(entry).toBeDefined();
      expect(entry.type).toBe('manual');
      expect(entry.filename).toMatch(/^fcc-backup-manual-.*\.zip$/);
      expect(entry.sizeBytes).toBeGreaterThan(0);
      expect(entry.sections).toEqual(
        expect.arrayContaining([
          'env',
          'database',
          'metrics',
          'tls',
          'map_presets',
          'announcements',
          'instance_logs',
        ]),
      );

      const backupFilePath = path.join(mockPaths.backupsDir, entry.filename);
      expect(fs.existsSync(backupFilePath)).toBe(true);

      // Verify zip contains manifest.json and valid hashes
      const zip = new AdmZip(backupFilePath);
      const manifestEntry = zip.getEntry('manifest.json');
      expect(manifestEntry).not.toBeNull();

      const manifest = JSON.parse(
        manifestEntry!.getData().toString('utf-8'),
      ) as BackupManifest;
      expect(manifest.type).toBe('manual');
      expect(manifest.sha256['env/.env']).toBeDefined();
      expect(manifest.sha256['database/fcc_database.sqlite']).toBeDefined();
    });

    it('should prevent concurrent backup creation', async () => {
      // Start one backup and immediately try another
      const p1 = service.createBackup({ type: 'manual' });
      await expect(service.createBackup({ type: 'manual' })).rejects.toThrow(
        BadRequestException,
      );
      await p1;
    });
  });

  describe('listBackups', () => {
    it('should list backups sorted newest first', async () => {
      // Create auto backup
      const b1 = await service.createBackup({ type: 'auto' });
      // Create manual backup
      const b2 = await service.createBackup({ type: 'manual' });

      const list = await service.listBackups();
      expect(list.length).toBe(2);
      expect(list.map((b) => b.id)).toEqual(
        expect.arrayContaining([b1.id, b2.id]),
      );
    });

    it('should return empty list if backup directory is missing', async () => {
      fs.rmSync(mockPaths.backupsDir, { recursive: true, force: true });
      const list = await service.listBackups();
      expect(list).toEqual([]);
    });
  });

  describe('saveUploadedBackup', () => {
    it('should reject empty files', async () => {
      await expect(
        service.saveUploadedBackup({
          originalname: 'test.zip',
          buffer: Buffer.alloc(0),
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject zip without manifest.json', async () => {
      const zip = new AdmZip();
      zip.addFile('dummy.txt', Buffer.from('not a backup'));
      const buffer = zip.toBuffer();

      await expect(
        service.saveUploadedBackup({
          originalname: 'corrupt.zip',
          buffer,
        }),
      ).rejects.toThrow('backup_invalid_manifest');
    });

    it('should save valid uploaded backup and return entry', async () => {
      const zip = new AdmZip();
      const manifest = {
        fccVersion: '1.1.3',
        createdAt: new Date().toISOString(),
        type: 'uploaded',
        sections: ['database', 'env'],
        sha256: {},
      };
      zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifest)));
      zip.addFile('env/.env', Buffer.from('FCC_KEY=abc'));
      const buffer = zip.toBuffer();

      const entry = await service.saveUploadedBackup({
        originalname: 'my-uploaded-backup.zip',
        buffer,
      });

      expect(entry.type).toBe('uploaded');
      expect(entry.filename).toMatch(/^fcc-backup-uploaded-.*\.zip$/);
      expect(entry.sections).toEqual(['database', 'env']);
      expect(
        fs.existsSync(path.join(mockPaths.backupsDir, entry.filename)),
      ).toBe(true);
    });
  });

  describe('deleteBackup and validation', () => {
    it('should reject invalid backup id preventing path traversal', () => {
      expect(() => service.getBackupPath('../../etc/passwd')).toThrow(
        BadRequestException,
      );
      expect(() => service.getBackupPath('not-a-backup.zip')).toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if backup file does not exist', () => {
      expect(() =>
        service.getBackupPath('fcc-backup-manual-2026-01-01T00-00-00Z.zip'),
      ).toThrow(NotFoundException);
    });

    it('should delete existing backup', async () => {
      const entry = await service.createBackup({ type: 'manual' });
      expect(
        fs.existsSync(path.join(mockPaths.backupsDir, entry.filename)),
      ).toBe(true);

      service.deleteBackup(entry.filename);
      expect(
        fs.existsSync(path.join(mockPaths.backupsDir, entry.filename)),
      ).toBe(false);
    });
  });

  describe('pruneOldBackups', () => {
    it('should prune only auto-backups exceeding maxCount and keep manual backups', async () => {
      jest.useFakeTimers();
      try {
        jest.setSystemTime(new Date('2026-01-01T10:00:00Z'));
        const auto1 = await service.createBackup({ type: 'auto' });

        jest.setSystemTime(new Date('2026-01-01T11:00:00Z'));
        const auto2 = await service.createBackup({ type: 'auto' });

        jest.setSystemTime(new Date('2026-01-01T12:00:00Z'));
        const auto3 = await service.createBackup({ type: 'auto' });

        jest.setSystemTime(new Date('2026-01-01T13:00:00Z'));
        const manual1 = await service.createBackup({ type: 'manual' });

        // Prune to max 2 auto backups
        await service.pruneOldBackups(2);

        const remaining = await service.listBackups();
        const remainingFilenames = remaining.map((b) => b.filename);

        // Oldest auto backup should be deleted
        expect(remainingFilenames).not.toContain(auto1.filename);
        // Newer auto backups should remain
        expect(remainingFilenames).toContain(auto2.filename);
        expect(remainingFilenames).toContain(auto3.filename);
        // Manual backup must be preserved
        expect(remainingFilenames).toContain(manual1.filename);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('restoreBackup', () => {
    it('should extract files in all mode', async () => {
      const entry = await service.createBackup({
        type: 'manual',
        includeLogs: true,
      });

      // Clear or mutate original files to verify restoration
      fs.unlinkSync(mockPaths.envFilePath);
      expect(fs.existsSync(mockPaths.envFilePath)).toBe(false);

      await service.restoreBackup(entry.filename, { mode: 'all' });

      // Check that .env is restored
      expect(fs.existsSync(mockPaths.envFilePath)).toBe(true);
      expect(fs.readFileSync(mockPaths.envFilePath, 'utf-8')).toBe(
        'FCC_SECRET=test-secret\n',
      );

      // Check database restore file created (database/fcc_database.sqlite -> .restore)
      const restoredDbPath = path.join(
        mockPaths.dbDir,
        'fcc_database.sqlite.restore',
      );
      expect(fs.existsSync(restoredDbPath)).toBe(true);
      expect(fs.readFileSync(restoredDbPath, 'utf-8')).toBe(
        'sqlite-db-binary-mock',
      );
    });

    it('should respect mode db_only and not touch files', async () => {
      const entry = await service.createBackup({ type: 'manual' });
      fs.unlinkSync(mockPaths.envFilePath);

      await service.restoreBackup(entry.filename, { mode: 'db_only' });

      // .env should NOT be restored in db_only mode
      expect(fs.existsSync(mockPaths.envFilePath)).toBe(false);
      // Database should be restored
      const restoredDbPath = path.join(
        mockPaths.dbDir,
        'fcc_database.sqlite.restore',
      );
      expect(fs.existsSync(restoredDbPath)).toBe(true);
    });
  });
});
