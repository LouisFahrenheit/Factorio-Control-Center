import { Injectable } from '@nestjs/common';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { FccConfigService } from '../../config/fcc-config.service';
import { InstancesService } from '../../instances/instances.service';
import { AuditLogService } from '../../maintenance/audit-log.service';
import { InstanceHistoryService } from '../instance-history.service';
import { ModPortalService } from '../mod-portal/mod-portal.service';
import { RuntimeService } from '../runtime.service';
import {
  OpResult,
  installedModVersions,
  isErrorResult,
  latestVersion,
  selectedInstance,
} from '../ops-utils';
import { firstPlanItemRequiringNewerGame } from './mod-game-req';
import { ModPlanItem, ModPlanService } from './mod-plan.service';
import { trackModInstallMeta } from '../instance-server-data';
import { PathManager } from '../path-manager';

interface JobState {
  running: boolean;
  instance_id: string;
  phase: string;
  mode: string;
  current_step: number;
  total_steps: number;
  current_name: string;
  current_version: string;
  download_cur: number;
  download_tot: number;
  download_active: number;
  active_downloads: { name: string; version: string }[];
  log: Record<string, unknown>[];
  error: string;
  error_key: string;
  error_args: unknown[];
  stop_requested: boolean;
  started_at: number;
  finished_at: number;
  summary: {
    installed: unknown[];
    updated: unknown[];
    skipped: unknown[];
    failed: unknown[];
  };
}

const ERROR_KEY_MAP: Record<string, string> = {
  mod_portal_no_credentials: 'missing_credentials',
  requires_space_age: 'mod_requires_space_age',
  requires_game_update_confirm: 'mod_job_requires_newer_game_confirm',
  updates_blocked_by_instance_setting: 'maintenance_instance_updates_forbidden',
  server_running: 'server_running_mutate_blocked',
};

const DOWNLOAD_RETRY_ATTEMPTS = 3;

function formatModJobHistoryItem(x: unknown): string {
  if (x == null || x === '') return '';
  if (typeof x === 'string') {
    const s = x.trim();
    return s === '[object Object]' ? '' : s;
  }
  if (typeof x === 'object') {
    const row = x as Record<string, unknown>;
    const name = String(row.name || '').trim();
    const version = String(row.version || '').trim();
    const from = String(row.from_version || row.from || '').trim();
    if (name && from && version) return `${name} (${from} → ${version})`;
    if (name && version) return `${name} (${version})`;
    const error = String(row.error || '').trim();
    if (name && error) return `${name}: ${error}`;
    return name || version || error;
  }
  const s = String(x).trim();
  return s === '[object Object]' ? '' : s;
}

@Injectable()
export class ModsJobService {
  private state: JobState = this.idle();

  constructor(
    private readonly instances: InstancesService,
    private readonly portal: ModPortalService,
    private readonly plan: ModPlanService,
    private readonly runtime: RuntimeService,
    private readonly config: FccConfigService,
    private readonly auditLog: AuditLogService,
    private readonly instanceHistory: InstanceHistoryService,
  ) {}

  isRunningForInstance(instanceId: string): boolean {
    const iid = String(instanceId || '').trim();
    if (!iid || !this.state.running) return false;
    return this.state.instance_id === iid;
  }

  start(mode: string, params: Record<string, unknown>): OpResult {
    if (this.state.running)
      return { ok: false, error: 'mod_job_already_running' };
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;

    const normalized = this.normalizeMode(mode);
    if (
      ['update_one', 'update_all'].includes(normalized) &&
      sel.item.blockUpdates
    ) {
      return { ok: false, error: 'updates_blocked_by_instance_setting' };
    }
    if (this.runtime.isRunning(sel.item.id)) {
      return { ok: false, error: 'server_running' };
    }

    this.state = this.idle();
    Object.assign(this.state, {
      running: true,
      instance_id: sel.item.id,
      phase: 'preparing',
      mode: normalized,
      stop_requested: false,
      started_at: Date.now() / 1000,
      finished_at: 0,
    });
    void this.worker(normalized, params).catch((e) => this.failJobError(e));
    return { ok: true, started: true, mode: normalized };
  }

