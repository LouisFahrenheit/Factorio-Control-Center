import {
  MOD_SETTINGS_SECTIONS,
  MOD_SETTINGS_OTHER_GROUP,
  type ModSettingsDocument,
  type ModSettingsSection,
  type ModSettingSchemaEntry,
  type SettingValueKind,
} from '../types/modSettings';

export function parseModSettingsDocument(raw: string): ModSettingsDocument {
  const parsed = JSON.parse(raw) as Record<string, unknown>;
  if (!parsed || parsed['!type'] !== 'ModSettings') {
    throw new Error('expected_mod_settings_root');
  }
  return ensureModSettingsDocument(parsed as unknown as ModSettingsDocument);
}

export function ensureModSettingsDocument(doc: ModSettingsDocument): ModSettingsDocument {
  const data = (doc.data && typeof doc.data === 'object' ? doc.data : {}) as ModSettingsDocument['data'];
  for (const sec of MOD_SETTINGS_SECTIONS) {
    if (!data[sec] || typeof data[sec] !== 'object' || Array.isArray(data[sec])) {
      data[sec] = {};
    }
  }
  doc.data = data;
  return doc;
}

export function isSimpleValueEntry(entry: unknown): entry is { value: unknown } {
  return !!entry && typeof entry === 'object' && !Array.isArray(entry) && Object.keys(entry).length === 1 && 'value' in entry;
}

export function isRgbaValue(value: unknown): value is { r: number; g: number; b: number; a: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return ['r', 'g', 'b', 'a'].every((k) => typeof v[k] === 'number');
}

export function inferSettingValueKind(entry: unknown): { kind: SettingValueKind; value?: unknown } {
  if (!isSimpleValueEntry(entry)) return { kind: 'json_entry' };
  const val = entry.value;
  if (typeof val === 'boolean') return { kind: 'bool', value: val };
  if (val && typeof val === 'object' && !Array.isArray(val)) {
    const obj = val as Record<string, unknown>;
    if (obj['!pt'] === 'uint64' && 'v' in obj) return { kind: 'uint64', value: val };
    if (isRgbaValue(val)) return { kind: 'color', value: val };
    return { kind: 'json_value', value: val };
  }
  if (typeof val === 'number') return { kind: Number.isInteger(val) ? 'int' : 'float', value: val };
  if (typeof val === 'string') return { kind: 'string', value: val };
  return { kind: 'json_value', value: val };
}

export function sortedSettingKeys(section: Record<string, unknown>): string[] {
  return Object.keys(section).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

export function sectionLabelKey(section: ModSettingsSection): string {
  if (section === 'startup') return 'mod_settings_tab_startup';
  if (section === 'runtime-global') return 'mod_settings_tab_runtime_global';
  return 'mod_settings_tab_runtime_per_user';
}

export function localizeModSettingsError(raw: string, t: (key: string, ...args: (string | number)[]) => string): string {
  const key = String(raw || '').trim();
  const map: Record<string, string> = {
    server_running: 'server_running_mutate_blocked',
    expected_mod_settings_root: 'mod_settings_not_modsettings',
  };
  const locKey = map[key];
  if (locKey) {
    const line = t(locKey);
    if (line !== locKey) return line;
  }
  if (key === 'expected_mod_settings_root') return t('mod_settings_not_modsettings');
  return key;
}

export function modSettingValuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'boolean' || typeof b === 'boolean') return false;
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 1e-9;
  return false;
}

export function rowShouldUseChoiceCombo(val: unknown, allowed: unknown[]): boolean {
  if (!allowed.length) return false;
  if (typeof val === 'string') return allowed.every((x) => typeof x === 'string');
  if (typeof val === 'boolean') return allowed.every((x) => typeof x === 'boolean');
  if (typeof val === 'number' && !Number.isNaN(val)) return allowed.every((x) => typeof x === 'number');
  return false;
}

export function choiceLabelText(label: string, t: (key: string) => string): string {
  if (label === 'yes') {
    const line = t('mod_settings_choice_yes');
    return line !== 'mod_settings_choice_yes' ? line : 'Yes';
  }
  if (label === 'no') {
    const line = t('mod_settings_choice_no');
    return line !== 'mod_settings_choice_no' ? line : 'No';
  }
  return label;
}

