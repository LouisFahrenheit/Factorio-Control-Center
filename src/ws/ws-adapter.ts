import { IoAdapter } from '@nestjs/platform-socket.io';
import type { INestApplication } from '@nestjs/common';
import type { Server as HttpServer } from 'http';
import type { Server as HttpsServer } from 'https';
import { Server } from 'socket.io';
import type { ServerOptions } from 'socket.io';
/**
 * Custom Socket.IO adapter that attaches to the existing HTTP/HTTPS server
 * created by WebPanelListenerService, instead of creating its own.
 */
export class FccWsAdapter extends IoAdapter {
  private ioServer: Server | null = null;

  constructor(app: INestApplication) {
    super(app);
  }

  createIOServer(port: number, options?: Partial<ServerOptions>): Server {
    // Create the Socket.IO server WITHOUT an http server bound yet
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
