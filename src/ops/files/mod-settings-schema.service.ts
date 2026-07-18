import { Injectable } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { createHash } from 'crypto';
import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';
import { FccConfigService } from '../../config/fcc-config.service';
import { InstancesService } from '../../instances/instances.service';
import {
  LocaleSections,
  loadFactorioLocaleSections,
  lookupLocaleString,
  modPackagePathsForInternalName,
  resolveModDisplayTitlesBatch,
} from '../mod-display-titles.util';
import { ModSettings, modSettingsToJsonObject } from '../factorio-data-codec';
import {
  OpResult,
  isErrorResult,
  selectedInstance,
  type SelectedInstance,
} from '../ops-utils';
import {
  ingestSettingsLuaText,
  isSettingsLuaMember,
  modSettingChoiceLocaleKeys,
  type LuaSettingUiRefs,
} from './mod-settings-lua.util';

const SECTIONS = ['startup', 'runtime-global', 'runtime-per-user'] as const;
const OTHER_GROUP = '\0other';
const CHOICE_SECTIONS = [
  'string-mod-setting',
  'int-mod-setting',
  'double-mod-setting',
  'bool-mod-setting',
];

export interface ModSettingSchemaChoice {
  value: unknown;
  label: string;
}

export interface ModSettingSchemaEntry {
  display_name: string;
  description: string;
  group: string;
  allowed_values?: ModSettingSchemaChoice[];
}

export interface ModSettingsSchemaProgress {
  phase: string;
  mod?: string;
  mod_done?: number;
  mod_total?: number;
  step?: number;
  step_total?: number;
}

interface SchemaPayload {
  settings: Record<string, ModSettingSchemaEntry>;
  group_titles: Record<string, string>;
}

interface SchemaJob {
  instanceId: string;
  uiLang: string;
  fingerprint: string;
  running: boolean;
  progress: ModSettingsSchemaProgress;
  result: SchemaPayload | null;
  error: string;
}

@Injectable()
export class ModSettingsSchemaService {
  private readonly cache = new Map<string, SchemaPayload>();
  private job: SchemaJob | null = null;

  constructor(
    private readonly instances: InstancesService,
    private readonly config: FccConfigService,
  ) {}

  get(uiLangRaw?: string, refresh = false): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;

    const uiLang = this.normalizeLang(uiLangRaw);
    const fingerprint = this.buildFingerprint(sel, uiLang);

    if (!refresh) {
      const cached = this.cache.get(fingerprint);
      if (cached) {
        return {
          ok: true,
          cached: true,
          settings: cached.settings,
          group_titles: cached.group_titles,
        };
      }
    } else {
      this.dropCacheForInstance(sel.item.id);
    }

    if (
      this.job?.running &&
      this.job.instanceId === sel.item.id &&
      this.job.uiLang === uiLang
    ) {
      return { ok: true, pending: true, progress: this.job.progress };
    }