  status(): OpResult {
    return { ok: true, ...this.snapshot() };
  }

  stop(): OpResult {
    if (!this.state.running) return { ok: false, error: 'mod_job_not_running' };
    this.state.stop_requested = true;
    return { ok: true };
  }

  private normalizeMode(mode: string): string {
    const m = String(mode || '').trim();
    if (m === 'install_save') return 'install_many';
    if (m === 'update') return 'update_one';
    if (m === 'import_modpack') return 'import_modpack';
    return m;
  }

  private async worker(
    mode: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    try {
      const sel = selectedInstance(this.instances);
      if (isErrorResult(sel))
        throw new Error(String(sel.error || 'instance_not_found'));

      const modsDir = String(params.mods_dir || sel.pm.modsDir);
      mkdirSync(modsDir, { recursive: true });
      const serverPath = sel.item.serverPath;
      const allowRequiresGameUpdate = !!params.allow_requires_game_update;
      const removeOldZips = params.remove_old_zips !== false;
      const isImportModpack = mode === 'import_modpack';

      const creds = this.portal.loadCredentials(
        sel.pm,
        this.config.webPanel.global_username,
        this.config.webPanel.global_token,
      );
      if (!creds) throw new Error('mod_portal_no_credentials');

      let plan: ModPlanItem[] = [];

      if (mode === 'install') {
        const modId = this.portal.modIdFromInput(String(params.mod || ''));
        if (!this.portal.isValidPortalModId(modId))
          throw new Error('invalid_mod_id');
        if (this.portal.isBuiltin(modId)) throw new Error('builtin');
        this.appendLog('info', 'mod_job_log_dependency');
        plan = await this.plan.planInstall(serverPath, modsDir, modId);
        this.guardGameVersion(serverPath, plan, allowRequiresGameUpdate, modId);
      } else if (mode === 'install_many' || isImportModpack) {
        const mods = this.parseModNames(params.mods);
        if (!mods.length) throw new Error('empty_name');
        this.appendLog('info', 'mod_job_log_dependency');
        plan = await this.plan.planInstallMany(serverPath, modsDir, mods);
        this.guardGameVersion(
          serverPath,
          plan,
          allowRequiresGameUpdate,
          mods[0] || '?',
        );
      } else if (mode === 'update_one') {
        const name = this.portal.modIdFromInput(
          String(params.name || params.mod || ''),
        );
        if (!name) throw new Error('empty_name');
        if (!this.portal.isValidPortalModId(name))
          throw new Error('invalid_mod_id');
        if (this.portal.isBuiltin(name)) throw new Error('builtin');

        const planAll = await this.plan.planInstall(serverPath, modsDir, name);
        this.guardGameVersion(
          serverPath,
          planAll,
          allowRequiresGameUpdate,
          name,
        );
        const rootItem = planAll.find((it) => it.name === name);
        if (!rootItem) {
          const localVer =
            latestVersion(installedModVersions(modsDir, name)) || '';
          this.appendLog('info', 'mod_job_log_skipped', [name, localVer]);
          this.state.summary.skipped.push({ name, version: localVer });
          plan = [];
        } else {
          const depsPlan = planAll.filter((it) => it.name !== name);
          if (depsPlan.length) this.appendLog('info', 'mod_job_log_dependency');
          plan = [rootItem, ...depsPlan];
        }
      } else if (mode === 'update_all') {
        plan = await this.plan.planUpdateAll(
          sel.pm,
          allowRequiresGameUpdate,
          false,
          {
            cancelCheck: () => this.cancelCheck(),
            onSkipped: (name, localVersion) => {
              this.state.summary.skipped.push({ name, version: localVersion });
              this.appendLog('info', 'mod_job_log_skipped', [
                name,
                localVersion,
              ]);
            },
            onFailed: (name, error) => {
              this.state.summary.failed.push({ name, error });
              this.appendLog('error', 'mod_job_log_failed', [name, error]);
            },
            onSkippedRequiresGame: (name, required, current, blockedDep) => {
              const rec: Record<string, unknown> = {
                name,
                reason_key: 'mod_skip_requires_newer_factorio',
                required_factorio: required,
                current_factorio: current,
              };
              if (blockedDep) rec.blocked_dependency = blockedDep;
              this.state.summary.skipped.push(rec);
              this.appendLog('info', 'mod_job_log_skipped_requires_game', [
                name,
                required,
                current,
              ]);
            },
          },
        );
      } else {
        throw new Error(`unknown_mode:${mode}`);
      }

      this.cancelCheck();
      await this.applyInstallConflicts(sel.pm, mode, params);
      this.state.total_steps = plan.length;
      this.state.current_step = 0;

      if (!plan.length) {
        this.state.phase = 'done';
        this.appendLog('info', 'mod_job_log_nothing');
        return;
      }

      const actor = String(params.actor || 'Web').trim() || 'Web';
      const concurrency = this.downloadConcurrency();

      if (plan.length <= 1 || concurrency <= 1) {
        await this.processPlanSequential(
          plan,
          mode,
          isImportModpack,
          modsDir,
          serverPath,
          actor,
          creds,
          removeOldZips,
        );
      } else {
        await this.processPlanParallel(
          plan,
          mode,
          isImportModpack,
          modsDir,
          serverPath,
          actor,
          creds,
          removeOldZips,
          concurrency,
        );
      }

      if (isImportModpack) {
        this.refreshModpackMetadata(String(params.modpack_name || ''), modsDir);
      }

      const installed = this.state.summary.installed.length;
      const updated = this.state.summary.updated.length;
      const skipped = this.state.summary.skipped.length;
      const failed = this.state.summary.failed.length;
      if (mode === 'update_one' || mode === 'update_all') {
        this.appendLog('info', 'mod_job_log_summary_update', [
          updated,
          skipped,
          failed,
        ]);
      } else {
        this.appendLog('info', 'mod_job_log_summary_install', [
          installed + updated,
        ]);
      }

      this.state.phase = 'done';
    } catch (e) {
      if (String(e) === 'cancelled') {
        this.state.phase = 'cancelled';
      } else {
        this.failJobError(e);
      }
    } finally {
      this.state.running = false;
      this.state.finished_at = Date.now() / 1000;
      this.state.download_cur = 0;
      this.state.download_tot = 0;
      this.state.download_active = 0;
      this.state.active_downloads = [];
      this.recordJobAudit(mode, params);
    }
  }

