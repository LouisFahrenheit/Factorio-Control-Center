import { createColumnPrefs } from './columnPrefs';
import { createStatusModePrefs } from './statusModePrefs';

export type UserAccessColumnKey =
  | 'role'
  | 'status'
  | 'twofa'
  | 'servers'
  | 'perms'
  | 'created';

export type UserAccessColumnVisibility = Record<UserAccessColumnKey, boolean>;

export const DEFAULT_USER_ACCESS_COLUMNS: UserAccessColumnVisibility = {
  role: true,
  status: true,
  twofa: true,
  servers: true,
  perms: true,
  created: true,
};

export const DEFAULT_USER_ACCESS_COLUMN_ORDER: readonly UserAccessColumnKey[] =
  ['role', 'status', 'twofa', 'servers', 'perms', 'created'];

export const userAccessColumnPrefs = createColumnPrefs<UserAccessColumnKey>({
  columnsKey: 'fcc_user_access_columns',
  orderKey: 'fcc_user_access_column_order',
  defaults: DEFAULT_USER_ACCESS_COLUMNS,
  defaultOrder: DEFAULT_USER_ACCESS_COLUMN_ORDER,
});

export const userAccessStatusPrefs = createStatusModePrefs(
  'fcc_user_access_status_mode',
  'column',
);
