import { Injectable } from '@nestjs/common';
import AdmZip from 'adm-zip';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'fs';
import { basename, join } from 'path';
import { FccConfigService } from '../../config/fcc-config.service';
import { InstancesService } from '../../instances/instances.service';
import { ModPortalService } from '../mod-portal/mod-portal.service';
import { RuntimeService } from '../runtime.service';
import {
  OpResult,
  compareVersions,
  copyFileUnique,
  ensureModListEntry,
  gameVersion,
  hasSpaceAge,
  installedModVersions,
  isErrorResult,
  latestVersion,
  modNameFromZip,
  readModList,
  readModManifest,
  safeName,
  selectedInstance,
  writeModList,
} from '../ops-utils';
import {
  loadServerData,
  saveServerData,
  trackModInstallMeta,
  BUILTIN_MOD_AUTHOR,
  resolveBuiltinModInstallDate,
} from '../instance-server-data';
import {
  buildInstallConflictInfo,
  isBuiltinModName,
  isOptionalDependencyString,
  isSpaceAgeDependency,
  manifestConflictNames,
  manifestRequiresSpaceAge,
  normalizeModListName,
  parseDependencyModName,
  portalDependencyNames,
  releaseRequiresSpaceAge,
  type ModInstallConflictInfo,
} from '../mod-deps';
import { ModsJobService } from './mods-job.service';
import { ModPlanService } from './mod-plan.service';
import {
  normalizeModUiLang,
  resolveModDisplayTitlesBatch,
} from '../mod-display-titles.util';

const PORTAL_CHECK_WORKERS = 10;
const PORTAL_VERSION_CACHE_TTL_SEC = 300;

interface ModPortalCheckResult {
  ok: boolean;
  version: string;
  error: string;
}

interface ModCheckState {
  ok: boolean;
  running: boolean;
  started_at: number;
  finished_at: number;
  total: number;
  done: number;
  ok_count: number;
  failed: number;
  error: string;
  generation: number;
  results: Record<string, ModPortalCheckResult>;
}

@Injectable()
export class ModsOpsService {
  private checkState: ModCheckState = ModsOpsService.emptyCheckState();
  private portalVersionCache = new Map<
    string,
    { ts: number; data: ModPortalCheckResult }
  >();

  private static emptyCheckState(): ModCheckState {
    return {
      ok: true,
      running: false,
      started_at: 0,
      finished_at: 0,
      total: 0,
      done: 0,
      ok_count: 0,
      failed: 0,
      error: '',
      generation: 0,
      results: {},
    };
  }

  constructor(
    private readonly instances: InstancesService,
    private readonly runtime: RuntimeService,
    private readonly portal: ModPortalService,
    private readonly config: FccConfigService,
    private readonly jobs: ModsJobService,
    private readonly modPlan: ModPlanService,
  ) {}

