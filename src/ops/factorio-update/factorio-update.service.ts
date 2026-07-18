import { Injectable } from '@nestjs/common';
import AdmZip from 'adm-zip';
import {
  createWriteStream,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'fs';
import { tmpdir } from 'os';
import { basename, join } from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { FccConfigService } from '../../config/fcc-config.service';
import { InstancesService } from '../../instances/instances.service';
import { AuditLogService } from '../../maintenance/audit-log.service';
import { InstanceHistoryService } from '../instance-history.service';
import { markFactorioUpdated } from '../instance-server-data';
import { RuntimeService } from '../runtime.service';
import {
  OpResult,
  compareVersions,
  gameVersion,
  hasSpaceAgeInstalled,
  isErrorResult,
  selectedInstance,
} from '../ops-utils';

const execFileAsync = promisify(execFile);

@Injectable()
export class FactorioUpdateService {
  private state = this.idle();

  constructor(
    private readonly instances: InstancesService,
    private readonly runtime: RuntimeService,
    private readonly config: FccConfigService,
    private readonly auditLog: AuditLogService,
    private readonly instanceHistory: InstanceHistoryService,
  ) {}

  async check(): Promise<OpResult> {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    if (sel.item.blockUpdates) {
      const prep = await this.prepareLocalVersionOnly(
        sel.item.serverPath,
        sel.pm.findFactorioExe() || '',
      );
      if (prep.ok === false) return prep;
      return {
        ok: true,
        current: prep.ver,
        latest_stable: prep.ver,
        updates: [],
        check_skipped: 'updates_blocked_by_instance_setting',
      };
    }
    const prep = await this.prepare();
    if (prep.ok === false) return prep;
    const updates = this.pickUpdates(
      prep.avail,
      prep.pkg,
      prep.ver,
      !!sel.item.experimentalUpdates,
    );
    return {
      ok: true,
      current: prep.ver,
      latest_stable: updates.latest[0] || prep.ver,
      updates: updates.updates,
    };
  }

  async checkAll(): Promise<OpResult> {
    const st = this.instances.load();
    const selectedId = String(st.selectedId || '').trim();
    const out: Record<string, unknown>[] = [];

    for (const item of st.items) {
      const iid = String(item.id || '').trim();
      if (!iid) continue;
      const nm = String(item.name || iid).trim() || iid;
      if (item.blockUpdates) {
        out.push({
          id: iid,
          name: nm,
          ok: true,
          has_updates: false,
          latest_stable: '',
          updates_count: 0,
          check_skipped: 'updates_blocked_by_instance_setting',
        });
        continue;
      }
      const switched = await this.instances.withInstance(iid, async () =>
        this.check(),
      );
      if (switched.ok === false) {
        out.push({
          id: iid,
          name: nm,
          ok: false,
          error: String(switched.error || 'update_check_failed'),
        });
        continue;
      }
      const updates = Array.isArray(switched.updates) ? switched.updates : [];
      const latest =
        updates.length && typeof updates[updates.length - 1] === 'object'
          ? String(
              (updates[updates.length - 1] as { to?: string }).to ||
                switched.latest_stable ||
                '',
            )
          : String(switched.latest_stable || '');
      out.push({
        id: iid,
        name: nm,
        ok: true,
        has_updates: updates.length > 0,
        latest_stable: latest,
        updates_count: updates.length,
      });
    }

    if (selectedId) {
      try {
        await this.instances.select(selectedId);
      } catch {
        /* ignore restore errors */
      }
    }

    return { ok: true, items: out, selectedId };
  }

  async releases(): Promise<OpResult> {
    const ua = { 'User-Agent': 'FactorioControlCenter/2.0' };
    const versionsStable: string[] = [];
    const versionsExperimental: string[] = [];
    const seenStable = new Set<string>();
    const seenExp = new Set<string>();

    const plausible = (v: string): boolean => {
      if (!/^\d+(?:\.\d+){2}$/.test(v)) return false;
      const maj = parseInt(v.split('.')[0], 10);
      return maj === 0 || maj === 1 || maj === 2;
    };

    try {
      const pageRes = await fetch(
        'https://www.factorio.com/download/archive/',
        {
          headers: ua,
        },
      );
      const html = pageRes.ok ? await pageRes.text() : '';
      if (html) {
        const linkRe = /<a\b[^>]*>[\s\S]*?<\/a>/gi;
        let m: RegExpExecArray | null;
        while ((m = linkRe.exec(html)) !== null) {
          const block = m[0];
          const hrefM = block.match(
            /href\s*=\s*"\/download\/archive\/(\d+(?:\.\d+){2})"/i,
          );
          if (!hrefM) continue;
          const v = hrefM[1].trim();
          if (!plausible(v)) continue;
          const clsM = block.match(/class\s*=\s*"([^"]+)"/i);
          const cls = (clsM?.[1] || '').toLowerCase();
          if (cls.includes('version-button-stable') && !seenStable.has(v)) {
            seenStable.add(v);
            versionsStable.push(v);
          }
          if (cls.includes('version-button-experimental') && !seenExp.has(v)) {
            seenExp.add(v);
            versionsExperimental.push(v);
          }
        }
        if (!versionsStable.length && !versionsExperimental.length) {
          const seenAny = new Set<string>();
          const hrefRe = /\/download\/archive\/(\d+(?:\.\d+){2})/g;
          let hm: RegExpExecArray | null;
          while ((hm = hrefRe.exec(html)) !== null) {
            const v = hm[1].trim();
            if (plausible(v) && !seenAny.has(v)) {
              seenAny.add(v);
              versionsStable.push(v);
            }
          }
        }
      }
    } catch {
      /* fall through to API */
    }

    if (versionsStable.length || versionsExperimental.length) {
      const sortDesc = (arr: string[]) =>
        [...arr].sort((a, b) => compareVersions(b, a));
      return {
        ok: true,
        releases: {
          stable: sortDesc(versionsStable),
          experimental: sortDesc(versionsExperimental),
        },
      };
    }

    try {
      const res = await fetch('https://factorio.com/api/latest-releases', {
        headers: ua,
      });
      if (!res.ok) throw new Error(`http_${res.status}`);
      const data = (await res.json()) as Record<string, unknown>;
      const stable: string[] = [];
      const experimental: string[] = [];
      const collect = (node: unknown) => {
        if (!node) return;
        if (typeof node === 'string' && plausible(node)) {
          if (!stable.includes(node)) stable.push(node);
          return;
        }
        if (Array.isArray(node)) {
          node.forEach(collect);
          return;
        }
        if (typeof node === 'object') {
          for (const [k, v] of Object.entries(
            node as Record<string, unknown>,
          )) {
            if (plausible(k) && !stable.includes(k)) stable.push(k);
            collect(v);
          }
        }
      };
      collect(data);
      stable.sort((a, b) => compareVersions(b, a));
      return { ok: true, releases: { stable, experimental } };
    } catch (e) {
      return {
        ok: false,
        error: 'instance_releases_fetch_failed',
        detail: e instanceof Error ? e.message : String(e),
      };
    }
  }

  async start(
    targetVersion?: unknown,
    params: Record<string, unknown> = {},
  ): Promise<OpResult> {
    if (this.state.running)
      return { ok: false, error: 'factorio_update_already_running' };
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    if (sel.item.blockUpdates)
      return { ok: false, error: 'updates_blocked_by_instance_setting' };
    if (this.runtime.isRunning(sel.item.id))
      return { ok: false, error: 'server_running' };
    const prep = await this.prepare();
    if (prep.ok === false) return prep;
    const experimental =
      params.experimental === true ||
      params.experimental === 'true' ||
      !!sel.item.experimentalUpdates;
    const picked = this.pickUpdates(
      prep.avail,
      prep.pkg,
      prep.ver,
      experimental,
    );
    let updates = picked.updates;
    if (!updates.length) {
      return {
        ok: true,
        updated: false,
        current: prep.ver,
        latest_stable: picked.latest[0] || prep.ver,
      };
    }
    const target = String(targetVersion || '').trim();
    if (target) {
      const targets = updates.map((u) => u.to);
      if (!targets.includes(target)) {
        return {
          ok: false,
          error: 'target_version_not_available',
          target_version: target,
          available: targets,
        };
      }
      updates = updates.slice(0, targets.indexOf(target) + 1);
    }
    this.state = this.idle();
    Object.assign(this.state, {
      running: true,
      phase: 'preparing',
      total_steps: updates.length,
      current: prep.ver,
      latest_stable: picked.latest[0] || prep.ver,
      server_path: prep.serverPath,
      started_at: Date.now() / 1000,
      actor: String(params.actor || '').trim() || undefined,
      audit_trigger: params.maintenance_auto
        ? 'scheduled'
        : params.actor
          ? 'manual'
          : 'system',
      maintenance_auto: !!params.maintenance_auto,
    });
    void this.worker({ ...prep, experimental }, updates).catch((e) =>
      this.fail(e instanceof Error ? e.message : String(e)),
    );
    return {
      ok: true,
      started: true,
      steps: updates.length,
      from: prep.ver,
      to: updates[updates.length - 1].to,
    };
  }

  status(): OpResult {
    return { ok: true, ...this.state, log: [...this.state.log] };
  }

  stop(): OpResult {
    if (!this.state.running)
      return { ok: false, error: 'factorio_update_not_running' };
    this.state.stop_requested = true;
    return { ok: true };
  }

  private async prepareLocalVersionOnly(
    serverPath: string,
    exe: string,
  ): Promise<OpResult & { ver: string }> {
    const ver = await this.installedVersion(serverPath, exe);
    if (!ver)
      return {
        ok: false,
        error: 'about_factorio_update_version_unknown',
      } as never;
    return { ok: true, ver };
  }

  private async prepare(): Promise<
    OpResult & {
      exe: string;
      ver: string;
      user: string;
      token: string;
      avail: Record<string, unknown>;
      pkg: string;
      flavor: string;
      serverPath: string;
    }
  > {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel as never;
    const serverPath = sel.item.serverPath;
    const exe = sel.pm.findFactorioExe();
    if (!exe) return { ok: false, error: 'no_factorio_exe' } as never;
    const ver = await this.installedVersion(serverPath, exe);
    if (!ver)
      return {
        ok: false,
        error: 'about_factorio_update_version_unknown',
      } as never;
    const creds = this.resolveCredentials(sel.pm.serverSettings);
    if (!creds)
      return {
        ok: false,
        error: 'about_factorio_update_no_credentials',
      } as never;
    const avail = await this.getJson(
      'https://updater.factorio.com/get-available-versions',
      {
        username: creds.user,
        token: creds.token,
        apiVersion: '2',
      },
    );
    const defaultPkg =
      process.platform === 'win32' ? 'core-win64' : 'core-linux_headless64';
    const flavor = this.installFlavor(serverPath);
    const pkg = this.selectPackage(avail, defaultPkg, flavor);
    if (!Array.isArray(avail[pkg])) {
      return {
        ok: false,
        error: 'about_factorio_update_package_missing',
        package: pkg,
      } as never;
    }
    return {
      ok: true,
      exe,
      ver,
      user: creds.user,
      token: creds.token,
      avail,
      pkg,
      flavor,
      serverPath,
    };
  }

  private installFlavor(serverPath: string): string {
    return hasSpaceAgeInstalled(serverPath) ? 'expansion' : 'base';
  }

  private listPackageKeys(avail: Record<string, unknown>): string[] {
    return Object.keys(avail).filter((k) => Array.isArray(avail[k]));
  }

  /** Updater exposes a separate expansion channel (Windows); Linux headless often uses one core key for SA patches. */
  private hasDedicatedExpansionPackage(
    avail: Record<string, unknown>,
  ): boolean {
    const isLinux = process.platform.startsWith('linux');
    return this.listPackageKeys(avail).some((k) => {
      const kl = k.toLowerCase();
      if (!kl.includes('expansion')) return false;
      if (process.platform === 'win32') return kl.includes('win64');
      return isLinux && kl.includes('linux') && kl.includes('headless');
    });
  }

  private shouldWarnExpansionCoreMismatch(
    flavor: string,
    pkg: string,
    avail: Record<string, unknown>,
  ): boolean {
    if (flavor !== 'expansion') return false;
    if (pkg.toLowerCase().includes('expansion')) return false;
    // Linux headless: core-linux_headless64 is the normal API channel; patches may still be named core_expansion-*.
    if (process.platform.startsWith('linux')) return false;
    return (
      process.platform === 'win32' && this.hasDedicatedExpansionPackage(avail)
    );
  }

  /** Match Python factorio_updater_select_package — expansion installs need expansion patches. */
  private selectPackage(
    avail: Record<string, unknown>,
    defaultPkg: string,
    flavor: string,
  ): string {
    const keys = this.listPackageKeys(avail);
    if (!keys.length) return defaultPkg;

    const isLinux = process.platform.startsWith('linux');

    if (flavor !== 'expansion') {
      if (keys.includes(defaultPkg)) return defaultPkg;
      const prefer: string[] = [];
      for (const k of keys) {
        const kl = k.toLowerCase();
        if (kl.includes('expansion')) continue;
        if (process.platform === 'win32' && kl.includes('win64'))
          prefer.push(k);
        else if (isLinux && kl.includes('linux') && kl.includes('headless'))
          prefer.push(k);
      }
      if (prefer.length) return prefer[0];
      return keys[0];
    }

    const guesses =
      process.platform === 'win32'
        ? [
            'expansion-win64',
            'core-win64-expansion',
            'win64-expansion',
            'full-win64',
            'expansion_win64',
            'expansion-win64-manual',
          ]
        : [
            'core_expansion-linux_headless64',
            'expansion-linux_headless64',
            'core-linux_headless64-expansion',
          ];

    for (const g of guesses) {
      if (g in avail) return g;
    }
    for (const k of keys) {
      const kl = k.toLowerCase();
      if (!kl.includes('expansion')) continue;
      if (process.platform === 'win32' && kl.includes('win64')) return k;
      if (isLinux && kl.includes('linux') && kl.includes('headless')) return k;
    }
    if (keys.includes(defaultPkg)) return defaultPkg;
    const expansionKey = keys.find((k) =>
      k.toLowerCase().includes('expansion'),
    );
    if (expansionKey) return expansionKey;
    return keys[0];
  }

  private async worker(
    ctx: {
      exe: string;
      user: string;
      token: string;
      pkg: string;
      flavor: string;
      serverPath: string;
      avail: Record<string, unknown>;
      experimental: boolean;
    },
    updates: { from: string; to: string }[],
  ): Promise<void> {
    const dlDir = join(tmpdir(), `fcc_factorio_upd_${Date.now()}`);
    mkdirSync(dlDir, { recursive: true });
    this.log(
      'info',
      `Package: ${ctx.pkg}`,
      'about_factorio_update_log_package',
      [ctx.pkg],
    );
    if (this.shouldWarnExpansionCoreMismatch(ctx.flavor, ctx.pkg, ctx.avail)) {
      this.log('warn', '', 'about_factorio_update_expansion_core_warn', [
        ctx.pkg,
      ]);
    }
    try {
      let completed = 0;
      for (const [idx, update] of updates.entries()) {
        if (this.state.stop_requested) throw new Error('cancelled');
        const installed = await this.installedVersion(ctx.serverPath, ctx.exe);
        if (installed) {
          if (compareVersions(installed, update.to) >= 0) {
            this.log(
              'info',
              `Already at ${installed}, skip patch ${update.from} -> ${update.to}`,
              'about_factorio_update_log_skip_already',
              [installed, update.from, update.to],
            );
            completed = idx + 1;
            continue;
          }
          if (compareVersions(installed, update.from) > 0) {
            this.log(
              'info',
              `Version ${installed} is ahead of planned ${update.from}, skip patch to ${update.to}`,
              'about_factorio_update_log_skip_ahead',
              [installed, update.from, update.to],
            );
            completed = idx + 1;
            continue;
          }
        }
        Object.assign(this.state, {
          current_step: idx + 1,
          from: update.from,
          to: update.to,
          phase: 'download',
          download_cur: 0,
          download_tot: 0,
        });
        let url: string;
        try {
          url = await this.getDownloadLink(
            ctx.user,
            ctx.token,
            ctx.pkg,
            update.from,
            update.to,
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          if (
            completed > 0 &&
            (await this.tryFinishPartialUpdate(
              ctx,
              installed || update.from,
              updates,
              idx,
            ))
          ) {
            return;
          }
          throw new Error(
            `get-download-link ${update.from}->${update.to}: ${msg}`,
          );
        }
        const zip = await this.downloadZip(url, dlDir);
        if (this.state.stop_requested) throw new Error('cancelled');
        this.log(
          'success',
          `Downloaded: ${basename(zip)} (${(statSync(zip).size / (1024 * 1024)).toFixed(1)} MB)`,
        );
        this.state.phase = 'apply';
        let stdout = '';
        let stderr = '';
        let exitCode = 0;
        try {
          const proc = await execFileAsync(ctx.exe, ['--apply-update', zip], {
            timeout: 900_000,
            windowsHide: true,
          });
          stdout = proc.stdout || '';
          stderr = proc.stderr || '';
        } catch (e) {
          const err = e as {
            stdout?: string;
            stderr?: string;
            code?: number | string;
          };
          stdout = err.stdout || '';
          stderr = err.stderr || '';
          exitCode = typeof err.code === 'number' ? err.code : 1;
        }
        if (stdout.trim()) this.log('out', stdout.trim());
        if (stderr.trim()) this.log('out', stderr.trim());
        await this.waitApplySlaves();
        const combined = `${stdout}\n${stderr}`.toLowerCase();
        if (combined.includes('unexpected content')) {
          this.fail('', 'about_factorio_update_log_unexpected_content');
          return;
        }
        if (exitCode !== 0) {
          this.fail('', 'about_factorio_update_log_exit_nonzero', [exitCode]);
          return;
        }
        rmSync(zip, { force: true });
        this.log('success', `Patch ${update.from} -> ${update.to} applied`);
        completed = idx + 1;
      }
      const finalVer = await this.installedVersion(ctx.serverPath, ctx.exe);
      this.state.phase = 'done';
      this.state.updated = true;
      this.state.final_to = finalVer || updates[updates.length - 1]?.to || '';
    } catch (e) {
      if (String((e as Error).message || e) === 'cancelled') {
        this.state.phase = 'cancelled';
        this.state.cancelled = true;
      } else {
        const msg = e instanceof Error ? e.message : String(e);
        const installed = await this.installedVersion(ctx.serverPath, ctx.exe);
        const stepIdx = Math.max(0, Number(this.state.current_step || 0) - 1);
        if (
          installed &&
          (await this.tryFinishPartialUpdate(ctx, installed, updates, stepIdx))
        ) {
          return;
        }
        this.fail(msg);
      }
    } finally {
      rmSync(dlDir, { recursive: true, force: true });
      this.state.running = false;
      this.state.finished_at = Date.now() / 1000;
      this.recordUpdateAudit();
    }
  }

  private recordUpdateAudit(): void {
    const phase = String(this.state.phase || '');
    if (!['done', 'error', 'cancelled'].includes(phase)) return;
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return;

    const partial = !!this.state.partial;
    const success = phase === 'done';
    const actor = String(this.state.actor || '').trim() || undefined;
    const trigger = String(this.state.audit_trigger || 'system') as
      | 'manual'
      | 'scheduled'
      | 'system';
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
    const fromVer = String(this.state.current || '');
    const toVer = String(this.state.final_to || '');
    const serverPath = String(
      this.state.server_path || sel.item.serverPath || '',
    ).trim();

    const maintenanceAuto = !!this.state.maintenance_auto;
    if (!maintenanceAuto) {
      this.auditLog.record({
        event_kind: 'factorio_update',
        instance_id: sel.item.id,
        instance_name: sel.item.name,
        actor,
        trigger,
        success,
        error: success
          ? undefined
          : String(this.state.error || this.state.error_key || phase),
        message_key: partial
          ? 'audit_event_factorio_update_partial'
          : 'audit_event_factorio_update',
        detail: {
          from: fromVer,
          to: toVer,
          partial,
          cancelled: phase === 'cancelled',
        },
        started_at: startedIso,
        finished_at: finishedIso,
      });
    }

    if (!serverPath) return;
    if (success) {
      try {
        markFactorioUpdated(serverPath);
      } catch {
        /* ignore */
      }
    }
    try {
      this.instanceHistory.recordFactorioUpdate(serverPath, actor, success, {
        from: fromVer,
        to: toVer,
        partial,
        error: success
          ? undefined
          : String(this.state.error || this.state.error_key || phase),
      });
    } catch {
      /* ignore history failures */
    }
  }

  private pickUpdates(
    avail: Record<string, unknown>,
    pkg: string,
    fromVersion: string,
    experimental: boolean,
  ): { updates: { from: string; to: string }[]; latest: [string, string] } {
    const rows = Array.isArray(avail[pkg])
      ? (avail[pkg] as Record<string, string>[])
      : [];
    const latest: [string, string] = ['', ''];
    for (const row of rows) if (!row.from) latest[0] = row.stable || latest[0];
    if (experimental) {
      for (const row of rows)
        if (row.from && (!latest[1] || compareVersions(row.to, latest[1]) > 0))
          latest[1] = row.to;
    }
    const map = new Map<string, string>();
    for (const row of rows) {
      if (!row.from) continue;
      if (compareVersions(row.from, fromVersion) < 0) continue;
      if (experimental || compareVersions(row.to, latest[0]) <= 0)
        map.set(row.from, row.to);
    }
    const updates: { from: string; to: string }[] = [];
    let cur = fromVersion;
    while (map.has(cur)) {
      const to = map.get(cur)!;
      if (!experimental && compareVersions(cur, latest[0]) >= 0) break;
      updates.push({ from: cur, to });
      cur = to;
    }
    return { updates, latest };
  }

  private async installedVersion(
    serverPath: string,
    exe: string,
  ): Promise<string> {
    const fromExe = await this.exeVersion(exe);
    if (fromExe) return fromExe;
    try {
      const saInfo = join(serverPath, 'data', 'space-age', 'info.json');
      if (existsSync(saInfo)) {
        const raw = JSON.parse(readFileSync(saInfo, 'utf-8')) as {
          version?: unknown;
        };
        const v = String(raw.version || '').trim();
        if (v) return v;
      }
    } catch {
      /* ignore */
    }
    return gameVersion(serverPath);
  }

  private async exeVersion(exe: string): Promise<string> {
    try {
      const { stdout } = await execFileAsync(exe, ['--version'], {
        timeout: 45_000,
      });
      return /Version:\s*(\d+\.\d+\.\d+)/.exec(stdout)?.[1] || '';
    } catch {
      return '';
    }
  }

  private resolveCredentials(
    settingsPath: string,
  ): { user: string; token: string } | null {
    const global =
      this.config.webPanel.global_username && this.config.webPanel.global_token
        ? {
            user: this.config.webPanel.global_username,
            token: this.config.webPanel.global_token,
          }
        : null;
    if (global) return global;
    if (!settingsPath || !existsSync(settingsPath)) return null;
    try {
      const data = JSON.parse(
        require('fs').readFileSync(settingsPath, 'utf-8'),
      ) as Record<string, string>;
      const user = String(
        data['service-username'] || data.username || '',
      ).trim();
      const token = String(data['service-token'] || data.token || '').trim();
      if (user && token) return { user, token };
    } catch {
      /* ignore */
    }
    return null;
  }

  private async tryFinishPartialUpdate(
    ctx: {
      exe: string;
      user: string;
      token: string;
      pkg: string;
      serverPath: string;
      experimental?: boolean;
    },
    installedVer: string,
    planned: { from: string; to: string }[],
    failedIndex: number,
  ): Promise<boolean> {
    const lastApplied = planned[failedIndex - 1]?.to;
    if (lastApplied && compareVersions(installedVer, lastApplied) < 0)
      return false;
    try {
      const avail = await this.getJson(
        'https://updater.factorio.com/get-available-versions',
        {
          username: ctx.user,
          token: ctx.token,
          apiVersion: '2',
        },
      );
      const picked = this.pickUpdates(
        avail,
        ctx.pkg,
        installedVer,
        !!ctx.experimental,
      );
      if (picked.updates.length) return false;
    } catch {
      if (!lastApplied || compareVersions(installedVer, lastApplied) < 0)
        return false;
    }
    this.state.phase = 'done';
    this.state.updated = true;
    this.state.partial = true;
    this.state.final_to = installedVer;
    this.state.error = '';
    this.state.error_key = '';
    this.log(
      'warn',
      `Update stopped after ${installedVer}; no further stable patches available`,
      'about_factorio_update_partial_ok',
      [installedVer],
    );
    return true;
  }

  private async fetchWithRetry(
    url: URL | string,
    init?: RequestInit,
    attempts = 4,
  ): Promise<Response> {
    let lastErr: unknown;
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await fetch(url, init);
      } catch (e) {
        lastErr = e;
        if (i < attempts - 1) {
          this.log(
            'warn',
            `Fetch retry ${i + 2}/${attempts}: ${e instanceof Error ? e.message : String(e)}`,
            'about_factorio_update_log_fetch_retry',
            [i + 2, attempts],
          );
          await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
        }
      }
    }
    throw lastErr instanceof Error
      ? lastErr
      : new Error(String(lastErr ?? 'fetch failed'));
  }

  private async getJson(
    url: string,
    params: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const u = new URL(url);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    const res = await this.fetchWithRetry(u, {
      headers: { 'User-Agent': 'FactorioControlCenter/2.0' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    return (await res.json()) as Record<string, unknown>;
  }

  private async getDownloadLink(
    user: string,
    token: string,
    pkg: string,
    from: string,
    to: string,
  ): Promise<string> {
    const data = await this.getJson(
      'https://updater.factorio.com/get-download-link',
      {
        username: user,
        token,
        package: pkg,
        from,
        to,
        apiVersion: '2',
      },
    );
    if (Array.isArray(data) && data[0]) return String(data[0]);
    if (typeof data === 'string') return data;
    throw new Error('Unexpected get-download-link response');
  }

  /** After --apply-update, Factorio may spawn a child updater that still reads the zip (Windows/Linux). */
  private async waitApplySlaves(timeoutSec = 300): Promise<void> {
    const deadline = Date.now() + timeoutSec * 1000;
    if (process.platform === 'win32') {
      while (Date.now() < deadline) {
        try {
          const { stdout, stderr } = await execFileAsync(
            'tasklist',
            ['/FI', 'IMAGENAME eq Factorio.exe', '/NH'],
            { timeout: 45_000, windowsHide: true },
          );
          const out = `${stdout || ''}${stderr || ''}`;
          if (!out.includes('Factorio.exe')) return;
        } catch {
          /* ignore poll errors */
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      return;
    }
    while (Date.now() < deadline) {
      let found = false;
      for (const name of ['factorio', 'Factorio']) {
        try {
          const { stdout } = await execFileAsync('pgrep', ['-x', name], {
            timeout: 15_000,
          });
          if ((stdout || '').trim()) {
            found = true;
            break;
          }
        } catch (e) {
          if ((e as NodeJS.ErrnoException).code === 'ENOENT') return;
        }
      }
      if (!found) return;
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  private async downloadZip(url: string, dir: string): Promise<string> {
    const name = basename(new URL(url).pathname) || 'factorio-update.zip';
    const out = join(dir, name);
    const res = await this.fetchWithRetry(url, {
      headers: { 'User-Agent': 'FactorioControlCenter/2.0' },
    });
    if (!res.ok || !res.body) throw new Error(`download_http_${res.status}`);
    const total = Number(res.headers.get('content-length') || 0);
    const ws = createWriteStream(out);
    let done = 0;
    const reader = res.body.getReader();
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      const buf = Buffer.from(chunk.value);
      done += buf.length;
      this.state.download_cur = done;
      this.state.download_tot = total;
      ws.write(buf);
    }
    await new Promise<void>((resolve, reject) =>
      ws.end((e?: Error) => (e ? reject(e) : resolve())),
    );
    new AdmZip(out).test();
    return out;
  }

  private log(
    level: string,
    text: string,
    key?: string,
    args?: unknown[],
  ): void {
    const entry: Record<string, unknown> = { ts: Date.now() / 1000, level };
    if (key) {
      entry.key = key;
      if (args?.length) entry.args = args;
    } else {
      entry.text = text;
    }
    this.state.log.push(entry);
    if (this.state.log.length > 500)
      this.state.log.splice(0, this.state.log.length - 500);
  }

  private fail(error: string, errorKey = '', errorArgs: unknown[] = []): void {
    this.state.phase = 'error';
    this.state.error = error;
    this.state.error_key = errorKey;
    this.state.error_args = errorArgs;
    if (error) this.log('error', error);
    else if (errorKey) this.log('error', '', errorKey, errorArgs);
  }

  private idle() {
    return {
      running: false,
      phase: 'idle',
      current_step: 0,
      total_steps: 0,
      from: '',
      to: '',
      download_cur: 0,
      download_tot: 0,
      log: [] as Record<string, unknown>[],
      error: '',
      error_key: '',
      error_args: [] as unknown[],
      cancelled: false,
      updated: false,
      partial: false,
      current: '',
      latest_stable: '',
      final_to: '',
      server_path: '',
      stop_requested: false,
      started_at: 0,
      finished_at: 0,
      actor: '',
      audit_trigger: 'system',
      maintenance_auto: false,
    };
  }
}