    void this.startJob(sel, uiLang, fingerprint);
    return {
      ok: true,
      pending: true,
      progress: this.job?.progress || { phase: 'preparing' },
    };
  }

  status(): OpResult {
    const sel = selectedInstance(this.instances);
    if (isErrorResult(sel)) return sel;
    if (!this.job || this.job.instanceId !== sel.item.id) {
      return {
        ok: true,
        running: false,
        ready: false,
        progress: { phase: 'idle' },
      };
    }
    if (this.job.running) {
      return {
        ok: true,
        running: true,
        ready: false,
        progress: this.job.progress,
      };
    }
    if (this.job.error) {
      return {
        ok: false,
        running: false,
        ready: true,
        error: this.job.error,
        progress: this.job.progress,
      };
    }
    if (this.job.result) {
      return {
        ok: true,
        running: false,
        ready: true,
        cached: false,
        settings: this.job.result.settings,
        group_titles: this.job.result.group_titles,
        progress: { phase: 'done' },
      };
    }
    return {
      ok: true,
      running: false,
      ready: false,
      progress: { phase: 'idle' },
    };
  }

  invalidateInstance(instanceId: string): void {
    this.dropCacheForInstance(instanceId);
    if (this.job?.instanceId === instanceId) {
      this.job = null;
    }
  }

  private normalizeLang(raw?: string): string {
    return (
      String(raw || this.config.langCode || 'en')
        .trim()
        .toLowerCase() || 'en'
    );
  }

  private dropCacheForInstance(instanceId: string): void {
    const prefix = `${instanceId}:`;
    for (const key of [...this.cache.keys()]) {
      if (key.startsWith(prefix)) this.cache.delete(key);
    }
  }

  private buildFingerprint(sel: SelectedInstance, uiLang: string): string {
    const enabledMods = this.loadEnabledModsFromModList(sel.pm.modsDir);
    const parts = [
      sel.item.id,
      uiLang,
      this.config.translateModNames ? '1' : '0',
      this.fileMtime(sel.pm.modSettingsDat),
      this.fileMtime(sel.pm.modList),
      this.modsPackagesFingerprint(sel.pm.modsDir, enabledMods),
    ];
    return createHash('sha1').update(parts.join('|')).digest('hex');
  }

  private fileMtime(path: string): string {
    try {
      if (!existsSync(path)) return '0';
      return String(statSync(path).mtimeMs);
    } catch {
      return '0';
    }
  }

  private modsPackagesFingerprint(modsDir: string, mods: string[]): string {
    const chunks: string[] = [];
    for (const mod of mods) {
      for (const pkg of modPackagePathsForInternalName(modsDir, mod)) {
        try {
          const st = statSync(pkg);
          chunks.push(`${mod}:${st.mtimeMs}:${st.size}`);
        } catch {
          chunks.push(`${mod}:missing`);
        }
      }
    }
    return createHash('sha1').update(chunks.join(';')).digest('hex');
  }

  private startJob(
    sel: SelectedInstance,
    uiLang: string,
    fingerprint: string,
  ): void {
    this.job = {
      instanceId: sel.item.id,
      uiLang,
      fingerprint,
      running: true,
      progress: { phase: 'preparing' },
      result: null,
      error: '',
    };
    void this.runJob(sel, uiLang, fingerprint).catch((e) => {
      if (!this.job || this.job.fingerprint !== fingerprint) return;
      this.job.running = false;
      this.job.error = e instanceof Error ? e.message : String(e);
      this.job.progress = { phase: 'error' };
    });
  }

  private setProgress(progress: ModSettingsSchemaProgress): void {
    if (this.job) this.job.progress = progress;
  }

  private async runJob(
    sel: SelectedInstance,
    uiLang: string,
    fingerprint: string,
  ): Promise<void> {
    const modsDir = sel.pm.modsDir;
    const dataDir = join(sel.item.serverPath, 'data');
    const allMods = this.loadAllModsFromModList(modsDir);
    const enabledMods = this.loadEnabledModsFromModList(modsDir);
    const datKeys = this.loadSettingKeysFromDat(sel.pm.modSettingsDat);

    const ownerMod: Record<string, string> = {};
    const allowedValues: Record<string, unknown[]> = {};
    const ui: LuaSettingUiRefs = {
      titles: {},
      descriptions: {},
      titleRefs: {},
      descRefs: {},
    };

    const modTotal = enabledMods.length;
    for (let idx = 0; idx < enabledMods.length; idx += 1) {
      const mod = enabledMods[idx];
      this.setProgress({
        phase: 'scan',
        mod,
        mod_done: idx + 1,
        mod_total: modTotal,
      });
      await this.yieldThread();
      for (const pkg of modPackagePathsForInternalName(modsDir, mod)) {
        try {
          if (existsSync(pkg) && !pkg.toLowerCase().endsWith('.zip')) {
            for (const luaPath of this.iterSettingsLuaFilesInDirectory(pkg)) {
              try {
                ingestSettingsLuaText(
                  readFileSync(luaPath, 'utf-8'),
                  mod,
                  ownerMod,
                  allowedValues,
                  ui,
                );
              } catch {
                /* ignore */
              }
            }
          } else if (pkg.toLowerCase().endsWith('.zip')) {
            const zip = new AdmZip(pkg);
            for (const member of this.iterSettingsLuaMembersInZip(zip)) {
              try {
                ingestSettingsLuaText(
                  zip.readAsText(member, 'utf8'),
                  mod,
                  ownerMod,
                  allowedValues,
                  ui,
                );
              } catch {
                /* ignore */
              }
            }
          }
        } catch {
          /* ignore */
        }
      }
    }

    const modsSorted = [...allMods].sort((a, b) => {
      const d = b.length - a.length;
      return d !== 0
        ? d
        : a.localeCompare(b, undefined, { sensitivity: 'base' });
    });

    const localeMods = [...allMods];
    const localeSeen = new Set(localeMods);
    for (const key of datKeys) {
      const g = this.settingModGroup(key, ownerMod, modsSorted, modsDir);
      if (g && g !== OTHER_GROUP && !localeSeen.has(g)) {
        localeSeen.add(g);
        localeMods.push(g);
      }
    }

    this.setProgress({
      phase: 'locale_data_en',
      step: 1,
      step_total: uiLang === 'en' ? 2 : 4,
    });
    await this.yieldThread();
    const { active: localeSections, en: enLocaleSections } =
      loadFactorioLocaleSections(modsDir, dataDir, localeMods, uiLang);
    if (uiLang !== 'en') {
      this.setProgress({ phase: 'locale_data_ui', step: 3, step_total: 4 });
      await this.yieldThread();
    }
    this.setProgress({
      phase: 'locale_mods_ui',
      step: uiLang === 'en' ? 2 : 4,
      step_total: uiLang === 'en' ? 2 : 4,
    });
    await this.yieldThread();

    this.setProgress({ phase: 'building', step: 1, step_total: 1 });
    await this.yieldThread();

    const groupIds = new Set<string>();
    const settings: Record<string, ModSettingSchemaEntry> = {};
    for (const key of datKeys) {
      const group = this.settingModGroup(key, ownerMod, modsSorted, modsDir);
      groupIds.add(group);
      const owner =
        ownerMod[key] || (group !== OTHER_GROUP ? group : undefined);
      settings[key] = {
        display_name: this.settingDisplayName(
          key,
          ui,
          localeSections,
          enLocaleSections,
          owner,
        ),
        description: this.settingDescription(
          key,
          ui,
          localeSections,
          enLocaleSections,
          owner,
        ),
        group,
      };
      const allowed = allowedValues[key];
      if (allowed?.length) {
        settings[key].allowed_values = allowed.map((value) => ({
          value,
          label: this.choiceDisplayForValue(
            key,
            value,
            localeSections,
            enLocaleSections,
          ),
        }));
      }
    }

    const groupTitles = resolveModDisplayTitlesBatch({
      serverPath: sel.item.serverPath,
      modsDir,
      modNames: [...groupIds].filter((g) => g !== OTHER_GROUP),
      uiLang,
      translateModNames: this.config.translateModNames,
    });

    const payload: SchemaPayload = { settings, group_titles: groupTitles };
    this.cache.set(fingerprint, payload);

    if (!this.job || this.job.fingerprint !== fingerprint) return;
    this.job.running = false;
    this.job.result = payload;
    this.job.progress = { phase: 'done' };
  }

  private yieldThread(): Promise<void> {
    return new Promise((resolve) => setImmediate(resolve));
  }

  private loadAllModsFromModList(modsDir: string): string[] {
    return this.readModNamesFromListPath(join(modsDir, 'mod-list.json'), false);
  }

  private loadEnabledModsFromModList(modsDir: string): string[] {
    return this.readModNamesFromListPath(join(modsDir, 'mod-list.json'), true);
  }

  private readModNamesFromListPath(
    path: string,
    enabledOnly: boolean,
  ): string[] {
    if (!existsSync(path)) return [];
    try {
      const data = JSON.parse(readFileSync(path, 'utf-8')) as {
        mods?: { name?: string; enabled?: boolean }[];
      };
      const out: string[] = [];
      const seen = new Set<string>();
      for (const row of data.mods || []) {
        const n = String(row?.name || '').trim();
        if (!n || n === 'base' || seen.has(n)) continue;
        if (enabledOnly && row.enabled === false) continue;
        seen.add(n);
        out.push(n);
      }
      return out;
    } catch {
      return [];
    }
  }

  private loadSettingKeysFromDat(path: string): string[] {
    if (!existsSync(path)) return [];
    try {
      const ms = ModSettings.load(readFileSync(path));
      const obj = modSettingsToJsonObject(ms);
      const data = (obj.data || {}) as Record<string, Record<string, unknown>>;
      const keys = new Set<string>();
      for (const sec of SECTIONS) {
        const bucket = data[sec];
        if (!bucket || typeof bucket !== 'object') continue;
        for (const key of Object.keys(bucket)) keys.add(key);
      }
      return [...keys];
    } catch {
      return [];
    }
  }

  private *iterSettingsLuaFilesInDirectory(modRoot: string): Generator<string> {
    const seen = new Set<string>();
    const tryEmit = (fp: string): string | null => {
      if (!existsSync(fp) || seen.has(fp)) return null;
      seen.add(fp);
      return fp;
    };
    for (const fname of ['settings.lua', 'settings-updates.lua']) {
      const got = tryEmit(join(modRoot, fname));
      if (got) yield got;
    }
    const sd = join(modRoot, 'settings');
    if (existsSync(sd)) {
      for (const ent of this.rglobLua(sd)) {
        const got = tryEmit(ent);
        if (got) yield got;
      }
    }
    try {
      for (const sub of readdirSync(modRoot, { withFileTypes: true })) {
        if (!sub.isDirectory() || sub.name.startsWith('.')) continue;
        const subRoot = join(modRoot, sub.name);
        for (const fname of ['settings.lua', 'settings-updates.lua']) {
          const got = tryEmit(join(subRoot, fname));
          if (got) yield got;
        }
        const subSd = join(subRoot, 'settings');
        if (existsSync(subSd)) {
          for (const ent of this.rglobLua(subSd)) {
            const got = tryEmit(ent);
            if (got) yield got;
          }
        }
      }
    } catch {
      /* ignore */
    }
  }

  private *rglobLua(dir: string): Generator<string> {
    for (const ent of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, ent.name);
      if (ent.isDirectory()) yield* this.rglobLua(p);
      else if (ent.isFile() && ent.name.toLowerCase().endsWith('.lua')) yield p;
    }
  }

  private *iterSettingsLuaMembersInZip(zip: AdmZip): Generator<string> {
    for (const ent of zip.getEntries()) {
      if (ent.isDirectory) continue;
      if (isSettingsLuaMember(ent.entryName)) yield ent.entryName;
    }
  }

  private settingModGroup(
    settingKey: string,
    ownerMod: Record<string, string>,
    modsSorted: string[],
    modsDir: string,
  ): string {
    const owner = ownerMod[settingKey];
    if (owner) return owner;
    const skl = settingKey.toLowerCase();
    for (const mod of modsSorted) {
      const ml = mod.toLowerCase();
      if (skl === ml || skl.startsWith(`${ml}-`) || skl.startsWith(`${ml}_`))
        return mod;
    }
    if (settingKey.includes('-')) {
      const byPrefix = this.settingGroupByKeyPrefixPackages(
        settingKey,
        modsDir,
      );
      if (byPrefix) return byPrefix;
    }
    const under = this.settingGroupUnderscorePrefix(settingKey);
    if (under) return under;
    return OTHER_GROUP;
  }

  private settingGroupByKeyPrefixPackages(
    settingKey: string,
    modsDir: string,
  ): string | null {
    const parts = settingKey.split('-');
    if (!parts.length || !parts[0]?.trim()) return null;
    for (let end = parts.length; end > 0; end -= 1) {
      const cand = parts.slice(0, end).join('-');
      if (!cand) continue;
      if (modPackagePathsForInternalName(modsDir, cand).length) return cand;
    }
    return parts[0] || null;
  }

  private settingGroupUnderscorePrefix(settingKey: string): string | null {
    if (settingKey.includes('-') || !settingKey.includes('_')) return null;
    const pre = settingKey.split('_', 1)[0]?.trim();
    return pre || null;
  }

  private resolveLocRef(
    sections: LocaleSections,
    cat: string,
    subkey: string,
  ): string | undefined {
    if (!cat && subkey.includes('.')) {
      const dot = subkey.indexOf('.');
      const a = subkey.slice(0, dot);
      const b = subkey.slice(dot + 1);
      if (a && b) {
        const got = lookupLocaleString(sections, a, b);
        if (got) return got;
      }
    }
    if (!cat) {
      return (
        lookupLocaleString(sections, 'mod-setting-name', subkey) ||
        lookupLocaleString(sections, 'mod-setting-description', subkey)
      );
    }
    return lookupLocaleString(sections, cat, subkey);
  }

  private settingLocaleKeyVariants(key: string, owner?: string): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (k: string) => {
      const v = String(k || '').trim();
      if (!v || seen.has(v)) return;
      seen.add(v);
      out.push(v);
    };
    push(key);
    if (owner) {
      const ol = owner.toLowerCase();
      const kl = key.toLowerCase();
      if (kl.startsWith(`${ol}-`)) push(key.slice(owner.length + 1));
      else if (kl.startsWith(`${ol}_`)) push(key.slice(owner.length + 1));
    }
    return out;
  }

  private lookupSettingLocale(
    sections: LocaleSections,
    key: string,
    owner: string | undefined,
    description: boolean,
  ): string | undefined {
    const primary = description
      ? 'mod-setting-description'
      : 'mod-setting-name';
    const secondary = description
      ? 'mod-setting-name'
      : 'mod-setting-description';
    for (const variant of this.settingLocaleKeyVariants(key, owner)) {
      const got = lookupLocaleString(sections, primary, variant);
      if (got) return got;
      const alt = lookupLocaleString(sections, secondary, variant);
      if (alt) return alt;
    }
    for (const variant of this.settingLocaleKeyVariants(key, owner)) {
      for (const [secName, pairs] of Object.entries(sections)) {
        if (!secName.includes('setting')) continue;
        const got = pairs?.[variant];
        if (typeof got === 'string' && got.trim()) return got.trim();
      }
    }
    if (owner) {
      for (const variant of this.settingLocaleKeyVariants(key, owner)) {
        const got = lookupLocaleString(sections, owner, variant);
        if (got) return got;
      }
    }
    return undefined;
  }

  private isRawSettingKeyLabel(label: string, key: string): boolean {
    const a = String(label || '')
      .trim()
      .toLowerCase();
    const b = String(key || '')
      .trim()
      .toLowerCase();
    return !!a && !!b && a === b;
  }

  private humanizeSettingKey(key: string): string {
    const raw = String(key || '').trim();
    if (!raw) return raw;
    return raw
      .replace(/[-_]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }

  private resolveSettingText(
    key: string,
    ui: LuaSettingUiRefs,
    sections: LocaleSections,
    enSections: LocaleSections,
    owner: string | undefined,
    description: boolean,
  ): string {
    const refs = description ? ui.descRefs[key] : ui.titleRefs[key];
    if (refs) {
      const got = this.resolveLocRef(sections, refs[0], refs[1]);
      if (got) return got;
      const enGot = this.resolveLocRef(enSections, refs[0], refs[1]);
      if (enGot) return enGot;
    }

    const active = this.lookupSettingLocale(sections, key, owner, description);
    if (active) return active;
    const en = this.lookupSettingLocale(enSections, key, owner, description);
    if (en) return en;

    const inline = description ? ui.descriptions[key] : ui.titles[key];
    if (inline && !this.isRawSettingKeyLabel(inline, key)) return inline;

    if (description) return '';
    return this.humanizeSettingKey(key);
  }

  private settingDisplayName(
    key: string,
    ui: LuaSettingUiRefs,
    sections: LocaleSections,
    enSections: LocaleSections,
    owner?: string,
  ): string {
    return this.resolveSettingText(key, ui, sections, enSections, owner, false);
  }

  private settingDescription(
    key: string,
    ui: LuaSettingUiRefs,
    sections: LocaleSections,
    enSections: LocaleSections,
    owner?: string,
  ): string {
    return this.resolveSettingText(key, ui, sections, enSections, owner, true);
  }

  private choiceDisplayForValue(
    settingKey: string,
    value: unknown,
    sections: LocaleSections,
    enSections: LocaleSections,
  ): string {
    for (const lk of modSettingChoiceLocaleKeys(settingKey, value)) {
      for (const sec of CHOICE_SECTIONS) {
        const got = lookupLocaleString(sections, sec, lk);
        if (got) return got;
        const enGot = lookupLocaleString(enSections, sec, lk);
        if (enGot) return enGot;
      }
    }
    if (typeof value === 'string' && value.includes('.')) {
      const dot = value.indexOf('.');
      const got =
        lookupLocaleString(
          sections,
          value.slice(0, dot),
          value.slice(dot + 1),
        ) ||
        lookupLocaleString(
          enSections,
          value.slice(0, dot),
          value.slice(dot + 1),
        );
      if (got) return got;
    }
    if (typeof value === 'boolean') return value ? 'yes' : 'no';
    return String(value);
  }
}
