import { Injectable } from '@nestjs/common';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { PathsService } from '../config/paths.service';
import { FccConfigService } from '../config/fcc-config.service';
import { CommandsCatalogService } from '../ops/commands-catalog.service';

@Injectable()
export class LocaleService {
  constructor(
    private readonly paths: PathsService,
    private readonly config: FccConfigService,
    private readonly commandsCatalog: CommandsCatalogService,
  ) {}

  readLang(code: string): Record<string, string> | null {
    const c = (code || 'en').slice(0, 12).toLowerCase();
    const candidates = [
      join(this.paths.localeDir, `server_lang_${c}.json`),
      join(this.paths.localeDir, `server_lang_${c.slice(0, 2)}.json`),
    ];
    if (c.startsWith('ru'))
      candidates.unshift(join(this.paths.localeDir, 'server_lang_ru.json'));
    if (c.startsWith('en'))
      candidates.unshift(join(this.paths.localeDir, 'server_lang_en.json'));
    for (const p of candidates) {
      if (!existsSync(p)) continue;
      try {
        return JSON.parse(readFileSync(p, 'utf-8')) as Record<string, string>;
      } catch {
        continue;
      }
    }
    return null;
  }

  getLocale(lang?: string): {
    ok: boolean;
    lang: string;
    strings: Record<string, string>;
  } {
    const requested = (lang || this.config.langCode || 'en').slice(0, 12);
    let strings = this.readLang(requested);
    let outLang = requested;
    if (!strings) {
      strings = this.readLang('en') || {};
      outLang = 'en';
    }
    return { ok: true, lang: outLang, strings };
  }

  listAvailableLanguages(): string[] {
    const codes = new Set<string>();
    try {
      for (const f of readdirSync(this.paths.localeDir)) {
        const m = /^server_lang_([a-z]{2}(?:-[a-z]+)?)\.json$/i.exec(f);
        if (m?.[1]) codes.add(m[1].toLowerCase());
      }
    } catch {
      /* ignore */
    }
    if (!codes.size) codes.add('en');
    return [...codes].sort();
  }

  readCommands(lang?: string): Record<string, unknown> | null {
    const result = this.commandsCatalog.read(lang);
    if (!result.ok || !result.data) return null;
    return result.data as Record<string, unknown>;
  }
}
