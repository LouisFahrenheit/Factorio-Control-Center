export const MOD_SETTINGS_SECTIONS = ['startup', 'runtime-global', 'runtime-per-user'] as const;

export type ModSettingsSection = (typeof MOD_SETTINGS_SECTIONS)[number];

/** Server editor tabs — per-user settings are client-side only and are not shown here. */
export const MOD_SETTINGS_UI_SECTIONS = ['startup', 'runtime-global'] as const satisfies readonly ModSettingsSection[];

export type ModSettingsUiSection = (typeof MOD_SETTINGS_UI_SECTIONS)[number];

export interface ModSettingsDocument {
  '!type': 'ModSettings';
  version: [number, number, number, number];
  has_quality: boolean;
  data: Record<ModSettingsSection, Record<string, unknown>>;
}

export type SettingValueKind =
  | 'json_entry'
  | 'bool'
  | 'uint64'
  | 'int'
  | 'float'
  | 'string'
  | 'color'
  | 'json_value';

export interface ModSettingsReadResponse {
  ok?: boolean;
  json_text?: string;
  missing_file?: boolean;
  error?: string;
}

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

export interface ModSettingsSchemaResponse {
  ok?: boolean;
  pending?: boolean;
  ready?: boolean;
  running?: boolean;
  cached?: boolean;
  settings?: Record<string, ModSettingSchemaEntry>;
  group_titles?: Record<string, string>;
  progress?: ModSettingsSchemaProgress;
  error?: string;
}

export interface ModSettingsSchemaProgress {
  phase: string;
  mod?: string;
  mod_done?: number;
  mod_total?: number;
  step?: number;
  step_total?: number;
}

export interface ModSettingsSchemaStatusResponse extends ModSettingsSchemaResponse {
  ready?: boolean;
  running?: boolean;
}

export const MOD_SETTINGS_OTHER_GROUP = '\0other';
