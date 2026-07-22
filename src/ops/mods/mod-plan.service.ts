import { Injectable } from '@nestjs/common';
import {
  readModList,
  installedModVersions,
  latestVersion,
  hasSpaceAge,
  gameVersion,
  writeModList,
} from '../ops-utils';
import { ModPortalService } from '../mod-portal/mod-portal.service';
import {
  normalizeModListName,
  portalDependencyNames,
  portalRecommendedDependencyNames,
  releaseConflictNames,
  releaseRequiresSpaceAge,
  disableModListEntriesByName,
  buildInstallConflictInfo,
  isBuiltinModName,
  type ModInstallConflictInfo,
} from '../mod-deps';
import { PathManager } from '../path-manager';
import {
  firstPlanItemRequiringNewerGame,
  gameBelowModFactorioReq,
  type ModGameUpgradeHint,
} from './mod-game-req';

export interface ModPlanItem {
  name: string;
  release: Record<string, unknown>;
  version: string;
  local_version: string;
}

export interface ModInstallPlanResult {
  ok: true;
  mod: string;
  dependencies: string[];
  to_install: { name: string; local_version: string; portal_version: string }[];
  requires_confirmation: boolean;
  version: string;
  game_version: string;
  mods_needing_game_update: ModGameUpgradeHint[];
  requires_game_update_confirmation: boolean;
  conflicts_to_disable: string[];
  requires_conflict_confirmation: boolean;
  install_conflicts: ModInstallConflictInfo[];
  recommended?: string[];
}

export interface ModPlanLogHooks {
  onSkipped?: (name: string, localVersion: string) => void;
  onFailed?: (name: string, error: string) => void;
  onSkippedRequiresGame?: (
    name: string,
    required: string,
    current: string,
    blockedDep?: string,
  ) => void;
  cancelCheck?: () => void;
}

@Injectable()
export class ModPlanService {
  constructor(private readonly portal: ModPortalService) {}

  modBlockedWithoutSpaceAge(
    serverPath: string,
    release: Record<string, unknown>,
  ): boolean {
    return !hasSpaceAge(serverPath) && releaseRequiresSpaceAge(release);
  }

