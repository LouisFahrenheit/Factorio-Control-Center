import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SystemPreference } from '../config/system-preference.entity';
import { GameInstance } from '../instances/game-instance.entity';
import { NotificationsService } from './notifications.service';
import { TelegramService } from './telegram.service';
import { WebhookService } from './webhook.service';

@Module({
  imports: [TypeOrmModule.forFeature([SystemPreference, GameInstance])],
  providers: [TelegramService, WebhookService, NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
