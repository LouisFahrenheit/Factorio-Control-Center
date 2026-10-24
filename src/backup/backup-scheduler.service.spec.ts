import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';

jest.mock('archiver', () => jest.fn());

import { SystemPreference } from '../config/system-preference.entity';
import { BackupService } from './backup.service';
import { BackupSchedulerService } from './backup-scheduler.service';

describe('BackupSchedulerService', () => {
  let service: BackupSchedulerService;
  let mockSysPrefs: {
    find: jest.Mock;
    upsert: jest.Mock;
  };
  let mockBackups: {
    createBackup: jest.Mock;
    pruneOldBackups: jest.Mock;
  };

  beforeEach(async () => {
    jest.useFakeTimers();

    mockSysPrefs = {
      find: jest.fn().mockResolvedValue([]),
      upsert: jest.fn().mockResolvedValue({}),
    };

    mockBackups = {
      createBackup: jest
        .fn()
        .mockResolvedValue({ filename: 'backup_auto.zip' }),
      pruneOldBackups: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BackupSchedulerService,
        {
          provide: getRepositoryToken(SystemPreference),
          useValue: mockSysPrefs,
        },
        { provide: BackupService, useValue: mockBackups },
      ],
    }).compile();

    service = module.get<BackupSchedulerService>(BackupSchedulerService);
  });

  afterEach(() => {
    service.onModuleDestroy();
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  describe('initialization & loadSettings', () => {
    it('should initialize with default settings when preferences are empty', async () => {
      mockSysPrefs.find.mockResolvedValue([]);
      await service.onModuleInit();

      expect(service.getSettings()).toEqual({
        enabled: false,
        intervalHours: 24,
        maxCount: 5,
        includeMetrics: false,
        includeLogs: false,
        lastRunAt: '',
        nextRunAt: '',
      });
    });

    it('should parse saved preferences properly on module init', async () => {
      mockSysPrefs.find.mockResolvedValue([
        { key: 'backup.enabled', value: 'true' },
        { key: 'backup.intervalHours', value: '12' },
        { key: 'backup.maxCount', value: '10' },
        { key: 'backup.includeMetrics', value: '1' },
        { key: 'backup.includeLogs', value: 'yes' },
        { key: 'backup.lastRunAt', value: '2026-10-24T10:00:00.000Z' },
      ]);

      await service.onModuleInit();

      const settings = service.getSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.intervalHours).toBe(12);
      expect(settings.maxCount).toBe(10);
      expect(settings.includeMetrics).toBe(true);
      expect(settings.includeLogs).toBe(true);
      expect(settings.lastRunAt).toBe('2026-10-24T10:00:00.000Z');
      expect(settings.nextRunAt).toBeTruthy();
    });
  });

  describe('saveSettings', () => {
    it('should persist modified settings to database and reschedule', async () => {
      await service.onModuleInit();

      await service.saveSettings({
        enabled: true,
        intervalHours: 6,
        maxCount: 7,
      });

      expect(mockSysPrefs.upsert).toHaveBeenCalledWith(
        { key: 'backup.enabled', value: 'true' },
        ['key'],
      );
      expect(mockSysPrefs.upsert).toHaveBeenCalledWith(
        { key: 'backup.intervalHours', value: '6' },
        ['key'],
      );
      expect(mockSysPrefs.upsert).toHaveBeenCalledWith(
        { key: 'backup.maxCount', value: '7' },
        ['key'],
      );

      const settings = service.getSettings();
      expect(settings.enabled).toBe(true);
      expect(settings.intervalHours).toBe(6);
      expect(settings.nextRunAt).toBeTruthy();
    });
  });

  describe('scheduling and execution flow', () => {
    it('should run scheduled backup when delay expires and prune old backups', async () => {
      // Setup enabled schedule with 2 hours interval, lastRunAt = 1 hour ago
      const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
      mockSysPrefs.find.mockResolvedValue([
        { key: 'backup.enabled', value: 'true' },
        { key: 'backup.intervalHours', value: '2' },
        { key: 'backup.maxCount', value: '5' },
        { key: 'backup.includeMetrics', value: 'true' },
        { key: 'backup.includeLogs', value: 'false' },
        { key: 'backup.lastRunAt', value: oneHourAgo },
      ]);

      await service.onModuleInit();

      // Advancing by 1 hour (remaining delay) should trigger run
      jest.advanceTimersByTime(3600 * 1000);
      await Promise.resolve(); // drain microtasks

      expect(mockBackups.createBackup).toHaveBeenCalledWith({
        includeMetrics: true,
        includeLogs: false,
        type: 'auto',
      });
      expect(mockBackups.pruneOldBackups).toHaveBeenCalledWith(5);

      const updated = service.getSettings();
      expect(updated.lastRunAt).toBeTruthy();
    });

    it('should handle errors during scheduled backup run and reschedule', async () => {
      mockSysPrefs.find.mockResolvedValue([
        { key: 'backup.enabled', value: 'true' },
        { key: 'backup.intervalHours', value: '1' },
      ]);
      mockBackups.createBackup.mockRejectedValue(new Error('Disk full'));

      await service.onModuleInit();

      // Trigger run
      jest.advanceTimersByTime(3600 * 1000);
      await Promise.resolve();

      expect(mockBackups.createBackup).toHaveBeenCalled();
      const settings = service.getSettings();
      expect(settings.lastRunAt).toBeTruthy();
    });

    it('should not schedule backup if disabled', async () => {
      mockSysPrefs.find.mockResolvedValue([
        { key: 'backup.enabled', value: 'false' },
      ]);

      await service.onModuleInit();

      jest.advanceTimersByTime(86400 * 1000);
      await Promise.resolve();

      expect(mockBackups.createBackup).not.toHaveBeenCalled();
    });

    it('should clear timer and stop execution on module destroy', async () => {
      mockSysPrefs.find.mockResolvedValue([
        { key: 'backup.enabled', value: 'true' },
        { key: 'backup.intervalHours', value: '1' },
      ]);

      await service.onModuleInit();
      service.onModuleDestroy();

      jest.advanceTimersByTime(3600 * 1000);
      await Promise.resolve();

      expect(mockBackups.createBackup).not.toHaveBeenCalled();
    });
  });
});