  async portalVersionsForMod(
    name: string,
  ): Promise<
    | { ok: true; version: string; release: Record<string, unknown> }
    | { ok: false; error: string }
  > {
    try {
      const meta = await this.portal.fetchFull(name);
      const rel = this.portal.lastRelease(meta);
      if (!rel) return { ok: false, error: 'no_release' };
      return { ok: true, version: String(rel.version || ''), release: rel };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  /** Walk dependency tree — Python ``_mj_plan_install``. */
  async planInstall(
    serverPath: string,
    modsDir: string,
    rootModId: string,
  ): Promise<ModPlanItem[]> {
    const seen = new Set<string>();
    const plan: ModPlanItem[] = [];

    const walk = async (name: string): Promise<void> => {
      const n = String(name || '').trim();
      if (!n || seen.has(n) || this.portal.isBuiltin(n)) return;
      seen.add(n);

      const pv = await this.portalVersionsForMod(n);
      if (!pv.ok) {
        const err = new Error(
          String(pv.error || `portal_error:${n}`),
        ) as Error & { errorKey?: string; errorArgs?: unknown[] };
        throw err;
      }
      if (this.modBlockedWithoutSpaceAge(serverPath, pv.release)) {
        const err = new Error('requires_space_age') as Error & {
          errorKey?: string;
          errorArgs?: unknown[];
        };
        err.errorKey = 'mod_requires_space_age';
        err.errorArgs = [n];
        throw err;
      }

      const localVer = latestVersion(installedModVersions(modsDir, n)) || '';
      const need = !localVer || this.portal.versionNewer(pv.version, localVer);
      if (need) {
        plan.push({
          name: n,
          release: pv.release,
          version: pv.version,
          local_version: localVer,
        });
      }

      for (const dep of portalDependencyNames(pv.release)) {
        await walk(dep);
      }
    };

    await walk(rootModId);
    return plan;
  }

  mergePlanItems(items: ModPlanItem[]): ModPlanItem[] {
    const merged = new Map<string, ModPlanItem>();
    const order: string[] = [];
    for (const item of items) {
      const n = String(item.name || '').trim();
      if (!n) continue;
      const prev = merged.get(n);
      if (!prev) {
        merged.set(n, { ...item });
        order.push(n);
        continue;
      }
      if (this.portal.versionNewer(item.version, prev.version))
        merged.set(n, { ...item });
    }
    return order.map((n) => merged.get(n)!);
  }

  async planInstallMany(
    serverPath: string,
    modsDir: string,
    roots: string[],
  ): Promise<ModPlanItem[]> {
    const merged: ModPlanItem[] = [];
    for (const root of roots) {
      const sub = await this.planInstall(serverPath, modsDir, root);
      merged.push(...sub);
    }
    return this.mergePlanItems(merged);
  }

  /** Python ``_op_mods_install_plan`` / ``_walk`` for a single mod. */
  async installPlanDetail(
    pm: PathManager,
    modId: string,
  ): Promise<
    ModInstallPlanResult | { ok: false; error: string; mod?: string }
  > {
    const id = this.portal.modIdFromInput(modId);
    if (!this.portal.isValidPortalModId(id))
      return { ok: false, error: 'invalid_mod_id' };
    if (this.portal.isBuiltin(id)) return { ok: false, error: 'builtin' };

    const seen = new Set<string>();
    const depsRequired: string[] = [];
    const toInstall: ModInstallPlanResult['to_install'] = [];
    const needGameUpgrade = new Map<string, ModGameUpgradeHint>();
    const conflictTargets = new Map<
      string,
      { name: string; is_builtin: boolean }
    >();
    const installTree = new Set<string>();
    const recommendedMods = new Set<string>();

    const noteConflict = (raw: string): void => {
      const name = String(raw || '').trim();
      if (!name) return;
      const key = normalizeModListName(name);
      if (key === 'base') return;
      if (!conflictTargets.has(key)) {
        conflictTargets.set(key, { name, is_builtin: isBuiltinModName(name) });
      }
    };

    const walk = async (
      name: string,
    ): Promise<{ ok: true } | { ok: false; error: string; mod?: string }> => {
      const n = String(name || '').trim();
      if (!n || seen.has(n) || this.portal.isBuiltin(n)) return { ok: true };
      seen.add(n);
      installTree.add(normalizeModListName(n));

      const pv = await this.portalVersionsForMod(n);
      if (!pv.ok)
        return { ok: false, error: String(pv.error || 'portal_error'), mod: n };
      if (this.modBlockedWithoutSpaceAge(pm.serverPath, pv.release)) {
        return { ok: false, error: 'requires_space_age', mod: n };
      }

      for (const conflict of releaseConflictNames(pv.release)) {
        noteConflict(conflict);
      }

      const localVer = latestVersion(installedModVersions(pm.modsDir, n)) || '';
      if (!localVer || this.portal.versionNewer(pv.version, localVer)) {
        const { below, current, required } = gameBelowModFactorioReq(
          pm.serverPath,
          pv.release,
        );
        if (below) {
          needGameUpgrade.set(n, {
            name: n,
            current_factorio: current,
            required_factorio: required,
          });
        }
        toInstall.push({
          name: n,
          local_version: localVer,
          portal_version: pv.version,
        });
      }

      for (const dep of portalDependencyNames(pv.release)) {
        const d = String(dep || '').trim();
        if (!d || this.portal.isBuiltin(d)) continue;
        if (!depsRequired.some((x) => x.toLowerCase() === d.toLowerCase()))
          depsRequired.push(d);
        const r = await walk(d);
        if (!r.ok) return r;
      }
      for (const dep of portalRecommendedDependencyNames(pv.release)) {
        const d = String(dep || '').trim();
        if (!d || this.portal.isBuiltin(d)) continue;
        const isInstalled = installedModVersions(pm.modsDir, d).length > 0;
        if (!isInstalled && !seen.has(d) && !installTree.has(normalizeModListName(d))) {
          recommendedMods.add(d);
        }
      }
      return { ok: true };
    };

    const r = await walk(id);
    if (!r.ok) return r;

    const root = toInstall.find((x) => x.name === id);
    const modsNeedGame = [...needGameUpgrade.values()].sort((a, b) =>
      a.name.localeCompare(b.name),
    );
    const installConflicts = buildInstallConflictInfo(
      readModList(pm),
      conflictTargets.values(),
      installTree,
    );
    const conflictsToDisable = installConflicts
      .filter((x) => x.will_disable)
      .map((x) => x.name);

    return {
      ok: true,
      mod: id,
      dependencies: depsRequired,
      to_install: toInstall,
      requires_confirmation:
        depsRequired.length > 0 || conflictsToDisable.length > 0,
      version: root?.portal_version || '',
      game_version: gameVersion(pm.serverPath),
      mods_needing_game_update: modsNeedGame,
      requires_game_update_confirmation: modsNeedGame.length > 0,
      conflicts_to_disable: conflictsToDisable,
      requires_conflict_confirmation: conflictsToDisable.length > 0,
      install_conflicts: installConflicts,
      recommended: Array.from(recommendedMods).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: 'base' }),
      ),
    };
  }

  /** Walk install roots and return enabled mods that conflict with the incoming tree. */
  async conflictsToDisableForInstall(
    pm: PathManager,
    roots: string[],
  ): Promise<string[]> {
    const meta = await this.installConflictMetaForRoots(pm, roots);
    return meta.conflicts_to_disable;
  }

  async installConflictMetaForRoots(
    pm: PathManager,
    roots: string[],
  ): Promise<{
    conflicts_to_disable: string[];
    install_conflicts: ModInstallConflictInfo[];
  }> {
    const conflictTargets = new Map<
      string,
      { name: string; is_builtin: boolean }
    >();
    const installTree = new Set<string>();
    const seen = new Set<string>();

    const noteConflict = (raw: string): void => {
      const name = String(raw || '').trim();
      if (!name) return;
      const key = normalizeModListName(name);
      if (key === 'base') return;
      if (!conflictTargets.has(key)) {
        conflictTargets.set(key, { name, is_builtin: isBuiltinModName(name) });
      }
    };

    const walk = async (name: string): Promise<void> => {
      const n = String(name || '').trim();
      if (!n || seen.has(n) || this.portal.isBuiltin(n)) return;
      seen.add(n);
      installTree.add(normalizeModListName(n));

      const pv = await this.portalVersionsForMod(n);
      if (!pv.ok) return;
      if (this.modBlockedWithoutSpaceAge(pm.serverPath, pv.release)) return;

      for (const conflict of releaseConflictNames(pv.release)) {
        noteConflict(conflict);
      }

      for (const dep of portalDependencyNames(pv.release)) {
        await walk(dep);
      }
    };

    for (const root of roots) {
      const id = this.portal.modIdFromInput(root);
      if (
        !id ||
        this.portal.isBuiltin(id) ||
        !this.portal.isValidPortalModId(id)
      )
        continue;
      await walk(id);
    }

    const installConflicts = buildInstallConflictInfo(
      readModList(pm),
      conflictTargets.values(),
      installTree,
    );
    return {
      conflicts_to_disable: installConflicts
        .filter((x) => x.will_disable)
        .map((x) => x.name),
      install_conflicts: installConflicts,
    };
  }

  disableConflictingMods(pm: PathManager, names: string[]): string[] {
    const rows = readModList(pm).mods;
    const disabled = disableModListEntriesByName(rows, names);
    if (disabled.length) writeModList(pm, rows);
    return disabled;
  }

  /** Mod-list roots that have a newer portal release (for update-all conflict scan). */
  async updateRootModIds(pm: PathManager): Promise<string[]> {
    const rows = readModList(pm).mods;
    const out: string[] = [];
    for (const row of rows) {
      const name = String(row.name || '').trim();
      if (!name || this.portal.isBuiltin(name)) continue;
      const localVer =
        latestVersion(installedModVersions(pm.modsDir, name)) || '';
      const pv = await this.portalVersionsForMod(name);
      if (!pv.ok) continue;
      if (this.portal.versionNewer(pv.version, localVer)) out.push(name);
    }
    return out;
  }

  /** Python ``_mj_plan_update_all``. */
  async planUpdateAll(
    pm: PathManager,
    allowRequiresGameUpdate: boolean,
    quiet: boolean,
    hooks: ModPlanLogHooks = {},
  ): Promise<ModPlanItem[]> {
    const rows = readModList(pm).mods;
    const merged = new Map<string, ModPlanItem>();
    const order: string[] = [];

    for (const row of rows) {
      hooks.cancelCheck?.();
      const name = String(row.name || '').trim();
      if (!name || this.portal.isBuiltin(name)) continue;

      const localVer =
        latestVersion(installedModVersions(pm.modsDir, name)) || '';
      const pv = await this.portalVersionsForMod(name);
      if (!pv.ok) {
        if (!quiet) hooks.onFailed?.(name, String(pv.error || 'portal_error'));
        continue;
      }

      if (!this.portal.versionNewer(pv.version, localVer)) {
        if (!quiet) hooks.onSkipped?.(name, localVer || pv.version);
        continue;
      }

      let subPlan: ModPlanItem[];
      try {
        subPlan = await this.planInstall(pm.serverPath, pm.modsDir, name);
      } catch (e) {
        const err = e instanceof Error ? e.message : String(e);
        if (!quiet) hooks.onFailed?.(name, err);
        continue;
      }

      const blocked = firstPlanItemRequiringNewerGame(pm.serverPath, subPlan);
      if (blocked && !allowRequiresGameUpdate) {
        if (!quiet) {
          hooks.onSkippedRequiresGame?.(
            name,
            blocked.required,
            blocked.current,
            blocked.mod !== name ? blocked.mod : undefined,
          );
        }
        continue;
      }

      for (const item of subPlan) {
        const n = String(item.name || '').trim();
        if (!n) continue;
        const prev = merged.get(n);
        if (!prev) {
          merged.set(n, { ...item });
          order.push(n);
        } else if (this.portal.versionNewer(item.version, prev.version)) {
          merged.set(n, { ...item });
        }
      }
    }

    return order.map((n) => merged.get(n)!);
  }

  async scanUpdatesNeedingNewerGame(
    pm: PathManager,
  ): Promise<ModGameUpgradeHint[]> {
    const rows = readModList(pm).mods;
    const out: ModGameUpgradeHint[] = [];
    const seen = new Set<string>();

    for (const row of rows) {
      const name = String(row.name || '').trim();
      if (!name || this.portal.isBuiltin(name) || seen.has(name)) continue;

      const localVer =
        latestVersion(installedModVersions(pm.modsDir, name)) || '';
      const pv = await this.portalVersionsForMod(name);
      if (!pv.ok) continue;
      if (!this.portal.versionNewer(pv.version, localVer)) continue;

      const { below, current, required } = gameBelowModFactorioReq(
        pm.serverPath,
        pv.release,
      );
      if (below) {
        seen.add(name);
        out.push({
          name,
          current_factorio: current,
          required_factorio: required,
        });
      }
    }

    return out.sort((a, b) => a.name.localeCompare(b.name));
  }
}
