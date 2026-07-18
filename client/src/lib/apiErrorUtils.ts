/** Maps backend `error` codes to locale keys (api_error_* or existing keys). */
const API_ERROR_I18N: Record<string, string> = {
  missing_server_settings: 'api_error_missing_server_settings',
  not_in_list: 'api_error_not_in_list',
  no_factorio_exe: 'api_error_no_factorio_exe',
  rcon_failed: 'api_error_rcon_failed',
  commands_not_allowed: 'api_error_commands_not_allowed',
  empty_message: 'api_error_empty_message',
  unknown_instance: 'api_error_unknown_instance',
  instance_id_required: 'api_error_instance_id_required',
  forbidden: 'api_error_forbidden',
  rename_failed: 'api_error_rename_failed',
  mod_job_not_running: 'mod_job_not_running',
  mod_job_running: 'mod_job_running_block_start',
  start_failed: 'api_error_start_failed',
  stop_failed: 'api_error_stop_failed',
  restart_failed: 'api_error_restart_failed',
  kill_failed: 'api_error_kill_failed',
  not_found: 'api_error_not_found',
  tmp_not_found: 'api_error_tmp_not_found',
  path_not_found: 'api_error_path_not_found',
  path_required: 'api_error_path_required',
  path_invalid: 'api_error_path_invalid',
  no_mods: 'api_error_no_mods',
  invalid_format: 'api_error_invalid_format',
  invalid_save_archive: 'saves_manager_upload_invalid_archive',
  invalid_save_zip: 'saves_manager_upload_invalid_zip',
  client_not_built: 'api_error_client_not_built',
  folder_name_invalid: 'api_error_folder_name_invalid',
  folder_exists: 'api_error_folder_exists',
  already_active: 'modpack_activate_already_active',
  modpack_requires_space_age: 'modpack_activate_requires_space_age',
  updates_blocked_by_instance_setting: 'maintenance_instance_updates_forbidden',
  not_running: 'not_running',
  load_failed: 'api_error_load_failed',
  save_failed: 'api_error_save_failed',
  create_failed: 'api_error_create_failed',
  list_failed: 'api_error_list_failed',
  factorio_credentials_invalid: 'program_factorio_credentials_invalid',
  factorio_credentials_incomplete: 'program_factorio_credentials_incomplete',
};

/** Instance/API errors that use a different locale key than the error code. */
const ERROR_ALIASES: Record<string, string> = {
  no_saves: 'cannot_start_no_save',
  save_not_found: 'cannot_start_no_save',
  port_in_use: 'instances_error_port_in_use',
  game_port_in_use: 'instances_error_game_port_duplicate',
  invalid_port: 'instances_error_invalid_port',
  invalid_ip: 'control_invalid_ip',
  invalid_rcon_host: 'instances_error_invalid_rcon_host',
  instance_not_found: 'instances_error_not_found',
  instance_switch_failed: 'instances_error_not_found',
  delete_failed: 'instances_error_delete_failed',
  instance_clone_failed: 'instances_error_clone_failed',
  instance_path_invalid: 'instances_error_path_invalid',
  path_invalid: 'instances_error_path_invalid',
  path_required: 'instances_error_path_required',
  instance_path_not_empty: 'instances_error_path_not_empty',
  instance_path_exists: 'instances_error_path_exists',
  instance_executable_missing: 'instances_error_executable_missing',
  invalid_server_path: 'instances_error_path_invalid',
  about_factorio_update_no_credentials: 'instances_error_no_credentials',
  instance_template_extract_failed: 'instances_error_template_extract_failed',
  instance_template_invalid: 'instances_error_template_invalid',
  instance_template_download_failed: 'instances_error_template_download_failed',
  instance_template_download_incomplete: 'instances_error_template_download_incomplete',
  update_failed: 'instances_error_update_failed',
  create_failed: 'instances_error_create_failed',
  name_required: 'instances_error_name_required',
  invalid_rcon_port: 'instances_error_invalid_rcon_port',
  invalid_rcon_password: 'instances_error_invalid_rcon_password',
  cancelled: 'mod_job_stopped',
  instance_bootstrap_not_running: 'mod_job_not_running',
  web_error_load_failed: 'web_error_load_failed',
  web_error_network: 'web_error_network',
  restart_stop_timeout: 'restart_server_timeout',
  already_busy: 'restart_server_timeout',
  mod_job_already_running: 'mod_job_already_running',
  server_running: 'server_running_mutate_blocked',
  invalid_name: 'saves_manager_rename_invalid',
  exists: 'saves_manager_rename_exists',
  running_active_save: 'saves_manager_running_active_save',
};

export function localizeApiError(
  err: string,
  t: (key: string, ...args: (string | number)[]) => string,
  args: (string | number)[] = [],
): string {
  const k = String(err || '').trim();
  if (!k) return '';

  const alias = ERROR_ALIASES[k];
  if (alias) {
    const loc = t(alias, ...args);
    if (loc !== alias) return loc;
  }

  const i18nKey = API_ERROR_I18N[k] || k;
  const loc = t(i18nKey, ...args);
  if (loc !== i18nKey) return loc;

  return k;
}