export function groupTitle(
  groupId: string,
  groupTitles: Record<string, string>,
  t: (key: string) => string,
): string {
  if (groupId === MOD_SETTINGS_OTHER_GROUP) {
    const line = t('mod_settings_group_other');
    return line !== 'mod_settings_group_other' ? line : 'Other';
  }
  return groupTitles[groupId] || groupId;
}

export function groupSortKey(groupId: string, groupTitles: Record<string, string>, t: (key: string) => string): string {
  if (groupId === MOD_SETTINGS_OTHER_GROUP) return `\uffff${groupId}`;
  return groupTitle(groupId, groupTitles, t).toLowerCase();
}

export function buildSectionGroups(
  section: Record<string, unknown>,
  settingsMeta: Record<string, ModSettingSchemaEntry>,
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const key of Object.keys(section)) {
    const group = settingsMeta[key]?.group || MOD_SETTINGS_OTHER_GROUP;
    const bucket = groups.get(group) || [];
    bucket.push(key);
    groups.set(group, bucket);
  }
  for (const [group, keys] of groups) {
    keys.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    groups.set(group, keys);
  }
  return groups;
}

export function matchesSettingsFilter(
  key: string,
  meta: ModSettingSchemaEntry | undefined,
  groupTitles: Record<string, string>,
  filter: string,
  t: (key: string) => string,
): boolean {
  const ft = filter.trim().toLowerCase();
  if (!ft) return true;
  const disp = String(meta?.display_name || key).toLowerCase();
  const groupId = meta?.group || MOD_SETTINGS_OTHER_GROUP;
  const gtitle = groupTitle(groupId, groupTitles, t).toLowerCase();
  const gid = groupId === MOD_SETTINGS_OTHER_GROUP ? '' : groupId.toLowerCase();
  return (
    key.toLowerCase().includes(ft) ||
    disp.includes(ft) ||
    gtitle.includes(ft) ||
    (!!gid && gid.includes(ft))
  );
}

export function schemaProgressMessage(
  progress: { phase: string; mod?: string; mod_done?: number; mod_total?: number; step?: number; step_total?: number } | null,
  t: (key: string, ...args: (string | number)[]) => string,
): string {
  if (!progress || progress.phase === 'preparing' || progress.phase === 'idle') {
    return t('mod_settings_progress_preparing');
  }
  if (progress.phase === 'scan') {
    return t(
      'mod_settings_progress_scan',
      progress.mod || '',
      progress.mod_done ?? 0,
      progress.mod_total ?? 0,
    );
  }
  if (progress.phase === 'locale_data_en') return t('mod_settings_progress_locale_data_en');
  if (progress.phase === 'locale_mods_en') return t('mod_settings_progress_locale_mods_en');
  if (progress.phase === 'locale_data_ui') return t('mod_settings_progress_locale_data_ui');
  if (progress.phase === 'locale_mods_ui') return t('mod_settings_progress_locale_mods_ui');
  if (progress.phase === 'building') {
    return t('mod_settings_progress_building', progress.step ?? 1, progress.step_total ?? 1);
  }
  if (progress.phase === 'done') return t('mod_settings_progress_building', 1, 1);
  return t('mod_settings_progress_preparing');
}

export function schemaProgressPercent(
  progress: { phase: string; mod_done?: number; mod_total?: number; step?: number; step_total?: number } | null,
): number | null {
  if (!progress) return null;
  if (progress.phase === 'scan' && progress.mod_total) {
    return Math.round(((progress.mod_done ?? 0) / progress.mod_total) * 55);
  }
  if (progress.phase === 'locale_data_en') return 60;
  if (progress.phase === 'locale_mods_en') return 70;
  if (progress.phase === 'locale_data_ui') return 75;
  if (progress.phase === 'locale_mods_ui') return 85;
  if (progress.phase === 'building') return 95;
  if (progress.phase === 'done') return 100;
  if (progress.phase === 'preparing') return 5;
  return null;
}