  private recordJobAudit(mode: string, params: Record<string, unknown>): void {
    if (params.maintenance_auto) return;
    const phase = String(this.state.phase || '');
    if (phase === 'preparing' || phase === 'idle') return;
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return;

    const installed = this.state.summary.installed.length;
    const updated = this.state.summary.updated.length;
    const skipped = this.state.summary.skipped.length;
    const failed = this.state.summary.failed.length;
    const isUpdate = mode === 'update_one' || mode === 'update_all';
    const eventKind =
      mode === 'import_modpack'
        ? 'modpack_import'
        : isUpdate
          ? 'mod_update'
          : 'mod_install';
    const actor = String(params.actor || '').trim() || undefined;
    const triggerRaw = String(params._audit_trigger || '').trim();
    const trigger =
      triggerRaw === 'scheduled' || params.maintenance_auto
        ? 'scheduled'
        : actor
          ? 'manual'
          : 'system';
    const success = phase === 'done' && !this.state.error;
    const startedIso = this.state.started_at
      ? new Date(this.state.started_at * 1000)
          .toISOString()
          .slice(0, 19)
          .replace('T', ' ')
      : undefined;
    const finishedIso = this.state.finished_at
      ? new Date(this.state.finished_at * 1000)
          .toISOString()
          .slice(0, 19)
          .replace('T', ' ')
      : undefined;

    this.auditLog.record({
      event_kind: eventKind,
      instance_id: sel.item.id,
      instance_name: sel.item.name,
      actor,
      trigger,
      success,
      error: success
        ? undefined
        : String(this.state.error || this.state.error_key || phase),
      message_key: isUpdate
        ? 'audit_event_mod_job_update'
        : 'audit_event_mod_job_install',
      detail: {
        mode,
        installed,
        updated,
        skipped,
        failed,
        modpack_name: params.modpack_name,
        installed_items: this.state.summary.installed,
        updated_items: this.state.summary.updated,
      },
      started_at: startedIso,
      finished_at: finishedIso,
    });

    try {
      this.instanceHistory.recordModsJob(mode, params, {
        installed: this.state.summary.installed
          .map(formatModJobHistoryItem)
          .filter(Boolean),
        updated: this.state.summary.updated
          .map(formatModJobHistoryItem)
          .filter(Boolean),
        failed: this.state.summary.failed
          .map(formatModJobHistoryItem)
          .filter(Boolean),
        phase,
        error: success
          ? undefined
          : String(this.state.error || this.state.error_key || phase),
      });
    } catch {
      /* ignore history failures */
    }
  }

