import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemPreference } from '../config/system-preference.entity';
import { PathsService } from '../config/paths.service';
import { BackupService } from './backup.service';
import { BackupSchedulerService } from './backup-scheduler.service';

@Module({
  imports: [TypeOrmModule.forFeature([SystemPreference])],
  providers: [PathsService, BackupService, BackupSchedulerService],
  exports: [BackupService, BackupSchedulerService],
})
export class BackupModule {}
