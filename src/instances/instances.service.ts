import { Injectable, Logger } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';
import { cpSync, existsSync, mkdirSync, rmSync } from 'fs';
import { join, dirname, basename, resolve } from 'path';
import { randomBytes } from 'crypto';
import { readJsonFile, writeJsonFile } from '../common/json-store';
import { InstanceItem, InstancesState } from '../common/types';
import { PathsService } from '../config/paths.service';
import { FccConfigService } from '../config/fcc-config.service';
import { AuditLogService } from '../maintenance/audit-log.service';
import {
  INSTANCE_ALL,
  taskTargetInstanceIds,
} from '../maintenance/maintenance-time.util';
import {
  ensureServerSettingsOptionsFromWebPanel,
  nowStamp,
} from '../ops/ops-utils';
import { hasFactorioExecutable } from '../ops/path-manager';
import { initializeInstanceServerFiles } from './instance-server-init';
import type { OpResult } from '../ops/ops-utils';

export interface InstanceRemoveOptions {
  deleteFromDisk?: boolean;
  deleteData?: boolean;
}

export type InstanceOpResult = OpResult & {
  ok: boolean;
  item?: InstanceItem;
  error?: string;
  errorArgs?: (string | number)[];
};

@Injectable()
export class InstancesService {
  private readonly log = new Logger(InstancesService.name);
  private readonly instanceContext = new AsyncLocalStorage<string>();

  constructor(
    private readonly paths: PathsService,
    private readonly config: FccConfigService,
    private readonly auditLog: AuditLogService,
  ) {}

  load(): InstancesState {
    const fallback: InstancesState = { version: 1, items: [], selectedId: '' };
    const data = readJsonFile<InstancesState>(
      this.paths.instancesPath,
      fallback,
    );
    if (!Array.isArray(data.items)) data.items = [];
    return data;
  }

  save(state: InstancesState): void {
    writeJsonFile(this.paths.instancesPath, state);
  }

  getSelectedId(): string {
    const ctx = this.instanceContext.getStore();
    if (ctx) return ctx;
    return String(this.load().selectedId || '').trim();
  }

  getSelected(): InstanceItem | undefined {
    const id = this.getSelectedId();
    if (!id) return undefined;
    return this.getById(id);
  }

  getById(id: string): InstanceItem | undefined {
    return this.load().items.find((i) => i.id === id);
  }

  list(): InstancesState & { ok: true } {
    const st = this.load();
    return { ok: true, ...st };
  }

  select(id: string): { ok: boolean; error?: string } {
    const st = this.load();
    if (!st.items.some((i) => i.id === id))
      return { ok: false, error: 'not_found' };
    st.selectedId = id;
    this.save(st);
    return { ok: true };
  }

  findExistingByServerPath(
    serverPath: string,
    excludeId?: string,
  ): InstanceItem | undefined {
    const key = this.serverPathKey(serverPath);
    if (!key) return undefined;
    const skipId = String(excludeId || '').trim();
    return this.load().items.find((it) => {
      if (skipId && it.id === skipId) return false;
      return this.serverPathKey(it.serverPath) === key;
    });
  }

  private serverPathKey(serverPath: string): string {
    const raw = String(serverPath || '').trim();
    if (!raw) return '';
    const resolved = resolve(raw);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  }

