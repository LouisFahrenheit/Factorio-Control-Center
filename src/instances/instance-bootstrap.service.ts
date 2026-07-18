import { Injectable, Logger } from '@nestjs/common';
import {
  closeSync,
  createWriteStream,
  existsSync,
  mkdirSync,
  openSync,
  readSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { FccConfigService } from '../config/fcc-config.service';
import { FactorioUpdateService } from '../ops/factorio-update/factorio-update.service';
import { ensureServerSettingsOptionsFromWebPanel } from '../ops/ops-utils';
import { markServerCreated } from '../ops/instance-server-data';
import { initializeInstanceServerFiles } from './instance-server-init';
import { InstancesService } from './instances.service';

const execFileAsync = promisify(execFile);

interface BootstrapState {
  running: boolean;
  phase: string;
  download_cur: number;
  download_tot: number;
  target_path: string;
  error: string;
  error_args: unknown[];
  server_path: string;
  added_id: string;
  finished_at: number;
  stop_requested: boolean;
}

interface BootstrapAddPayload {
  name?: string;
  ip?: string;
  port?: string;
  rconPort?: number;
  rconPassword?: string;
  autostartServer?: boolean;
  autoEnterPanel?: boolean;
  blockUpdates?: boolean;
  experimentalUpdates?: boolean;
}

@Injectable()
export class InstanceBootstrapService {
  private readonly log = new Logger(InstanceBootstrapService.name);
  private thread: Promise<void> | null = null;
  private state: BootstrapState = this.idleState();

  constructor(
    private readonly config: FccConfigService,
    private readonly factorioUpdate: FactorioUpdateService,
    private readonly instances: InstancesService,
  ) {}

  start(kwargs: Record<string, unknown>): Record<string, unknown> {
    const targetPath = String(kwargs.serverPath || '').trim();
    if (!targetPath) return { ok: false, error: 'instance_path_required' };
    if (this.state.running)
      return { ok: false, error: 'instance_bootstrap_busy' };
    const duplicate = this.instances.findExistingByServerPath(targetPath);
    if (duplicate) {
      return {
        ok: false,
        error: 'instance_path_exists',
        errorArgs: [duplicate.name],
      };
    }

    const packageBuild = kwargs.packageBuild;
    const packageVersion = kwargs.packageVersion;
    const showExperimental =
      kwargs.showExperimental === true || kwargs.showExperimental === 'true';
    const addPayload: BootstrapAddPayload = {
      name: String(kwargs.name || '').trim() || undefined,
      ip: String(kwargs.ip || '').trim() || undefined,
      port: String(kwargs.port || '').trim() || undefined,
      rconPort: Number(kwargs.rconPort) || undefined,
      rconPassword: String(kwargs.rconPassword || '').trim() || undefined,
      autostartServer: !!kwargs.autostartServer,
      autoEnterPanel: !!kwargs.autoEnterPanel,
      blockUpdates: !!kwargs.blockUpdates,
      experimentalUpdates: !!kwargs.experimentalUpdates,
    };
    this.state = {
      ...this.idleState(),
      running: true,
      phase: 'prepare',
      target_path: targetPath,
      stop_requested: false,
    };
    this.thread = this.runWorker(
      targetPath,
      packageBuild,
      packageVersion,
      showExperimental,
      addPayload,
    ).finally(() => {
      this.thread = null;
    });
    return { ok: true, started: true };
  }

  status(): Record<string, unknown> {
    return { ok: true, ...this.state };
  }

  stop(): Record<string, unknown> {
    if (!this.state.running)
      return { ok: false, error: 'instance_bootstrap_not_running' };
    this.state.stop_requested = true;
    return { ok: true };
  }

  private cancelCheck(): void {
    if (this.state.stop_requested) throw new Error('cancelled');
  }

  private idleState(): BootstrapState {
    return {
      running: false,
      phase: 'idle',
      download_cur: 0,
      download_tot: 0,
      target_path: '',
      error: '',
      error_args: [],
      server_path: '',
      added_id: '',
      finished_at: 0,
      stop_requested: false,
    };
  }

  private set(partial: Partial<BootstrapState>): void {
    Object.assign(this.state, partial);
  }

  private async runWorker(
    targetPath: string,
    packageBuild: unknown,
    packageVersion: unknown,
    showExperimental: boolean,
    addPayload: BootstrapAddPayload,
  ): Promise<void> {
    try {
      await this.downloadAndExtract(
        targetPath,
        packageBuild,
        packageVersion,
        showExperimental,
      );
      this.initializeDownloadedServer(
        String(this.state.server_path || targetPath || '').trim(),
      );
      this.tryAutoAddInstance(targetPath, addPayload);
      this.set({
        running: false,
        phase: 'done',
        finished_at: Date.now() / 1000,
      });
    } catch (e) {
      const err = e as Error & { errorArgs?: unknown[] };
      const msg = err instanceof Error ? err.message : String(e);
      if (msg === 'cancelled') {
        this.log.warn('Instance bootstrap cancelled by user');
        this.set({
          running: false,
          phase: 'cancelled',
          error: '',
          error_args: [],
          finished_at: Date.now() / 1000,
        });
        return;
      }
      this.log.warn(`Instance bootstrap failed: ${msg}`);
      this.set({
        running: false,
        phase: 'error',
        error: msg || 'instance_template_download_failed',
        error_args: Array.isArray(err.errorArgs) ? err.errorArgs : [],
        finished_at: Date.now() / 1000,
      });
    }
  }

  private resolveCredentials(): { user: string; token: string } | null {
    const wp = this.config.webPanel;
    const user = String(wp.global_username || '').trim();
    const token = String(wp.global_token || '').trim();
    if (!user || !token) return null;
    return { user, token };
  }

  private normalizeBuild(raw: unknown): string {
    if (process.platform === 'linux') return 'headless';
    const val =
      String(raw || '')
        .trim()
        .toLowerCase() || 'alpha';
    if (val === 'headless')
      throw new Error('instance_template_headless_windows');
    if (['alpha', 'expansion', 'demo'].includes(val)) return val;
    throw new Error('instance_template_invalid_build');
  }

  private normalizeVersion(raw: unknown): string {
    const val = String(raw || '')
      .trim()
      .toLowerCase();
    if (!val || val === 'latest') return 'latest';
    if (/^\d+(?:\.\d+){1,3}$/.test(val)) return val;
    throw new Error('instance_template_invalid_version');
  }

  private async resolveDownloadVersion(
    raw: unknown,
    showExperimental: boolean,
  ): Promise<string> {
    const val = this.normalizeVersion(raw);
    if (val !== 'latest') return val;
    if (showExperimental) return 'latest';

    const rel = await this.factorioUpdate.releases();
    const releases = rel.releases as
      | { stable?: string[]; experimental?: string[] }
      | undefined;
    const stable = Array.isArray(releases?.stable) ? releases.stable : [];
    if (stable.length) return stable[0];

    this.log.warn(
      'No stable releases found; falling back to Factorio "latest" download URL',
    );
    return 'latest';
  }

  private async downloadAndExtract(
    targetPath: string,
    packageBuild: unknown,
    packageVersion: unknown,
    showExperimental: boolean,
  ): Promise<void> {
    const creds = this.resolveCredentials();
    if (!creds) throw new Error('about_factorio_update_no_credentials');

    const build = this.normalizeBuild(packageBuild);
    const version = await this.resolveDownloadVersion(
      packageVersion,
      showExperimental,
    );
    const distro = process.platform === 'win32' ? 'win64-manual' : 'linux64';
    const qs = new URLSearchParams({
      username: creds.user,
      token: creds.token,
    });
    const url = `https://www.factorio.com/get-download/${encodeURIComponent(version)}/${encodeURIComponent(build)}/${distro}?${qs}`;

    const target = resolve(targetPath);
    mkdirSync(target, { recursive: true });
    if (readdirSync(target).length > 0)
      throw new Error('instance_path_not_empty');

    const tmpFile = join(tmpdir(), `fcc_bootstrap_${Date.now()}.pkg`);
    try {
      this.set({ phase: 'download', download_cur: 0, download_tot: 0 });
      await this.downloadWithResume(url, tmpFile, (done, total) => {
        this.set({ download_cur: done, download_tot: total });
      });

      this.cancelCheck();
      this.set({ phase: 'extract' });
      await this.extractArchive(tmpFile, target);

      this.set({ phase: 'verify' });
      let detected = this.detectServerRoot(target);
      if (!detected) throw new Error('instance_template_invalid');
      detected = this.flattenExtractedRoot(target, detected);
      markServerCreated(detected);
      this.set({ server_path: detected });
    } finally {
      try {
        rmSync(tmpFile, { force: true });
      } catch {
        /* ignore */
      }
    }
  }

  private isZipFile(path: string): boolean {
    const fd = openSync(path, 'r');
    try {
      const buf = Buffer.alloc(4);
      readSync(fd, buf, 0, 4, 0);
      return buf[0] === 0x50 && buf[1] === 0x4b;
    } catch {
      return false;
    } finally {
      closeSync(fd);
    }
  }

  /**
   * Do not use adm-zip for Factorio server packages (~4–5 GB): Node Buffer max is ~2 GiB.
   * Use tar (streams to disk; zip is supported on Windows 10+ and Linux).
   */
  private async extractArchive(
    archivePath: string,
    targetDir: string,
  ): Promise<void> {
    const root = resolve(targetDir);
    const isZip = this.isZipFile(archivePath);
    if (!isZip && process.platform === 'win32') {
      throw new Error('instance_template_extract_failed');
    }
    try {
      await execFileAsync('tar', ['-xf', archivePath, '-C', root], {
        timeout: 1_800_000,
        windowsHide: true,
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch (e) {
      if (isZip && process.platform === 'win32') {
        await this.extractZipPowerShell(archivePath, root);
        return;
      }
      throw e instanceof Error ? e : new Error(String(e));
    }
  }

  private async extractZipPowerShell(
    archivePath: string,
    targetDir: string,
  ): Promise<void> {
    const ap = archivePath.replace(/'/g, "''");
    const td = targetDir.replace(/'/g, "''");
    const cmd = `Expand-Archive -LiteralPath '${ap}' -DestinationPath '${td}' -Force`;
    await execFileAsync('powershell.exe', ['-NoProfile', '-Command', cmd], {
      timeout: 1_800_000,
      windowsHide: true,
      maxBuffer: 64 * 1024 * 1024,
    });
  }

  private detectServerRoot(path: string): string | null {
    const root = resolve(path);
    if (this.isValidServerPath(root)) return root;
    let children: string[] = [];
    try {
      children = readdirSync(root, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => join(root, d.name));
    } catch {
      return null;
    }
    const matches = children.filter((c) => this.isValidServerPath(c));
    return matches.length === 1 ? resolve(matches[0]) : null;
  }

  private isValidServerPath(path: string): boolean {
    return existsSync(join(path, 'data', 'base', 'info.json'));
  }

  private flattenExtractedRoot(
    targetDir: string,
    detectedRoot: string,
  ): string {
    const target = resolve(targetDir);
    const detected = resolve(detectedRoot);
    if (detected === target) return detected;
    if (resolve(detected, '..') !== target) return detected;
    try {
      const entries = readdirSync(target);
      if (entries.length !== 1 || resolve(target, entries[0]) !== detected)
        return detected;
      for (const name of readdirSync(detected)) {
        const dst = join(target, name);
        if (existsSync(dst)) return detected;
        require('fs').renameSync(join(detected, name), dst);
      }
      require('fs').rmdirSync(detected);
      return target;
    } catch {
      return detected;
    }
  }

  /** One-time init after Factorio package download (always reset settings + mods). */
  private initializeDownloadedServer(serverPath: string): void {
    if (!serverPath) return;
    const init = initializeInstanceServerFiles(
      serverPath,
      ensureServerSettingsOptionsFromWebPanel(this.config.webPanel),
      'bootstrap',
    );
    if (init.serverSettings.attempted && !init.serverSettings.ok) {
      this.log.warn(
        `Post-bootstrap server settings init failed (${serverPath}): ${init.serverSettings.error || 'unknown'}`,
      );
    }
    if (init.mods.attempted && !init.mods.ok) {
      this.log.warn(
        `Post-bootstrap mods init failed (${serverPath}): ${init.mods.error || 'unknown'}`,
      );
    }
  }

  private async downloadWithResume(
    url: string,
    destFile: string,
    progress: (done: number, total: number) => void,
  ): Promise<void> {
    const ua = 'FactorioControlCenter/2.0';
    let expectedTotal = 0;
    for (let attempt = 1; attempt <= 4; attempt++) {
      const ac = new AbortController();
      try {
        this.cancelCheck();
        let existing = 0;
        try {
          existing = existsSync(destFile) ? statSync(destFile).size : 0;
        } catch {
          existing = 0;
        }

        const headers: Record<string, string> = { 'User-Agent': ua };
        if (existing > 0) headers.Range = `bytes=${existing}-`;

        const res = await fetch(url, {
          headers,
          redirect: 'follow',
          signal: ac.signal,
        });
        const code = res.status;
        if (code === 429)
          throw new Error('instance_template_download_http_429');
        if (code >= 500) throw new Error('instance_template_download_http_5xx');
        if (!res.ok && code !== 206) {
          throw new Error(`instance_template_download_http_${code}`);
        }

        const lenHdr = res.headers.get('content-length');
        const contentLen = lenHdr ? parseInt(lenHdr, 10) : 0;
        let mode: 'append' | 'write' = 'write';
        if (existing > 0 && code === 206) {
          mode = 'append';
          if (contentLen > 0)
            expectedTotal = Math.max(expectedTotal, existing + contentLen);
        } else {
          existing = 0;
          if (contentLen > 0)
            expectedTotal = Math.max(expectedTotal, contentLen);
        }

        let done = existing;
        progress(done, expectedTotal);

        const body = res.body;
        if (!body) throw new Error('instance_template_download_failed');
        const stream = createWriteStream(destFile, {
          flags: mode === 'append' ? 'a' : 'w',
        });
        const reader = body.getReader();
        try {
          while (true) {
            if (this.state.stop_requested) {
              ac.abort();
              await reader.cancel().catch(() => undefined);
              throw new Error('cancelled');
            }
            const { value, done: eof } = await reader.read();
            if (eof) break;
            if (!value?.length) continue;
            stream.write(Buffer.from(value));
            done += value.length;
            progress(done, expectedTotal);
          }
        } catch (e) {
          stream.destroy();
          try {
            rmSync(destFile, { force: true });
          } catch {
            /* ignore */
          }
          if (
            this.state.stop_requested ||
            (e instanceof Error && e.message === 'cancelled')
          ) {
            throw new Error('cancelled');
          }
          throw e;
        }
        await new Promise<void>((resolve, reject) => {
          stream.end(() => resolve());
          stream.on('error', reject);
        });

        const finalSize = existsSync(destFile) ? statSync(destFile).size : 0;
        if (expectedTotal > 0 && finalSize < expectedTotal) {
          throw new Error('instance_template_download_incomplete');
        }
        progress(finalSize, expectedTotal || finalSize);
        return;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg === 'cancelled') throw e;
        if (attempt >= 4 || !this.isTransientDownloadError(e)) throw e;
        await new Promise((r) => setTimeout(r, Math.min(6000, 1500 * attempt)));
      }
    }
    throw new Error('instance_template_download_failed');
  }

  private isTransientDownloadError(e: unknown): boolean {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      [
        'instance_template_download_incomplete',
        'instance_template_download_http_5xx',
        'instance_template_download_http_429',
      ].includes(msg)
    ) {
      return true;
    }
    const low = msg.toLowerCase();
    return (
      low.includes('timed out') ||
      low.includes('fetch failed') ||
      low.includes('econnreset') ||
      low.includes('aborted')
    );
  }

  private tryAutoAddInstance(
    targetPath: string,
    addPayload: BootstrapAddPayload,
  ): void {
    const serverPath = String(
      this.state.server_path || targetPath || '',
    ).trim();
    if (!serverPath) return;
    const add = this.instances.add({
      name: addPayload.name,
      serverPath,
      ip: addPayload.ip,
      port: addPayload.port,
      rconPort: addPayload.rconPort,
      rconPassword: addPayload.rconPassword,
      autostartServer: addPayload.autostartServer,
      autoEnterPanel: addPayload.autoEnterPanel,
      blockUpdates: addPayload.blockUpdates,
      experimentalUpdates: addPayload.experimentalUpdates,
      autoFixPortsOnConflict: true,
    });
    if (add.ok && add.item?.id) {
      this.set({ added_id: String(add.item.id) });
      return;
    }
    if (!add.ok) {
      const args = Array.isArray(add.errorArgs) ? add.errorArgs : [];
      if (add.error === 'instance_path_exists') {
        const err = new Error('instance_path_exists') as Error & {
          errorArgs?: unknown[];
        };
        err.errorArgs = args;
        throw err;
      }
      this.log.warn(
        `Instance auto-register failed after bootstrap: ${String(add.error || 'unknown')}`,
      );
    }
  }
}
