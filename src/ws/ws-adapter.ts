import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplication } from '@nestjs/common';
import type { Server as HttpServer } from 'http';
import type { Server as HttpsServer } from 'https';
import type { ServerOptions } from 'socket.io';

/**
 * Custom Socket.IO adapter that attaches to the existing HTTP/HTTPS server
 * created by WebPanelListenerService, instead of creating its own.
 */
export class FccWsAdapter extends IoAdapter {
  private ioServer: any = null;

  constructor(app: INestApplication) {
    super(app);
  }

  createIOServer(port: number, options?: Partial<ServerOptions>) {
    // Create the Socket.IO server WITHOUT an http server bound yet
    const { Server } = require('socket.io') as typeof import('socket.io');
    this.ioServer = new Server({
      ...options,
      cors: { origin: '*' },
    });
    return this.ioServer;
  }

  setHttpServer(server: HttpServer | HttpsServer): void {
    if (this.ioServer) {
      // Attach Socket.IO to the existing HTTP server now that it's ready
      this.ioServer.attach(server);
    }
  }
}
