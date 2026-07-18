import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { createServer as createHttpServer, Server as HttpServer } from 'http';
import {
  createServer as createHttpsServer,
  Server as HttpsServer,
} from 'https';
import { readFileSync } from 'fs';
import { FccConfigService } from '../config/fcc-config.service';
import { PathsService } from '../config/paths.service';
import { trimHost } from '../common/trim.util';
import {
  captureRuntimeSnapshot,
  customBindPortRequiresElevation,
  resolveBindPort,
  resolveDisplayHost,
  resolveDisplayPort,
  runtimeNeedsRestart,
  type WebPanelRuntimeSnapshot,
} from './web-panel-bind.util';
import { resolveTlsPath, tlsFilesExist } from './tls-path.util';
import { WebPanelLogService } from '../logging/web-panel-log.service';

type ListenerServer = HttpServer | HttpsServer;

@Injectable()
export class WebPanelListenerService implements OnModuleDestroy {
  private readonly log = new Logger(WebPanelListenerService.name);
  private app: INestApplication | null = null;
  private server: ListenerServer | null = null;
  private lastError = '';

  constructor(
    private readonly config: FccConfigService,
    private readonly paths: PathsService,
    private readonly webLog: WebPanelLogService,
  ) {}

  setApp(app: INestApplication): void {
    this.app = app;
  }

  getLastError(): string {
    return this.lastError;
  }

  async onModuleDestroy(): Promise<void> {
    await this.stop();
  }

  async start(): Promise<void> {
    if (!this.app) throw new Error('web_panel_app_not_set');
    await this.stop();

    const wp = this.config.webPanel;
    const host = trimHost(wp.listen_host);
    const port = resolveBindPort(wp);
    const mode = String(wp.port_mode || 'custom')
      .trim()
      .toLowerCase();

    if (customBindPortRequiresElevation(wp, port)) {
      this.lastError = 'web_panel_privileged_port_unix';
      throw new Error(this.lastError);
    }

    const handler = this.app.getHttpAdapter().getInstance();
    let tlsOptions: { cert: Buffer; key: Buffer; passphrase?: string } | null =
      null;

    if (wp.tls_enabled) {
      if (!tlsFilesExist(wp.tls_certfile, wp.tls_keyfile, this.paths.rootDir)) {
        this.lastError = 'web_panel_tls_startup_missing_files';
        throw new Error(this.lastError);
      }
      const certPath = resolveTlsPath(wp.tls_certfile, this.paths.rootDir);
      const keyPath = resolveTlsPath(wp.tls_keyfile, this.paths.rootDir);
      tlsOptions = {
        cert: readFileSync(certPath),
        key: readFileSync(keyPath),
      };
      const pw = String(wp.tls_key_password || '').trim();
      if (pw) tlsOptions.passphrase = pw;
    }

    const server = tlsOptions
      ? createHttpsServer(tlsOptions, handler)
      : createHttpServer(handler);

    await new Promise<void>((resolvePromise, reject) => {
      server.once('error', (err: NodeJS.ErrnoException) => {
        this.lastError =
          err.code === 'EADDRINUSE'
            ? 'web_panel_port_in_use'
            : err.message || 'web_panel_failed_to_start';
        reject(new Error(this.lastError));
      });
      server.listen(port, host, () => resolvePromise());
    });

    this.server = server;
    this.lastError = '';

    const scheme = tlsOptions ? 'https' : 'http';
    const urlHost = resolveDisplayHost(wp);
    const urlPort = resolveDisplayPort(wp, port);
    const started = `Web panel listening on ${scheme}://${urlHost}:${urlPort}/ (bind ${host}:${port}, mode=${mode})`;
    this.log.log(started);
    this.webLog.logEvent('web_panel', started);
  }

  async stop(): Promise<void> {
    const srv = this.server;
    this.server = null;
    if (!srv) return;

    await new Promise<void>((resolvePromise) => {
      srv.close(() => resolvePromise());
    });
    this.webLog.logEvent('web_panel', 'Web panel listener stopped');
  }

  async restartIfNeeded(
    prev: WebPanelRuntimeSnapshot,
  ): Promise<{ ok: boolean; error?: string }> {
    const wp = this.config.webPanel;
    if (!runtimeNeedsRestart(prev, wp)) {
      return { ok: true };
    }
    return this.restart();
  }

  async restart(): Promise<{ ok: boolean; error?: string }> {
    const maxAttempts = 4;
    const waitStepMs = 350;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await this.stop();
        if (attempt > 0) await delay(waitStepMs * (attempt + 1));
        await this.start();
        return { ok: true };
      } catch (e) {
        this.lastError = e instanceof Error ? e.message : String(e);
        if (attempt === maxAttempts - 1) {
          this.webLog.logEvent(
            'web_panel',
            `Web panel restart failed: ${this.lastError}`,
          );
          return {
            ok: false,
            error: this.lastError || 'web_panel_restart_failed',
          };
        }
      }
    }
    return { ok: false, error: this.lastError || 'web_panel_restart_failed' };
  }

  captureSnapshot(): WebPanelRuntimeSnapshot {
    return captureRuntimeSnapshot(this.config.webPanel);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
