import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { getModDetailsCached, modPackagePathsForInternalName } from '../ops/mod-display-titles.util';
import { readJsonFile } from '../common/json-store';
import { InstanceItem } from '../common/types';
import { PathsService } from '../config/paths.service';
import { RuntimeService } from '../ops/runtime.service';
import { ModsJobService } from '../ops/mods/mods-job.service';
import {
  detectServerListModBadges,
  type ServerListModBadgeId,
} from '../shared/server-list-mod-badges';
import {
  gameVersion,
  hasSpaceAge,
  readModList,
  readServerSettingsNetworkFlags,
  readServerSettingsDetails,
} from '../ops/ops-utils';
import { isBuiltinModName } from '../ops/mod-deps';
import { PathManager } from '../ops/path-manager';
import { InstancesService } from './instances.service';

export interface InstanceSummaryRow {
  id: string;
  name: string;
  serverPath: string;
  ip: string;
  port: string;
  rconPort: number;
  rconPassword: string;
  gameVersion: string;
  hasSpaceAge: boolean;
  modBadges: ServerListModBadgeId[];
  onlineCount: number;
  modsCount: number;
  uptimeSeconds: number | null;
  autostartServer: boolean;
  autoEnterPanel: boolean;
  status: string;
  visibilityLan: boolean;
  visibilityPublic: boolean;
  requireUserVerification: boolean;
  maintenanceLock: boolean;
  maintenanceManualPending: boolean;
  blockUpdates: boolean;
  experimentalUpdates: boolean;
  launchSave: string;
  modJobRunning: boolean;
  isPublic: boolean;
  publicDescription: string;
  publicConnectionAddress: string;
  publicMods: { name: string; title: string; version?: string }[];
  publicPlayers: string[];
  serverSettingsName?: string;
  serverSettingsDesc?: string;
  serverSettingsAutoPause?: boolean;
  serverSettingsMaxPlayers?: number;
  serverSettingsAfkAutokick?: number;
}

@Injectable()
export class InstanceSummaryService {
  private readonly settingsCache = new Map<
    string,
    {
      mtime: number;
      details: {
        name: string;
        description: string;
        auto_pause: boolean;
        max_players: number;
        afk_autokick_interval: number;
        visibility_lan: boolean;
        visibility_public: boolean;
        require_user_verification: boolean;
      };
    }
  >();

  constructor(
    private readonly instances: InstancesService,
    private readonly runtime: RuntimeService,
    private readonly modJobs: ModsJobService,
    private readonly paths: PathsService,
  ) {}

  list(): { ok: true; items: InstanceSummaryRow[]; selectedId: string | null } {
    const st = this.instances.load();
    const pending = this.pendingManualResumeIds();
    return {
      ok: true,
      items: st.items.map((it) => this.summarize(it, pending)),
      selectedId: st.selectedId || null,
    };
  }

  private pendingManualResumeIds(): Set<string> {
    const data = readJsonFile<Record<string, unknown>>(
      this.paths.maintenancePendingPath,
      {},
    );
    const out = new Set<string>();
    for (const [id, ent] of Object.entries(data)) {
      if (typeof ent === 'string' && ent.trim()) out.add(id);
      else if (ent && typeof ent === 'object' && !Array.isArray(ent)) {
        const runId = String((ent as { run_id?: string }).run_id || '').trim();
        if (runId) out.add(id);
      }
    }
    return out;
  }

  private isValidServerPath(serverPath: string): boolean {
    return existsSync(join(serverPath, 'data', 'base', 'info.json'));
  }

  private networkFlags(serverPath: string): {
    lan: boolean;
    pub: boolean;
    ruv: boolean;
  } {
    const f = readServerSettingsNetworkFlags(serverPath);
    return {
      lan: f.visibility_lan,
      pub: f.visibility_public,
      ruv: f.require_user_verification,
    };
  }

  private enabledModNames(serverPath: string): string[] {
    const pm = new PathManager(serverPath);
    if (!existsSync(pm.modList)) return [];
    const { mods } = readModList(pm);
    const out: string[] = [];
    for (const row of mods) {
      if (row.enabled === false) continue;
      const name = String(row.name || '').trim();
      if (name) out.push(name);
    }
    return out;
  }

  private countEnabledMods(enabledMods: string[]): number {
    let n = 0;
    for (const name of enabledMods) {
      if (!isBuiltinModName(name)) n++;
    }
    return n;
  }

  private publicModNames(enabledMods: string[]): string[] {
    return enabledMods.filter((name) => !isBuiltinModName(name));
  }

