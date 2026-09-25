export interface ModJobLogEntry {
  level?: string;
  ts?: number;
  key?: string;
  args?: (string | number)[];
  text?: string;
}

export interface ModJobStatus {
  running?: boolean;
  phase?: string;
  current_step?: number;
  total_steps?: number;
  current_name?: string;
  current_version?: string;
  download_cur?: number;
  download_tot?: number;
  download_active?: number;
  active_downloads?: { name: string; version?: string }[];
  error?: string;
  error_key?: string;
  error_args?: (string | number)[];
  log?: ModJobLogEntry[];
}

import type { ModInstallConflictInfo } from './modConflict';

export interface ModPortalReleaseItem {
  version: string;
  factorio_version: string;
  released_at?: string;
  file_name?: string;
  sha1?: string;
  is_compatible?: boolean;
}

export interface ModPortalReleasesResponse {
  ok?: boolean;
  error?: string;
  name?: string;
  title?: string;
  game_version?: string;
  factorio_version?: string;
  recommended_version?: string;
  installed_version?: string;
  available_versions?: string[];
  releases?: ModPortalReleaseItem[];
}

export interface ModInstallPlan {
  ok?: boolean;
  error?: string;
  mod?: string;
  version?: string;
  selected_version?: string;
  available_portal_versions?: ModPortalReleaseItem[];
  dependencies?: string[];
  to_install?: { name?: string; local_version?: string; portal_version?: string }[];
  requires_game_update_confirmation?: boolean;
  game_version?: string;
  mods_needing_game_update?: { name?: string; required_factorio?: string }[];
  conflicts_to_disable?: string[];
  requires_conflict_confirmation?: boolean;
  install_conflicts?: ModInstallConflictInfo[];
  recommended?: string[];
  titles?: Record<string, string>;
}

export interface ModCheckResultEntry {
  ok?: boolean;
  version?: string;
  error?: string;
}

export interface ModCheckStatus {
  running?: boolean;
  done?: number;
  total?: number;
  failed?: number;
  error?: string;
  results?: Record<string, ModCheckResultEntry>;
}

export interface ModSavePreviewMod {
  name: string;
  display_name?: string;
  version?: string;
  installed?: boolean;
}

export interface ModSavePreview {
  ok?: boolean;
  error?: string;
  factorio_version?: string;
  mods?: ModSavePreviewMod[];
}

export interface ModUploadResponse {
  ok?: boolean;
  error?: string;
  detail?: string;
  mod_name?: string;
  name?: string;
  kind?: string;
  required_dependencies?: string[];
  install_conflicts?: ModInstallConflictInfo[];
  conflicts_to_disable?: string[];
}
