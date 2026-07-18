import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { spawn, execFile, ChildProcessWithoutNullStreams } from 'child_process';
import { promisify } from 'util';
import { existsSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { randomBytes } from 'crypto';
import { PathManager } from './path-manager';
import { RconService } from './rcon.service';
import { InstanceItem } from '../common/types';
import { PathsService } from '../config/paths.service';
import { InstancesService } from '../instances/instances.service';
import { LogRotationService } from '../logging/log-rotation.service';
import { trimHost } from '../common/trim.util';
import {
  isValidGameBindIp,
  isValidGamePort,
} from '../common/network-validation';
import { FccConfigService } from '../config/fcc-config.service';
import { FirewallService } from './firewall/firewall.service';
import {
  ensureServerSettingsFile,
  ensureServerSettingsOptionsFromWebPanel,
  gameVersion,
  hasSpaceAge,
} from './ops-utils';
import {
  parseMissingStartupDependencies,
  recordMissingStartupDepLine,
} from './mod-deps';
import { InstanceHistoryService } from './instance-history.service';
import { panelLogLineTimestamp, panelTimestamp } from '../common/datetime.util';
import {
  FactorioLogSessionState,
  LIVE_LOG_RING_MAX,
  liveLogTail,
  trimLiveLogRing,
} from '../shared/factorio-log-timestamps';

export interface InstanceRuntime {
  proc: ChildProcessWithoutNullStreams | null;
  startedAt: number;
  bind: string;
  saveName: string;
  serverPath: string;
  logRing: string[];
  sessionRawLines: string[];
  logSession: FactorioLogSessionState;
  logPath: string;
  stopping: boolean;
  inGame: boolean;
  wasEverInGame: boolean;
  onlinePlayers: Record<string, string>;
  rconHost: string;
  rconPort: number;
  rconPassword: string;
  lastExitCode: number;
  lastStartFailed: boolean;
  missingStartupDependencies: string[];
  missingStartupDepsSeen: Set<string>;
  gameVersion: string;
  sawShutdownMarker: boolean;
  sawSaveProgress100: boolean;
  sawRemoteQuit: boolean;
  killRequested: boolean;
  stopWatchdogActive: boolean;
  serverShutdownLogged: boolean;
  shutdownMarkerAt: number;
  shutdownKillScheduled: boolean;
  instanceId: string;
}

const STOP_WATCHDOG_POLL_MS = 500;
const STOP_WATCHDOG_TIMEOUT_SEC = 30;
const STOP_SAVE_FALLBACK_MS = 180_000;
const STOP_MARKER_KILL_DELAY_MS = 2500;
const STOP_WAIT_POLL_MS = 450;

const execFileAsync = promisify(execFile);

const CHAT_LOG_TAG_RE = /\[CHAT\]/i;
const JOIN_RE = /\[JOIN\]\s+([^\s]+)\s+joined the game/i;
const LEAVE_RE = /\[LEAVE\]\s+([^\s]+)\s+left the game/i;
const KICK_RE = /\[KICK\]\s+([^\s]+)\s+was kicked by/i;
const BAN_RE = /\[BAN\]\s+([^\s]+)\s+was banned by/i;
const SAVE_PROGRESS_100_RE = /100%/i;

@Injectable()
export class RuntimeService implements OnModuleDestroy {
  private readonly log = new Logger(RuntimeService.name);
  readonly runtimes = new Map<string, InstanceRuntime>();

  constructor(
    private readonly rcon: RconService,
    private readonly paths: PathsService,
    private readonly instances: InstancesService,
    private readonly logRotation: LogRotationService,
    private readonly config: FccConfigService,
    private readonly firewall: FirewallService,
    private readonly instanceHistory: InstanceHistoryService,
  ) {}

  onModuleDestroy(): void {
    for (const [, rt] of this.runtimes) {
      try {
        rt.proc?.kill('SIGTERM');
      } catch {
        /* ignore */
      }
    }
  }

  get(instanceId: string): InstanceRuntime | undefined {
    return this.runtimes.get(instanceId);
  }

  isRunning(instanceId: string): boolean {
    const rt = this.runtimes.get(instanceId);
    return !!(rt?.proc && rt.proc.exitCode === null);
  }

  async waitUntilStopped(
    instanceId: string,
    timeoutMs: number,
  ): Promise<boolean> {
    const deadline = Date.now() + Math.max(0, timeoutMs);
    while (Date.now() < deadline) {
      if (!this.isRunning(instanceId)) return true;
      await new Promise((r) => setTimeout(r, STOP_WAIT_POLL_MS));
    }
    return !this.isRunning(instanceId);
  }

  async start(item: InstanceItem): Promise<{ ok: boolean; error?: string }> {
    const iid = item.id;
    if (this.isRunning(iid)) return { ok: false, error: 'already_busy' };

    const pm = new PathManager(item.serverPath);
    if (!existsSync(pm.serverSettings)) {
      const ensured = ensureServerSettingsFile(
        item.serverPath,
        ensureServerSettingsOptionsFromWebPanel(this.config.webPanel),
      );
      if (!ensured.ok) return { ok: false, error: 'missing_server_settings' };
    }
    if (!existsSync(pm.serverSettings))
      return { ok: false, error: 'missing_server_settings' };
    if (!existsSync(pm.savesDir)) return { ok: false, error: 'no_saves' };

    let saveName = (item.launchSave || '').trim();
    if (!saveName || saveName === 'latest') saveName = pm.latestSave() || '';
    if (!saveName) return { ok: false, error: 'no_saves' };
    const savePath = joinSafe(pm.savesDir, saveName);
    if (!existsSync(savePath)) return { ok: false, error: 'save_not_found' };

    const exe = pm.findFactorioExe();
    if (!exe) return { ok: false, error: 'no_factorio_exe' };

    const ip = (item.ip || '0.0.0.0').trim();
    const port = String(item.port || '34197').trim();
    if (!isValidGameBindIp(ip)) return { ok: false, error: 'invalid_ip' };
    if (!isValidGamePort(port)) return { ok: false, error: 'invalid_port' };
    const pInt = parseInt(port, 10);

    let rconPassword = (item.rconPassword || '').trim();
    if (!rconPassword) rconPassword = randomBytes(12).toString('base64url');
    const rconPort = item.rconPort || 27015;

    const args = [
      '--start-server',
      savePath,
      '--server-settings',
      pm.serverSettings,
      '--server-adminlist',
      existsSync(pm.adminList) ? pm.adminList : 'server-adminlist.json',
      '--bind',
      `${ip}:${port}`,
      '--rcon-port',
      String(rconPort),
      '--rcon-password',
      rconPassword,
    ];

    const logPath = this.paths.instanceLogPath(iid);
    mkdirSync(dirname(logPath), { recursive: true });

    await this.firewall.tryApplyOnGameStart(exe, pInt);

    let proc: ChildProcessWithoutNullStreams;
    try {
      proc = spawn(exe, args, {
        cwd: item.serverPath,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch (e) {
      return { ok: false, error: String(e) };
    }

    const rt: InstanceRuntime = {
      proc,
      startedAt: Date.now() / 1000,
      bind: `${ip}:${port}`,
      saveName,
      serverPath: item.serverPath,
      logRing: [],
      sessionRawLines: [],
      logSession: new FactorioLogSessionState(),
      logPath,
      stopping: false,
      inGame: false,
      wasEverInGame: false,
      onlinePlayers: {},
      rconHost: '127.0.0.1',
      rconPort,
      rconPassword,
      lastExitCode: 0,
      lastStartFailed: false,
      missingStartupDependencies: [],
      missingStartupDepsSeen: new Set<string>(),
      gameVersion: gameVersion(item.serverPath),
      sawShutdownMarker: false,
      sawSaveProgress100: false,
      sawRemoteQuit: false,
      killRequested: false,
      stopWatchdogActive: false,
      serverShutdownLogged: false,
      shutdownMarkerAt: 0,
      shutdownKillScheduled: false,
      instanceId: iid,
    };
    this.runtimes.set(iid, rt);

    const pump = (chunk: Buffer) => {
      const text = chunk.toString('utf-8');
      for (const line of text.split(/\r?\n/)) {
        if (!line) continue;
        rt.sessionRawLines.push(line);
        this.parseRuntimeLine(rt, line);
        this.appendGameLogLine(rt, rt.logSession.formatLine(line));
      }
    };
    proc.stdout.on('data', pump);
    proc.stderr.on('data', pump);
    proc.on('close', (code) => {
      rt.lastExitCode = code ?? 0;
      const graceful =
        rt.sawShutdownMarker || rt.sawRemoteQuit || rt.killRequested;
      rt.lastStartFailed = !graceful && !rt.wasEverInGame && (code ?? 0) !== 0;
      if (rt.lastStartFailed && !rt.missingStartupDependencies.length) {
        rt.missingStartupDependencies = parseMissingStartupDependencies(
          rt.sessionRawLines,
          hasSpaceAge(rt.serverPath),
        );
      }
      if (rt.lastStartFailed) {
        try {
          this.instanceHistory.recordStartupError(rt.serverPath, {
            exit_code: code ?? 0,
            missing_deps: rt.missingStartupDependencies.slice(),
          });
        } catch {
          /* ignore history failures */
        }
      }
      rt.proc = null;
      rt.inGame = false;
      rt.stopping = false;
      rt.stopWatchdogActive = false;
      this.emitServerShutdownLogOnce(rt);
    });

    return { ok: true };
  }

  private rconEndpoint(instanceId: string): {
    host: string;
    port: number;
    password: string;
  } | null {
    const rt = this.runtimes.get(instanceId);
    if (rt) {
      return {
        host: rt.rconHost,
        port: rt.rconPort,
        password: rt.rconPassword,
      };
    }
    const item = this.instances.getById(instanceId);
    if (!item) return null;
    const password = String(item.rconPassword || '').trim();
    if (!password) return null;
    return {
      host:
        trimHost(item.ip, '127.0.0.1') === '0.0.0.0'
          ? '127.0.0.1'
          : trimHost(item.ip, '127.0.0.1'),
      port: item.rconPort || 27015,
      password,
    };
  }

  async stop(
    instanceId: string,
  ): Promise<{ ok: boolean; error?: string; forced_kill?: boolean }> {
    const rt = this.runtimes.get(instanceId);
    const ep = this.rconEndpoint(instanceId);
    if (!ep) {
      if (!rt?.proc || rt.proc.exitCode !== null)
        return { ok: false, error: 'not_running' };
      return { ok: false, error: 'rcon_password_missing' };
    }

    try {
      await this.rcon.run(ep.host, ep.port, ep.password, '/quit', 25000);
      if (rt) {
        rt.stopping = true;
        rt.inGame = false;
        this.startStopWatchdog(rt);
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `rcon_stop_failed: ${e}` };
    }
  }

  kill(instanceId: string): { ok: boolean; error?: string } {
    const rt = this.runtimes.get(instanceId);
    if (!rt?.proc || rt.proc.exitCode !== null)
      return { ok: false, error: 'not_running' };
    rt.killRequested = true;
    rt.inGame = false;
    void this.forceKillProc(rt);
    rt.stopping = false;
    rt.stopWatchdogActive = false;
    return { ok: true };
  }

  async rconExec(
    instanceId: string,
    command: string,
    forceSlashPrefix = true,
  ): Promise<{ ok: boolean; output?: string; error?: string }> {
    const ep = this.rconEndpoint(instanceId);
    if (!ep) {
      const item = this.instances.getById(instanceId);
      if (!item) return { ok: false, error: 'instance_not_found' };
      if (!this.runtimes.has(instanceId))
        return { ok: false, error: 'not_running' };
      return { ok: false, error: 'rcon_password_missing' };
    }
    try {
      const output = await this.rcon.run(
        ep.host,
        ep.port,
        ep.password,
        command,
        20000,
        forceSlashPrefix,
      );
      return { ok: true, output };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: msg };
    }
  }

  logTail(instanceId: string, tail: number): string[] {
    const rt = this.runtimes.get(instanceId);
    if (!rt) return [];
    return liveLogTail(rt.logRing, rt.logSession.anchorLine, tail);
  }

  private startStopWatchdog(rt: InstanceRuntime): void {
    if (rt.stopWatchdogActive) return;
    if (process.platform !== 'win32') return;
    rt.stopWatchdogActive = true;
    void this.runStopWatchdog(rt);
  }

  /** Windows: Factorio often hangs after graceful shutdown — kill after log markers (original FCC). */
  private async runStopWatchdog(rt: InstanceRuntime): Promise<void> {
    const wall0 = Date.now();
    let budgetStart: number | null = null;

    try {
      while (true) {
        const proc = rt.proc;
        if (!proc || proc.exitCode !== null) {
          rt.stopping = false;
          return;
        }

        const now = Date.now();
        const wallElapsed = now - wall0;

        if (budgetStart === null) {
          if (rt.sawSaveProgress100 || wallElapsed >= STOP_SAVE_FALLBACK_MS) {
            budgetStart = now;
          }
        }

        const afterMarkerMs =
          rt.shutdownMarkerAt > 0 ? now - rt.shutdownMarkerAt : 0;
        const shutdownOk =
          rt.sawShutdownMarker &&
          (rt.sawSaveProgress100 ||
            wallElapsed >= STOP_SAVE_FALLBACK_MS ||
            afterMarkerMs >= STOP_MARKER_KILL_DELAY_MS);

        if (shutdownOk) {
          await this.finalizeShutdownKill(rt);
          return;
        }

        if (
          budgetStart !== null &&
          now - budgetStart >= STOP_WATCHDOG_TIMEOUT_SEC * 1000
        ) {
          this.appendRuntimeEvent(rt, 'Stopping server process...');
          await this.finalizeShutdownKill(rt);
          return;
        }

        await new Promise((r) => setTimeout(r, STOP_WATCHDOG_POLL_MS));
      }
    } finally {
      rt.stopWatchdogActive = false;
    }
  }

  private scheduleShutdownKill(rt: InstanceRuntime): void {
    if (
      rt.shutdownKillScheduled ||
      process.platform !== 'win32' ||
      !rt.stopping
    )
      return;
    rt.shutdownKillScheduled = true;
    setTimeout(() => {
      void this.finalizeShutdownKill(rt);
    }, STOP_MARKER_KILL_DELAY_MS);
  }

  private async finalizeShutdownKill(rt: InstanceRuntime): Promise<void> {
    const proc = rt.proc;
    if (!proc || proc.exitCode !== null) {
      rt.stopping = false;
      rt.stopWatchdogActive = false;
      return;
    }
    this.emitServerShutdownLogOnce(rt);
    await this.forceKillProc(rt);
    rt.stopping = false;
    rt.stopWatchdogActive = false;
  }

  private async findListeningPid(port: number): Promise<number | null> {
    if (process.platform !== 'win32' || port < 1) return null;
    try {
      const { stdout } = await execFileAsync('netstat', ['-ano'], {
        encoding: 'utf8',
        windowsHide: true,
      });
      const needle = `:${port}`;
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.includes('LISTENING') || !line.includes(needle)) continue;
        const parts = line.trim().split(/\s+/);
        const pid = parseInt(parts[parts.length - 1] || '', 10);
        if (pid > 0) return pid;
      }
    } catch {
      /* ignore */
    }
    return null;
  }

  private async forceKillProc(rt: InstanceRuntime): Promise<void> {
    const proc = rt.proc;
    if (!proc || proc.exitCode !== null) return;
    rt.killRequested = true;

    const killPid = async (pid: number) => {
      if (process.platform === 'win32') {
        await execFileAsync('taskkill', ['/PID', String(pid), '/T', '/F'], {
          windowsHide: true,
        });
        return;
      }
      process.kill(pid, 'SIGKILL');
    };

    const pids = new Set<number>();
    if (proc.pid) pids.add(proc.pid);

    const item = this.instances.getById(rt.instanceId);
    const gamePort = parseInt(String(item?.port || ''), 10);
    if (gamePort > 0) {
      const byPort = await this.findListeningPid(gamePort);
      if (byPort) pids.add(byPort);
    }
    if (item?.rconPort) {
      const byRcon = await this.findListeningPid(item.rconPort);
      if (byRcon) pids.add(byRcon);
    }

    for (const pid of pids) {
      try {
        await killPid(pid);
      } catch {
        /* try next */
      }
    }

    if (proc.exitCode === null) {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
    }
  }

  private appendGameLogLine(rt: InstanceRuntime, line: string): void {
    rt.logRing.push(line);
    rt.logRing = trimLiveLogRing(
      rt.logRing,
      rt.logSession.anchorLine,
      LIVE_LOG_RING_MAX,
    );
    if (this.logRotation.logWriteInstanceEnabled()) {
      this.logRotation.appendLine(rt.logPath, line);
    }
  }

  private appendRuntimeEvent(rt: InstanceRuntime, text: string): void {
    this.appendGameLogLine(rt, `${panelLogLineTimestamp()}  ${text}`);
  }

  private emitServerShutdownLogOnce(rt: InstanceRuntime): void {
    if (rt.serverShutdownLogged) return;
    rt.serverShutdownLogged = true;
    this.appendRuntimeEvent(rt, '*** SERVER SHUTDOWN COMPLETE ***');
  }

  private parseRuntimeLine(rt: InstanceRuntime, line: string): void {
    if (CHAT_LOG_TAG_RE.test(line)) {
      this.logRotation.appendLine(join(rt.serverPath, 'chat_log.txt'), line);
    }

    const joinMatch = JOIN_RE.exec(line);
    if (joinMatch?.[1]) {
      rt.onlinePlayers[joinMatch[1]] = new Date().toISOString();
      this.appendPlayerHistory(rt, joinMatch[1], 'JOIN');
      return;
    }

    const leaveName =
      LEAVE_RE.exec(line)?.[1] ||
      KICK_RE.exec(line)?.[1] ||
      BAN_RE.exec(line)?.[1];
    if (leaveName) {
      delete rt.onlinePlayers[leaveName];
      this.appendPlayerHistory(rt, leaveName, 'LEAVE');
      return;
    }

    if (
      line.includes('changing state from(CreatingGame) to(InGame)') ||
      line.includes('Hosting game')
    ) {
      rt.inGame = true;
      rt.wasEverInGame = true;
      rt.lastStartFailed = false;
      rt.missingStartupDependencies = [];
      rt.missingStartupDepsSeen.clear();
    }

    if (!rt.inGame) {
      recordMissingStartupDepLine(
        rt.missingStartupDependencies,
        rt.missingStartupDepsSeen,
        line,
        hasSpaceAge(rt.serverPath),
      );
    }
    if (line.includes('Deleting active scenario (global = true)')) {
      rt.sawShutdownMarker = true;
      if (!rt.shutdownMarkerAt) rt.shutdownMarkerAt = Date.now();
      this.scheduleShutdownKill(rt);
    }
    if (SAVE_PROGRESS_100_RE.test(line)) rt.sawSaveProgress100 = true;
    const low = line.toLowerCase();
    if (low.includes('remote-quit') && low.includes('quitting'))
      rt.sawRemoteQuit = true;
  }

  private appendPlayerHistory(
    rt: InstanceRuntime,
    player: string,
    action: 'JOIN' | 'LEAVE',
  ): void {
    const path = join(rt.serverPath, 'server-history.json');
    try {
      const doc = existsSync(path)
        ? (JSON.parse(require('fs').readFileSync(path, 'utf-8')) as Record<
            string,
            unknown
          >)
        : {};
      const history = Array.isArray(doc.history) ? doc.history : [];
      history.push({ player, action, date: panelTimestamp() });
      doc.history = history.slice(-2000);
      require('fs').writeFileSync(
        path,
        JSON.stringify(doc, null, 2) + '\n',
        'utf-8',
      );
    } catch {
      /* ignore */
    }
  }
}

function joinSafe(base: string, name: string): string {
  const { join, normalize } = require('path') as typeof import('path');
  const p = normalize(join(base, name));
  if (!p.startsWith(normalize(base))) throw new Error('path_traversal');
  return p;
}
