jest.mock('archiver', () => jest.fn());

const mockListener = {
  setApp: jest.fn(),
  start: jest.fn().mockResolvedValue(undefined),
  stop: jest.fn().mockResolvedValue(undefined),
  getServer: jest.fn().mockReturnValue({}),
};

const mockStartupLog = {
  logReady: jest.fn().mockResolvedValue(undefined),
};

const mockAutostart = {
  scheduleAfterPanelStart: jest.fn(),
};

const mockApp = {
  setGlobalPrefix: jest.fn(),
  enableShutdownHooks: jest.fn(),
  useGlobalPipes: jest.fn(),
  useWebSocketAdapter: jest.fn(),
  init: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  get: jest.fn((token: unknown) => {
    if (token === WebPanelListenerService) return mockListener;
    if (token === PanelStartupLogService) return mockStartupLog;
    if (token === InstanceAutostartService) return mockAutostart;
    return {};
  }),
};

jest.mock('@nestjs/core', () => {
  const actual =
    jest.requireActual<typeof import('@nestjs/core')>('@nestjs/core');
  return {
    ...actual,
    NestFactory: {
      create: jest.fn().mockResolvedValue(mockApp),
    },
  };
});

jest.mock('dotenv', () => ({
  config: jest.fn(),
}));

jest.mock('./config/db-bootstrap-backup', () => ({
  backupDbBeforeStartup: jest.fn(),
}));

jest.mock('./ws/ws-adapter', () => ({
  FccWsAdapter: jest.fn().mockImplementation(() => ({
    setHttpServer: jest.fn(),
  })),
}));

jest.mock('@nestjs/swagger', () => {
  const actual =
    jest.requireActual<typeof import('@nestjs/swagger')>('@nestjs/swagger');
  return {
    ...actual,
    SwaggerModule: {
      createDocument: jest.fn().mockReturnValue({}),
      setup: jest.fn(),
    },
    DocumentBuilder: jest.fn().mockImplementation(() => ({
      setTitle: jest.fn().mockReturnThis(),
      setDescription: jest.fn().mockReturnThis(),
      setVersion: jest.fn().mockReturnThis(),
      setContact: jest.fn().mockReturnThis(),
      addBearerAuth: jest.fn().mockReturnThis(),
      build: jest.fn().mockReturnValue({}),
    })),
  };
});

import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { WebPanelListenerService } from './http/web-panel-listener.service';
import { PanelStartupLogService } from './logging/panel-startup-log.service';
import { InstanceAutostartService } from './instances/instance-autostart.service';
import { backupDbBeforeStartup } from './config/db-bootstrap-backup';

// Static import executes bootstrap with our mocked dependencies
import './main';

interface NestCreateOptions {
  cors?: {
    origin?: boolean;
    credentials?: boolean;
  };
}

describe('main bootstrap', () => {
  const createMock = (NestFactory as unknown as Record<string, jest.Mock>)[
    'create'
  ];

  beforeAll(async () => {
    // Wait for the asynchronous bootstrap function to complete
    await new Promise((resolve) => setTimeout(resolve, 50));
  });

  it('should initialize and start the NestJS application with AppModule', () => {
    expect(createMock).toHaveBeenCalled();
    const calls = createMock.mock.calls as Array<[unknown, NestCreateOptions]>;
    const [moduleArg, optionsArg] = calls[0];
    expect(moduleArg).toBe(AppModule);
    expect(optionsArg.cors?.origin).toBe(true);
    expect(optionsArg.cors?.credentials).toBe(true);
  });

  it('should configure global prefix, shutdown hooks and global pipes', () => {
    expect(mockApp.setGlobalPrefix).toHaveBeenCalledWith('');
    expect(mockApp.enableShutdownHooks).toHaveBeenCalled();
    expect(mockApp.useGlobalPipes).toHaveBeenCalled();
  });

  it('should execute pre-boot database safety backup', () => {
    const backupMock = backupDbBeforeStartup as unknown as jest.Mock;
    expect(backupMock).toHaveBeenCalled();
  });

  it('should register WebSocket adapter and initialize application', () => {
    expect(mockApp.useWebSocketAdapter).toHaveBeenCalled();
    expect(mockApp.init).toHaveBeenCalled();
  });

  it('should bind application to WebPanelListenerService and start listener', () => {
    expect(mockListener.setApp).toHaveBeenCalledWith(mockApp);
    expect(mockListener.start).toHaveBeenCalled();
  });

  it('should log panel readiness and schedule instance autostart', () => {
    expect(mockStartupLog.logReady).toHaveBeenCalled();
    expect(mockAutostart.scheduleAfterPanelStart).toHaveBeenCalled();
  });
});
