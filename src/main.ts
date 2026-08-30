import { config as dotenvConfig } from 'dotenv';
import { join, resolve, dirname } from 'path';
import { existsSync, readFileSync, writeFileSync, copyFileSync, unlinkSync, renameSync, mkdirSync } from 'fs';
import { randomBytes } from 'crypto';

const fccRootForEnv = resolve(
  (process.env.FCC_ROOT_DIR || '').replace(/^["']+|["']+$/g, '').trim() ||
    process.cwd(),
);
const envPath = join(fccRootForEnv, '.env');
const envExamplePath = join(fccRootForEnv, '.env.example');

// Apply pending backup restoration before SQLite database files are locked by TypeORM
const dataDir = join(fccRootForEnv, 'data');
const dbDir = join(dataDir, 'db');

const applyPendingDb = (pendingPath: string, targetPath: string, label: string) => {
  if (existsSync(pendingPath)) {
    try {
      const parent = dirname(targetPath);
      if (!existsSync(parent)) mkdirSync(parent, { recursive: true });
      if (existsSync(targetPath)) {
        try { unlinkSync(targetPath); } catch { /* */ }
      }
      renameSync(pendingPath, targetPath);
      console.log(`[Bootstrap] Applied restored ${label} from backup.`);
    } catch {
      try {
        copyFileSync(pendingPath, targetPath);
        unlinkSync(pendingPath);
        console.log(`[Bootstrap] Copied restored ${label} from backup.`);
      } catch (e) {
        console.error(`[Bootstrap] Failed to apply restored ${label}:`, e);
      }
    }
  }
};

// Check data/db/ pending restore and fallback legacy data/ pending restore
applyPendingDb(join(dbDir, 'fcc_database.sqlite.restore'), join(dbDir, 'fcc_database.sqlite'), 'database');
applyPendingDb(join(dataDir, 'fcc_database.sqlite.restore'), join(dbDir, 'fcc_database.sqlite'), 'database');
applyPendingDb(join(dbDir, 'fcc_metrics.sqlite.restore'), join(dbDir, 'fcc_metrics.sqlite'), 'metrics database');
applyPendingDb(join(dataDir, 'fcc_metrics.sqlite.restore'), join(dbDir, 'fcc_metrics.sqlite'), 'metrics database');

if (!existsSync(envPath) && existsSync(envExamplePath)) {
  let content = readFileSync(envExamplePath, 'utf8');
  // Generate secure random strings for a fresh installation
  const apiToken = randomBytes(32).toString('hex');
  const appSecret = randomBytes(32).toString('base64');

  content = content.replace('API_TOKEN=', `API_TOKEN=${apiToken}`);
  content = content.replace('APP_SECRET=', `APP_SECRET=${appSecret}`);

  writeFileSync(envPath, content, 'utf8');
  // Use console.log since Nest Logger isn't initialized yet
  console.log(
    `[Bootstrap] Created new .env file from .env.example with secure tokens.`,
  );
} else if (existsSync(envPath)) {
  let content = readFileSync(envPath, 'utf8');
  let modified = false;

  const hasValue = (key: string) => {
    const match = new RegExp(`^\\s*${key}\\s*=\\s*(.*)$`, 'm').exec(content);
    return match && match[1].trim().length > 0;
  };

  if (!hasValue('API_TOKEN')) {
    const apiToken = randomBytes(32).toString('hex');
    const keyRegex = new RegExp(`^\\s*#?\\s*API_TOKEN\\s*=.*$`, 'm');
    if (keyRegex.test(content)) {
      content = content.replace(keyRegex, `API_TOKEN=${apiToken}`);
    } else {
      content += `\nAPI_TOKEN=${apiToken}`;
    }
    modified = true;
  }

  if (!hasValue('APP_SECRET')) {
    const appSecret = randomBytes(32).toString('base64');
    const keyRegex = new RegExp(`^\\s*#?\\s*APP_SECRET\\s*=.*$`, 'm');
    if (keyRegex.test(content)) {
      content = content.replace(keyRegex, `APP_SECRET=${appSecret}`);
    } else {
      content += `\nAPP_SECRET=${appSecret}`;
    }
    modified = true;
  }

  if (modified) {
    writeFileSync(envPath, content, 'utf8');
    console.log(
      `[Bootstrap] Generated missing secure tokens in existing .env file.`,
    );
  }
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
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

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
    rootLogger.debug(
      `DEBUG_LOGS is enabled! NestJS Logger initialized with debug levels.`,
    );
  }

  app.setGlobalPrefix('');
  app.enableShutdownHooks();

  // Swagger/OpenAPI documentation (enabled via SWAGGER_ENABLED=true in .env)
  const swaggerEnabled =
    String(process.env.SWAGGER_ENABLED).toLowerCase() === 'true';
  if (swaggerEnabled) {
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Factorio Control Center API')
      .setDescription(
        'REST API for managing dedicated Factorio game servers.\n\n' +
          '## Authentication\n' +
          'Most endpoints require a Bearer token. You can authenticate with:\n' +
          '- **Session token** — obtained via `POST /api/auth/login`\n' +
          '- **API token** — the `API_TOKEN` value from your `.env` file\n\n' +
          'Click the **Authorize** button and enter: `<your_token>`',
      )
      .setVersion(APP_VERSION)
      .setContact(
        'Louis Fahrenheit',
        'https://github.com/LouisFahrenheit/Factorio-Control-Center',
        '',
      )
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'Token',
          description: 'Session token or API_TOKEN from .env',
        },
        'bearer',
      )
      .build();

    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api/docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        tagsSorter: 'alpha',
        operationsSorter: 'alpha',
      },
      customSiteTitle: 'FCC API Docs',
    });
    rootLogger.log('Swagger UI is enabled at /api/docs');
  }

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
