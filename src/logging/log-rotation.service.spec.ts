import { Test, TestingModule } from '@nestjs/testing';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { FccConfigService } from '../config/fcc-config.service';
import { LogRotationService } from './log-rotation.service';

describe('LogRotationService', () => {
  let service: LogRotationService;
  let mockConfig: { webPanel: Record<string, unknown> };
  let testDir: string;

  beforeEach(async () => {
    testDir = mkdtempSync(join(tmpdir(), 'fcc-log-rotation-test-'));

    mockConfig = {
      webPanel: {
        log_rotation_max_mb: 50,
        log_rotation_interval_hours: 24,
        log_rotation_backup_count: 3,
        log_write_instance: true,
        log_write_web: false,
        log_write_maintenance: true,
        log_write_audit: false,
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LogRotationService,
        { provide: FccConfigService, useValue: mockConfig },
      ],
    }).compile();

    service = module.get<LogRotationService>(LogRotationService);
    service.onModuleInit();
  });

  afterEach(() => {
    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  describe('configuration & feature flags', () => {
    it('should initialize and return feature flags from config', () => {
      expect(service.logWriteInstanceEnabled()).toBe(true);
      expect(service.logWriteWebEnabled()).toBe(false);
      expect(service.logWriteMaintenanceEnabled()).toBe(true);
      expect(service.logWriteAuditEnabled()).toBe(false);
    });

    it('should clamp config values properly', () => {
      mockConfig.webPanel = {
        log_rotation_max_mb: 999999, // clamped to 2048
        log_rotation_interval_hours: -10, // clamped to 1
        log_rotation_backup_count: 50, // clamped to 20
        log_write_instance: false,
        log_write_web: true,
        log_write_maintenance: false,
        log_write_audit: true,
      };

      service.syncFromConfig();

      expect(service.logWriteInstanceEnabled()).toBe(false);
      expect(service.logWriteWebEnabled()).toBe(true);
      expect(service.logWriteMaintenanceEnabled()).toBe(false);
      expect(service.logWriteAuditEnabled()).toBe(true);
    });

    it('should use fallback defaults when config values are non-numeric or invalid', () => {
      mockConfig.webPanel = {
        log_rotation_max_mb: 'invalid',
        log_rotation_interval_hours: null,
        log_rotation_backup_count: undefined,
      };

      service.syncFromConfig();

      // Ensure service runs without throwing
      const logFile = join(testDir, 'test.log');
      service.appendLine(logFile, 'hello');
      expect(existsSync(logFile)).toBe(true);
    });
  });

  describe('appendLine', () => {
    it('should ignore empty or blank file path', () => {
      expect(() => service.appendLine('', 'message')).not.toThrow();
      expect(() => service.appendLine('   ', 'message')).not.toThrow();
    });

    it('should create missing parent directories and append line with trailing newline', () => {
      const nestedLog = join(testDir, 'nested', 'sub', 'test.log');
      service.appendLine(nestedLog, 'first line');
      service.appendLine(nestedLog, 'second line\n');

      expect(existsSync(nestedLog)).toBe(true);
      const content = readFileSync(nestedLog, 'utf-8');
      expect(content).toBe('first line\nsecond line\n');
    });
  });

  describe('rotation logic', () => {
    it('should rotate log when file size exceeds maxBytes', () => {
      // Set max size to 100 bytes and backup count to 3
      mockConfig.webPanel.log_rotation_max_mb = 1;
      (service as unknown as { maxBytes: number }).maxBytes = 100;
      (service as unknown as { intervalSec: number }).intervalSec = 0; // check on every write

      const logFile = join(testDir, 'server.log');

      // Write initial content exceeding 100 bytes
      writeFileSync(logFile, 'A'.repeat(120), 'utf-8');

      // Next appendLine should trigger rotation
      service.appendLine(logFile, 'new log line');

      const rotated1 = join(testDir, 'server.log.1');
      expect(existsSync(rotated1)).toBe(true);
      expect(readFileSync(rotated1, 'utf-8')).toBe('A'.repeat(120));

      const newContent = readFileSync(logFile, 'utf-8');
      expect(newContent).toBe('new log line\n');
    });

    it('should shift numbered backups up to backupCount and delete oldest', () => {
      (service as unknown as { maxBytes: number }).maxBytes = 50;
      (service as unknown as { backupCount: number }).backupCount = 3;
      (service as unknown as { intervalSec: number }).intervalSec = 0;

      const logFile = join(testDir, 'server.log');
      const log1 = join(testDir, 'server.log.1');
      const log2 = join(testDir, 'server.log.2');
      const log3 = join(testDir, 'server.log.3');

      // Pre-create existing backups: log.1 and log.2
      writeFileSync(logFile, 'B'.repeat(60), 'utf-8');
      writeFileSync(log1, 'backup-1', 'utf-8');
      writeFileSync(log2, 'backup-2', 'utf-8');

      // First rotation: log.2 -> log.3, log.1 -> log.2, log -> log.1
      service.appendLine(logFile, 'line after first rotation');

      expect(existsSync(log3)).toBe(true);
      expect(readFileSync(log3, 'utf-8')).toBe('backup-2');
      expect(readFileSync(log2, 'utf-8')).toBe('backup-1');
      expect(readFileSync(log1, 'utf-8')).toBe('B'.repeat(60));

      // Overwrite current log to exceed maxBytes again
      writeFileSync(logFile, 'C'.repeat(60), 'utf-8');

      // Second rotation: log.3 is unlinked, log.2 -> log.3, log.1 -> log.2, log -> log.1
      service.appendLine(logFile, 'line after second rotation');

      expect(readFileSync(log3, 'utf-8')).toBe('backup-1');
      expect(readFileSync(log2, 'utf-8')).toBe('B'.repeat(60));
      expect(readFileSync(log1, 'utf-8')).toBe('C'.repeat(60));
      expect(readFileSync(logFile, 'utf-8')).toBe(
        'line after second rotation\n',
      );
    });

    it('should not rotate if file size is below maxBytes', () => {
      (service as unknown as { maxBytes: number }).maxBytes = 1000;
      (service as unknown as { intervalSec: number }).intervalSec = 0;

      const logFile = join(testDir, 'server.log');
      writeFileSync(logFile, 'small content', 'utf-8');

      service.appendLine(logFile, 'another line');

      const log1 = join(testDir, 'server.log.1');
      expect(existsSync(log1)).toBe(false);
      expect(readFileSync(logFile, 'utf-8')).toBe(
        'small contentanother line\n',
      );
    });

    it('should throttle size check if interval has not elapsed', () => {
      (service as unknown as { maxBytes: number }).maxBytes = 50;
      (service as unknown as { intervalSec: number }).intervalSec = 3600; // 1 hour interval

      const logFile = join(testDir, 'throttled.log');
      service.appendLine(logFile, 'initial line');

      // Grow the file beyond maxBytes manually
      writeFileSync(logFile, 'D'.repeat(100), 'utf-8');

      // Append immediately: interval (1 hour) has not elapsed, so rotation check is skipped
      service.appendLine(logFile, 'fast follow-up');

      const log1 = join(testDir, 'throttled.log.1');
      expect(existsSync(log1)).toBe(false);
    });
  });
});
