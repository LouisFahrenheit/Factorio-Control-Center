import { Injectable } from '@nestjs/common';
import AdmZip from 'adm-zip';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { panelTimestamp } from '../../common/datetime.util';
import {
  buildFccFileEnvelope,
  fccFileKindContainsLabel,
  FCC_FILE_FORMAT,
  parseJsonObject,
  unwrapModpackPayload,
} from '../../common/fcc-file-format';
import { PathsService } from '../../config/paths.service';
import { FccConfigService } from '../../config/fcc-config.service';
import { LocaleService } from '../../locale/locale.service';
import { InstancesService } from '../../instances/instances.service';
import {
  OpResult,
  gameVersion,
  hasSpaceAgeInstalled,
  isErrorResult,
  modNameFromZip,
  readModList,
  readModManifest,
  safeName,
  selectedInstance,
} from '../ops-utils';
import {
  ensureSaOfficialExpansionRows,
  modpackActivateNeedsSpaceAge,
  portalDependencyNames,
  resetServerModsDir,
} from '../mod-deps';
import { ModPortalService } from '../mod-portal/mod-portal.service';
import { ModsJobService } from '../mods/mods-job.service';
import { RuntimeService } from '../runtime.service';
import { ProgramOpsService } from '../program/program-ops.service';
import { trackModInstallMeta } from '../instance-server-data';
import {
  normalizeModUiLang,
  resolveModDisplayTitlesBatch,
} from '../mod-display-titles.util';

const BUILTIN_MODS = [
  'base',
  'elevated-rails',
  'quality',
  'recycler',
  'space-age',
];

interface ImportManifest {
  mods: string[];
  mod_entries?: { name: string; enabled?: boolean; version?: string }[];
  pending_extra_deps?: string[];
}

@Injectable()
export class ModpacksOpsService {
  constructor(
    private readonly paths: PathsService,
    private readonly instances: InstancesService,
    private readonly runtime: RuntimeService,
    private readonly portal: ModPortalService,
    private readonly modJobs: ModsJobService,
    private readonly program: ProgramOpsService,
    private readonly config: FccConfigService,
    private readonly locale: LocaleService,
  ) {}

  list(): OpResult {
    mkdirSync(this.paths.modpacksDir, { recursive: true });
    const active = this.activeGet();
    const modpacks = readdirSync(this.paths.modpacksDir, {
      withFileTypes: true,
    })
      .filter((d) => d.isDirectory())
      .map((d) => this.summarize(d.name, active));
    return {
      ok: true,
      active,
      modpacks,
      root_dir: this.paths.modpacksDir,
      activate_use_symlinks: this.program.modpackActivateUseSymlinks(),
    };
  }

  get(name: string, uiLangRaw?: string): OpResult {
    const nm = this.validName(name);
    if (!nm) return { ok: false, error: 'invalid_name' };
    const dir = this.dir(nm);
    if (!existsSync(dir)) return { ok: false, error: 'not_found' };
    const info = this.summarize(nm, this.activeGet());
    const mods = this.listModpackMods(nm, dir, uiLangRaw);
    return { ok: true, modpack: { ...info, mods } };
  }

  private listModpackMods(
    name: string,
    dir: string,
    uiLangRaw?: string,
  ): { name: string; display_name: string; version: string }[] {
    const modsDir = join(dir, 'mods');
    let rows: { name: string; display_name: string; version: string }[] = [];
    const fromZips = existsSync(modsDir)
      ? readdirSync(modsDir)
          .filter((f) => f.toLowerCase().endsWith('.zip'))
          .map((f) => {
            const manifest = readModManifest(join(modsDir, f));
            return {
              name: String(
                manifest?.name || f.replace(/_\d+\.\d+\.\d+\.zip$/i, ''),
              ),
              display_name: String(
                manifest?.name || f.replace(/_\d+\.\d+\.\d+\.zip$/i, ''),
              ),
              version: String(manifest?.version || ''),
            };
          })
      : [];
    if (fromZips.length) rows = fromZips;
    else {
      const imp = this.readImportManifest(name);
      if (imp?.mod_entries?.length) {
        rows = imp.mod_entries.map((e) => ({
          name: String(e.name || ''),
          display_name: String(e.name || ''),
          version: String(e.version || '—'),
        }));
      } else {
        const modListPath = join(modsDir, 'mod-list.json');
        if (existsSync(modListPath)) {
          try {
            const data = JSON.parse(readFileSync(modListPath, 'utf-8')) as {
              mods?: { name?: string; version?: string }[];
            };
            for (const row of data.mods || []) {
              const n = String(row?.name || '').trim();
              if (!n || BUILTIN_MODS.includes(n.toLowerCase())) continue;
              rows.push({
                name: n,
                display_name: n,
                version: String(row?.version || '—'),
              });
            }
          } catch {
            /* ignore */
          }
        }
      }
    }
    if (!rows.length) return rows;
    const sel = selectedInstance(this.instances);
    const serverPath = isErrorResult(sel) ? '' : sel.item.serverPath;
    const uiLang = normalizeModUiLang(uiLangRaw, this.config.langCode);
    const titles = resolveModDisplayTitlesBatch({
      serverPath,
      modsDir,
      modNames: rows.map((r) => r.name),
      uiLang,
      translateModNames: this.config.translateModNames,
    });
    return rows.map((r) => ({
      ...r,
      display_name: titles[r.name] || r.display_name,
    }));
  }

