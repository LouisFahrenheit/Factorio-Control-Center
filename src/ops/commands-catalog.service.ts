import { Injectable } from '@nestjs/common';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'fs';
import { join } from 'path';
import { PathsService } from '../config/paths.service';
import { FccConfigService } from '../config/fcc-config.service';
import { OpResult } from './ops-utils';
import {
  emptyBaseDoc,
  emptyTranslationsDoc,
  mergeCatalog,
  parseBaseDoc,
  parseTranslationsDoc,
  serializeBaseDoc,
  serializeTranslationsDoc,
  splitMergedCatalog,
  type CommandsBaseDoc,
  type CommandsMergedDoc,
  type CommandsTranslationsDoc,
} from './commands-catalog.merge';

@Injectable()
export class CommandsCatalogService {
  static readonly BASE_FILENAME = 'server_commands.json';

  constructor(
    private readonly paths: PathsService,
    private readonly config: FccConfigService,
  ) {}

  read(uiLang?: string): OpResult {
    const lang = this.resolveLangCode(uiLang);
    try {
      const base = this.loadBase();
      let translations = this.readTranslationsForLang(lang);
      if (this.isEmptyTranslations(translations) && lang !== 'en') {
        translations = this.readTranslationsForLang('en');
      }
      const data = mergeCatalog(base, translations);
      return {
        ok: true,
        path: this.basePath(),
        data,
        lang,
      };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  write(data: unknown, uiLang?: string): OpResult {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return { ok: false, error: 'expected_object' };
    }
    const lang = this.resolveLangCode(uiLang);
    try {
      mkdirSync(this.paths.localeDir, { recursive: true });
      const { base: rawBase, translations: rawTranslations } =
        splitMergedCatalog(data);
      const base = serializeBaseDoc(rawBase);
      const activeTranslations = serializeTranslationsDoc(
        rawTranslations,
        base,
      );

      writeFileSync(
        this.basePath(),
        JSON.stringify(base, null, 2) + '\n',
        'utf-8',
      );
      writeFileSync(
        this.translationsPath(lang),
        JSON.stringify(activeTranslations, null, 2) + '\n',
        'utf-8',
      );

      for (const otherLang of this.listInstalledTranslationLangs()) {
        if (otherLang === lang) continue;
        const existing = this.readTranslationsForLang(otherLang);
        const synced = serializeTranslationsDoc(existing, base);
        writeFileSync(
          this.translationsPath(otherLang),
          JSON.stringify(synced, null, 2) + '\n',
          'utf-8',
        );
      }

      return { ok: true, path: this.basePath(), lang };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  basePath(): string {
    return join(this.paths.localeDir, CommandsCatalogService.BASE_FILENAME);
  }

  translationsPath(langCode: string): string {
    return join(this.paths.localeDir, this.translationsFilename(langCode));
  }

  translationsFilename(langCode: string): string {
    return `server_commands_${this.resolveLangCode(langCode)}.json`;
  }

  resolveLangCode(raw?: string): string {
    const ui = String(raw || '')
      .trim()
      .toLowerCase()
      .slice(0, 12);
    if (ui) {
      if (ui.startsWith('ru')) return 'ru';
      if (ui.startsWith('en')) return 'en';
      return ui;
    }
    const cfg = String(this.config.langCode || 'en')
      .trim()
      .toLowerCase()
      .slice(0, 12);
    if (cfg.startsWith('ru')) return 'ru';
    if (cfg.startsWith('en')) return 'en';
    return cfg || 'en';
  }

  private loadBase(): CommandsBaseDoc {
    const basePath = this.basePath();
    if (existsSync(basePath)) {
      return parseBaseDoc(
        JSON.parse(readFileSync(basePath, 'utf-8')) as unknown,
      );
    }
    return emptyBaseDoc();
  }

  private readTranslationsForLang(langCode: string): CommandsTranslationsDoc {
    for (const p of this.translationFileCandidates(langCode)) {
      if (!existsSync(p)) continue;
      try {
        return parseTranslationsDoc(
          JSON.parse(readFileSync(p, 'utf-8')) as unknown,
        );
      } catch {
        continue;
      }
    }
    return emptyTranslationsDoc();
  }

  private translationFileCandidates(langCode: string): string[] {
    const c = this.resolveLangCode(langCode);
    const dir = this.paths.localeDir;
    const names = [`server_commands_${c}.json`];
    if (c.length > 2) {
      names.push(`server_commands_${c.slice(0, 2)}.json`);
    }

    const seen = new Set<string>();
    return names
      .filter((name) => {
        if (seen.has(name)) return false;
        seen.add(name);
        return true;
      })
      .map((name) => join(dir, name));
  }

  private listInstalledTranslationLangs(): string[] {
    const codes = new Set<string>();
    try {
      for (const f of readdirSync(this.paths.localeDir)) {
        const lang = this.langCodeFromTranslationFilename(f);
        if (lang) codes.add(lang);
      }
    } catch {
      /* ignore */
    }
    if (!codes.size) codes.add('en');
    return [...codes].sort();
  }

  private langCodeFromTranslationFilename(file: string): string | null {
    const m = /^server_commands_([a-z]{2}(?:-[a-z]+)?)\.json$/i.exec(file);
    return m?.[1]?.toLowerCase() ?? null;
  }

  private isEmptyTranslations(doc: CommandsTranslationsDoc): boolean {
    return (
      !Object.keys(doc.categories).length && !Object.keys(doc.commands).length
    );
  }
}