  add(
    body: Partial<InstanceItem> & { autoFixPortsOnConflict?: boolean },
  ): InstanceOpResult {
    const st = this.load();
    const serverPathRaw = String(body.serverPath || '').trim();
    const serverPath = serverPathRaw ? resolve(serverPathRaw) : '';
    const autoFixPortsOnConflict = body.autoFixPortsOnConflict === true;
    if (!serverPath || !existsSync(serverPath))
      return { ok: false, error: 'invalid_server_path' };
    if (!hasFactorioExecutable(serverPath))
      return { ok: false, error: 'instance_executable_missing' };
    const existing = this.findExistingByServerPath(serverPath);
    if (existing) {
      return {
        ok: false,
        error: 'instance_path_exists',
        errorArgs: [existing.name],
      };
    }
    const id = randomBytes(8).toString('hex');
    const item: InstanceItem = {
      id,
      name: String(body.name || `Server ${st.items.length + 1}`).trim(),
      serverPath,
      ip: String(body.ip || '0.0.0.0'),
      port: String(body.port || '34197'),
      rconPort: Number(body.rconPort) || 27015,
      rconPassword: String(
        body.rconPassword || randomBytes(12).toString('base64url'),
      ),
      autostartServer: !!body.autostartServer,
      autoEnterPanel: !!body.autoEnterPanel,
      launchSave: String(body.launchSave || 'latest'),
      maintenanceLock: false,
      blockUpdates: !!body.blockUpdates,
      experimentalUpdates: !!body.experimentalUpdates,
    };
    if (this.config.webPanel.require_unique_instance_game_ports) {
      const port = item.port;
      if (st.items.some((x) => x.port === port)) {
        if (!autoFixPortsOnConflict) return { ok: false, error: 'port_in_use' };
        const used = this.collectUsedInstancePorts(st.items);
        const requestedGame =
          parseInt(String(item.port || '34197').trim(), 10) || 34197;
        const requestedRcon = Number(item.rconPort) || 27015;
        item.port = String(this.pickFreePort(requestedGame + 1, used.game));
        item.rconPort = this.pickFreePort(requestedRcon + 1, used.rcon);
      }
    }
    this.initializeServerFilesIfNeeded(serverPath);
    st.items.push(item);
    if (!st.selectedId) st.selectedId = id;
    this.save(st);
    return { ok: true, item };
  }

  private initializeServerFilesIfNeeded(serverPath: string): void {
    const init = initializeInstanceServerFiles(
      serverPath,
      ensureServerSettingsOptionsFromWebPanel(this.config.webPanel),
      'if_needed',
    );
    if (init.serverSettings.attempted && !init.serverSettings.ok) {
      this.log.warn(
        `Instance server settings init failed (${serverPath}): ${init.serverSettings.error || 'unknown'}`,
      );
    }
    if (init.mods.attempted && !init.mods.ok) {
      this.log.warn(
        `Instance mods init failed (${serverPath}): ${init.mods.error || 'unknown'}`,
      );
    }
  }

  update(id: string, patch: Partial<InstanceItem>): InstanceOpResult {
    const st = this.load();
    const item = st.items.find((i) => i.id === id);
    if (!item) return { ok: false, error: 'not_found' };
    if (patch.serverPath !== undefined) {
      const serverPathRaw = String(patch.serverPath || '').trim();
      const serverPath = serverPathRaw ? resolve(serverPathRaw) : '';
      if (!serverPath || !existsSync(serverPath))
        return { ok: false, error: 'invalid_server_path' };
      const existing = this.findExistingByServerPath(serverPath, id);
      if (existing) {
        return {
          ok: false,
          error: 'instance_path_exists',
          errorArgs: [existing.name],
        };
      }
      patch = { ...patch, serverPath };
    }
    Object.assign(item, patch, { id });
    this.save(st);
    return { ok: true };
  }

  remove(
    id: string,
    opts: boolean | InstanceRemoveOptions = false,
  ): { ok: boolean; error?: string } {
    const options: InstanceRemoveOptions =
      typeof opts === 'boolean' ? { deleteFromDisk: opts } : opts || {};
    const deleteFromDisk = !!options.deleteFromDisk;
    const deleteData = !!options.deleteData;

    const st = this.load();
    const item = st.items.find((i) => i.id === id);
    if (!item) return { ok: false, error: 'not_found' };
    st.items = st.items.filter((i) => i.id !== id);
    if (st.selectedId === id) st.selectedId = st.items[0]?.id || '';
    this.save(st);

    if (deleteData) {
      try {
        this.purgeInstanceData(id);
      } catch {
        return { ok: false, error: 'delete_failed' };
      }
    }
    if (deleteFromDisk && existsSync(item.serverPath)) {
      try {
        rmSync(item.serverPath, { recursive: true, force: true });
      } catch {
        return { ok: false, error: 'delete_failed' };
      }
    }
    return { ok: true };
  }

  private purgeInstanceData(instanceId: string): void {
    const iid = String(instanceId || '').trim();
    if (!iid) return;

    this.auditLog.purgeInstance(iid);

    const annPath = this.paths.announcementsPath(iid);
    if (existsSync(annPath)) rmSync(annPath, { force: true });

    const logDir = dirname(this.paths.instanceLogPath(iid));
    if (existsSync(logDir)) rmSync(logDir, { recursive: true, force: true });

    const pending = readJsonFile<Record<string, unknown>>(
      this.paths.maintenancePendingPath,
      {},
    );
    if (pending[iid]) {
      delete pending[iid];
      writeJsonFile(this.paths.maintenancePendingPath, pending);
    }

    this.stripInstanceFromMaintenanceTasks(iid);
  }

