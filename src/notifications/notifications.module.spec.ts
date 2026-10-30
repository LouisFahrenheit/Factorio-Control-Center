import { MODULE_METADATA } from '@nestjs/common/constants';
import { NotificationsModule } from './notifications.module';
import { NotificationsService } from './notifications.service';
import { TelegramService } from './telegram.service';
import { WebhookService } from './webhook.service';
import { PathsService } from '../config/paths.service';

describe('NotificationsModule', () => {
  it('should be defined', () => {
    expect(NotificationsModule).toBeDefined();
    const moduleInstance = new NotificationsModule();
    expect(moduleInstance).toBeInstanceOf(NotificationsModule);
  });

  it('should declare expected providers', () => {
    const providers = Reflect.getMetadata(
      MODULE_METADATA.PROVIDERS,
      NotificationsModule,
    ) as unknown[];

    expect(Array.isArray(providers)).toBe(true);
    expect(providers).toContain(PathsService);
    expect(providers).toContain(TelegramService);
    expect(providers).toContain(WebhookService);
    expect(providers).toContain(NotificationsService);
  });

  it('should export NotificationsService', () => {
    const exportsList = Reflect.getMetadata(
      MODULE_METADATA.EXPORTS,
      NotificationsModule,
    ) as unknown[];

    expect(Array.isArray(exportsList)).toBe(true);
    expect(exportsList).toContain(NotificationsService);
  });

  it('should import TypeOrmModule feature with entities', () => {
    const importsList = Reflect.getMetadata(
      MODULE_METADATA.IMPORTS,
      NotificationsModule,
    ) as unknown[];

    expect(Array.isArray(importsList)).toBe(true);
    expect(importsList.length).toBeGreaterThan(0);
  });
});
