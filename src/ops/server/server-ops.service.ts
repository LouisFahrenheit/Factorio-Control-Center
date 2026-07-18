import { Injectable } from '@nestjs/common';
import { existsSync, renameSync } from 'fs';
import { join } from 'path';
import { InstancesService } from '../../instances/instances.service';
import { RuntimeService } from '../runtime.service';
import {
  OpResult,
  gameVersion,
  hasSpaceAge,
  isErrorResult,
  factorioCreateStagingZipName,
  normalizeSaveZipName,
  readableSaveStamp,
  readServerSettingsNetworkFlags,
  selectedInstance,
  tailFile,
  readLogFile,
  LOG_HISTORY_DEFAULT_TAIL,
} from '../ops-utils';
import {
  logShowsModLoadFailure,
  parseMissingStartupDependencies,
  filterInstallableMissingDeps,
} from '../mod-deps';
import { readJsonFile } from '../../common/json-store';
import { sanitizeStdinLine } from '../../common/ban-sanitize';
import { PathsService } from '../../config/paths.service';
import { LogRotationService } from '../../logging/log-rotation.service';
import { LIVE_LOG_RING_MAX } from '../../shared/factorio-log-timestamps';
import {
  MapGenOpsService,
  type CreateSaveOptions,
} from '../map-gen/map-gen-ops.service';
import {
  prepareMapGenSettings,
  prepareMapSettings,
} from '../map-gen/map-gen-defaults';
import { execFactorio } from '../factorio-exec';
import { ModsJobService } from '../mods/mods-job.service';

const RESTART_STOP_WAIT_MS = 240_000;
const RESTART_KILL_WAIT_MS = 35_000;

@Injectable()
export class ServerOpsService {
  constructor(
    private readonly instances: InstancesService,
    private readonly runtime: RuntimeService,
    private readonly paths: PathsService,
    private readonly mapGen: MapGenOpsService,
    private readonly logRotation: LogRotationService,
    private readonly modJobs: ModsJobService,
  ) {}