  async list(uiLangRaw?: string): Promise<OpResult> {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    mkdirSync(sel.pm.modsDir, { recursive: true });
    const modList = readModList(sel.pm);
    const installMeta = loadServerData(sel.item.serverPath);
    const builtinInstallDate = resolveBuiltinModInstallDate(
      sel.item.serverPath,
    );
    const rows = modList.mods
      .filter((row) => String(row.name || '').toLowerCase() !== 'base')
      .map((row) => {
        const name = String(row.name || '').trim();
        const versions = installedModVersions(sel.pm.modsDir, name);
        const pinned = String(row.version || '').trim();
        const local = pinned || latestVersion(versions);
        const zip = local ? join(sel.pm.modsDir, `${name}_${local}.zip`) : '';
        const manifest = zip && existsSync(zip) ? readModManifest(zip) : null;
        const isBuiltin = this.portal.isBuiltin(name);
        let portalVersion = '';
        if (isBuiltin) {
          portalVersion = gameVersion(sel.item.serverPath) || local || '-';
        } else {
          const cached = this.portalVersionFromCache(name);
          if (cached.ok) portalVersion = cached.version;
          else if (cached.error === 'not_checked') portalVersion = '-';
          else portalVersion = '~';
        }
        return {
          name,
          display_name: name,
          enabled: row.enabled !== false,
          is_builtin: isBuiltin,
          local_version:
            local || (isBuiltin ? gameVersion(sel.item.serverPath) : ''),
          portal_version: portalVersion,
          available_versions: versions,
          pinned_version: pinned || null,
          zip_size_bytes: zip && existsSync(zip) ? statSync(zip).size : 0,
          author: isBuiltin
            ? BUILTIN_MOD_AUTHOR
            : String(manifest?.author || ''),
          install_date: isBuiltin
            ? builtinInstallDate
            : String(installMeta.mod_install_dates[name] || ''),
          installed_by: isBuiltin
            ? '__builtin__'
            : String(installMeta.mod_install_by[name] || ''),
        };
      });
    const uiLang = normalizeModUiLang(uiLangRaw, this.config.langCode);
    const titles = resolveModDisplayTitlesBatch({
      serverPath: sel.item.serverPath,
      modsDir: sel.pm.modsDir,
      modNames: rows.map((r) => r.name),
      uiLang,
      translateModNames: this.config.translateModNames,
    });
    for (const row of rows) {
      row.display_name = titles[row.name] || row.display_name;
    }
    const portalUsername =
      await this.portal.resolveVerifiedServerSettingsUsername(sel.pm);
    return {
      ok: true,
      mods: rows,
      game_version: gameVersion(sel.item.serverPath),
      remove_old_zips: this.readRemoveOldZips(sel.item.serverPath),
      portal_username: portalUsername,
    };
  }