  private readServerSettingsCached(serverPath: string) {
    const settingsPath = join(serverPath, 'server-settings.json');
    const defaults = {
      name: '',
      description: '',
      auto_pause: true,
      max_players: 0,
      afk_autokick_interval: 0,
      visibility_lan: false,
      visibility_public: false,
      require_user_verification: false,
    };
    if (!existsSync(settingsPath)) {
      return defaults;
    }
    try {
      const stat = statSync(settingsPath);
      const mtime = stat.mtimeMs;
      const cached = this.settingsCache.get(settingsPath);
      if (cached && cached.mtime === mtime) {
        return cached.details;
      }
      const data = JSON.parse(readFileSync(settingsPath, 'utf-8')) as Record<
        string,
        unknown
      >;
      const vis = (data.visibility as Record<string, unknown>) || {};
      const details = {
        name: typeof data.name === 'string' ? data.name : '',
        description: typeof data.description === 'string' ? data.description : '',
        auto_pause: data.auto_pause !== false,
        max_players: typeof data.max_players === 'number' ? data.max_players : 0,
        afk_autokick_interval:
          typeof data.afk_autokick_interval === 'number'
            ? data.afk_autokick_interval
            : 0,
        visibility_lan: !!vis.lan,
        visibility_public: !!vis.public,
        require_user_verification: !!data.require_user_verification,
      };
      this.settingsCache.set(settingsPath, { mtime, details });
      return details;
    } catch {
      return defaults;
    }
  }

  private publicModsList(serverPath: string, enabledMods: string[]): { name: string; title: string; version?: string }[] {
    const names = this.publicModNames(enabledMods);
    if (!names.length) return [];
    const modsDir = join(serverPath, 'mods');
    return names.map((name) => {
      const packages = modPackagePathsForInternalName(modsDir, name);
      if (packages.length > 0) {
        const details = getModDetailsCached(packages[0], 'en');
        return {
          name,
          title: details.title,
          version: details.version,
        };
      }
      return { name, title: name };
    });
  }

  private summarize(
    item: InstanceItem,
    pending: Set<string>,
  ): InstanceSummaryRow {
    const sp = item.serverPath;
    let status = this.isValidServerPath(sp) ? 'ready' : 'missing';
    const gv = gameVersion(sp);
    const rt = this.runtime.get(item.id);
    let onlineCount = 0;
    let uptimeSeconds: number | null = null;
    let publicPlayers: string[] = [];

    if (rt?.proc && rt.proc.exitCode === null) {
      const running = true;
      const stopping = !!rt.stopping;
      const inGame = !!rt.inGame;
      if (running && stopping) status = 'stopping';
      else if (running && inGame) status = 'running';
      else status = 'starting';
      if (inGame && rt.startedAt) {
        uptimeSeconds = Math.max(
          0,
          Math.floor(Date.now() / 1000 - rt.startedAt),
        );
      }
      onlineCount = Object.keys(rt.onlinePlayers || {}).length;
      publicPlayers = Object.keys(rt.onlinePlayers || {});
    }

    const iid = item.id;
    if (
      item.maintenanceLock &&
      !['running', 'starting', 'stopping'].includes(status)
    ) {
      status = 'maintenance';
    } else if (
      pending.has(iid) &&
      !['running', 'starting', 'stopping'].includes(status)
    ) {
      status = 'maintenance_manual';
    }

    const settings = this.readServerSettingsCached(sp);
    const enabledMods = this.enabledModNames(sp);

    return {
      id: item.id,
      name: item.name,
      serverPath: sp,
      ip: String(item.ip || '0.0.0.0'),
      port: String(item.port || '34197'),
      rconPort: Number(item.rconPort) || 0,
      rconPassword: String(item.rconPassword || ''),
      gameVersion: gv,
      hasSpaceAge: hasSpaceAge(sp),
      modBadges: detectServerListModBadges(enabledMods),
      onlineCount,
      modsCount: this.countEnabledMods(enabledMods),
      uptimeSeconds,
      autostartServer: !!item.autostartServer,
      autoEnterPanel: !!item.autoEnterPanel,
      status,
      visibilityLan: settings.visibility_lan,
      visibilityPublic: settings.visibility_public,
      requireUserVerification: settings.require_user_verification,
      maintenanceLock: !!item.maintenanceLock,
      maintenanceManualPending: pending.has(iid),
      blockUpdates: !!item.blockUpdates,
      experimentalUpdates: !!item.experimentalUpdates,
      launchSave: String(item.launchSave || 'latest').trim() || 'latest',
      modJobRunning: this.modJobs.isRunningForInstance(iid),
      isPublic: !!item.isPublic,
      publicDescription: String(item.publicDescription || ''),
      publicConnectionAddress: String(item.publicConnectionAddress || ''),
      publicMods: this.publicModsList(sp, enabledMods),
      publicPlayers,
      serverSettingsName: settings.name,
      serverSettingsDesc: settings.description,
      serverSettingsAutoPause: settings.auto_pause,
      serverSettingsMaxPlayers: settings.max_players,
      serverSettingsAfkAutokick: settings.afk_autokick_interval,
    };
  }
}
