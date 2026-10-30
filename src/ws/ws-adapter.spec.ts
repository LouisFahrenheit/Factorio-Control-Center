import type { INestApplication } from '@nestjs/common';
import type { Server as HttpServer } from 'http';
import { Server } from 'socket.io';
import { FccWsAdapter } from './ws-adapter';

jest.mock('socket.io', () => {
  return {
    Server: jest.fn().mockImplementation((options: unknown) => ({
      options,
      attach: jest.fn(),
    })),
  };
});

describe('FccWsAdapter', () => {
  let adapter: FccWsAdapter;
  let mockApp: INestApplication;

  beforeEach(() => {
    mockApp = {} as unknown as INestApplication;
    adapter = new FccWsAdapter(mockApp);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  it('should create Socket.IO server with cors origin * and passed options', () => {
    const server = adapter.createIOServer(3000, {
      path: '/custom-socket',
    });

    expect(Server).toHaveBeenCalledWith({
      path: '/custom-socket',
      cors: { origin: '*' },
    });
    expect(server).toBeDefined();
  });

  it('should attach ioServer to http server when setHttpServer is called', () => {
    const ioServer = adapter.createIOServer(3000);
    const mockHttpServer = {} as HttpServer;

    adapter.setHttpServer(mockHttpServer);

    const attachMock = (ioServer as unknown as Record<string, jest.Mock>)[
      'attach'
    ];
    expect(attachMock).toHaveBeenCalledWith(mockHttpServer);
  });

  it('should do nothing when setHttpServer is called before createIOServer', () => {
    const mockHttpServer = {} as HttpServer;
    expect(() => adapter.setHttpServer(mockHttpServer)).not.toThrow();
  });
});