  private async applyInstallConflicts(
    pm: PathManager,
    mode: string,
    params: Record<string, unknown>,
  ): Promise<void> {
    const isInstallLike =
      mode === 'install' ||
      mode === 'install_many' ||
      mode === 'import_modpack' ||
      mode === 'update_one' ||
      mode === 'update_all';
    if (!isInstallLike) return;

    let roots: string[] = [];
    if (mode === 'install') {
      const modId = this.portal.modIdFromInput(String(params.mod || ''));
      if (modId) roots = [modId];
    } else if (mode === 'install_many' || mode === 'import_modpack') {
      roots = this.parseModNames(params.mods);
    } else if (mode === 'update_one') {
      const name = this.portal.modIdFromInput(
        String(params.name || params.mod || ''),
      );
      if (name) roots = [name];
    } else if (mode === 'update_all') {
      roots = await this.plan.updateRootModIds(pm);
    }
    if (!roots.length) return;

    const conflicts = await this.plan.conflictsToDisableForInstall(pm, roots);
    if (!conflicts.length) return;
    const disabled = this.plan.disableConflictingMods(pm, conflicts);
    if (disabled.length) {
      this.appendLog('info', 'mod_job_log_conflicts_disabled', [
        disabled.join(', '),
      ]);
    }
  }

  private guardGameVersion(
    serverPath: string,
    plan: ModPlanItem[],
    allow: boolean,
    fallbackMod: string,
  ): void {
    const blocked = firstPlanItemRequiringNewerGame(serverPath, plan);
    if (blocked && !allow) {
      const err = new Error('requires_game_update_confirm') as Error & {
        errorKey?: string;
        errorArgs?: unknown[];
      };
      err.errorKey = 'mod_job_requires_newer_game_confirm';
      err.errorArgs = [
        blocked.mod || fallbackMod,
        blocked.required,
        blocked.current || '?',
      ];
      throw err;
    }
  }

  private parseModNames(raw: unknown): string[] {
    const out: string[] = [];
    if (!Array.isArray(raw)) return out;
    for (const x of raw) {
      const rawName = String(x || '').trim();
      if (!rawName || rawName.startsWith('!')) continue;
      const n = this.portal.modIdFromInput(rawName);
      if (!n || this.portal.isBuiltin(n) || !this.portal.isValidPortalModId(n))
        continue;
      if (!out.some((v) => v.toLowerCase() === n.toLowerCase())) out.push(n);
    }
    return out;
  }