  saveCurrent(
    name: string,
    description = '',
    includeSettings = false,
    includeDisabled = false,
  ): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    const nm = this.validName(name);
    if (!nm) return { ok: false, error: 'invalid_name' };
    const modList = readModList(sel.pm);
    const isUserMod = (row: Record<string, unknown>) => {
      const n = String(row.name || '')
        .trim()
        .toLowerCase();
      return n && !BUILTIN_MODS.includes(n);
    };
    const isEnabled = (row: Record<string, unknown>) => row.enabled !== false;
    const userModCount = modList.mods.filter(
      (row) => isUserMod(row) && (includeDisabled || isEnabled(row)),
    ).length;
    if (!userModCount) return { ok: false, error: 'empty' };
    const includedModNames = new Set<string>();
    for (const row of modList.mods) {
      const n = String(row.name || '')
        .trim()
        .toLowerCase();
      if (!n) continue;
      if (BUILTIN_MODS.includes(n)) {
        includedModNames.add(n);
        continue;
      }
      if (includeDisabled || isEnabled(row)) includedModNames.add(n);
    }
    const dir = this.dir(nm);
    if (existsSync(dir)) return { ok: false, error: 'exists' };
    mkdirSync(join(dir, 'mods'), { recursive: true });
    let copied = 0;
    for (const f of readdirSync(sel.pm.modsDir)) {
      const lower = f.toLowerCase();
      if (lower.endsWith('.zip')) {
        if (!includedModNames.has(modNameFromZip(f).toLowerCase())) continue;
        copyFileSync(join(sel.pm.modsDir, f), join(dir, 'mods', f));
        copied += 1;
        continue;
      }
      if (includeSettings && f === 'mod-settings.dat') {
        copyFileSync(join(sel.pm.modsDir, f), join(dir, 'mods', f));
        copied += 1;
      }
    }
    const modsToWrite = includeDisabled
      ? modList.mods
      : modList.mods.filter((row) => {
          const n = String(row.name || '')
            .trim()
            .toLowerCase();
          if (!n) return false;
          if (BUILTIN_MODS.includes(n)) return true;
          return isEnabled(row);
        });
    writeFileSync(
      join(dir, 'mods', 'mod-list.json'),
      JSON.stringify({ mods: modsToWrite }, null, 2) + '\n',
      'utf-8',
    );
    copied += 1;
    writeFileSync(
      join(dir, 'metadata.json'),
      JSON.stringify(
        {
          name: nm,
          description,
          factorio_version: gameVersion(sel.item.serverPath),
          created_at: panelTimestamp(),
          mods_count: copied,
          has_mod_settings: includeSettings,
        },
        null,
        2,
      ) + '\n',
      'utf-8',
    );
    return { ok: true, name: nm, copied };
  }

  activate(name: string, createBackup: boolean, actor = ''): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    if (this.runtime.isRunning(sel.item.id))
      return { ok: false, error: 'server_running' };
    const nm = this.validName(name);
    if (!nm || !existsSync(this.dir(nm)))
      return { ok: false, error: 'not_found' };
    if (this.activeGet() === nm) return { ok: false, error: 'already_active' };
    if (
      !hasSpaceAgeInstalled(sel.item.serverPath) &&
      modpackActivateNeedsSpaceAge(this.dir(nm))
    ) {
      return { ok: false, error: 'modpack_requires_space_age' };
    }
    const installedUserMods = readModList(sel.pm).mods.filter((row) => {
      const n = String(row.name || '')
        .trim()
        .toLowerCase();
      return n && !BUILTIN_MODS.includes(n);
    }).length;
    let backup = '';
    if (createBackup && installedUserMods > 0) {
      backup = `backup_${Date.now()}`;
      this.saveCurrent(backup, 'auto-backup before activate', true, true);
    }
    mkdirSync(sel.pm.modsDir, { recursive: true });
    let deleted = 0;
    for (const f of readdirSync(sel.pm.modsDir)) {
      const lower = f.toLowerCase();
      if (
        !lower.endsWith('.zip') &&
        f !== 'mod-list.json' &&
        f !== 'mod-settings.dat'
      )
        continue;
      rmSync(join(sel.pm.modsDir, f), { force: true, recursive: true });
      deleted += 1;
    }
    const src = join(this.dir(nm), 'mods');
    const useCopy = !this.program.modpackActivateUseSymlinks();
    let copied = 0;
    if (existsSync(src)) {
      for (const f of readdirSync(src)) {
        const lower = f.toLowerCase();
        if (
          !lower.endsWith('.zip') &&
          f !== 'mod-list.json' &&
          f !== 'mod-settings.dat'
        )
          continue;
        const from = join(src, f);
        const to = join(sel.pm.modsDir, f);
        if (lower.endsWith('.zip') && !useCopy) {
          try {
            symlinkSync(from, to, 'file');
            copied += 1;
            continue;
          } catch {
            /* fall back to copy */
          }
        }
        copyFileSync(from, to);
        copied += 1;
      }
    }
    if (existsSync(join(src, 'mod-list.json'))) {
      copyFileSync(join(src, 'mod-list.json'), sel.pm.modList);
    } else if (existsSync(sel.pm.modList)) {
      ensureSaOfficialExpansionRows(
        sel.pm.modList,
        hasSpaceAgeInstalled(sel.item.serverPath),
        gameVersion(sel.item.serverPath),
      );
    }
    const modNames = readModList(sel.pm)
      .mods.map((r) => String(r.name || '').trim())
      .filter((n) => n && !BUILTIN_MODS.includes(n.toLowerCase()));
    trackModInstallMeta(sel.item.serverPath, modNames, actor, true);
    this.activeSet(nm);
    return {
      ok: true,
      name: nm,
      deleted,
      copied,
      backup,
      used_symlinks: !useCopy,
    };
  }

  rename(oldName: string, newName: string): OpResult {
    const old = this.validName(oldName);
    const nn = this.validName(newName);
    if (!old || !nn) return { ok: false, error: 'invalid_name' };
    if (!existsSync(this.dir(old))) return { ok: false, error: 'not_found' };
    if (old !== nn && existsSync(this.dir(nn)))
      return { ok: false, error: 'exists' };
    require('fs').renameSync(this.dir(old), this.dir(nn));
    if (this.activeGet() === old) this.activeSet(nn);
    return { ok: true, name: nn };
  }

  delete(name: string): OpResult {
    const nm = this.validName(name);
    if (!nm || !existsSync(this.dir(nm)))
      return { ok: false, error: 'not_found' };
    rmSync(this.dir(nm), { recursive: true, force: true });
    if (this.activeGet() === nm) this.activeSet('');
    return { ok: true };
  }

  reset(): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    if (this.runtime.isRunning(sel.item.id))
      return { ok: false, error: 'server_running' };
    const deleted = resetServerModsDir(sel.item.serverPath);
    this.activeSet('');
    return { ok: true, deleted };
  }

  exportPrepare(
    name: string,
    includeSettings = false,
    description = '',
  ): OpResult {
    const nm = this.validName(name);
    if (!nm || !existsSync(this.dir(nm)))
      return { ok: false, error: 'not_found' };
    const modsDir = join(this.dir(nm), 'mods');
    const modListPath = join(modsDir, 'mod-list.json');
    const metaPath = join(this.dir(nm), 'metadata.json');
    const meta = existsSync(metaPath)
      ? (JSON.parse(readFileSync(metaPath, 'utf-8')) as Record<string, unknown>)
      : {};
    const userMods: { name: string; enabled?: boolean; version?: string }[] =
      [];
    if (existsSync(modListPath)) {
      try {
        const data = JSON.parse(readFileSync(modListPath, 'utf-8')) as {
          mods?: { name?: string; enabled?: boolean; version?: string }[];
        };
        for (const row of data.mods || []) {
          const n = String(row?.name || '').trim();
          if (!n || BUILTIN_MODS.includes(n.toLowerCase())) continue;
          userMods.push({
            name: n,
            enabled: row.enabled !== false,
            version: row.version ? String(row.version) : undefined,
          });
        }
      } catch {
        /* ignore */
      }
    }
    if (!userMods.length) {
      const imp = this.readImportManifest(nm);
      if (imp?.mod_entries?.length) {
        for (const row of imp.mod_entries) userMods.push(row);
      }
    }
    if (!userMods.length) return { ok: false, error: 'empty' };

    const payload: Record<string, unknown> = {
      factorio_version: String(meta.factorio_version || '').trim(),
      mods: userMods,
    };
    const settingsPath = join(modsDir, 'mod-settings.dat');
    if (includeSettings && existsSync(settingsPath)) {
      payload.mod_settings_b64 = readFileSync(settingsPath).toString('base64');
    }

    const safeStub =
      nm.replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^\.+|\.+$/g, '') ||
      'modpack';
    const localeStrings =
      this.locale.readLang(this.config.langCode) ||
      this.locale.readLang('en') ||
      {};
    const envelope = buildFccFileEnvelope('modpack', nm, payload, {
      description: String(description || meta.description || '').trim(),
      created_at: panelTimestamp(),
      contains: fccFileKindContainsLabel('modpack', localeStrings),
    });
    const out = join(require('os').tmpdir(), `${safeStub}.fcc`);
    writeFileSync(out, JSON.stringify(envelope, null, 2) + '\n', 'utf-8');
    return { ok: true, path: out, name: `${safeStub}.fcc` };
  }

  importUpload(tmpPath: string, name: string, applySettings = false): OpResult {
    const nm = this.validName(name);
    if (!nm) return { ok: false, error: 'invalid_name' };
    if (!existsSync(tmpPath)) return { ok: false, error: 'tmp_not_found' };
    if (existsSync(this.dir(nm))) return { ok: false, error: 'exists' };

    const raw = readFileSync(tmpPath);
    if (this.looksLikeJsonFile(raw)) {
      return this.importUploadJson(raw.toString('utf-8'), nm, applySettings);
    }
    return this.importUploadZip(tmpPath, nm);
  }

  async importDownloadPlan(name: string): Promise<OpResult> {
    const nm = this.validName(name);
    if (!nm || !existsSync(this.dir(nm)))
      return { ok: false, error: 'not_found' };
    const imp = this.ensureImportManifest(nm);
    if (!imp?.mods?.length)
      return { ok: true, dependencies: [], requires_confirmation: false };

    const planned = new Set(
      imp.mods
        .map((m) =>
          String(m || '')
            .trim()
            .toLowerCase(),
        )
        .filter(Boolean),
    );
    const extra: string[] = [];
    for (const mod of imp.mods) {
      const id = this.portal.modIdFromInput(String(mod || ''));
      if (!id || this.portal.isBuiltin(id.toLowerCase())) continue;
      try {
        const meta = await this.portal.fetchFull(id);
        const rel = this.portal.lastRelease(meta);
        for (const dep of portalDependencyNames(rel)) {
          const depName = this.portal.modIdFromInput(dep);
          const depKey = depName.toLowerCase();
          if (!depName || this.portal.isBuiltin(depKey) || planned.has(depKey))
            continue;
          if (!extra.some((x) => x.toLowerCase() === depKey))
            extra.push(depName);
        }
      } catch {
        /* skip mod on portal errors */
      }
    }
    imp.pending_extra_deps = extra;
    this.writeImportManifest(nm, imp);
    return {
      ok: true,
      dependencies: extra,
      requires_confirmation: extra.length > 0,
    };
  }

  importAppendDependencies(name: string): OpResult {
    const nm = this.validName(name);
    if (!nm || !existsSync(this.dir(nm)))
      return { ok: false, error: 'not_found' };
    const imp = this.readImportManifest(nm);
    if (!imp) return { ok: false, error: 'not_found' };
    const added: string[] = [];
    for (const dep of imp.pending_extra_deps || []) {
      const d = String(dep || '').trim();
      const key = d.toLowerCase();
      if (
        !d ||
        imp.mods.some(
          (m) =>
            String(m || '')
              .trim()
              .toLowerCase() === key,
        )
      )
        continue;
      imp.mods.push(d);
      added.push(d);
    }
    imp.pending_extra_deps = [];
    this.writeImportManifest(nm, imp);
    return { ok: true, added, count: added.length };
  }

  importStartDownload(
    name: string,
    params: Record<string, unknown> = {},
  ): OpResult {
    const nm = this.validName(name);
    if (!nm || !existsSync(this.dir(nm)))
      return { ok: false, error: 'not_found' };
    const imp = this.ensureImportManifest(nm);
    if (!imp?.mods?.length) return { ok: false, error: 'no_mods' };
    const modsDir = join(this.dir(nm), 'mods');
    mkdirSync(modsDir, { recursive: true });
    return this.modJobs.start('import_modpack', {
      mods: imp.mods,
      mods_dir: modsDir,
      modpack_name: nm,
      remove_old_zips: params.remove_old_zips !== false,
    });
  }

  private importUploadJson(
    raw: string,
    nm: string,
    applySettings: boolean,
  ): OpResult {
    const parsed = parseJsonObject(raw);
    if (!parsed) return { ok: false, error: 'invalid_format' };
    if (parsed.format !== FCC_FILE_FORMAT || parsed.kind !== 'modpack') {
      return { ok: false, error: 'invalid_format' };
    }
    const payload = unwrapModpackPayload(parsed);
    if (!payload) return { ok: false, error: 'invalid_format' };

    const userMods = this.userModsFromPayload(payload);
    if (!userMods.length) return { ok: false, error: 'no_mods' };

    const packDir = this.dir(nm);
    const modsDir = join(packDir, 'mods');
    mkdirSync(modsDir, { recursive: true });

    const desc = String(parsed.description || payload.description || '').trim();
    const fv = String(payload.factorio_version || '').trim();
    const hasSettings =
      applySettings &&
      typeof payload.mod_settings_b64 === 'string' &&
      payload.mod_settings_b64.length > 0;

    writeFileSync(
      join(packDir, 'metadata.json'),
      JSON.stringify(
        {
          name: nm,
          description: desc,
          factorio_version: fv,
          created_at: panelTimestamp(),
          mods_count: 0,
          has_mod_settings: hasSettings,
        },
        null,
        2,
      ) + '\n',
      'utf-8',
    );

    const manifest: ImportManifest = {
      mods: userMods.map((m) => m.name.trim()),
      mod_entries: userMods,
      pending_extra_deps: [],
    };
    this.writeImportManifest(nm, manifest);

    const modList = {
      mods: [
        { name: 'base', enabled: true },
        ...userMods.map((m) => ({
          name: m.name,
          enabled: m.enabled !== false,
          ...(m.version ? { version: m.version } : {}),
        })),
      ],
    };
    writeFileSync(
      join(modsDir, 'mod-list.json'),
      JSON.stringify(modList, null, 2) + '\n',
      'utf-8',
    );

    if (hasSettings) {
      writeFileSync(
        join(modsDir, 'mod-settings.dat'),
        Buffer.from(String(payload.mod_settings_b64), 'base64'),
      );
    }

    return {
      ok: true,
      name: nm,
      user_mods_count: userMods.length,
      applied_settings: hasSettings,
    };
  }

  private importUploadZip(tmpPath: string, nm: string): OpResult {
    mkdirSync(this.dir(nm), { recursive: true });
    try {
      new AdmZip(tmpPath).extractAllTo(this.dir(nm), true);
      this.ensureImportManifest(nm);
      const imp = this.readImportManifest(nm);
      const count = imp?.mods?.length || 0;
      return {
        ok: true,
        name: nm,
        user_mods_count: count,
        applied_settings: false,
      };
    } catch (e) {
      rmSync(this.dir(nm), { recursive: true, force: true });
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  private looksLikeJsonFile(raw: Buffer): boolean {
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) continue;
      return c === 0x7b; // '{'
    }
    return false;
  }

  private userModsFromPayload(
    payload: Record<string, unknown>,
  ): { name: string; enabled?: boolean; version?: string }[] {
    const mods = Array.isArray(payload.mods) ? payload.mods : [];
    const out: { name: string; enabled?: boolean; version?: string }[] = [];
    for (const row of mods) {
      if (!row || typeof row !== 'object') continue;
      const rec = row as Record<string, unknown>;
      const name = String(rec.name || '').trim();
      if (!name || BUILTIN_MODS.includes(name.toLowerCase())) continue;
      out.push({
        name,
        enabled: rec.enabled !== false,
        version: rec.version ? String(rec.version) : undefined,
      });
    }
    return out;
  }

  private importManifestPath(name: string): string {
    return join(this.dir(name), 'import.json');
  }

  private readImportManifest(name: string): ImportManifest | null {
    const p = this.importManifestPath(name);
    if (!existsSync(p)) return null;
    try {
      const data = JSON.parse(readFileSync(p, 'utf-8')) as ImportManifest;
      if (!Array.isArray(data.mods)) data.mods = [];
      return data;
    } catch {
      return null;
    }
  }

  private ensureImportManifest(name: string): ImportManifest | null {
    const existing = this.readImportManifest(name);
    if (existing?.mods?.length) return existing;

    const modsDir = join(this.dir(name), 'mods');
    const mods: string[] = [];
    const modListPath = join(modsDir, 'mod-list.json');
    if (existsSync(modListPath)) {
      try {
        const data = JSON.parse(readFileSync(modListPath, 'utf-8')) as {
          mods?: { name?: string }[];
        };
        for (const row of data.mods || []) {
          const n = String(row?.name || '').trim();
          if (n && !BUILTIN_MODS.includes(n.toLowerCase())) mods.push(n);
        }
      } catch {
        /* ignore */
      }
    }
    if (!mods.length && existsSync(modsDir)) {
      for (const f of readdirSync(modsDir)) {
        if (!f.toLowerCase().endsWith('.zip')) continue;
        const m = /^(.+)_(\d+\.\d+\.\d+)\.zip$/i.exec(f);
        if (m?.[1] && !BUILTIN_MODS.includes(m[1].toLowerCase()))
          mods.push(m[1]);
      }
    }
    const unique = [...new Set(mods.map((m) => m.trim()).filter(Boolean))];
    if (!unique.length) return existing;

    const manifest: ImportManifest = { mods: unique, pending_extra_deps: [] };
    this.writeImportManifest(name, manifest);
    return manifest;
  }

  private writeImportManifest(name: string, data: ImportManifest): void {
    writeFileSync(
      this.importManifestPath(name),
      JSON.stringify(data, null, 2) + '\n',
      'utf-8',
    );
  }

  private summarize(name: string, active: string): Record<string, unknown> {
    const dir = this.dir(name);
    const metaPath = join(dir, 'metadata.json');
    const meta = existsSync(metaPath)
      ? (JSON.parse(readFileSync(metaPath, 'utf-8')) as Record<string, unknown>)
      : {};
    const modsDir = join(dir, 'mods');
    const modsCount = existsSync(modsDir)
      ? readdirSync(modsDir).filter((f) => f.toLowerCase().endsWith('.zip'))
          .length
      : 0;
    return {
      name,
      active: active === name,
      mods_count: modsCount,
      requires_space_age: modpackActivateNeedsSpaceAge(dir),
      ...meta,
    };
  }

  private validName(name: string): string {
    const n = safeName(name);
    return /^[A-Za-z0-9_. -]+$/.test(n) && n ? n : '';
  }

  private dir(name: string): string {
    return join(this.paths.modpacksDir, name);
  }

  private activePath(): string {
    const id = this.instances.getSelectedId() || 'global';
    return join(this.paths.modpacksDir, `.active-${id}.txt`);
  }

  private activeGet(): string {
    try {
      return existsSync(this.activePath())
        ? readFileSync(this.activePath(), 'utf-8').trim()
        : '';
    } catch {
      return '';
    }
  }

  private activeSet(name: string): void {
    mkdirSync(this.paths.modpacksDir, { recursive: true });
    writeFileSync(this.activePath(), name, 'utf-8');
  }
}
