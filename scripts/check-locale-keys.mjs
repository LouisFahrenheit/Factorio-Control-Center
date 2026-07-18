import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function collectFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', 'dist'].includes(ent.name)) continue;
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === 'locale') continue;
      collectFiles(p, out);
    } else if (/\.(ts|tsx|js|jsx|html|json|mjs)$/.test(ent.name) && !/server_lang_[a-z]+\.json$/i.test(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

const files = [
  ...collectFiles(path.join(root, 'client')),
  ...collectFiles(path.join(root, 'src')),
  path.join(root, 'client/index.html'),
].filter((p) => fs.existsSync(p));

const blob = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');

const PREFIX_GROUPS = [
  'maintenance_report_step_',
  'audit_event_',
  'audit_report_kind_',
  'server_settings_field_',
  'server_settings_hint_',
  'server_settings_category_',
  'ui_theme_',
  'lang_name_',
  'web_role_',
  'history_action_',
  'history_player_category_',
  'section_help_',
  'mod_job_log_',
  'headless_',
  'panel_startup_',
  'maintenance_chat_',
  'maintenance_warn_',
  'map_gen_control_',
  'map_gen_resource_',
  'map_gen_preset_',
  'map_gen_planet_',
  'map_gen_section_',
  'map_gen_preview_color_',
  'map_gen_col_',
  'maintenance_wd_',
  'quality_',
  'instances_status_',
  'web_perm_',
  'web_tab_',
  'web_settings_subtab_',
  'web_access_perm_',
  'web_error_',
  'web_user_',
  'web_login_',
  'web_logout_',
  'web_program_',
  'web_save_',
  'program_web_',
  'instances_error_',
  'instances_quick_',
  'instances_start_all_',
  'instances_stop_all_',
  'instances_kill_all_',
  'instances_end_maintenance_',
  'instances_download_',
  'instances_clone_',
  'instances_add_',
  'instances_edit_',
  'instances_delete_',
  'instances_path_',
  'instances_bootstrap_',
  'instance_bootstrap_',
  'instance_template_',
  'instance_maintenance_',
  'mod_list_dl_',
  'mod_list_conflict_',
  'modpack_import_',
  'modpack_export_',
  'modpack_save_',
  'modpack_activate_',
  'modpack_delete_',
  'modpack_rename_',
  'modpack_reset_',
  'saves_manager_',
  'map_gen_',
  'create_save_',
  'mod_job_',
  'mod_update_',
  'mod_deps_',
  'modpack_',
  'mod_settings_',
  'mod_list_',
  'modpack_',
  'factorio_update_',
  'web_update_',
  'server_update_',
  'maintenance_',
  'announce_',
  'console_',
  'control_',
  'stats_',
  'players_',
  'commands_',
  'history_',
  'audit_',
  'mobile_',
  'user_settings_',
  'program_',
  'about_',
  'settings_',
  'server_settings_',
  'reset_confirm_',
  'confirm_',
  'error_',
  'validation_',
  'cmd_',
  'ban_',
  'whitelist_',
  'sync_',
  'fcc_',
  'ui_',
  'login_',
  'logout_',
  'status_',
  'start_',
  'stop_',
  'restart_',
  'kill_',
  'save_',
  'backup_',
  'cannot_',
  'instances_',
  'instance_',
  'web_',
];

function keyReferenced(k) {
  const literals = [
    `'${k}'`,
    `"${k}"`,
    `\`${k}\``,
    `data-i18n="${k}"`,
    `data-i18n='${k}'`,
    `data-i18n-placeholder="${k}"`,
    `data-i18n-title="${k}"`,
    `message_key: '${k}'`,
    `message_key: "${k}"`,
    `titleKey: '${k}'`,
    `introKey: '${k}'`,
    `textKey: '${k}'`,
  ];
  if (literals.some((p) => blob.includes(p))) return true;
  for (const prefix of PREFIX_GROUPS) {
    if (k.startsWith(prefix) && blob.includes(prefix)) return true;
  }
  return false;
}

const en = JSON.parse(fs.readFileSync(path.join(root, 'locale/server_lang_en.json'), 'utf8'));
const unused = Object.keys(en).filter((k) => !keyReferenced(k)).sort();

const outPath = path.join(root, 'scripts/locale-unused-keys.json');
fs.writeFileSync(outPath, JSON.stringify({ count: unused.length, keys: unused }, null, 2) + '\n');
console.log('Unused keys:', unused.length);
console.log('Written to', outPath);
if (unused.length) {
  console.error('\nLocale unused-key check failed. Remove orphan keys or reference them in code.');
  unused.slice(0, 20).forEach((k) => console.error(`  - ${k}`));
  if (unused.length > 20) console.error(`  ... and ${unused.length - 20} more`);
  process.exit(1);
}
