import { Injectable } from '@nestjs/common';
import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { PathManager } from '../ops/path-manager';
import { readJsonFile } from '../common/json-store';

@Injectable()
export class ModsService {
  list(pm: PathManager | null): Record<string, unknown> {
    if (!pm) return { ok: false, error: 'no_instance' };
    const modListPath = pm.modList;
    const modList = existsSync(modListPath)
      ? readJsonFile<{ mods: { name: string; enabled: boolean }[] }>(
          modListPath,
          {
            mods: [],
          },
        )
      : { mods: [] };
    const zips: { name: string; filename: string; enabled: boolean }[] = [];
    if (existsSync(pm.modsDir)) {
      const enabledMap = new Map(
        (modList.mods || []).map((m) => [m.name, m.enabled]),
      );
      for (const f of readdirSync(pm.modsDir)) {
        if (!f.toLowerCase().endsWith('.zip')) continue;
        const base = f
          .replace(/_\d+\.\d+\.\d+\.zip$/i, '')
          .replace(/\.zip$/i, '');
        zips.push({
          name: base,
          filename: f,
          enabled: enabledMap.get(base) ?? true,
        });
      }
    }
    return { ok: true, mods: zips, mod_list: modList };
  }
}
