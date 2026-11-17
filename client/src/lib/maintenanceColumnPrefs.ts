import { createColumnPrefs } from './columnPrefs';
import { createStatusModePrefs } from './statusModePrefs';

export type MaintenanceColumnKey =
  | 'status'
  | 'next_fire'
  | 'servers'
  | 'actions'
  | 'timezone';

export type MaintenanceColumnVisibility = Record<MaintenanceColumnKey, boolean>;

export const DEFAULT_MAINTENANCE_COLUMNS: MaintenanceColumnVisibility = {
  status: true,
  next_fire: true,
  servers: true,
  actions: true,
  timezone: false,
};

/** Schedule stays first; state, then when (next run), then what (servers, actions), zone last. */
export const DEFAULT_MAINTENANCE_COLUMN_ORDER: readonly MaintenanceColumnKey[] =
  ['status', 'next_fire', 'servers', 'actions', 'timezone'];

export const maintenanceColumnPrefs = createColumnPrefs<MaintenanceColumnKey>({
  columnsKey: 'fcc_user_maintenance_columns',
  orderKey: 'fcc_user_maintenance_column_order',
  defaults: DEFAULT_MAINTENANCE_COLUMNS,
  defaultOrder: DEFAULT_MAINTENANCE_COLUMN_ORDER,
});

/** Defaults to the dot next to the schedule, which is how the table looked before the setting existed. */
export const maintenanceStatusPrefs = createStatusModePrefs(
  'fcc_user_maintenance_status_mode',
  'dot',
);
