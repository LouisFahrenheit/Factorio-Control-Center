import { Injectable } from '@nestjs/common';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';
import { panelTimestamp } from '../../common/datetime.util';
import {
  buildFccFileEnvelope,
  fccFileKindContainsLabel,
  parseJsonObject,
  unwrapMapPresetPayload,
  unwrapMapPresetsFromFile,
} from '../../common/fcc-file-format';
import { PathsService } from '../../config/paths.service';
import { FccConfigService } from '../../config/fcc-config.service';
import { LocaleService } from '../../locale/locale.service';
import { OpResult } from '../ops-utils';

const MAX_PRESETS = 30;

export interface MapPresetRecord {
  id: string;
  name: string;
  created_at: string;
  state: Record<string, unknown>;
}

interface MapPresetsIndex {
  presets: MapPresetRecord[];
}

@Injectable()
export class MapPresetsOpsService {
  constructor(
    private readonly paths: PathsService,
    private readonly config: FccConfigService,
    private readonly locale: LocaleService,
  ) {}

  list(): OpResult {
    return { ok: true, presets: this.readIndex().presets };
  }

  save(name: string, state: unknown): OpResult {
    const trimmed = String(name || '').trim();
    if (!trimmed) return { ok: false, error: 'invalid_name' };
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      return { ok: false, error: 'invalid_state' };
    }
    const index = this.readIndex();
    const preset: MapPresetRecord = {
      id: this.newId(),
      name: trimmed,
      created_at: panelTimestamp(),
      state: state as Record<string, unknown>,
    };
    index.presets = [preset, ...index.presets].slice(0, MAX_PRESETS);
    this.writeIndex(index);
    return { ok: true, preset };
  }

  delete(id: string): OpResult {
    const presetId = String(id || '').trim();
    if (!presetId) return { ok: false, error: 'invalid_id' };
    const index = this.readIndex();
    const next = index.presets.filter((p) => p.id !== presetId);
    if (next.length === index.presets.length)
      return { ok: false, error: 'not_found' };
    index.presets = next;
    this.writeIndex(index);
    return { ok: true };
  }

  exportPrepare(id: string): OpResult {
    const presetId = String(id || '').trim();
    if (!presetId) return { ok: false, error: 'invalid_id' };
    const preset = this.readIndex().presets.find((p) => p.id === presetId);
    if (!preset) return { ok: false, error: 'not_found' };

    const localeStrings =
      this.locale.readLang(this.config.langCode) ||
      this.locale.readLang('en') ||
      {};
    const envelope = buildFccFileEnvelope(
      'map_preset',
      preset.name,
      { state: preset.state },
      {
        created_at: preset.created_at,
        contains: fccFileKindContainsLabel('map_preset', localeStrings),
      },
    );
    const safeStub =
      preset.name.replace(/[^A-Za-z0-9_.-]+/g, '_').replace(/^\.+|\.+$/g, '') ||
      'map-preset';
    const out = join(require('os').tmpdir(), `${safeStub}.fcc`);
    writeFileSync(out, JSON.stringify(envelope, null, 2) + '\n', 'utf-8');
    return { ok: true, path: out, name: `${safeStub}.fcc` };
  }

  importUpload(tmpPath: string, nameOverride = ''): OpResult {
    if (!existsSync(tmpPath)) return { ok: false, error: 'tmp_not_found' };
    const raw = readFileSync(tmpPath, 'utf-8');
    const parsed = parseJsonObject(raw);
    if (!parsed) return { ok: false, error: 'invalid_format' };
    const entries = unwrapMapPresetsFromFile(parsed);
    if (!entries?.length) return { ok: false, error: 'invalid_format' };
    return this.importBatch(entries);
  }

  importBatch(items: { name?: string; state?: unknown }[]): OpResult {
    const index = this.readIndex();
    const existingNames = new Set(
      index.presets.map((p) => p.name.trim().toLowerCase()),
    );
    const added: MapPresetRecord[] = [];
    const skipped: string[] = [];

    for (const item of items || []) {
      const name = String(item?.name || '').trim();
      const state = item?.state;
      if (!name || !state || typeof state !== 'object' || Array.isArray(state))
        continue;
      const key = name.toLowerCase();
      if (existingNames.has(key)) {
        skipped.push(name);
        continue;
      }
      if (index.presets.length + added.length >= MAX_PRESETS) break;
      const preset: MapPresetRecord = {
        id: this.newId(),
        name,
        created_at: panelTimestamp(),
        state: state as Record<string, unknown>,
      };
      added.push(preset);
      existingNames.add(key);
    }

    if (!added.length) {
      return skipped.length
        ? {
            ok: true,
            added: [],
            skipped,
            imported_count: 0,
            skipped_count: skipped.length,
          }
        : { ok: false, error: 'invalid_state' };
    }

    index.presets = [...added, ...index.presets].slice(0, MAX_PRESETS);
    this.writeIndex(index);
    return {
      ok: true,
      added,
      skipped,
      imported_count: added.length,
      skipped_count: skipped.length,
    };
  }

  private newId(): string {
    return `p-${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`;
  }

  private indexPath(): string {
    mkdirSync(this.paths.mapPresetsDir, { recursive: true });
    return join(this.paths.mapPresetsDir, 'index.json');
  }

  private readIndex(): MapPresetsIndex {
    mkdirSync(this.paths.mapPresetsDir, { recursive: true });
    const path = this.indexPath();
    if (!existsSync(path)) return { presets: [] };
    try {
      const data = JSON.parse(readFileSync(path, 'utf-8')) as MapPresetsIndex;
      const presets = Array.isArray(data?.presets) ? data.presets : [];
      return {
        presets: presets
          .filter(
            (p) =>
              p &&
              typeof p.id === 'string' &&
              typeof p.name === 'string' &&
              p.state &&
              typeof p.state === 'object',
          )
          .slice(0, MAX_PRESETS),
      };
    } catch {
      return { presets: [] };
    }
  }

  private writeIndex(index: MapPresetsIndex): void {
    writeFileSync(
      this.indexPath(),
      JSON.stringify(index, null, 2) + '\n',
      'utf-8',
    );
  }
}
