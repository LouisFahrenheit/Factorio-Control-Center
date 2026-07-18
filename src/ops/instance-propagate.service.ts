import { Injectable } from '@nestjs/common';
import { copyFileSync, existsSync } from 'fs';
import { join } from 'path';
import { FccConfigService } from '../config/fcc-config.service';
import { InstancesService } from '../instances/instances.service';
import { readJsonFile, writeJsonFile } from '../common/json-store';
import { RuntimeService } from './runtime.service';
import { PathManager } from './path-manager';

@Injectable()
export class InstancePropagateService {
  constructor(
    private readonly instances: InstancesService,
    private readonly runtime: RuntimeService,
    private readonly config: FccConfigService,
  ) {}

  propagateBanList(fromServerPath: string): void {
    if (!this.config.webPanel.sync_bans_across_instances) return;
    const src = join(fromServerPath, 'server-banlist.json');
    if (!existsSync(src)) return;
    for (const root of this.otherValidServerPaths(fromServerPath)) {
      try {
        copyFileSync(src, join(root, 'server-banlist.json'));
      } catch {
        /* ignore per-target errors */
      }
    }
  }

  async propagateAdminList(
    fromInstanceId: string,
    newList: string[],
  ): Promise<void> {
    if (!this.config.webPanel.sync_admins_across_instances) return;
    for (const item of this.otherInstances(fromInstanceId)) {
      const pm = new PathManager(item.serverPath);
      const rt = this.runtime.get(item.id);
      const running = !!(rt?.proc && rt.proc.exitCode === null);
      const oldList = existsSync(pm.adminList)
        ? readJsonFile<string[]>(pm.adminList, [])
        : [];
      const oldSet = new Set(oldList);
      const newSet = new Set(newList);
      if (running) {
        for (const name of newList) {
          if (!oldSet.has(name))
            await this.runtime.rconExec(item.id, `/promote ${name}`);
        }
        for (const name of oldList) {
          if (!newSet.has(name))
            await this.runtime.rconExec(item.id, `/demote ${name}`);
        }
      } else {
        writeJsonFile(pm.adminList, newList);
      }
    }
  }

  propagateWhitelist(fromServerPath: string): void {
    if (!this.config.webPanel.sync_whitelist_across_instances) return;
    const src = join(fromServerPath, 'server-whitelist.json');
    const data = existsSync(src) ? readJsonFile<unknown[]>(src, []) : [];
    for (const root of this.otherValidServerPaths(fromServerPath)) {
      try {
        writeJsonFile(join(root, 'server-whitelist.json'), data);
      } catch {
        /* ignore */
      }
    }
  }

  private otherInstances(fromId: string) {
    return this.instances
      .load()
      .items.filter(
        (it) => it.id !== fromId && this.isValidServerPath(it.serverPath),
      );
  }

  private otherValidServerPaths(fromServerPath: string): string[] {
    const norm = String(fromServerPath || '').trim();
    return this.instances
      .load()
      .items.filter(
        (it) => it.serverPath !== norm && this.isValidServerPath(it.serverPath),
      )
      .map((it) => it.serverPath);
  }

  private isValidServerPath(serverPath: string): boolean {
    return existsSync(join(serverPath, 'data', 'base', 'info.json'));
  }
}