  private downloadConcurrency(): number {
    return this.config.webPanel.mod_download_concurrency;
  }

  private createInstallLock(): <T>(fn: () => T | Promise<T>) => Promise<T> {
    let chain: Promise<void> = Promise.resolve();
    return <T>(fn: () => T | Promise<T>): Promise<T> => {
      const run = chain.then(() => fn());
      chain = run.then(
        () => undefined,
        () => undefined,
      );
      return run;
    };
  }

  private updateParallelDownloadProgress(
    progress: Map<string, { cur: number; tot: number; version: string }>,
    completedSteps: number,
  ): void {
    let cur = 0;
    let tot = 0;
    for (const p of progress.values()) {
      cur += p.cur;
      if (p.tot > 0) tot += p.tot;
      else if (p.cur > 0) tot += p.cur;
    }
    this.state.download_cur = cur;
    this.state.download_tot = tot;
    this.state.download_active = progress.size;
    this.state.active_downloads = [...progress.entries()]
      .sort(([a], [b]) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' }),
      )
      .map(([name, p]) => ({ name, version: p.version }));
    this.state.current_step = completedSteps;
    this.state.phase = 'download';
  }

  private async processPlanSequential(
    plan: ModPlanItem[],
    mode: string,
    isImportModpack: boolean,
    modsDir: string,
    serverPath: string,
    actor: string,
    creds: { user: string; token: string },
    removeOldZips: boolean,
  ): Promise<void> {
    const installLock = this.createInstallLock();
    for (const [idx, item] of plan.entries()) {
      this.cancelCheck();
      this.state.current_step = idx + 1;
      this.state.download_active = 1;
      await this.processPlanItem(
        item,
        mode,
        isImportModpack,
        modsDir,
        serverPath,
        actor,
        creds,
        removeOldZips,
        installLock,
      );
    }
    this.state.download_active = 0;
  }

  private async processPlanParallel(
    plan: ModPlanItem[],
    mode: string,
    isImportModpack: boolean,
    modsDir: string,
    serverPath: string,
    actor: string,
    creds: { user: string; token: string },
    removeOldZips: boolean,
    concurrency: number,
  ): Promise<void> {
    const installLock = this.createInstallLock();
    const progress = new Map<
      string,
      { cur: number; tot: number; version: string }
    >();
    let completedSteps = 0;
    let nextIndex = 0;
    let aborted = false;
    let firstError: Error | null = null;

    this.state.phase = 'download';
    this.state.download_cur = 0;
    this.state.download_tot = 0;
    this.updateParallelDownloadProgress(progress, completedSteps);

    const worker = async (): Promise<void> => {
      while (!aborted) {
        this.cancelCheck();
        const idx = nextIndex++;
        if (idx >= plan.length) return;
        const item = plan[idx];
        progress.set(item.name, { cur: 0, tot: 0, version: item.version });
        this.updateParallelDownloadProgress(progress, completedSteps);
        try {
          await this.processPlanItem(
            item,
            mode,
            isImportModpack,
            modsDir,
            serverPath,
            actor,
            creds,
            removeOldZips,
            installLock,
            (cur, tot) => {
              const row = progress.get(item.name);
              if (row) progress.set(item.name, { ...row, cur, tot });
              this.updateParallelDownloadProgress(progress, completedSteps);
            },
          );
          progress.delete(item.name);
          completedSteps += 1;
          this.state.current_step = completedSteps;
          this.updateParallelDownloadProgress(progress, completedSteps);
        } catch (e) {
          aborted = true;
          firstError = e instanceof Error ? e : new Error(String(e));
          return;
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(concurrency, plan.length) }, () =>
        worker(),
      ),
    );
    this.state.download_active = 0;
    if (firstError) throw firstError;
  }

