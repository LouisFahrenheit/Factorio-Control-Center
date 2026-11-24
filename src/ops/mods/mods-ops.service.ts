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
import { tmpdir } from 'os';
import { FccConfigService } from '../../config/fcc-config.service';
import { InstancesService } from '../../instances/instances.service';
import {
  ModPortalService,
  type ModPortalSortBy,
} from '../mod-portal/mod-portal.service';
import { RuntimeService } from '../runtime.service';
import {
  OpResult,
  compareVersions,
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
  isConflictDependencyName,
  isOptionalDependencyString,
  isSpaceAgeDependency,
  manifestConflictNames,
  manifestRequiresSpaceAge,
  normalizeModListName,
  parseConflictModName,
  parseDependencyModName,
  portalDependencyNames,
  serverHasBuiltinRecycler,
  type ModInstallConflictInfo,
} from '../mod-deps';
import { ModsJobService } from './mods-job.service';
import { ModPlanService } from './mod-plan.service';
import {
  normalizeModUiLang,
  resolveModDisplayTitlesBatch,
} from '../mod-display-titles.util';
import { safeStr, safeTrim } from '../../common/trim.util';

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
      .filter((row) => safeTrim(row.name).toLowerCase() !== 'base')
      .map((row) => {
        const name = safeTrim(row.name);
        const versions = installedModVersions(sel.pm.modsDir, name);
        const pinned = safeTrim(row.version);
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
          author: isBuiltin ? BUILTIN_MOD_AUTHOR : safeStr(manifest?.author),
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
    let portalUsername =
      await this.portal.resolveVerifiedServerSettingsUsername(sel.pm);
    let portalUsernameSource = portalUsername ? 'server-settings.json' : '';
    if (!portalUsername && typeof this.portal.loadCredentials === 'function') {
      const creds = this.portal.loadCredentials(
        sel.pm,
        this.config.webPanel?.global_username,
        this.config.webPanel?.global_token,
      );
      const fallbackUsername = safeTrim(creds?.user);
      if (fallbackUsername) {
        portalUsername = fallbackUsername;
        portalUsernameSource =
          safeTrim(this.config.webPanel?.global_username) &&
          safeTrim(this.config.webPanel?.global_token)
            ? 'webPanel (global)'
            : 'server-settings.json';
      }
    }
    return {
      ok: true,
      mods: rows,
      game_version: gameVersion(sel.item.serverPath),
      remove_old_zips: this.readRemoveOldZips(sel.item.serverPath),
      portal_username: portalUsername,
      portal_username_source: portalUsernameSource,
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
          .mods.map((row) => safeTrim(row.name))
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
    const row = rows.find((r) => safeStr(r.name) === safeTrim(name));
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
      const name = safeTrim(row.name);
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
    const row = rows.find((r) => safeStr(r.name) === name);
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
      const remaining = installedModVersions(sel.pm.modsDir, name);
      if (!remaining.length) {
        writeModList(
          sel.pm,
          rows.filter(
            (r) => safeTrim(r.name).toLowerCase() !== name.toLowerCase(),
          ),
        );
      } else {
        const row = rows.find(
          (r) => safeTrim(r.name).toLowerCase() === name.toLowerCase(),
        );
        if (row && row.version === version) {
          row.version = latestVersion(remaining);
          writeModList(sel.pm, rows);
        }
      }
    } else {
      for (const f of readdirSync(sel.pm.modsDir)) {
        if (modNameFromZip(f).toLowerCase() === name.toLowerCase())
          rmSync(join(sel.pm.modsDir, f), { force: true });
      }
      writeModList(
        sel.pm,
        rows.filter(
          (r) => safeTrim(r.name).toLowerCase() !== name.toLowerCase(),
        ),
      );
    }
    return { ok: true };
  }

  uploadArchive(tmpPath: string, name: string, actor = ''): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    if (!existsSync(tmpPath)) return { ok: false, error: 'tmp_not_found' };
    const manifest = readModManifest(tmpPath);
    if (
      !manifest ||
      typeof manifest !== 'object' ||
      typeof manifest.name !== 'string' ||
      !manifest.name.trim() ||
      typeof manifest.version !== 'string' ||
      !manifest.version.trim()
    ) {
      const fallbackName = modNameFromZip(basename(name || tmpPath));
      return {
        ok: false,
        error: 'invalid_mod_archive',
        mod_name: fallbackName,
      };
    }

    const modName = manifest.name.trim();
    const modVersion = manifest.version.trim();
    const serverHasSpaceAge = hasSpaceAge(sel.item.serverPath);
    if (!serverHasSpaceAge && manifestRequiresSpaceAge(manifest)) {
      return { ok: false, error: 'requires_space_age', mod_name: modName };
    }

    mkdirSync(sel.pm.modsDir, { recursive: true });
    const final = `${modName}_${modVersion}.zip`;
    const zipPath = join(sel.pm.modsDir, final);

    copyFileSync(tmpPath, zipPath);

    // Clean up any stale duplicate suffixes like mod_1.0.0_1.zip which cause Factorio to crash on boot
    try {
      for (const f of readdirSync(sel.pm.modsDir)) {
        if (
          f !== final &&
          f
            .toLowerCase()
            .startsWith(
              `${modName.toLowerCase()}_${modVersion.toLowerCase()}_`,
            ) &&
          f.toLowerCase().endsWith('.zip')
        ) {
          rmSync(join(sel.pm.modsDir, f), { force: true });
        }
      }
    } catch {
      /* ignore */
    }

    if (this.readRemoveOldZips(sel.item.serverPath)) {
      this.portal.pruneOldZips(modName, modVersion, sel.pm.modsDir);
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

  buildArchive(options?: {
    includeDisabled?: boolean;
    includeSettings?: boolean;
  }): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const includeDisabled = options?.includeDisabled !== false;
    const includeSettings = options?.includeSettings === true;

    let enabledNames: Set<string> | null = null;
    if (!includeDisabled) {
      const modList = readModList(sel.pm);
      enabledNames = new Set(
        modList.mods
          .filter((r) => r.enabled !== false)
          .map((r) => safeTrim(r.name).toLowerCase())
          .filter(Boolean),
      );
    }

    const out = join(tmpdir(), `fcc_mods_${Date.now()}.zip`);
    const zip = new AdmZip();
    for (const f of readdirSync(sel.pm.modsDir)) {
      if (!f.toLowerCase().endsWith('.zip')) continue;
      if (enabledNames) {
        const modName = safeTrim(modNameFromZip(f)).toLowerCase();
        if (!modName || !enabledNames.has(modName)) continue;
      }
      zip.addLocalFile(join(sel.pm.modsDir, f));
    }
    if (includeSettings && existsSync(sel.pm.modSettingsDat)) {
      zip.addLocalFile(sel.pm.modSettingsDat);
    }
    zip.writeZip(out);
    const archiveName = `${safeName(sel.item.name, 'server')}-mods.zip`;
    return { ok: true, path: out, name: archiveName };
  }

  async installPlan(mod: string, version?: string): Promise<OpResult> {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    return this.modPlan.installPlanDetail(
      sel.pm,
      mod,
      version,
    ) as Promise<OpResult>;
  }

  private parseCsvParam(val: unknown): string[] {
    if (Array.isArray(val)) {
      return val.map((x) => safeTrim(x).toLowerCase()).filter(Boolean);
    }
    const raw = safeTrim(val);
    if (!raw) return [];
    return raw
      .split(',')
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean);
  }

  async searchPortal(
    query: string,
    limit = 40,
    onlyCompatible = true,
    extra?: Record<string, unknown>,
  ): Promise<OpResult> {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    try {
      const gv = gameVersion(sel.item.serverPath);
      const serverFv = this.portal.factorioMajorMinor(gv);
      const creds =
        typeof this.portal.loadCredentials === 'function'
          ? this.portal.loadCredentials(
              sel.pm,
              this.config.webPanel?.global_username,
              this.config.webPanel?.global_token,
            )
          : null;

      const bookmarksPromise = (async (): Promise<string[]> => {
        if (!creds || typeof this.portal.fetchBookmarks !== 'function') {
          return [];
        }
        try {
          return await this.portal.fetchBookmarks(creds.user, creds.token);
        } catch {
          return [];
        }
      })();
      const bookmarksLowerPromise = bookmarksPromise.then(
        (list) => new Set(list.map((b) => b.toLowerCase())),
      );

      const rawVersion =
        extra?.version !== undefined ? safeTrim(extra.version) : undefined;
      const rawSpaceAge = safeTrim(extra?.space_age).toLowerCase();
      const spaceAgeMode: 'neutral' | 'include' | 'exclude' =
        rawSpaceAge === 'include' || rawSpaceAge === 'exclude'
          ? rawSpaceAge
          : 'neutral';
      const rawSort = safeTrim(extra?.sort).toLowerCase();
      const sortBy: ModPortalSortBy =
        rawSort === 'downloads' ||
        rawSort === 'updated' ||
        rawSort === 'trending'
          ? rawSort
          : 'relevance';
      const parsedPage = Number(extra?.page);
      const page =
        Number.isFinite(parsedPage) && parsedPage >= 1
          ? Math.floor(parsedPage)
          : 1;

      const hideInstalled = Boolean(extra?.hide_installed);
      const onlyInstalled = Boolean(extra?.only_installed);
      const onlyUpdates = Boolean(extra?.only_updates);
      const installedNamesLower = new Set<string>();
      if (
        (hideInstalled || onlyInstalled || onlyUpdates) &&
        existsSync(sel.pm.modsDir)
      ) {
        try {
          for (const f of readdirSync(sel.pm.modsDir)) {
            if (!/\.zip$/i.test(f)) continue;
            const mName = modNameFromZip(f).trim().toLowerCase();
            if (mName) installedNamesLower.add(mName);
          }
        } catch {
          /* ignore unreadable modsDir */
        }
      }

      const modList = readModList(sel.pm);
      const pinnedMap = new Map<string, string>();
      for (const row of modList.mods) {
        const key = safeTrim(row.name).toLowerCase();
        const pinned = safeTrim(row.version);
        if (key && pinned) pinnedMap.set(key, pinned);
      }
      const resolveInstalledVersion = (name: string): string => {
        const installedVers = installedModVersions(sel.pm.modsDir, name);
        const pinned = pinnedMap.get(name.toLowerCase()) || '';
        return (
          (pinned && installedVers.includes(pinned) ? pinned : '') ||
          latestVersion(installedVers) ||
          ''
        );
      };

      const searchRes = await this.portal.searchMods(query, {
        factorioVersion: rawVersion,
        gameVersion: gv,
        page,
        limit,
        sort: sortBy,
        onlyCompatible,
        includeDeprecated: Boolean(extra?.include_deprecated),
        spaceAgeMode,
        includeCategories: this.parseCsvParam(extra?.include_categories),
        excludeCategories: this.parseCsvParam(extra?.exclude_categories),
        onlyBookmarked: Boolean(extra?.only_bookmarked),
        bookmarkedNamesLower: bookmarksLowerPromise,
        searchInDescription: extra?.search_in_description !== false,
        owner: safeTrim(extra?.owner),
        hideInstalled: hideInstalled && !onlyUpdates,
        onlyInstalled: onlyInstalled || onlyUpdates,
        installedNamesLower,
        extraFilter: onlyUpdates
          ? (item) => {
              const local = resolveInstalledVersion(item.name);
              return (
                Boolean(local) &&
                Boolean(item.latest_version) &&
                compareVersions(item.latest_version, local) > 0
              );
            }
          : undefined,
        collectAllNames: onlyUpdates,
        forceRefresh: Boolean(extra?.refresh),
      });

      const [bookmarksList, bookmarksLower] = await Promise.all([
        bookmarksPromise,
        bookmarksLowerPromise,
      ]);

      // Collect all candidate mod names that are installed and might have updates
      const candidateModNames = new Set<string>();
      if (searchRes.allNames) {
        for (const name of searchRes.allNames) {
          candidateModNames.add(name);
        }
      }
      for (const item of searchRes.results) {
        const local = resolveInstalledVersion(item.name);
        if (
          local &&
          item.latest_version &&
          compareVersions(item.latest_version, local) > 0
        ) {
          candidateModNames.add(item.name);
        }
      }
      if (searchRes.installedVersions) {
        for (const [name, catVer] of Object.entries(
          searchRes.installedVersions,
        )) {
          const local = resolveInstalledVersion(name);
          if (local && catVer && compareVersions(catVer, local) > 0) {
            candidateModNames.add(name);
          }
        }
      }

      const verifiedVersions = new Map<string, string>();
      if (candidateModNames.size > 0) {
        const candidateList = Array.from(candidateModNames);
        const workers = Math.max(
          1,
          Math.min(PORTAL_CHECK_WORKERS, candidateList.length),
        );
        let index = 0;
        const worker = async (): Promise<void> => {
          while (true) {
            const i = index;
            index += 1;
            if (i >= candidateList.length) return;
            const name = candidateList[i];
            try {
              const pv = await this.portalVersionsForMod(name);
              if (pv.ok && pv.version) {
                verifiedVersions.set(name, pv.version);
              }
            } catch {
              /* ignore individual mod check error */
            }
          }
        };
        await Promise.all(Array.from({ length: workers }, () => worker()));
      }

      const resolvedPortalVersions: Record<string, string> = {};
      if (searchRes.installedVersions) {
        for (const [name, catVer] of Object.entries(
          searchRes.installedVersions,
        )) {
          const verified = verifiedVersions.get(name);
          if (verified) {
            resolvedPortalVersions[name] = verified;
          } else {
            const cached = this.portalVersionFromCache(name);
            if (cached.ok && cached.version) {
              resolvedPortalVersions[name] = cached.version;
            } else {
              const local = resolveInstalledVersion(name);
              // Avoid setting phantom unverified newer version if catVer > local
              resolvedPortalVersions[name] =
                local && catVer && compareVersions(catVer, local) > 0
                  ? local
                  : catVer;
            }
          }
        }
      }
      for (const [name, ver] of verifiedVersions.entries()) {
        resolvedPortalVersions[name] = ver;
      }

      let finalResults = searchRes.results;
      let finalAllNames = searchRes.allNames;
      let finalTotal = searchRes.total;

      if (onlyUpdates) {
        const isTrueUpdate = (name: string, latestVer: string): boolean => {
          const local = resolveInstalledVersion(name);
          if (!local) return false;
          const targetVer = verifiedVersions.get(name) || latestVer;
          return compareVersions(targetVer, local) > 0;
        };

        finalResults = finalResults.filter((item) =>
          isTrueUpdate(item.name, item.latest_version),
        );
        if (finalAllNames) {
          finalAllNames = finalAllNames.filter((name) => {
            const catVer = searchRes.installedVersions?.[name] || '';
            return isTrueUpdate(name, catVer);
          });
          finalTotal = finalAllNames.length;
        } else {
          finalTotal = finalResults.length;
        }
      }

      const enriched = finalResults.map((item) => {
        const nameLower = item.name.toLowerCase();
        const targetReleaseVersion = verifiedVersions.get(item.name);
        return {
          ...item,
          ...(targetReleaseVersion
            ? { target_release_version: targetReleaseVersion }
            : {}),
          installed_version: resolveInstalledVersion(item.name),
          bookmarked: bookmarksLower.has(nameLower),
        };
      });

      const finalTotalPages =
        onlyUpdates && searchRes.pageSize > 0
          ? Math.max(1, Math.ceil(finalTotal / searchRes.pageSize))
          : searchRes.totalPages;

      return {
        ok: true,
        results: enriched,
        total: finalTotal,
        page: searchRes.page,
        page_size: searchRes.pageSize,
        total_pages: finalTotalPages,
        game_version: gv,
        server_factorio_version: serverFv,
        factorio_version: searchRes.factorioVersion,
        facets: searchRes.facets,
        ...(finalAllNames ? { all_names: finalAllNames } : {}),
        ...(Object.keys(resolvedPortalVersions).length > 0
          ? { portal_versions: resolvedPortalVersions }
          : {}),
        has_credentials: Boolean(creds),
        bookmarks_count: bookmarksList.length,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message || 'fetch_failed' };
    }
  }

  private checkVersionConstraint(
    localVer: string,
    op: string,
    reqVer: string,
  ): boolean {
    if (!op || !reqVer) return true;
    const cmp = compareVersions(localVer, reqVer);
    switch (op) {
      case '>=':
        return cmp >= 0;
      case '<=':
        return cmp <= 0;
      case '!=':
        return cmp !== 0;
      case '>':
        return cmp > 0;
      case '<':
        return cmp < 0;
      case '=':
        return cmp === 0;
      default:
        return true;
    }
  }

  private parseDepOperatorAndVersion(raw: string): {
    op: string;
    version: string;
  } {
    const m = /(?<op>>=|<=|!=|>|<|=)\s*(?<ver>\d+(?:\.\d+)*)\s*$/.exec(
      raw.trim(),
    );
    if (!m?.groups) return { op: '', version: '' };
    return {
      op: m.groups.op || '',
      version: m.groups.ver || '',
    };
  }

  async portalDetails(modRaw: unknown): Promise<OpResult> {
    const clean = safeTrim(modRaw);
    const modId = this.portal.modIdFromInput(clean) || clean;
    if (
      !modId ||
      this.portal.isBuiltin(modId) ||
      !this.portal.isValidPortalModId(modId)
    ) {
      return { ok: false, error: 'invalid_mod_id' };
    }
    try {
      const sel = selectedInstance(this.instances);
      const hasSel = !isErrorResult(sel);
      const gv = hasSel ? gameVersion(sel.item.serverPath) : '';
      const details = await this.portal.fetchModDetails(
        modId,
        hasSel
          ? { serverPath: sel.item.serverPath, gameVersion: gv }
          : undefined,
      );
      let installedVersion = '';
      let bookmarked = false;

      type DepStatus =
        | 'installed_ok'
        | 'installed_disabled'
        | 'needs_update'
        | 'missing_dlc'
        | 'will_download'
        | 'not_installed'
        | 'conflict_active'
        | 'conflict_inactive';

      interface DepEntry {
        name: string;
        title: string;
        kind: 'required' | 'optional' | 'conflict';
        operator: string;
        version: string;
        local_version: string;
        is_builtin: boolean;
        status: DepStatus;
      }

      const missingDlc: string[] = [];
      const activeConflicts: DepEntry[] = [];
      const requiredDeps: DepEntry[] = [];
      const optionalDeps: DepEntry[] = [];
      const inactiveConflicts: DepEntry[] = [];

      const modListMap = new Map<
        string,
        { name: string; enabled: boolean; pinned: string }
      >();
      let serverHasSa = true;

      if (hasSel) {
        serverHasSa = hasSpaceAge(sel.item.serverPath);
        const modList = readModList(sel.pm);
        for (const row of modList.mods) {
          const rName = safeTrim(row.name);
          if (!rName) continue;
          modListMap.set(normalizeModListName(rName), {
            name: rName,
            enabled: row.enabled !== false,
            pinned: safeTrim(row.version),
          });
        }

        const installedVers = installedModVersions(
          sel.pm.modsDir,
          details.name,
        );
        const selfEntry = modListMap.get(normalizeModListName(details.name));
        const pinned = selfEntry?.pinned || '';
        installedVersion =
          (pinned && installedVers.includes(pinned) ? pinned : '') ||
          latestVersion(installedVers) ||
          '';

        const creds =
          typeof this.portal.loadCredentials === 'function'
            ? this.portal.loadCredentials(
                sel.pm,
                this.config.webPanel?.global_username,
                this.config.webPanel?.global_token,
              )
            : null;
        if (creds && typeof this.portal.fetchBookmarks === 'function') {
          try {
            const bms = await this.portal.fetchBookmarks(
              creds.user,
              creds.token,
            );
            const target = details.name.toLowerCase();
            bookmarked = bms.some((b) => safeTrim(b).toLowerCase() === target);
          } catch {
            /* ignore bookmark check error */
          }
        }
      }

      const lookupTitle = (name: string): string => {
        if (typeof this.portal.lookupCatalogModTitle === 'function') {
          const found = this.portal.lookupCatalogModTitle(name);
          if (found) return found;
        }
        return name;
      };

      const resolveLocalModState = (
        depName: string,
      ): { localVer: string; enabled: boolean } => {
        if (!hasSel) return { localVer: '', enabled: false };
        const norm = normalizeModListName(depName);
        const ml = modListMap.get(norm);
        const lookupName = ml?.name || depName;
        const vers = installedModVersions(sel.pm.modsDir, lookupName);
        const pinned = ml?.pinned || '';
        const localVer =
          (pinned && vers.includes(pinned) ? pinned : '') ||
          latestVersion(vers) ||
          '';
        return {
          localVer,
          enabled: ml ? ml.enabled : false,
        };
      };

      const seenKeys = new Set<string>();
      for (const rawDep of details.raw_dependencies || []) {
        const trimmed = safeTrim(rawDep);
        if (!trimmed) continue;

        const isConflict = isConflictDependencyName(trimmed);
        const isOptional = !isConflict && isOptionalDependencyString(trimmed);
        const kind: 'required' | 'optional' | 'conflict' = isConflict
          ? 'conflict'
          : isOptional
            ? 'optional'
            : 'required';
        const depName = isConflict
          ? parseConflictModName(trimmed)
          : parseDependencyModName(trimmed);
        if (!depName) continue;

        const normKey = `${kind}:${normalizeModListName(depName)}`;
        if (seenKeys.has(normKey)) continue;
        seenKeys.add(normKey);

        const { op, version } = this.parseDepOperatorAndVersion(trimmed);
        const normMod = normalizeModListName(depName);
        const builtin = isBuiltinModName(depName);

        if (normMod === 'base') {
          if (
            kind === 'required' &&
            gv &&
            op &&
            version &&
            !this.checkVersionConstraint(gv, op, version)
          ) {
            requiredDeps.push({
              name: 'base',
              title: 'Factorio (base)',
              kind: 'required',
              operator: op,
              version,
              local_version: gv,
              is_builtin: true,
              status: 'needs_update',
            });
          }
          continue;
        }

        if (builtin) {
          const isRecycler = normMod === 'recycler';
          const hasDlcBinary = isRecycler
            ? serverHasBuiltinRecycler(gv)
            : serverHasSa;
          const ml = modListMap.get(normMod);
          const enabled = ml ? ml.enabled : true;

          if (kind === 'conflict') {
            const active = hasSel && hasDlcBinary && enabled;
            const entry: DepEntry = {
              name: depName,
              title: depName,
              kind: 'conflict',
              operator: op,
              version,
              local_version: hasDlcBinary ? gv : '',
              is_builtin: true,
              status: active ? 'conflict_active' : 'conflict_inactive',
            };
            if (active) activeConflicts.push(entry);
            else inactiveConflicts.push(entry);
          } else if (kind === 'required') {
            if (hasSel && !hasDlcBinary) {
              missingDlc.push(depName);
              requiredDeps.push({
                name: depName,
                title: depName,
                kind: 'required',
                operator: op,
                version,
                local_version: '',
                is_builtin: true,
                status: 'missing_dlc',
              });
            } else {
              requiredDeps.push({
                name: depName,
                title: depName,
                kind: 'required',
                operator: op,
                version,
                local_version: gv,
                is_builtin: true,
                status: enabled ? 'installed_ok' : 'installed_disabled',
              });
            }
          } else {
            optionalDeps.push({
              name: depName,
              title: depName,
              kind: 'optional',
              operator: op,
              version,
              local_version: hasDlcBinary ? gv : '',
              is_builtin: true,
              status:
                hasDlcBinary && enabled
                  ? 'installed_ok'
                  : hasDlcBinary
                    ? 'installed_disabled'
                    : 'not_installed',
            });
          }
          continue;
        }

        const { localVer, enabled } = resolveLocalModState(depName);
        const title = lookupTitle(depName);

        if (kind === 'conflict') {
          const active =
            Boolean(localVer) &&
            enabled &&
            this.checkVersionConstraint(localVer, op, version);
          const entry: DepEntry = {
            name: depName,
            title,
            kind: 'conflict',
            operator: op,
            version,
            local_version: localVer,
            is_builtin: false,
            status: active ? 'conflict_active' : 'conflict_inactive',
          };
          if (active) activeConflicts.push(entry);
          else inactiveConflicts.push(entry);
        } else if (kind === 'required') {
          let status: DepStatus = 'will_download';
          if (localVer) {
            if (!this.checkVersionConstraint(localVer, op, version)) {
              status = 'needs_update';
            } else if (!enabled) {
              status = 'installed_disabled';
            } else {
              status = 'installed_ok';
            }
          }
          requiredDeps.push({
            name: depName,
            title,
            kind: 'required',
            operator: op,
            version,
            local_version: localVer,
            is_builtin: false,
            status,
          });
        } else {
          optionalDeps.push({
            name: depName,
            title,
            kind: 'optional',
            operator: op,
            version,
            local_version: localVer,
            is_builtin: false,
            status: localVer
              ? enabled
                ? 'installed_ok'
                : 'installed_disabled'
              : 'not_installed',
          });
        }
      }

      if (hasSel && modListMap.size <= 60) {
        const selfNorm = normalizeModListName(details.name);
        const activeConflictNorms = new Set(
          activeConflicts.map((c) => normalizeModListName(c.name)),
        );
        for (const [normKey, mlRow] of modListMap.entries()) {
          if (!mlRow.enabled || normKey === 'base' || normKey === selfNorm) {
            continue;
          }
          if (
            isBuiltinModName(mlRow.name) ||
            activeConflictNorms.has(normKey)
          ) {
            continue;
          }
          const vers = installedModVersions(sel.pm.modsDir, mlRow.name);
          const ver =
            (mlRow.pinned && vers.includes(mlRow.pinned) ? mlRow.pinned : '') ||
            latestVersion(vers);
          if (!ver) continue;
          const zipPath = join(sel.pm.modsDir, `${mlRow.name}_${ver}.zip`);
          const manifest = existsSync(zipPath)
            ? readModManifest(zipPath)
            : null;
          if (!manifest) continue;
          const revConflicts = manifestConflictNames(manifest);
          if (
            revConflicts.some((rc) => normalizeModListName(rc) === selfNorm)
          ) {
            activeConflictNorms.add(normKey);
            activeConflicts.push({
              name: mlRow.name,
              title: lookupTitle(mlRow.name),
              kind: 'conflict',
              operator: '',
              version: '',
              local_version: ver,
              is_builtin: false,
              status: 'conflict_active',
            });
          }
        }
      }

      optionalDeps.sort((a, b) => {
        const aInst =
          a.status === 'installed_ok'
            ? 0
            : a.status === 'installed_disabled'
              ? 1
              : 2;
        const bInst =
          b.status === 'installed_ok'
            ? 0
            : b.status === 'installed_disabled'
              ? 1
              : 2;
        return aInst - bInst || a.title.localeCompare(b.title);
      });

      return {
        ok: true,
        mod: {
          ...details,
          installed_version: installedVersion,
          bookmarked,
          dependencies_info: {
            target_release_version: details.target_release_version,
            missing_dlc: missingDlc,
            active_conflicts: activeConflicts,
            required: requiredDeps,
            optional: optionalDeps,
            conflicts: inactiveConflicts,
          },
        },
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message || 'fetch_failed' };
    }
  }

  async togglePortalBookmark(
    rawModName: string,
    bookmarked: boolean,
  ): Promise<OpResult> {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const creds = this.portal.loadCredentials(
      sel.pm,
      this.config.webPanel?.global_username,
      this.config.webPanel?.global_token,
    );
    if (!creds) {
      return { ok: false, error: 'missing_credentials' };
    }
    try {
      const res = await this.portal.toggleBookmark(
        creds.user,
        creds.token,
        rawModName,
        bookmarked,
      );
      return {
        ok: true,
        mod: safeTrim(rawModName),
        bookmarked: res.bookmarked,
        bookmarks_count: res.bookmarks.length,
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message || 'fetch_failed' };
    }
  }

  async portalThumbnails(names: unknown): Promise<OpResult> {
    const list = Array.isArray(names)
      ? names.map((x) => safeTrim(x)).filter(Boolean)
      : [];
    if (list.length === 0) {
      return { ok: true, thumbnails: {} };
    }
    const thumbnails = await this.portal.fetchThumbnails(list);
    return { ok: true, thumbnails };
  }

  async portalReleases(rawName: string): Promise<OpResult> {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const modId = this.portal.modIdFromInput(rawName);
    if (!modId || this.portal.isBuiltin(modId)) {
      return { ok: false, error: 'invalid_mod_id' };
    }
    try {
      const meta = await this.portal.fetchFull(modId);
      const serverPath = sel.item.serverPath;
      const gv = gameVersion(serverPath);
      const releases = this.portal.listReleasesSummary(meta, serverPath);
      const resolved = this.portal.resolveRelease(meta, {
        serverPath,
        gameVersion: gv,
      });
      const installedVersions = installedModVersions(sel.pm.modsDir, modId);
      for (const iv of installedVersions) {
        if (!releases.some((r) => r.version === iv)) {
          releases.unshift({
            version: iv,
            factorio_version: this.portal.factorioMajorMinor(gv) || gv || '',
            released_at: '',
            is_compatible: true,
          });
        }
      }
      const modList = readModList(sel.pm);
      const modRow = modList.mods.find(
        (r) => safeTrim(r.name).toLowerCase() === modId.toLowerCase(),
      );
      const pinned = safeTrim(modRow?.version);
      const currentInstalled =
        (pinned && installedVersions.includes(pinned) ? pinned : '') ||
        latestVersion(installedVersions) ||
        '';
      return {
        ok: true,
        name: modId,
        title: typeof meta.title === 'string' ? meta.title : modId,
        game_version: gv,
        factorio_version: this.portal.factorioMajorMinor(gv),
        recommended_version: resolved ? safeStr(resolved.version) : '',
        installed_version: currentInstalled,
        available_versions: installedVersions,
        releases,
      };
    } catch (e) {
      const installedVersions = installedModVersions(sel.pm.modsDir, modId);
      if (installedVersions.length > 0) {
        const serverPath = sel.item.serverPath;
        const gv = gameVersion(serverPath);
        const modList = readModList(sel.pm);
        const modRow = modList.mods.find(
          (r) => safeTrim(r.name).toLowerCase() === modId.toLowerCase(),
        );
        const pinned = safeTrim(modRow?.version);
        const currentInstalled =
          (pinned && installedVersions.includes(pinned) ? pinned : '') ||
          latestVersion(installedVersions) ||
          '';
        return {
          ok: true,
          name: modId,
          title: modId,
          game_version: gv,
          factorio_version: this.portal.factorioMajorMinor(gv),
          recommended_version: '',
          installed_version: currentInstalled,
          available_versions: installedVersions,
          releases: installedVersions.map((v) => ({
            version: v,
            factorio_version: this.portal.factorioMajorMinor(gv) || gv || '',
            released_at: '',
            is_compatible: true,
          })),
        };
      }
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
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

    const titlesMerged: Record<string, string> = {};

    for (const mid of names) {
      const pr = await this.modPlan.installPlanDetail(sel.pm, mid);
      if (pr.ok === false) {
        planErrors.push({ mod: mid, error: String(pr.error || 'plan_failed') });
        continue;
      }
      if (pr.titles) {
        Object.assign(titlesMerged, pr.titles);
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
      titles: titlesMerged,
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
        .mods.map((r) => safeTrim(r.name))
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
    const titles = resolveModDisplayTitlesBatch({
      serverPath: sel.item.serverPath,
      modsDir: sel.pm.modsDir,
      modNames: [...depsExtra, ...roots],
      uiLang: 'ru',
      translateModNames: true,
    });
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
      titles,
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
        if (pv.ok) {
          this.checkState.ok_count += 1;
        } else if (this.isPortalMissingMod(pv.error)) {
          // Mod does not exist on portal or has no portal release - do not treat as failure
        } else {
          this.checkState.failed += 1;
        }
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

  private isPortalMissingMod(error?: string): boolean {
    const err = String(error || '').toLowerCase();
    return (
      err === 'http_404' ||
      err === 'not_found' ||
      err === 'no_release' ||
      err === 'builtin'
    );
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
        const sel = selectedInstance(this.instances);
        const serverPath = !isErrorResult(sel)
          ? sel.item.serverPath
          : undefined;
        const rel = this.portal.resolveRelease(meta, {
          serverPath,
          gameVersion: this.currentGameVersion(),
        });
        const version = safeTrim(rel?.version);
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
        const sel = selectedInstance(this.instances);
        const serverPath = !isErrorResult(sel)
          ? sel.item.serverPath
          : undefined;
        const rel = this.portal.resolveRelease(meta, {
          serverPath,
          gameVersion: this.currentGameVersion(),
        });
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
