import type { LocaleStrings } from '../i18n/locale';

export type SettingComment = { key: string; value: string };

export type SettingField = {
  key: string;
  value: unknown;
  comments: SettingComment[];
};

export const CATEGORY_ORDER = ['general', 'network', 'access', 'gameplay', 'performance', 'advanced'] as const;
export type SettingCategory = (typeof CATEGORY_ORDER)[number];

export const LEFT_COLUMN: SettingCategory[] = ['general', 'gameplay', 'access', 'advanced'];
export const RIGHT_COLUMN: SettingCategory[] = ['network', 'performance'];

export function isNotFoundApiError(err: string): boolean {
  const k = String(err || '').trim().toLowerCase();
  return k === 'not_found' || k.includes('not_found') || k.includes('enoent');
}

function humanizeSettingKey(key: string): string {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function wrapTooltipText(text: string, maxLen = 88): string {
  const limit = Math.max(40, maxLen);
  const parts = String(text || '').split(/\r?\n/);
  const wrapped: string[] = [];
  parts.forEach((part) => {
    let line = String(part || '').trim();
    while (line.length > limit) {
      let cut = line.lastIndexOf(' ', limit);
      if (cut < Math.floor(limit * 0.5)) cut = limit;
      wrapped.push(line.slice(0, cut).trim());
      line = line.slice(cut).trim();
    }
    if (line) wrapped.push(line);
  });
  return wrapped.join('\n');
}

function settingCommentText(
  commentKey: string,
  fallbackValue: string,
  strings: LocaleStrings,
): string {
  const comments = strings.settings_comment_translations;
  if (comments && typeof comments === 'object') {
    const raw = (comments as Record<string, unknown>)[commentKey];
    if (Array.isArray(raw)) return raw.map((x) => String(x)).join(' ');
    if (typeof raw === 'string' && raw.trim()) return raw;
  }
  return String(fallbackValue || '');
}

function settingTooltipText(comments: SettingComment[], strings: LocaleStrings): string {
  const lines = comments
    .map((meta) => settingCommentText(meta.key, meta.value, strings))
    .map((x) => String(x || '').trim())
    .filter(Boolean);
  return wrapTooltipText(lines.join('\n'), 88);
}

export function settingLabel(key: string, t: (k: string) => string, strings: LocaleStrings): string {
  const labelsRaw = strings.server_settings_field_labels;
  if (labelsRaw && typeof labelsRaw === 'object') {
    const direct = (labelsRaw as Record<string, string>)[key];
    if (typeof direct === 'string' && direct.trim()) return direct;
  }
  const legacy = t(`server_settings_field_${key}`);
  if (legacy !== `server_settings_field_${key}`) return legacy;
  return humanizeSettingKey(key);
}

export function settingHintForLabel(
  key: string,
  comments: SettingComment[],
  t: (k: string) => string,
  strings: LocaleStrings,
): string {
  const specific = t(`server_settings_hint_${key}`);
  const base = specific === `server_settings_hint_${key}` ? settingTooltipText(comments, strings) : specific;
  return wrapTooltipText(base, 88);
}

export function settingCategoryKey(fieldKey: string): SettingCategory {
  const k = String(fieldKey || '');
  if (['name', 'description', 'tags', 'game_password'].includes(k)) return 'general';
  if (['visibility', 'username', 'password', 'token'].includes(k)) return 'network';
  if (['admins'].includes(k)) return 'access';
  if (
    [
      'allow_commands',
      'max_players',
      'autosave_interval',
      'autosave_slots',
      'afk_autokick_interval',
      'auto_pause',
      'auto_pause_when_players_connect',
      'autosave_only_on_server',
      'non_blocking_saving',
      'only_admins_can_pause',
      'only_admins_can_pause_the_game',
      'ignore_player_limit_for_returning_players',
      'require_user_verification',
    ].includes(k)
  ) {
    return 'gameplay';
  }
  if (
    [
      'max_upload_in_kilobytes_per_second',
      'max_upload_slots',
      'minimum_latency_in_ticks',
      'max_heartbeats_per_second',
      'minimum_segment_size',
      'minimum_segment_size_peer_count',
      'maximum_segment_size',
      'maximum_segment_size_peer_count',
      'segment_sizes',
    ].includes(k)
  ) {
    return 'performance';
  }
  return 'advanced';
}

function settingFieldSortRank(categoryKey: SettingCategory, fieldKey: string): number {
  const ranks: Partial<Record<SettingCategory, Record<string, number>>> = {
    general: { name: 10, description: 20, tags: 30, game_password: 900 },
    gameplay: {
      allow_commands: 0,
      only_admins_can_pause: 900,
      only_admins_can_pause_the_game: 900,
      ignore_player_limit_for_returning_players: 910,
      require_user_verification: 920,
    },
  };
  const cat = ranks[categoryKey];
  if (cat && Object.prototype.hasOwnProperty.call(cat, fieldKey)) return cat[fieldKey]!;
  return 100;
}

export function settingCategoryTitle(categoryKey: SettingCategory, t: (k: string) => string): string {
  return t(`server_settings_category_${categoryKey}`);
}

export function isDefaultServerTextValue(key: string, value: unknown): boolean {
  const text = String(value == null ? '' : value).trim();
  if (!text) return false;
  if (key === 'name') {
    return [
      'Name of the game as it will appear in the game listing',
      'Name of the game as it will appear in the game listing.',
    ].includes(text);
  }
  if (key === 'description') {
    return [
      'Description of the game that will appear in the listing',
      'Description of the game that will appear in the listing.',
    ].includes(text);
  }
  return false;
}

export function parseSettingFields(data: Record<string, unknown>): SettingField[] {
  const fields: SettingField[] = [];
  let pendingComments: SettingComment[] = [];
  Object.entries(data || {}).forEach(([key, value]) => {
    if (String(key).startsWith('_comment_')) {
      pendingComments.push({ key: String(key), value: String(value || '') });
      return;
    }
    fields.push({ key, value, comments: pendingComments });
    pendingComments = [];
  });
  return fields;
}

export function groupFieldsByCategory(fields: SettingField[]): Map<SettingCategory, SettingField[]> {
  const categories = new Map<SettingCategory, SettingField[]>(
    CATEGORY_ORDER.map((k) => [k, []]),
  );
  fields.forEach((item) => {
    const cat = settingCategoryKey(item.key);
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(item);
  });
  categories.forEach((items, catKey) => {
    items.sort((a, b) => {
      const ar = settingFieldSortRank(catKey, a.key);
      const br = settingFieldSortRank(catKey, b.key);
      if (ar !== br) return ar - br;
      return 0;
    });
  });
  return categories;
}

export function extractEditableValues(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  Object.entries(data || {}).forEach(([key, value]) => {
    if (String(key).startsWith('_comment_')) return;
    out[key] = value;
  });
  return out;
}

export function validateFactorioServerSettingsCredentials(
  out: Record<string, unknown>,
  t: (k: string) => string,
): string | null {
  const tok = String(out.token != null ? out.token : '').trim();
  const pwd = String(out.password != null ? out.password : '').trim();
  if (tok && pwd) return t('server_settings_error_token_password_exclusive');
  const vis = out.visibility && typeof out.visibility === 'object' ? (out.visibility as Record<string, unknown>) : {};
  if (vis.public && !tok && !pwd) return t('server_settings_error_public_needs_auth');
  return null;
}

export function serializeSettingsForSave(
  rawEntries: [string, unknown][],
  values: Record<string, unknown>,
): { ok: true; data: Record<string, unknown> } | { ok: false; error: string } {
  const out: Record<string, unknown> = {};
  for (const [key, original] of rawEntries) {
    if (String(key).startsWith('_comment_')) {
      out[key] = original;
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(values, key)) {
      out[key] = original;
      continue;
    }
    const v = values[key];
    if (key === 'tags') {
      if (Array.isArray(v)) out[key] = v;
      else {
        const text = String(v ?? '').trim();
        out[key] = text ? text.split(',').map((x) => x.trim()).filter(Boolean) : [];
      }
    } else if (key === 'name' || key === 'description') {
      const text = String(v ?? '');
      out[key] = !text.trim() ? original : text;
    } else if (key === 'game_password' || key === 'password' || key === 'token' || key === 'username') {
      out[key] = String(v ?? '');
    } else if (typeof original === 'boolean') {
      out[key] = !!v;
    } else if (original && typeof original === 'object' && !Array.isArray(original) && key === 'visibility') {
      out[key] = v;
    } else if (original && typeof original === 'object' && !Array.isArray(original)) {
      if (typeof v === 'string') {
        try {
          out[key] = JSON.parse(v || '{}');
        } catch (e) {
          return { ok: false, error: `${key}: ${e instanceof Error ? e.message : String(e)}` };
        }
      } else {
        out[key] = v;
      }
    } else if (typeof v === 'string') {
      const text = v;
      if (/^-?\d+$/.test(text)) out[key] = parseInt(text, 10);
      else if (/^-?\d+\.\d+$/.test(text)) out[key] = parseFloat(text);
      else out[key] = text;
    } else {
      out[key] = v;
    }
  }
  return { ok: true, data: out };
}

export function localizeServerSettingsError(err: string, t: (k: string) => string): string {
  const k = String(err || '').trim();
  if (!k) return '';
  if (isNotFoundApiError(k)) return t('server_settings_json_not_found');
  if (k.startsWith('server_settings_error_')) {
    const tr = t(k);
    if (tr !== k) return tr;
  }
  return k;
}
