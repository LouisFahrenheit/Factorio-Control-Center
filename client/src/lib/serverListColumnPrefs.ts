import { createColumnPrefs } from './columnPrefs';
import { createStatusModePrefs } from './statusModePrefs';

export type ServerListColumnKey =
  | 'save'
  | 'access'
  | 'port'
  | 'rconPort'
  | 'version'
  | 'mods'
  | 'online'
  | 'uptime'
  | 'status';

export type ServerListColumnVisibility = Record<ServerListColumnKey, boolean>;

export const DEFAULT_SERVER_LIST_COLUMNS: ServerListColumnVisibility = {
  save: true,
  access: true,
  port: true,
  rconPort: true,
  version: true,
  mods: true,
  online: true,
  uptime: true,
  status: true,
};

export const DEFAULT_SERVER_LIST_COLUMN_ORDER: readonly ServerListColumnKey[] =
  [
    'save',
    'access',
    'port',
    'rconPort',
    'version',
    'mods',
    'online',
    'uptime',
    'status',
  ];

/** Visibility and order are stored under separate keys so older saved visibility maps stay valid. */
export const serverListColumnPrefs = createColumnPrefs<ServerListColumnKey>({
  columnsKey: 'fcc_user_server_list_columns',
  orderKey: 'fcc_user_server_list_column_order',
  defaults: DEFAULT_SERVER_LIST_COLUMNS,
  defaultOrder: DEFAULT_SERVER_LIST_COLUMN_ORDER,
});

export const serverListStatusPrefs = createStatusModePrefs(
  'fcc_user_server_list_status_mode',
  'dot',
);