  status(): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const net = readServerSettingsNetworkFlags(sel.item.serverPath);
    const rt = this.runtime.get(sel.item.id);
    const serverHasSpaceAge = hasSpaceAge(sel.item.serverPath);
    const missingStartupDependencies = this.resolveMissingStartupDependencies(
      sel.item.id,
      sel.item.serverPath,
      rt,
      serverHasSpaceAge,
    );
    const pendingManual = this.hasPendingManualResume(sel.item.id);
    if (rt) {
      const running = !!rt.proc && rt.proc.exitCode === null;
      let statusKind = running
        ? rt.stopping
          ? 'stopping'
          : rt.inGame
            ? 'running'
            : 'starting'
        : rt.lastStartFailed
          ? 'error'
          : sel.item.maintenanceLock
            ? 'maintenance'
            : 'stopped';
      if (
        sel.item.maintenanceLock &&
        !['running', 'starting', 'stopping'].includes(statusKind)
      ) {
        statusKind = 'maintenance';
      } else if (
        pendingManual &&
        !['running', 'starting', 'stopping'].includes(statusKind)
      ) {
        statusKind = 'maintenance_manual';
      }
      return {
        ok: true,
        server_running: running && rt.inGame,
        server_starting: running && !rt.inGame && !rt.stopping,
        server_stopping: running && rt.stopping,
        process_state: running ? 'running' : 'not_running',
        status_kind: statusKind,
        maintenance_manual_pending: pendingManual,
        mod_job_running: this.modJobs.isRunningForInstance(sel.item.id),
        last_start_failed: rt.lastStartFailed,
        last_exit_code: rt.lastExitCode,
        missing_startup_dependencies: missingStartupDependencies,
        game_bind: rt.bind,
        uptime_seconds:
          running && rt.inGame
            ? Math.max(0, Math.floor(Date.now() / 1000 - rt.startedAt))
            : null,
        online_players: Object.entries(rt.onlinePlayers).map(
          ([name, since]) => ({ name, since }),
        ),
        factorio_root: rt.serverPath,
        game_version: rt.gameVersion,
        ...net,
      };
    }
    const logFailed = missingStartupDependencies.length > 0;
    let statusKind = logFailed
      ? 'error'
      : sel.item.maintenanceLock
        ? 'maintenance'
        : 'stopped';
    if (sel.item.maintenanceLock && statusKind !== 'error')
      statusKind = 'maintenance';
    else if (
      pendingManual &&
      !['running', 'starting', 'stopping'].includes(statusKind)
    )
      statusKind = 'maintenance_manual';
    return {
      ok: true,
      server_running: false,
      server_starting: false,
      server_stopping: false,
      process_state: 'not_running',
      status_kind: statusKind,
      maintenance_manual_pending: pendingManual,
      mod_job_running: this.modJobs.isRunningForInstance(sel.item.id),
      last_start_failed: logFailed,
      last_exit_code: 0,
      missing_startup_dependencies: missingStartupDependencies,
      game_bind: `0.0.0.0:${sel.item.port || '34197'}`,
      uptime_seconds: null,
      online_players: [],
      factorio_root: sel.item.serverPath,
      game_version: gameVersion(sel.item.serverPath),
      ...net,
    };
  }

  private hasPendingManualResume(instanceId: string): boolean {
    const data = readJsonFile<Record<string, unknown>>(
      this.paths.maintenancePendingPath,
      {},
    );
    const ent = data[instanceId];
    if (typeof ent === 'string') return !!ent.trim();
    if (ent && typeof ent === 'object' && !Array.isArray(ent)) {
      return !!String((ent as { run_id?: string }).run_id || '').trim();
    }
    return false;
  }

  private resolveMissingStartupDependencies(
    instanceId: string,
    _serverPath: string,
    rt: ReturnType<RuntimeService['get']>,
    serverHasSpaceAge: boolean,
  ): string[] {
    if (rt) {
      if (!rt.lastStartFailed) return [];
      if (rt.missingStartupDependencies.length) {
        return filterInstallableMissingDeps(rt.missingStartupDependencies);
      }
      return filterInstallableMissingDeps(
        parseMissingStartupDependencies(rt.sessionRawLines, serverHasSpaceAge),
      );
    }

    // Nest restarted: inspect only the latest launch in the persisted log file.
    const logPath = this.paths.instanceLogPath(instanceId);
    const tail = tailFile(logPath, 5000);
    if (!logShowsModLoadFailure(tail.lines)) return [];
    return filterInstallableMissingDeps(
      parseMissingStartupDependencies(tail.lines, serverHasSpaceAge),
    );
  }

  start(): Promise<OpResult> {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return Promise.resolve(sel);
    if (this.modJobs.isRunningForInstance(sel.item.id)) {
      return Promise.resolve({ ok: false, error: 'mod_job_running' });
    }
    if (sel.item.maintenanceLock) {
      this.instances.update(sel.item.id, {
        ...sel.item,
        maintenanceLock: false,
      });
    }
    return this.runtime.start(sel.item);
  }

  stop(): Promise<OpResult> {
    const id = this.instances.getSelectedId();
    if (!id) return Promise.resolve({ ok: false, error: 'instance_not_found' });
    return this.runtime.stop(id);
  }

  async restart(): Promise<OpResult> {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const id = sel.item.id;

    const stopRes = await this.stop();
    if (stopRes.ok === false && stopRes.error !== 'not_running') return stopRes;

    if (this.runtime.isRunning(id)) {
      let stopped = await this.runtime.waitUntilStopped(
        id,
        RESTART_STOP_WAIT_MS,
      );
      if (!stopped) {
        const killRes = this.runtime.kill(id);
        if (killRes.ok) {
          stopped = await this.runtime.waitUntilStopped(
            id,
            RESTART_KILL_WAIT_MS,
          );
        }
      }
      if (!stopped) return { ok: false, error: 'restart_stop_timeout' };
    }

    return this.start();
  }

  kill(): OpResult {
    const id = this.instances.getSelectedId();
    if (!id) return { ok: false, error: 'instance_not_found' };
    return this.runtime.kill(id);
  }

  saveGame(): Promise<OpResult> {
    return this.rconExec('/save').then((r) => (r.ok ? { ok: true } : r));
  }

  backup(): Promise<OpResult> {
    return this.rconExec(`/save backup_${readableSaveStamp()}`).then((r) =>
      r.ok ? { ok: true } : r,
    );
  }

  async createSave(opts: CreateSaveOptions | string): Promise<OpResult> {
    const options: CreateSaveOptions =
      typeof opts === 'string' ? { name: opts, mode: 'default' } : opts;
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const saveName = normalizeSaveZipName(String(options.name || ''));
    if (!saveName) return { ok: false, error: 'invalid_name' };
    const stagingName = factorioCreateStagingZipName(saveName);
    const exe = sel.pm.findFactorioExe();
    if (!exe) return { ok: false, error: 'no_factorio_exe' };
    const finalOut = join(sel.pm.savesDir, saveName);
    if (existsSync(finalOut)) return { ok: false, error: 'exists' };
    const out = join(sel.pm.savesDir, stagingName);
    if (stagingName !== saveName && existsSync(out))
      return { ok: false, error: 'exists' };

    let workDir = '';
    try {
      let resolved;
      try {
        resolved = this.mapGen.resolveCreatePayload(options);
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }

      const serverPath = sel.item.serverPath;
      const seed =
        resolved.seed != null && Number.isFinite(resolved.seed)
          ? Math.floor(resolved.seed)
          : null;
      let mapGen = resolved.mapGen
        ? prepareMapGenSettings(serverPath, resolved.mapGen)
        : null;
      if (seed != null && mapGen) mapGen = { ...mapGen, seed: null };
      const preparedSettings = prepareMapSettings(
        serverPath,
        resolved.mapSettings,
      );

      const args = ['--create', out];
      const prepared = this.mapGen.prepareCreateFiles(
        serverPath,
        mapGen,
        preparedSettings,
        resolved.preset,
      );
      if ('presetOnly' in prepared) {
        if (prepared.presetOnly && prepared.presetOnly !== 'default') {
          args.push('--preset', prepared.presetOnly);
        }
      } else {
        workDir = prepared.workDir;
        args.push(...prepared.args);
      }
      if (seed != null) args.push('--map-gen-seed', String(seed));

      await execFactorio(exe, args, sel.item.serverPath, 300_000);
      if (stagingName !== saveName) {
        try {
          renameSync(out, finalOut);
        } catch {
          return { ok: false, error: 'rename_failed' };
        }
      }
      return { ok: true, name: saveName };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    } finally {
      if (workDir) this.mapGen.cleanupWorkDir(workDir);
    }
  }

  async rconExec(command: string): Promise<OpResult> {
    const id = this.instances.getSelectedId();
    if (!id) return { ok: false, error: 'instance_not_found' };
    return this.runtime.rconExec(id, String(command || ''));
  }

  async chatSendText(message: string): Promise<OpResult> {
    const text = sanitizeStdinLine(String(message || '')).trim();
    if (!text) return { ok: false, error: 'empty_message' };
    if (text.startsWith('/') || text.startsWith('\\'))
      return { ok: false, error: 'commands_not_allowed' };
    const id = this.instances.getSelectedId();
    if (!id) return { ok: false, error: 'instance_not_found' };
    const r = await this.runtime.rconExec(id, text, false);
    return r.ok ? { ok: true } : r;
  }

  logTail(tail = 500, instanceId?: string): OpResult {
    const iid = String(
      instanceId || this.instances.getSelectedId() || '',
    ).trim();
    if (!iid) return { ok: false, error: 'instance_id_required' };
    if (!this.logRotation.logWriteInstanceEnabled()) {
      return { ok: true, lines: [], instance_log_disabled: true };
    }
    const rtLines = this.runtime.logTail(
      iid,
      Math.max(1, Math.min(Number(tail) || 500, LIVE_LOG_RING_MAX)),
    );
    return { ok: true, lines: rtLines };
  }

  logFileHistory(
    tail = LOG_HISTORY_DEFAULT_TAIL,
    instanceId?: string,
    full = false,
  ): OpResult {
    const iid = String(
      instanceId || this.instances.getSelectedId() || '',
    ).trim();
    if (!iid) return { ok: false, error: 'instance_id_required' };
    if (!this.instances.getById(iid))
      return { ok: false, error: 'unknown_instance' };
    const path = this.paths.instanceLogPath(iid);
    if (!this.logRotation.logWriteInstanceEnabled()) {
      return {
        ok: true,
        lines: [],
        path,
        truncated: false,
        line_capped: false,
        full_loaded: false,
        file_missing: true,
        file_bytes: 0,
        instance_log_disabled: true,
      };
    }
    const tailLimit = Math.max(
      1,
      Math.min(
        Number(tail) || LOG_HISTORY_DEFAULT_TAIL,
        LOG_HISTORY_DEFAULT_TAIL,
      ),
    );
    const res = readLogFile(path, full ? { full: true } : { tail: tailLimit });
    if (res.tooLarge) {
      return {
        ok: false,
        error: 'log_file_too_large',
        path,
        file_bytes: res.fileBytes,
      };
    }
    return {
      ok: true,
      lines: res.lines,
      path,
      truncated: res.truncated,
      line_capped: res.lineCapped,
      full_loaded: full,
      file_missing: res.fileMissing,
      file_bytes: res.fileBytes,
    };
  }

  chatLogTail(tail = 500): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const path = require('path').join(sel.item.serverPath, 'chat_log.txt');
    const res = tailFile(
      path,
      Math.max(1, Math.min(Number(tail) || 500, 10000)),
    );
    return { ok: true, lines: res.lines };
  }
}
