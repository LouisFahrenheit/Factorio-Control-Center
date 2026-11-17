import { createColumnPrefs } from './columnPrefs';
import type { ColumnConfigItem } from '../components/instances/InstanceColumnsDropdown';

export type ModColumnKey =
  | 'type'
  | 'author'
  | 'size'
  | 'version'
  | 'portal'
  | 'installed'
  | 'installed_by';

export type ModColumnVisibility = Record<ModColumnKey, boolean>;

export const DEFAULT_MOD_COLUMNS: ModColumnVisibility = {
  type: true,
  author: true,
  size: true,
  version: true,
  portal: true,
  installed: true,
  installed_by: true,
};

export const DEFAULT_MOD_COLUMN_ORDER: readonly ModColumnKey[] = [
  'type',
  'author',
  'size',
  'version',
  'portal',
  'installed',
  'installed_by',
];

export const MOD_COLUMN_CONFIG: readonly ColumnConfigItem<ModColumnKey>[] = [
  { key: 'type', labelKey: 'mod_list_col_type' },
  { key: 'author', labelKey: 'mod_list_col_author' },
  { key: 'size', labelKey: 'mod_list_col_size' },
  { key: 'version', labelKey: 'mod_list_col_version' },
  { key: 'portal', labelKey: 'mod_list_col_portal' },
  { key: 'installed', labelKey: 'mod_list_col_installed_date' },
  { key: 'installed_by', labelKey: 'mod_list_col_installed_by' },
];

export const modsColumnPrefs = createColumnPrefs<ModColumnKey>({
  columnsKey: 'fcc_user_mods_columns',
  orderKey: 'fcc_user_mods_column_order',
  defaults: DEFAULT_MOD_COLUMNS,
  defaultOrder: DEFAULT_MOD_COLUMN_ORDER,
});
