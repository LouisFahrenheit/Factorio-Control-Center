export interface ModpackRow {
  name: string;
  mods_count?: number;
  size_bytes?: number;
  has_mod_settings?: boolean;
  factorio_version?: string;
  factorio_version_label?: string;
  requires_space_age?: boolean;
  created_at?: string;
  description?: string;
}

export interface ModpackModDetail {
  name?: string;
  display_name?: string;
  version?: string;
}

export interface ModpackDetails extends ModpackRow {
  mods?: ModpackModDetail[];
}

export interface ModpackGetResponse {
  ok?: boolean;
  error?: string;
  modpack?: ModpackDetails;
}

export interface ModpackListResponse {
  ok?: boolean;
  error?: string;
  modpacks?: ModpackRow[];
  active?: string;
  activate_use_symlinks?: boolean;
}
