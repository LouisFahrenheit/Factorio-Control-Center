import { Injectable } from '@nestjs/common';
import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from 'fs';
import { basename, join } from 'path';
import { InstancesService } from '../../instances/instances.service';
import { FccConfigService } from '../../config/fcc-config.service';
import {
  SaveInspectService,
  saveFactorioVersionStr,
  saveModVersionStr,
  validateFactorioSaveInspect,
} from '../save-inspect/save-inspect.service';
import {
  OpResult,
  copyFileUnique,
  isErrorResult,
  nowStamp,
  readableSaveStamp,
  safeJoin,
  safeZipName,
  selectedInstance,
  type SelectedInstance,
} from '../ops-utils';
import {
  normalizeModUiLang,
  resolveModDisplayTitlesBatch,
} from '../mod-display-titles.util';
import { RuntimeService } from '../runtime.service';
import { ModPortalService } from '../mod-portal/mod-portal.service';

@Injectable()
export class SavesOpsService {
  constructor(
    private readonly instances: InstancesService,
    private readonly inspect: SaveInspectService,
    private readonly runtime: RuntimeService,
    private readonly portal: ModPortalService,
    private readonly config: FccConfigService,
  ) {}

  list(): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    mkdirSync(sel.pm.savesDir, { recursive: true });
    const active =
      this.runtime.get(sel.item.id)?.saveName ||
      this.resolveLaunch(sel.item.launchSave, sel.pm.savesDir);
    const runningNow = this.runtime.isRunning(sel.item.id);
    const saves = sel.pm.listSaves().map((s) => ({
      name: s.name,
      mtime: Math.floor(s.mtime / 1000),
      is_running_active: runningNow && active === s.name,
    }));
    return {
      ok: true,
      saves,
      running_now: runningNow,
      running_active_save: runningNow ? active : '',
    };
  }

  downloadPath(name: string): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const fname = safeZipName(name);
    if (!fname) return { ok: false, error: 'invalid_name' };
    const p = safeJoin(sel.pm.savesDir, fname);
    if (!p || !existsSync(p)) return { ok: false, error: 'not_found' };
    return { ok: true, path: p, name: fname };
  }

  async inspectSave(name: string, uiLangRaw?: string): Promise<OpResult> {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const dl = this.downloadPath(name);
    if (dl.ok === false) return dl;
    const path = String(dl.path || '');
    try {
      const info = await this.inspect.inspectSaveZip(path);
      let header: {
        factorio_version: string;
        campaign: string;
        level_name: string;
        base_mod: string;
        difficulty: number;
        mods: {
          name: string;
          display_name: string;
          version: string;
          crc: number;
        }[];
      } | null = null;
      if (info.header) {
        const modNames = info.header.mods.map((m) => m.name);
        const titles = this.modDisplayTitles(sel, modNames, uiLangRaw);
        header = {
          factorio_version: saveFactorioVersionStr(
            info.header.factorio_version,
          ),
          campaign: info.header.campaign,
          level_name: info.header.level_name,
          base_mod: info.header.base_mod,
          difficulty: info.header.difficulty,
          mods: info.header.mods.map((m) => ({
            name: m.name,
            display_name: titles[m.name] || m.name,
            version: saveModVersionStr(m.version),
            crc: m.crc,
          })),
        };
      }
      return {
        ok: true,
        name: dl.name,
        header,
        header_error: info.header_error,
        header_source: info.header_source,
        has_level_dat: info.has_level_dat,
        has_level_init: info.has_level_init,
        script_output_files: info.script_output_files,
        members: info.members
          .slice(0, 500)
          .map((m) => ({ name: m.name, file_size: m.file_size })),
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  async inspectUploadedSaveMods(
    tmpPath: string,
    uiLangRaw?: string,
  ): Promise<OpResult> {
    if (!existsSync(tmpPath)) return { ok: false, error: 'not_found' };
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    try {
      const info = await this.inspect.inspectSaveZip(tmpPath);
      if (!info.header) {
        return {
          ok: false,
          error: 'inspect_failed',
          header_error: info.header_error,
          header_source: info.header_source,
        };
      }
      const filtered = info.header.mods.filter(
        (m) => !this.portal.isBuiltin(m.name),
      );
      const titles = this.modDisplayTitles(
        sel,
        filtered.map((m) => m.name),
        uiLangRaw,
      );
      const mods = filtered
        .map((m) => {
          const installedVersions = this.portal.listZipVersions(
            m.name,
            sel.pm.modsDir,
          );
          return {
            name: m.name,
            display_name: titles[m.name] || m.name,
            version: saveModVersionStr(m.version),
            installed: installedVersions.length > 0,
            installed_versions: installedVersions,
          };
        })
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        ok: true,
        factorio_version: saveFactorioVersionStr(info.header.factorio_version),
        mods,
        header_source: info.header_source,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  rename(oldName: string, newNameRaw: string): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    if (this.isActiveSave(sel.item.id, oldName))
      return { ok: false, error: 'running_active_save' };
    const newName = safeZipName(newNameRaw);
    if (!newName) return { ok: false, error: 'invalid_name' };
    const src = safeJoin(sel.pm.savesDir, oldName);
    const dst = safeJoin(sel.pm.savesDir, newName);
    if (!src || !existsSync(src)) return { ok: false, error: 'not_found' };
    if (!dst || existsSync(dst)) return { ok: false, error: 'exists' };
    try {
      require('fs').renameSync(src, dst);
      return { ok: true, name: newName };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  delete(name: string): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    if (this.isActiveSave(sel.item.id, name))
      return { ok: false, error: 'running_active_save' };
    const p = safeJoin(sel.pm.savesDir, name);
    if (!p || !existsSync(p)) return { ok: false, error: 'not_found' };
    rmSync(p, { force: true });
    return { ok: true };
  }

  duplicate(name: string): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const src = safeJoin(sel.pm.savesDir, name);
    if (!src || !existsSync(src)) return { ok: false, error: 'not_found' };
    const stem = basename(name).replace(/\.zip$/i, '');
    let dstName = `${stem}_copy_${readableSaveStamp()}.zip`;
    let dst = join(sel.pm.savesDir, dstName);
    let i = 1;
    while (existsSync(dst)) {
      dstName = `${stem}_copy_${readableSaveStamp()}_${i}.zip`;
      dst = join(sel.pm.savesDir, dstName);
      i += 1;
    }
    copyFileSync(src, dst);
    return { ok: true, name: dstName };
  }

  setLaunchSave(name: string): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const prev = String(sel.item.launchSave || 'latest');
    const raw = String(name || '').trim();
    if (raw === 'latest') {
      this.instances.update(sel.item.id, { ...sel.item, launchSave: 'latest' });
      const changes =
        prev !== 'latest' ? [{ key: 'save', from: prev, to: 'latest' }] : [];
      return { ok: true, settings_changes: changes };
    }
    const fname = safeZipName(raw);
    if (!fname || !existsSync(join(sel.pm.savesDir, fname)))
      return { ok: false, error: 'not_in_list' };
    this.instances.update(sel.item.id, { ...sel.item, launchSave: fname });
    const changes =
      prev !== fname ? [{ key: 'save', from: prev, to: fname }] : [];
    return { ok: true, settings_changes: changes };
  }

  async uploadArchive(tmpPath: string, name: string): Promise<OpResult> {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    if (!existsSync(tmpPath)) return { ok: false, error: 'tmp_not_found' };
    try {
      const inspect = await this.inspect.inspectSaveZip(tmpPath);
      const valid = validateFactorioSaveInspect(inspect);
      if (!valid.ok) return { ok: false, error: valid.error };
      const wanted =
        safeZipName(name || basename(tmpPath)) || `uploaded_${nowStamp()}.zip`;
      const finalName = copyFileUnique(tmpPath, sel.pm.savesDir, wanted);
      return {
        ok: true,
        name: finalName,
        bytes: statSync(join(sel.pm.savesDir, finalName)).size,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  private isActiveSave(instanceId: string, name: string): boolean {
    const rt = this.runtime.get(instanceId);
    return (
      !!rt?.proc &&
      rt.proc.exitCode === null &&
      rt.saveName === String(name || '').trim()
    );
  }

  private resolveLaunch(launchSave: string, savesDir: string): string {
    const raw = String(launchSave || '').trim();
    if (raw && raw !== 'latest') return raw;
    const files = require('fs').existsSync(savesDir)
      ? require('fs')
          .readdirSync(savesDir)
          .filter((f: string) => f.toLowerCase().endsWith('.zip') && !f.toLowerCase().endsWith('.tmp.zip'))
      : [];
    return (
      files
        .map((f: string) => ({ f, m: statSync(join(savesDir, f)).mtimeMs }))
        .sort((a: { m: number }, b: { m: number }) => b.m - a.m)[0]?.f || ''
    );
  }

  private modDisplayTitles(
    sel: SelectedInstance,
    modNames: string[],
    uiLangRaw?: string,
  ): Record<string, string> {
    return resolveModDisplayTitlesBatch({
      serverPath: sel.item.serverPath,
      modsDir: sel.pm.modsDir,
      modNames,
      uiLang: normalizeModUiLang(uiLangRaw, this.config.langCode),
      translateModNames: this.config.translateModNames,
    });
  }
}
