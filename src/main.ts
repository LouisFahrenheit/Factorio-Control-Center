import { config as dotenvConfig } from 'dotenv';
import { join, resolve } from 'path';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { randomBytes } from 'crypto';

const fccRootForEnv = resolve(
  (process.env.FCC_ROOT_DIR || '').replace(/^["']+|["']+$/g, '').trim() || process.cwd(),
);
const envPath = join(fccRootForEnv, '.env');
const envExamplePath = join(fccRootForEnv, '.env.example');

if (!existsSync(envPath) && existsSync(envExamplePath)) {
  let content = readFileSync(envExamplePath, 'utf8');
  // Generate secure random strings for a fresh installation
  const apiToken = randomBytes(32).toString('hex');
  const appSecret = randomBytes(32).toString('base64');
  
  content = content.replace('API_TOKEN=', `API_TOKEN=${apiToken}`);
  content = content.replace('APP_SECRET=', `APP_SECRET=${appSecret}`);
  
  writeFileSync(envPath, content, 'utf8');
  // Use console.log since Nest Logger isn't initialized yet
  console.log(`[Bootstrap] Created new .env file from .env.example with secure tokens.`);
}

dotenvConfig({ path: envPath });

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';
import { PathsService } from './config/paths.service';
import { UsersService } from './auth/users.service';
import { WebPanelListenerService } from './http/web-panel-listener.service';
import { InstanceAutostartService } from './instances/instance-autostart.service';
import { PanelStartupLogService } from './logging/panel-startup-log.service';
import { FccWsAdapter } from './ws/ws-adapter';
import { APP_NAME, APP_VERSION } from './constants/fcc.constants';

process.title = `${APP_NAME} v${APP_VERSION}`;

async function bootstrap() {
  const isDebug = String(process.env.DEBUG_LOGS).toLowerCase() === 'true';
  const loggerLevels: any = isDebug 
    ? ['log', 'error', 'warn', 'debug', 'verbose'] 
    : ['log', 'error', 'warn'];

  const app = await NestFactory.create(AppModule, { 
    cors: true,
    logger: loggerLevels,
  });
  const rootLogger = new Logger('Bootstrap');
  
  if (isDebug) {
    rootLogger.debug(`DEBUG_LOGS is enabled! NestJS Logger initialized with debug levels.`);
  }

  app.setGlobalPrefix('');
  app.enableShutdownHooks();

  app.get(PathsService);
  app.get(UsersService).load();

  // Create the WS adapter and register it before app.init()
  const wsAdapter = new FccWsAdapter(app);
  app.useWebSocketAdapter(wsAdapter);

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

  // Attach Socket.IO WebSocket adapter to the same HTTP server
  const httpServer = listener.getServer();
  if (httpServer) {
    wsAdapter.setHttpServer(httpServer);
  }

  await app.get(PanelStartupLogService).logReady();
  app.get(InstanceAutostartService).scheduleAfterPanelStart();
}

bootstrap();
