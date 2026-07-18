import { Injectable } from '@nestjs/common';
import { existsSync } from 'fs';
import { join } from 'path';
import { InstancesService } from '../../instances/instances.service';
import { PathsService } from '../../config/paths.service';
import { readJsonFile, writeJsonFile } from '../../common/json-store';
import { OpResult } from '../ops-utils';

type AnnounceItem = Record<string, unknown>;

@Injectable()
export class AnnouncementsOpsService {
  constructor(
    private readonly instances: InstancesService,
    private readonly paths: PathsService,
  ) {}

  read(): OpResult {
    const iid = this.instances.getSelectedId();
    if (!iid) return { ok: false, error: 'instance_not_found' };
    const instPath = this.paths.announcementsPath(iid);
    const missing = !existsSync(instPath);
    const dataInst = existsSync(instPath)
      ? readJsonFile<Record<string, unknown>>(instPath, {
          version: 1,
          items: [],
        })
      : { version: 1, items: [] };

    const gsched =
      dataInst.announceGlobalSchedules &&
      typeof dataInst.announceGlobalSchedules === 'object'
        ? (dataInst.announceGlobalSchedules as Record<string, unknown>)
        : {};

    const localItems = this.normalizeItems(
      Array.isArray(dataInst.items) ? (dataInst.items as AnnounceItem[]) : [],
    );
    const orphanGlobal = localItems.filter((x) => !!x.forAllServers);
    const localOnly = localItems.filter((x) => !x.forAllServers);

    const globalFromFile = this.loadGlobalItems()
      .map((git) => {
        const extra = gsched[String(git.id || '')];
        if (extra && typeof extra === 'object')
          return this.normalizeItem({ ...git, ...(extra as AnnounceItem) });
        return this.normalizeItem(git);
      })
      .filter((x): x is AnnounceItem => !!x);

    const merged = this.mergeItems(globalFromFile, orphanGlobal, localOnly);
    const base = { ...dataInst };
    for (const k of [
      'intervalHours',
      'autoRepeat',
      'lastAutoSentAt',
      'skipWhenNoPlayers',
      'announceGlobalSchedules',
      'items',
    ]) {
      delete base[k];
    }
    return {
      ok: true,
      missing,
      path: instPath,
      data: {
        ...base,
        version: Number(dataInst.version || 1),
        items: merged,
      },
    };
  }

  write(data: unknown): OpResult {
    const iid = this.instances.getSelectedId();
    if (!iid) return { ok: false, error: 'instance_not_found' };
    const norm = this.normalizeState(data);
    const globalsDisk: AnnounceItem[] = [];
    const gsched: Record<string, unknown> = {};
    const localsOut: AnnounceItem[] = [];

    for (const it of norm.items) {
      const nit = this.normalizeItem(it);
      if (!nit) continue;
      if (nit.forAllServers) {
        globalsDisk.push({
          id: nit.id,
          title: nit.title,
          body: nit.body,
          forAllServers: true,
        });
        const id = String(nit.id || '').trim();
        if (id) {
          gsched[id] = {
            autoRepeat: !!nit.autoRepeat,
            intervalHours: Math.max(
              1,
              Math.min(99, Number(nit.intervalHours || 6)),
            ),
            lastAutoSentAt: Number(nit.lastAutoSentAt || 0),
            skipWhenNoPlayers: nit.skipWhenNoPlayers !== false,
          };
        }
      } else {
        localsOut.push({ ...nit, forAllServers: false });
      }
    }

    writeJsonFile(this.globalPath(), { version: 1, items: globalsDisk });
    const instWrite = {
      version: Number(norm.version || 1),
      items: localsOut,
      selectedId: norm.selectedId,
      announceGlobalSchedules: gsched,
    };
    writeJsonFile(this.paths.announcementsPath(iid), instWrite);
    return { ok: true };
  }

  private globalPath(): string {
    return join(this.paths.announcementsDir, '_global.json');
  }

  private loadGlobalItems(): AnnounceItem[] {
    if (!existsSync(this.globalPath())) return [];
    const doc = readJsonFile<{ items?: AnnounceItem[] }>(this.globalPath(), {
      items: [],
    });
    return this.normalizeItems(Array.isArray(doc.items) ? doc.items : []);
  }

  private normalizeState(raw: unknown): {
    version: number;
    selectedId?: string;
    items: AnnounceItem[];
  } {
    const base =
      raw && typeof raw === 'object' && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    return {
      version: Number(base.version || 1),
      selectedId: base.selectedId ? String(base.selectedId) : undefined,
      items: this.normalizeItems(
        Array.isArray(base.items) ? (base.items as AnnounceItem[]) : [],
      ),
    };
  }

  private normalizeItems(items: AnnounceItem[]): AnnounceItem[] {
    const out: AnnounceItem[] = [];
    for (const it of items) {
      const nit = this.normalizeItem(it);
      if (nit) out.push(nit);
    }
    return out;
  }

  private normalizeItem(it: AnnounceItem): AnnounceItem | null {
    const id = String(it.id || '').trim();
    if (!id) return null;
    return {
      id,
      title: String(it.title || ''),
      body: String(it.body || ''),
      forAllServers: !!it.forAllServers,
      autoRepeat: !!it.autoRepeat,
      intervalHours: Math.max(1, Math.min(99, Number(it.intervalHours || 6))),
      lastAutoSentAt: Number(it.lastAutoSentAt || 0),
      skipWhenNoPlayers: it.skipWhenNoPlayers !== false,
    };
  }

  private mergeItems(
    global: AnnounceItem[],
    orphanGlobal: AnnounceItem[],
    localOnly: AnnounceItem[],
  ): AnnounceItem[] {
    const out: AnnounceItem[] = [];
    const seen = new Set<string>();
    for (const src of [global, orphanGlobal, localOnly]) {
      for (const it of src) {
        const id = String(it.id || '').trim();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const nit = this.normalizeItem(it);
        if (nit) out.push(nit);
      }
    }
    return out;
  }
}