  private async processPlanItem(
    item: ModPlanItem,
    mode: string,
    isImportModpack: boolean,
    modsDir: string,
    serverPath: string,
    actor: string,
    creds: { user: string; token: string },
    removeOldZips: boolean,
    installLock: <T>(fn: () => T | Promise<T>) => Promise<T>,
    onDownloadProgress?: (cur: number, tot: number) => void,
  ): Promise<void> {
    this.state.current_name = item.name;
    this.state.current_version = item.version;
    if (!onDownloadProgress) {
      this.state.phase = 'download';
      this.state.download_cur = 0;
      this.state.download_tot = 0;
      this.state.active_downloads = [
        { name: item.name, version: item.version },
      ];
    }

    this.appendLog('info', 'mod_job_log_download_start', [
      item.name,
      item.version,
    ]);
    const fileName = await this.downloadOne(
      item.name,
      item.release,
      modsDir,
      creds.user,
      creds.token,
      removeOldZips,
      onDownloadProgress,
    );

    let sizeMb = '?';
    try {
      sizeMb = (statSync(join(modsDir, fileName)).size / (1024 * 1024)).toFixed(
        1,
      );
    } catch {
      /* ignore */
    }
    this.appendLog('info', 'mod_job_log_download_done', [fileName, sizeMb]);

    await installLock(async () => {
      this.state.phase = 'install';
      this.state.active_downloads = [];
      this.state.current_name = item.name;
      this.state.current_version = item.version;
      const added = this.ensureModListEntryInDir(modsDir, item.name, true);
      if (added) this.appendLog('info', 'mod_job_log_added', [item.name]);

      const isInstallMode =
        mode === 'install' || mode === 'install_many' || isImportModpack;
      if (isInstallMode) {
        this.state.summary.installed.push({
          name: item.name,
          version: item.version,
          file: fileName,
        });
      } else {
        this.state.summary.updated.push({
          name: item.name,
          version: item.version,
          from_version: item.local_version,
          file: fileName,
        });
      }
      trackModInstallMeta(serverPath, [item.name], actor, false);
    });
  }

  private async downloadOne(
    modName: string,
    release: Record<string, unknown>,
    modsDir: string,
    user: string,
    token: string,
    removeOldZips: boolean,
    onProgress?: (cur: number, tot: number) => void,
  ): Promise<string> {
    let lastErr: Error | null = null;
    for (let attempt = 1; attempt <= DOWNLOAD_RETRY_ATTEMPTS; attempt++) {
      this.cancelCheck();
      if (onProgress) onProgress(0, 0);
      else {
        this.state.download_cur = 0;
        this.state.download_tot = 0;
      }
      try {
        const file = await this.portal.downloadRelease(
          release,
          modsDir,
          user,
          token,
          (cur, tot) => {
            if (onProgress) onProgress(cur, tot);
            else {
              this.state.download_cur = cur;
              this.state.download_tot = tot;
            }
          },
          () => this.state.stop_requested,
        );
        const version = String(release.version || '');
        if (removeOldZips && version)
          this.portal.pruneOldZips(modName, version, modsDir);
        return file;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error(String(e));
        if (lastErr.message === 'cancelled') throw lastErr;
        if (
          attempt < DOWNLOAD_RETRY_ATTEMPTS &&
          this.isTransientDownloadError(lastErr)
        ) {
          this.appendLog('warn', 'mod_job_log_retry', [
            modName,
            attempt + 1,
            DOWNLOAD_RETRY_ATTEMPTS,
          ]);
          await new Promise((r) =>
            setTimeout(r, Math.min(5000, 1000 + attempt * 1000)),
          );
          continue;
        }
        break;
      }
    }
    throw lastErr || new Error('download_failed');
  }

  private isTransientDownloadError(e: Error): boolean {
    const s = `${e.message} ${e.name}`.toLowerCase();
    if (s.includes('ssl') || s.includes('eof') || s.includes('unexpected_eof'))
      return true;
    if (
      s.includes('connection') &&
      (s.includes('reset') || s.includes('aborted') || s.includes('broken'))
    )
      return true;
    if (s.includes('timed out') || s.includes('timeout')) return true;
    return false;
  }

