export interface ModRow {
  name: string;
  display_name?: string;
  author?: string | string[];
  owner?: string;
  publisher?: string;
  username?: string;
  user?: string;
  authors?: string | string[];
  enabled?: boolean;
  is_builtin?: boolean;
  local_version?: string;
  portal_version?: string;
  pinned_version?: string;
  available_versions?: string[];
  zip_size_bytes?: number;
  install_date?: string;
  installed_by?: string;
}

export type ModSortColumn =
  | 'enabled'
  | 'name'
  | 'author'
  | 'size'
  | 'version'
  | 'portal'
  | 'installed'
  | 'installed_by';