  setPrefs(removeOldZips: unknown): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const prev = this.readRemoveOldZips(sel.item.serverPath);
    const next = removeOldZips == null ? true : !!removeOldZips;
    const sd = loadServerData(sel.item.serverPath);
    sd.mod_prefs = { remove_old_zips: next };
    saveServerData(sel.item.serverPath, sd);
    const changes =
      prev !== next
        ? [
            {
              key: 'remove_old_zips',
              from: prev ? 'true' : 'false',
              to: next ? 'true' : 'false',
            },
          ]
        : [];
    return { ok: true, remove_old_zips: next, settings_changes: changes };
  }

  private readRemoveOldZips(serverPath: string): boolean {
    const sd = loadServerData(serverPath);
    return sd.mod_prefs?.remove_old_zips !== false;
  }

  checkUpdatesStart(kwargs: Record<string, unknown> = {}): OpResult {
    if (this.checkState.running) {
      return {
        ok: true,
        started: false,
        reason: 'already_running',
        ...this.checkStatusPayload(),
      };
    }
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const ignoreBlock = !!kwargs.ignoreBlockUpdates;
    if (!ignoreBlock && sel.item.blockUpdates) {
      return {
        ok: true,
        started: false,
        reason: 'updates_blocked_by_instance_setting',
        total: 0,
      };
    }

    const names = Array.from(
      new Set(
        readModList(sel.pm)
          .mods.map((row) => String(row.name || '').trim())
          .filter((name) => name && !this.portal.isBuiltin(name)),
      ),
    ).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

    if (!names.length) {
      return { ok: true, started: false, reason: 'no_portal_mods', total: 0 };
    }

    for (const name of names) this.portalVersionCache.delete(name);

    this.checkState = {
      ...ModsOpsService.emptyCheckState(),
      running: true,
      started_at: Date.now() / 1000,
      total: names.length,
      generation: this.checkState.generation + 1,
    };
    void this.checkUpdatesWorker(names);
    return { ok: true, started: true, total: names.length };
  }

  checkUpdatesStatus(): OpResult {
    return { ...this.checkStatusPayload() };
  }

  private checkStatusPayload(): Record<string, unknown> {
    return {
      ok: true,
      running: this.checkState.running,
      started_at: this.checkState.started_at,
      finished_at: this.checkState.finished_at,
      total: this.checkState.total,
      done: this.checkState.done,
      failed: this.checkState.failed,
      error: this.checkState.error,
      generation: this.checkState.generation,
      results: { ...this.checkState.results },
    };
  }

  setEnabled(name: string, enabled: boolean): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    if (this.runtime.isRunning(sel.item.id))
      return { ok: false, error: 'server_running' };
    const rows = readModList(sel.pm).mods;
    const row = rows.find(
      (r) => String(r.name || '') === String(name || '').trim(),
    );
    if (!row) return { ok: false, error: 'not_found' };
    row.enabled = !!enabled;
    writeModList(sel.pm, rows);
    return { ok: true };
  }

  setAllNonBuiltinEnabled(enabled: boolean): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    if (this.runtime.isRunning(sel.item.id))
      return { ok: false, error: 'server_running' };
    const rows = readModList(sel.pm).mods;
    let changed = 0;
    for (const row of rows) {
      const name = String(row.name || '').trim();
      if (!name || this.portal.isBuiltin(name)) continue;
      if (!!row.enabled !== !!enabled) changed += 1;
      row.enabled = !!enabled;
    }
    writeModList(sel.pm, rows);
    return { ok: true, enabled: !!enabled, changed };
  }

  getChangelog(name: string): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const n = String(name || '').trim();
    const version = latestVersion(installedModVersions(sel.pm.modsDir, n));
    if (!version) return { ok: false, error: 'not_found' };
    const zp = join(sel.pm.modsDir, `${n}_${version}.zip`);
    try {
      const zip = new AdmZip(zp);
      const entry = zip
        .getEntries()
        .find((e) => /(^|\/)changelog\.txt$/i.test(e.entryName));
      if (!entry) return { ok: false, error: 'changelog_not_found' };
      return {
        ok: true,
        name: n,
        version,
        text: zip.readAsText(entry, 'utf-8'),
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  setVersion(name: string, version: string): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    if (this.runtime.isRunning(sel.item.id))
      return { ok: false, error: 'server_running' };
    const versions = installedModVersions(sel.pm.modsDir, name);
    if (versions.length <= 1) return { ok: false, error: 'no_multi_version' };
    if (!versions.includes(version))
      return { ok: false, error: 'invalid_version' };
    const rows = readModList(sel.pm).mods;
    const row = rows.find((r) => String(r.name || '') === name);
    if (!row) return { ok: false, error: 'not_found' };
    row.version = version;
    writeModList(sel.pm, rows);
    return { ok: true };
  }

  remove(name: string, scope = 'all', version = ''): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    if (this.runtime.isRunning(sel.item.id))
      return { ok: false, error: 'server_running' };
    if (this.portal.isBuiltin(name)) return { ok: false, error: 'builtin' };
    const rows = readModList(sel.pm).mods;
    if (scope === 'version' || scope === 'one') {
      if (!version) return { ok: false, error: 'empty_version' };
      const zp = join(sel.pm.modsDir, `${name}_${version}.zip`);
      if (!existsSync(zp)) return { ok: false, error: 'zip_not_found' };
      rmSync(zp, { force: true });
    } else {
      for (const f of readdirSync(sel.pm.modsDir)) {
        if (modNameFromZip(f).toLowerCase() === name.toLowerCase())
          rmSync(join(sel.pm.modsDir, f), { force: true });
      }
      writeModList(
        sel.pm,
        rows.filter(
          (r) => String(r.name || '').toLowerCase() !== name.toLowerCase(),
        ),
      );
    }
    return { ok: true };
  }

  uploadArchive(tmpPath: string, name: string, actor = ''): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    if (!existsSync(tmpPath)) return { ok: false, error: 'tmp_not_found' };
    const final = copyFileUnique(
      tmpPath,
      sel.pm.modsDir,
      basename(name || tmpPath),
    );
    const zipPath = join(sel.pm.modsDir, final);
    const modName = modNameFromZip(final);
    const manifest = readModManifest(zipPath);
    const serverHasSpaceAge = hasSpaceAge(sel.item.serverPath);
    if (!serverHasSpaceAge && manifestRequiresSpaceAge(manifest)) {
      rmSync(zipPath, { force: true });
      return { ok: false, error: 'requires_space_age', mod_name: modName };
    }
    ensureModListEntry(sel.pm, modName, true);
    trackModInstallMeta(sel.item.serverPath, [modName], actor, false);
    const required_dependencies = this.manifestPortalDependencies(
      manifest,
      serverHasSpaceAge,
    );
    const installTreeLower = new Set([normalizeModListName(modName)]);
    const conflictEntries = manifestConflictNames(manifest).map((name) => ({
      name,
      is_builtin: isBuiltinModName(name),
    }));
    const install_conflicts = buildInstallConflictInfo(
      readModList(sel.pm),
      conflictEntries,
      installTreeLower,
    );
    return {
      ok: true,
      name: modName,
      mod_name: modName,
      kind: 'mod_zip',
      file: final,
      required_dependencies,
      install_conflicts,
      conflicts_to_disable: install_conflicts.map((x) => x.name),
    };
  }

  disableConflicts(names: unknown): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    if (this.runtime.isRunning(sel.item.id))
      return { ok: false, error: 'server_running' };
    const list = Array.isArray(names)
      ? names.map((n) => String(n || '').trim()).filter(Boolean)
      : [];
    if (!list.length) return { ok: true, disabled: [] as string[] };
    const disabled = this.modPlan.disableConflictingMods(sel.pm, list);
    return { ok: true, disabled };
  }

  downloadPath(name: string): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const target = String(name || '').trim();
    for (const f of readdirSync(sel.pm.modsDir)) {
      if (f === target || modNameFromZip(f) === target)
        return { ok: true, path: join(sel.pm.modsDir, f), name: f };
    }
    return { ok: false, error: 'not_found' };
  }

  buildArchive(): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const out = join(require('os').tmpdir(), `fcc_mods_${Date.now()}.zip`);
    const zip = new AdmZip();
    for (const f of readdirSync(sel.pm.modsDir)) {
      if (f.toLowerCase().endsWith('.zip'))
        zip.addLocalFile(join(sel.pm.modsDir, f));
    }
    zip.writeZip(out);
    const archiveName = `${safeName(sel.item.name, 'server')}-mods.zip`;
    return { ok: true, path: out, name: archiveName };
  }

  async installPlan(mod: string): Promise<OpResult> {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    return this.modPlan.installPlanDetail(sel.pm, mod) as Promise<OpResult>;
  }

  async installPlanBatch(mods: unknown): Promise<OpResult> {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const names = Array.isArray(mods)
      ? mods
          .map((m) => this.portal.modIdFromInput(String(m || '')))
          .filter(
            (m) =>
              m &&
              !m.startsWith('!') &&
              !this.portal.isBuiltin(m) &&
              this.portal.isValidPortalModId(m),
          )
      : [];
    if (!names.length) return { ok: false, error: 'empty_name' };

    const mergedNeed = new Map<
      string,
      { current_factorio: string; required_factorio: string }
    >();
    const planErrors: { mod: string; error: string }[] = [];
    const conflictsMerged: string[] = [];
    const installConflictsMerged = new Map<string, ModInstallConflictInfo>();

    for (const mid of names) {
      const pr = await this.modPlan.installPlanDetail(sel.pm, mid);
      if (pr.ok === false) {
        planErrors.push({ mod: mid, error: String(pr.error || 'plan_failed') });
        continue;
      }
      for (const row of pr.mods_needing_game_update) {
        if (!mergedNeed.has(row.name)) {
          mergedNeed.set(row.name, {
            current_factorio: row.current_factorio,
            required_factorio: row.required_factorio,
          });
        }
      }
      for (const c of pr.conflicts_to_disable || []) {
        if (!conflictsMerged.some((x) => x.toLowerCase() === c.toLowerCase()))
          conflictsMerged.push(c);
      }
      for (const ic of pr.install_conflicts || []) {
        const key = ic.name.toLowerCase();
        if (!installConflictsMerged.has(key))
          installConflictsMerged.set(key, ic);
      }
    }

    const installConflicts = [...installConflictsMerged.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    const modsNeedGame = [...mergedNeed.entries()]
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => a.name.localeCompare(b.name));

    const out: OpResult = {
      ok: true,
      mods: names,
      game_version: gameVersion(sel.item.serverPath),
      mods_needing_game_update: modsNeedGame,
      requires_game_update_confirmation: modsNeedGame.length > 0,
      conflicts_to_disable: conflictsMerged.sort((a, b) => a.localeCompare(b)),
      requires_conflict_confirmation: conflictsMerged.length > 0,
      install_conflicts: installConflicts,
    };
    if (planErrors.length) out.plan_errors = planErrors;
    return out;
  }

  async updateAllPlan(): Promise<OpResult> {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    if (sel.item.blockUpdates)
      return { ok: false, error: 'updates_blocked_by_instance_setting' };

    const rootSet = new Set(
      readModList(sel.pm)
        .mods.map((r) => String(r.name || '').trim())
        .filter((n) => n && !this.portal.isBuiltin(n)),
    );

    const modsNeedGame = await this.modPlan.scanUpdatesNeedingNewerGame(sel.pm);
    const depsExtra: string[] = [];

    try {
      const plan = await this.modPlan.planUpdateAll(sel.pm, true, true);
      const seen = new Set<string>();
      for (const item of plan) {
        const n = String(item.name || '').trim();
        if (!n || rootSet.has(n) || seen.has(n)) continue;
        seen.add(n);
        depsExtra.push(n);
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }

    depsExtra.sort((a, b) => a.localeCompare(b));
    const roots = await this.modPlan.updateRootModIds(sel.pm);
    const conflictMeta = await this.modPlan.installConflictMetaForRoots(
      sel.pm,
      roots,
    );
    return {
      ok: true,
      dependencies: depsExtra,
      requires_confirmation:
        depsExtra.length > 0 || conflictMeta.conflicts_to_disable.length > 0,
      game_version: gameVersion(sel.item.serverPath),
      mods_needing_game_update: modsNeedGame,
      requires_game_update_confirmation: modsNeedGame.length > 0,
      conflicts_to_disable: conflictMeta.conflicts_to_disable,
      requires_conflict_confirmation:
        conflictMeta.conflicts_to_disable.length > 0,
      install_conflicts: conflictMeta.install_conflicts,
    };
  }

  jobStart(mode: string, params: Record<string, unknown>): OpResult {
    return this.jobs.start(mode, params);
  }

  jobStatus(): OpResult {
    return this.jobs.status();
  }

  jobStop(): OpResult {
    return this.jobs.stop();
  }

  private async checkUpdatesWorker(names: string[]): Promise<void> {
    const workers = Math.max(1, Math.min(PORTAL_CHECK_WORKERS, names.length));
    let index = 0;

    const worker = async (): Promise<void> => {
      while (true) {
        const i = index;
        index += 1;
        if (i >= names.length) return;
        const modName = names[i];
        const pv = await this.portalVersionsForMod(modName);
        this.portalVersionCache.set(modName, {
          ts: Date.now() / 1000,
          data: pv,
        });
        this.checkState.done += 1;
        if (pv.ok) this.checkState.ok_count += 1;
        else this.checkState.failed += 1;
        this.checkState.results[modName] = pv;
      }
    };

    try {
      await Promise.all(Array.from({ length: workers }, () => worker()));
    } catch (e) {
      this.checkState.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.checkState.running = false;
      this.checkState.finished_at = Date.now() / 1000;
    }
  }

  private portalVersionFromCache(
    modName: string,
  ): ModPortalCheckResult & { cached?: boolean } {
    const cached = this.portalVersionCache.get(modName);
    if (!cached)
      return { ok: false, version: '', error: 'not_checked', cached: false };
    if (Date.now() / 1000 - cached.ts > PORTAL_VERSION_CACHE_TTL_SEC) {
      return { ok: false, version: '', error: 'not_checked', cached: false };
    }
    return { ...cached.data, cached: true };
  }

  private async portalVersionsForMod(
    modName: string,
  ): Promise<ModPortalCheckResult> {
    const cached = this.portalVersionFromCache(modName);
    if (cached.cached) return cached;

    let lastErr = 'unknown';
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const meta = await this.portal.fetchFull(modName);
        const rel = this.portal.lastRelease(meta);
        const version = String(rel?.version || '').trim();
        if (!version) {
          const out = { ok: false, version: '', error: 'no_release' };
          this.portalVersionCache.set(modName, {
            ts: Date.now() / 1000,
            data: out,
          });
          return out;
        }
        const out = { ok: true, version, error: '' };
        this.portalVersionCache.set(modName, {
          ts: Date.now() / 1000,
          data: out,
        });
        return out;
      } catch (e) {
        lastErr = e instanceof Error ? e.message : String(e);
        const transient =
          /^(http_408|http_425|http_429|http_5\d\d|timeout|fetch)/i.test(
            lastErr,
          );
        if (!transient && attempt >= 1) break;
        if (attempt < 3) await new Promise((r) => setTimeout(r, 400 * attempt));
      }
    }
    const out = { ok: false, version: '', error: lastErr || 'unknown' };
    this.portalVersionCache.set(modName, { ts: Date.now() / 1000, data: out });
    return out;
  }

  private currentGameVersion(): string {
    const sel = selectedInstance(this.instances);
    return isErrorResult(sel) ? '' : gameVersion(sel.item.serverPath);
  }

  private manifestPortalDependencies(
    manifest: Record<string, unknown> | null,
    serverHasSpaceAge: boolean,
  ): string[] {
    if (!manifest) return [];
    const deps = manifest.dependencies;
    if (!Array.isArray(deps)) return [];
    const out: string[] = [];
    for (const dep of deps) {
      const raw = String(dep || '');
      if (isOptionalDependencyString(raw)) continue;
      const name = this.portal.modIdFromInput(parseDependencyModName(raw));
      if (!name || isBuiltinModName(name)) continue;
      if (!serverHasSpaceAge && isSpaceAgeDependency(raw)) continue;
      if (!out.some((x) => x.toLowerCase() === name.toLowerCase()))
        out.push(name);
    }
    return out;
  }

  private isModInstalled(modsDir: string, modName: string): boolean {
    return installedModVersions(modsDir, modName).length > 0;
  }

  private async collectMissingPortalDependencies(
    seedMods: string[],
    modsDir: string,
    serverHasSpaceAge: boolean,
  ): Promise<string[]> {
    const planned = new Set<string>();
    const missing: string[] = [];
    const queue = seedMods
      .map((m) => this.portal.modIdFromInput(String(m || '')))
      .filter((m) => m && !this.portal.isBuiltin(m));

    for (const root of queue) planned.add(root.toLowerCase());

    while (queue.length) {
      const name = queue.shift()!;

      try {
        const meta = await this.portal.fetchFull(name);
        const rel = this.portal.lastRelease(meta);
        for (const dep of portalDependencyNames(rel)) {
          const depName = this.portal.modIdFromInput(dep);
          if (!depName || this.portal.isBuiltin(depName)) continue;
          if (!serverHasSpaceAge && isSpaceAgeDependency(dep)) continue;
          const key = depName.toLowerCase();
          if (planned.has(key)) continue;
          planned.add(key);
          queue.push(depName);
        }
      } catch {
        /* skip portal errors while resolving dependency tree */
      }

      const key = name.toLowerCase();
      if (
        !this.isModInstalled(modsDir, name) &&
        !missing.some((x) => x.toLowerCase() === key)
      ) {
        missing.push(name);
      }
    }

    return missing.filter((name) => !this.isModInstalled(modsDir, name));
  }
}
