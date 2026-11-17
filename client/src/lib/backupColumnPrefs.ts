import { createColumnPrefs } from './columnPrefs';

export type BackupColumnKey =
  | 'type'
  | 'sections'
  | 'version'
  | 'size'
  | 'date'
  | 'age';

export type BackupColumnVisibility = Record<BackupColumnKey, boolean>;

export const DEFAULT_BACKUP_COLUMNS: BackupColumnVisibility = {
  type: true,
  sections: true,
  version: true,
  size: true,
  date: true,
  age: true,
};

/** Name stays first; descriptive fields, then size, then date and age last (file-manager convention). */
export const DEFAULT_BACKUP_COLUMN_ORDER: readonly BackupColumnKey[] = [
  'type',
  'sections',
  'version',
  'size',
  'date',
  'age',
];

export const backupColumnPrefs = createColumnPrefs<BackupColumnKey>({
  columnsKey: 'fcc_user_backup_columns',
  orderKey: 'fcc_user_backup_column_order',
  defaults: DEFAULT_BACKUP_COLUMNS,
  defaultOrder: DEFAULT_BACKUP_COLUMN_ORDER,
});

