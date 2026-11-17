import { createColumnPrefs } from './columnPrefs';
import { createStatusModePrefs } from './statusModePrefs';

export type PublicColumnKey =
  | 'status'
  | 'visibility'
  | 'online'
  | 'version'
  | 'mods'
  | 'uptime'
  | 'address'
  | 'description';

export type PublicColumnVisibility = Record<PublicColumnKey, boolean>;

export const DEFAULT_PUBLIC_COLUMNS: PublicColumnVisibility = {
  status: true,
  visibility: true,
  online: true,
  version: true,
  mods: false,
  uptime: false,
  address: true,
  description: true,
};

/** Name stays first; state, live metrics, then connection info, with the long free text last. */
export const DEFAULT_PUBLIC_COLUMN_ORDER: readonly PublicColumnKey[] = [
  'status',
  'visibility',
  'online',
  'version',
  'mods',
  'uptime',
  'address',
  'description',
];

export const publicColumnPrefs = createColumnPrefs<PublicColumnKey>({
  columnsKey: 'fcc_user_public_columns',
  orderKey: 'fcc_user_public_column_order',
  defaults: DEFAULT_PUBLIC_COLUMNS,
  defaultOrder: DEFAULT_PUBLIC_COLUMN_ORDER,
});

export const publicStatusPrefs = createStatusModePrefs(
  'fcc_user_public_status_mode',
  'dot',
);
