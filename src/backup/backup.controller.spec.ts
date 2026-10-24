import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import type { Request, Response } from 'express';

jest.mock('archiver', () => jest.fn());

import { AuthGuard, AUTH_USER_KEY } from '../auth/auth.guard';
import type { SessionUser } from '../common/types';
import { BackupController } from './backup.controller';
import { BackupService, type BackupEntry } from './backup.service';
import {
  BackupSchedulerService,
  type AutoBackupSettings,
} from './backup-scheduler.service';

function createMockReq(role: SessionUser['role'] = 'administrator'): Request {
  const user: SessionUser = {
    username: 'test_admin',
    role,
    tabs: ['all'],
    instance_ids: [],
    enabled: true,
  };
  return {
    [AUTH_USER_KEY]: user,
  } as unknown as Request;
}

describe('BackupController', () => {
  let controller: BackupController;
  let mockBackups: {
    listBackups: jest.Mock;
    isCreating: boolean;
    createBackup: jest.Mock;
    saveUploadedBackup: jest.Mock;
    getBackupPath: jest.Mock;
    deleteBackup: jest.Mock;
    restoreBackup: jest.Mock;
  };
  let mockScheduler: {
    getSettings: jest.Mock;
    saveSettings: jest.Mock;
  };

  const sampleEntry: BackupEntry = {
    id: 'fcc_backup_2026-10-24.zip',
    filename: 'fcc_backup_2026-10-24.zip',
    sizeBytes: 1048576,
    createdAt: '2026-10-24T12:00:00.000Z',
    type: 'manual',
    fccVersion: '1.2.1',
    sections: ['db', 'config'],
  };

  const sampleSettings: AutoBackupSettings = {
    enabled: true,
    intervalHours: 24,
    maxCount: 5,
    includeMetrics: false,
    includeLogs: false,
    lastRunAt: '',
    nextRunAt: '',
  };

  beforeEach(async () => {
    mockBackups = {
      listBackups: jest.fn().mockResolvedValue([sampleEntry]),
      isCreating: false,
      createBackup: jest.fn().mockResolvedValue(sampleEntry),
      saveUploadedBackup: jest.fn().mockResolvedValue(sampleEntry),
      getBackupPath: jest.fn().mockReturnValue('/backups/fcc_backup.zip'),
      deleteBackup: jest.fn(),
      restoreBackup: jest.fn().mockResolvedValue(undefined),
    };

    mockScheduler = {
      getSettings: jest.fn().mockReturnValue(sampleSettings),
      saveSettings: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [BackupController],
      providers: [
        { provide: BackupService, useValue: mockBackups },
        { provide: BackupSchedulerService, useValue: mockScheduler },
      ],
    })
      .overrideGuard(AuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<BackupController>(BackupController);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
  });

  describe('access control (requireAdmin)', () => {
    it('should throw ForbiddenException if user is not an administrator', async () => {
      const nonAdminReq = createMockReq('moderator');

      await expect(
        controller.create(nonAdminReq, { type: 'manual' }),
      ).rejects.toThrow(ForbiddenException);

      await expect(
        controller.upload(nonAdminReq, {
          originalname: 'test.zip',
          buffer: Buffer.from('zip'),
        }),
      ).rejects.toThrow(ForbiddenException);

      expect(() => controller.remove(nonAdminReq, 'test.zip')).toThrow(
        ForbiddenException,
      );

      await expect(
        controller.restore(nonAdminReq, 'test.zip', { mode: 'all' }),
      ).rejects.toThrow(ForbiddenException);

      await expect(controller.putSettings(nonAdminReq, {})).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('list and status', () => {
    it('should return list of backups', async () => {
      const res = await controller.list();
      expect(res).toEqual({ ok: true, items: [sampleEntry] });
      expect(mockBackups.listBackups).toHaveBeenCalled();
    });

    it('should return backup creation status', () => {
      mockBackups.isCreating = true;
      const res = controller.status();
      expect(res).toEqual({ ok: true, creating: true });
    });
  });

  describe('create and upload', () => {
    it('should create a backup with requested options', async () => {
      const req = createMockReq('administrator');
      const res = await controller.create(req, {
        includeMetrics: true,
        includeLogs: true,
        type: 'manual',
      });

      expect(res).toEqual({ ok: true, entry: sampleEntry });
      expect(mockBackups.createBackup).toHaveBeenCalledWith({
        includeMetrics: true,
        includeLogs: true,
        type: 'manual',
      });
    });

    it('should throw BadRequestException if upload is called without file', async () => {
      const req = createMockReq('administrator');
      await expect(controller.upload(req, undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should save uploaded backup file', async () => {
      const req = createMockReq('administrator');
      const file = {
        originalname: 'uploaded.zip',
        buffer: Buffer.from('data'),
      };

      const res = await controller.upload(req, file);
      expect(res).toEqual({ ok: true, entry: sampleEntry });
      expect(mockBackups.saveUploadedBackup).toHaveBeenCalledWith(file);
    });
  });

  describe('download and delete', () => {
    it('should initiate file download for requested backup ID', () => {
      const mockDownload = jest.fn();
      const res = { download: mockDownload } as unknown as Response;
      controller.download('test_backup.zip', res);

      expect(mockBackups.getBackupPath).toHaveBeenCalledWith('test_backup.zip');
      expect(mockDownload).toHaveBeenCalledWith(
        '/backups/fcc_backup.zip',
        'test_backup.zip',
      );
    });

    it('should delete specified backup', () => {
      const req = createMockReq('administrator');
      const res = controller.remove(req, 'test_backup.zip');

      expect(res).toEqual({ ok: true });
      expect(mockBackups.deleteBackup).toHaveBeenCalledWith('test_backup.zip');
    });
  });

  describe('restore and settings', () => {
    it('should restore backup and return restarting status', async () => {
      jest.useFakeTimers();
      const exitSpy = jest
        .spyOn(process, 'exit')
        .mockImplementation((() => undefined) as never);

      const req = createMockReq('administrator');
      const res = await controller.restore(req, 'test_backup.zip', {
        mode: 'all',
      });

      expect(res).toEqual({ ok: true, restarting: true });
      expect(mockBackups.restoreBackup).toHaveBeenCalledWith(
        'test_backup.zip',
        { mode: 'all' },
      );

      jest.advanceTimersByTime(2000);
      expect(exitSpy).toHaveBeenCalledWith(0);

      exitSpy.mockRestore();
      jest.useRealTimers();
    });

    it('should get auto-backup settings', () => {
      const res = controller.getSettings();
      expect(res).toEqual({ ok: true, settings: sampleSettings });
      expect(mockScheduler.getSettings).toHaveBeenCalled();
    });

    it('should validate and save auto-backup settings', async () => {
      const req = createMockReq('administrator');
      const res = await controller.putSettings(req, {
        enabled: true,
        intervalHours: 48,
        maxCount: 15,
        includeMetrics: true,
        includeLogs: false,
      });

      expect(mockScheduler.saveSettings).toHaveBeenCalledWith({
        enabled: true,
        intervalHours: 48,
        maxCount: 15,
        includeMetrics: true,
        includeLogs: false,
      });
      expect(res).toEqual({ ok: true, settings: sampleSettings });
    });
  });
});