  private stripInstanceFromMaintenanceTasks(instanceId: string): void {
    const doc = readJsonFile<{
      tasks?: Record<string, unknown>[];
      scheduler_tz?: string;
    }>(this.paths.maintenancePath, { tasks: [] });
    let changed = false;
    const tasks = (doc.tasks || []).map((raw) => {
      if (!raw || typeof raw !== 'object') return raw;
      const td = { ...raw };
      const targets = taskTargetInstanceIds(td);
      if (!targets.length || targets[0] === INSTANCE_ALL) return td;
      if (!targets.includes(instanceId)) return td;
      const filtered = targets.filter((x) => x !== instanceId);
      changed = true;
      td.active = false;
      td.instance_ids = filtered;
      delete td.instance_id;
      return td;
    });
    if (changed) writeJsonFile(this.paths.maintenancePath, { ...doc, tasks });
  }

  private pickFreePort(preferred: number, used: Set<number>): number {
    let p = Number(preferred);
    if (!Number.isInteger(p) || p < 1 || p > 65535) p = 1;
    for (let cur = p; cur <= 65535; cur += 1) {
      if (!used.has(cur)) return cur;
    }
    for (let cur = 1024; cur < p; cur += 1) {
      if (!used.has(cur)) return cur;
    }
    return p;
  }

  private collectUsedInstancePorts(items: InstanceItem[]): {
    game: Set<number>;
    rcon: Set<number>;
  } {
    const game = new Set<number>();
    const rcon = new Set<number>();
    for (const it of items) {
      const gp = parseInt(String(it.port || '').trim(), 10);
      if (Number.isFinite(gp) && gp >= 1 && gp <= 65535) game.add(gp);
      const rp = Number(it.rconPort);
      if (Number.isFinite(rp) && rp >= 1 && rp <= 65535) rcon.add(rp);
    }
    return { game, rcon };
  }

  private resolveClonePorts(src: InstanceItem): {
    port: string;
    rconPort: number;
  } {
    const srcGame = parseInt(String(src.port || '34197').trim(), 10);
    const srcRcon = Number(src.rconPort) || 27015;
    const baseGame = Number.isFinite(srcGame) ? srcGame : 34197;

    if (!this.config.webPanel.require_unique_instance_game_ports) {
      return { port: String(baseGame), rconPort: srcRcon };
    }

    const { game: usedGame, rcon: usedRcon } = this.collectUsedInstancePorts(
      this.load().items,
    );
    return {
      port: String(this.pickFreePort(baseGame + 1, usedGame)),
      rconPort: this.pickFreePort(srcRcon + 1, usedRcon),
    };
  }

  clone(
    id: string,
    name?: string,
  ): { ok: boolean; item?: InstanceItem; error?: string } {
    const src = this.getById(id);
    if (!src) return { ok: false, error: 'not_found' };
    const srcFolder =
      basename(src.serverPath).replace(/[.\s]+$/g, '') || 'server';
    const destPath = join(
      dirname(src.serverPath),
      `${srcFolder}-clone-${nowStamp()}`,
    );
    try {
      cpSync(src.serverPath, destPath, { recursive: true });
    } catch {
      return { ok: false, error: 'clone_failed' };
    }
    const ports = this.resolveClonePorts(src);
    return this.add({
      name: name || `${src.name} clone`,
      serverPath: destPath,
      ip: src.ip,
      port: ports.port,
      rconPort: ports.rconPort,
      rconPassword: randomBytes(12).toString('base64url'),
      launchSave: src.launchSave,
      experimentalUpdates: !!src.experimentalUpdates,
    });
  }

  async withInstance<T>(
    instanceId: string | undefined,
    fn: () => Promise<T> | T,
  ): Promise<T> {
    const iid = String(instanceId || '').trim();
    if (iid && !this.getById(iid)) throw new Error('instance_select_failed');
    if (!iid) return fn();
    return this.instanceContext.run(iid, () => fn());
  }
}
