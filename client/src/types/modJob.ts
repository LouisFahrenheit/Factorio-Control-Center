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
  to_install?: {
    name?: string;
    local_version?: string;
    portal_version?: string;
  }[];
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

export interface ModPortalSearchItem {
  name: string;
  title: string;
  summary: string;
  owner: string;
  downloads_count: number;
  thumbnail: string;
  category: string;
  requires_space_age?: boolean;
  latest_version: string;
  factorio_version: string;
  released_at: string;
  installed_version?: string;
  bookmarked?: boolean;
}

export interface ModPortalSearchFacets {
  space_age: number;
  categories: Record<string, number>;
  bookmarked?: number;
}

export type ModPortalSortBy =
  | 'relevance'
  | 'downloads'
  | 'updated'
  | 'trending';

export interface ModPortalSearchResponse {
  ok?: boolean;
  error?: string;
  results?: ModPortalSearchItem[];
  total?: number;
  page?: number;
  page_size?: number;
  total_pages?: number;
  game_version?: string;
  server_factorio_version?: string;
  factorio_version?: string;
  facets?: ModPortalSearchFacets;
  has_credentials?: boolean;
  bookmarks_count?: number;
  /** Names of all matched mods across pages (updates mode only). */
  all_names?: string[];
  /** Latest portal versions for installed mods (updates mode only). */
  portal_versions?: Record<string, string>;
}

export interface ModPortalThumbnailsResponse {
  ok?: boolean;
  thumbnails?: Record<string, string>;
}

export interface ModPortalFullImage {
  id: string;
  url: string;
  thumbnail: string;
}

export interface ModPortalLicenseInfo {
  title: string;
  url: string;
}

export type ModPortalDepStatus =
  | 'installed_ok'
  | 'installed_disabled'
  | 'needs_update'
  | 'missing_dlc'
  | 'will_download'
  | 'not_installed'
  | 'conflict_active'
  | 'conflict_inactive';

export interface ModPortalDependencyEntry {
  name: string;
  title: string;
  kind: 'required' | 'optional' | 'conflict';
  operator: string;
  version: string;
  local_version: string;
  is_builtin: boolean;
  status: ModPortalDepStatus;
}

export interface ModPortalDependenciesInfo {
  target_release_version: string;
  missing_dlc: string[];
  active_conflicts: ModPortalDependencyEntry[];
  required: ModPortalDependencyEntry[];
  optional: ModPortalDependencyEntry[];
  conflicts: ModPortalDependencyEntry[];
}

export interface ModPortalFullDetails {
  name: string;
  title: string;
  owner: string;
  summary: string;
  description: string;
  faq: string;
  changelog: string;
  category: string;
  tags: string[];
  downloads_count: number;
  created_at: string;
  updated_at: string;
  homepage: string;
  source_url: string;
  github_path: string;
  license: ModPortalLicenseInfo | null;
  thumbnail: string;
  images: ModPortalFullImage[];
  latest_version: string;
  released_at: string;
  requires_space_age: boolean;
  installed_version?: string;
  bookmarked?: boolean;
  dependencies_info?: ModPortalDependenciesInfo;
}

export interface ModPortalDetailsResponse {
  ok?: boolean;
  error?: string;
  mod?: ModPortalFullDetails;
}

export interface ModPortalBookmarkResponse {
  ok?: boolean;
  error?: string;
  mod?: string;
  bookmarked?: boolean;
  bookmarks_count?: number;
}