  private failJobError(e: unknown): void {
    const err = e as Error & { errorKey?: string; errorArgs?: unknown[] };
    const msg = err instanceof Error ? err.message : String(e);
    const key = err.errorKey || ERROR_KEY_MAP[msg] || '';
    const args = err.errorArgs || [];
    this.state.phase = 'error';
    this.state.error = msg;
    this.state.error_key = key;
    this.state.error_args = args;
    if (key) this.appendLog('error', key, args);
    else if (msg) this.appendLogRaw('error', msg);
  }

  private appendLogRaw(level: string, text: string): void {
    this.state.log.push({ ts: Date.now() / 1000, level, text });
    if (this.state.log.length > 500)
      this.state.log.splice(0, this.state.log.length - 500);
  }

  private appendLog(
    level: string,
    key?: string,
    args?: unknown[],
    text?: string,
  ): void {
    const entry: Record<string, unknown> = { ts: Date.now() / 1000, level };
    if (key) {
      entry.key = key;
      if (args?.length) entry.args = args;
    } else if (text) {
      entry.text = text;
    }
    this.state.log.push(entry);
    if (this.state.log.length > 500)
      this.state.log.splice(0, this.state.log.length - 500);
  }

  private cancelCheck(): void {
    if (this.state.stop_requested) throw new Error('cancelled');
  }

  private ensureModListEntryInDir(
    modsDir: string,
    name: string,
    enabled = true,
  ): boolean {
    const listPath = join(modsDir, 'mod-list.json');
    let data: { mods: Record<string, unknown>[] } = { mods: [] };
    if (existsSync(listPath)) {
      try {
        data = JSON.parse(readFileSync(listPath, 'utf-8')) as {
          mods: Record<string, unknown>[];
        };
        if (!Array.isArray(data.mods)) data.mods = [];
      } catch {
        data = { mods: [] };
      }
    }
    if (data.mods.some((m) => String(m.name || '') === name)) return false;
    data.mods.push({ name, enabled });
    writeFileSync(listPath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
    return true;
  }

  private refreshModpackMetadata(_modpackName: string, modsDir: string): void {
    const packDir = join(modsDir, '..');
    const metaPath = join(packDir, 'metadata.json');
    if (!existsSync(metaPath)) return;
    try {
      const meta = JSON.parse(readFileSync(metaPath, 'utf-8')) as Record<
        string,
        unknown
      >;
      const count = existsSync(modsDir)
        ? readdirSync(modsDir).filter((f) => f.toLowerCase().endsWith('.zip'))
            .length
        : 0;
      meta.mods_count = count;
      writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n', 'utf-8');
      const importPath = join(packDir, 'import.json');
      if (existsSync(importPath)) rmSync(importPath, { force: true });
    } catch {
      /* ignore */
    }
  }

  private snapshot(): JobState {
    return {
      ...this.state,
      log: [...this.state.log],
      summary: {
        installed: [...this.state.summary.installed],
        updated: [...this.state.summary.updated],
        skipped: [...this.state.summary.skipped],
        failed: [...this.state.summary.failed],
      },
      active_downloads: [...this.state.active_downloads],
    };
  }

  private idle(): JobState {
    return {
      running: false,
      instance_id: '',
      phase: 'idle',
      mode: '',
      current_step: 0,
      total_steps: 0,
      current_name: '',
      current_version: '',
      download_cur: 0,
      download_tot: 0,
      download_active: 0,
      active_downloads: [],
      log: [],
      error: '',
      error_key: '',
      error_args: [],
      stop_requested: false,
      started_at: 0,
      finished_at: 0,
      summary: { installed: [], updated: [], skipped: [], failed: [] },
    };
  }
}
