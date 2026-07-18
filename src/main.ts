import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { PathsService } from './config/paths.service';
import { UsersService } from './auth/users.service';
import { WebPanelListenerService } from './http/web-panel-listener.service';
import { InstanceAutostartService } from './instances/instance-autostart.service';
import { PanelStartupLogService } from './logging/panel-startup-log.service';
import { APP_NAME, APP_VERSION } from './constants/fcc.constants';

process.title = `${APP_NAME} v${APP_VERSION}`;

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });
  app.setGlobalPrefix('');
  app.enableShutdownHooks();

  app.get(PathsService);
  app.get(UsersService).load();

  // Required when using a custom http/https server instead of app.listen().
  await app.init();

  const listener = app.get(WebPanelListenerService);
  listener.setApp(app);

  const shutdown = async () => {
    try {
      await listener.stop();
    } catch {
      /* ignore */
    }
    try {
      await app.close();
    } catch {
      /* ignore */
    }
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());

  try {
    await listener.start();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`Failed to start web listener: ${msg}`);
    process.exit(1);
  }

  app.get(PanelStartupLogService).logReady();
  app.get(InstanceAutostartService).scheduleAfterPanelStart();
}

bootstrap();
