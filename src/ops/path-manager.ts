import { existsSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

export class PathManager {
  constructor(readonly serverPath: string) {}

  get serverSettings(): string {
    return join(this.serverPath, 'server-settings.json');
  }

  get adminList(): string {
    return join(this.serverPath, 'server-adminlist.json');
  }

  get banList(): string {
    return join(this.serverPath, 'server-banlist.json');
  }

  get modsDir(): string {
    return join(this.serverPath, 'mods');
  }

  get modList(): string {
    return join(this.modsDir, 'mod-list.json');
  }

  get modSettingsDat(): string {
    return join(this.modsDir, 'mod-settings.dat');
  }

  get savesDir(): string {
    return join(this.serverPath, 'saves');
  }

  findFactorioExe(): string | null {
    return findFactorioExecutable(this.serverPath);
  }

  listSaves(): { name: string; mtime: number }[] {
    if (!existsSync(this.savesDir)) return [];
    return readdirSync(this.savesDir)
      .filter((f) => f.toLowerCase().endsWith('.zip') && !f.toLowerCase().endsWith('.tmp.zip'))
      .map((name) => {
        const st = statSync(join(this.savesDir, name));
        return { name, mtime: st.mtimeMs };
      })
      .sort((a, b) => b.mtime - a.mtime);
  }

  latestSave(): string | null {
    const saves = this.listSaves();
    return saves[0]?.name ?? null;
  }
}

/** bin/x64/factorio.exe (Windows) or bin/x64/factorio (Linux headless). */
export function findFactorioExecutable(serverPath: string): string | null {
  const root = String(serverPath || '').trim();
  if (!root) return null;
  const candidates = [
    join(root, 'bin', 'x64', 'factorio.exe'),
    join(root, 'bin', 'x64', 'factorio'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function hasFactorioExecutable(serverPath: string): boolean {
  return !!findFactorioExecutable(serverPath);
}
