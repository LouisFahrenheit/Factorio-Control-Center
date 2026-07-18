import { Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
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
}

@Injectable()
export class InstanceSummaryService {
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

  private countEnabledMods(serverPath: string): number {
    let n = 0;
    for (const name of this.enabledModNames(serverPath)) {
      if (!isBuiltinModName(name)) n++;
    }
    return n;
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

    const net = this.networkFlags(sp);
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
      modBadges: detectServerListModBadges(this.enabledModNames(sp)),
      onlineCount,
      modsCount: this.countEnabledMods(sp),
      uptimeSeconds,
      autostartServer: !!item.autostartServer,
      autoEnterPanel: !!item.autoEnterPanel,
      status,
      visibilityLan: net.lan,
      visibilityPublic: net.pub,
      requireUserVerification: net.ruv,
      maintenanceLock: !!item.maintenanceLock,
      maintenanceManualPending: pending.has(iid),
      blockUpdates: !!item.blockUpdates,
      experimentalUpdates: !!item.experimentalUpdates,
      launchSave: String(item.launchSave || 'latest').trim() || 'latest',
      modJobRunning: this.modJobs.isRunningForInstance(iid),
    };
  }
}
