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

const DYNAMIC_PREFIXES = [
  'audit_event_',
  'audit_report_kind_',
  'maintenance_report_step_',
  'history_action_',
  'history_change_',
  'instances_status_',
  'maintenance_wd_',
  'lang_name_',
  'server_settings_field_',
  'server_settings_hint_',
  'server_settings_category_',
  'map_gen_section_',
  'map_gen_preset_',
  'map_gen_preview_color_',
  'map_gen_preview_tool_hint_',
  'map_gen_map_type_',
  'map_gen_control_',
  'map_gen_planet_',
  'map_gen_resource_',
  'web_error_',
  'web_role_',
  'web_tab_',
  'section_help_',
  'ui_theme_',
  'quality_',
  'mod_job_log_',
  'history_player_category_',
];

function prefixUsedDynamically(prefix) {
  const patterns = [
    `'${prefix}' +`,
    `"${prefix}" +`,
    `\`${prefix}\${`,
    `message_key: \`${prefix}`,
    `return \`${prefix}`,
    `key = '${prefix}`,
    `key = \`${prefix}`,
    `i18n: '${prefix}`,
  ];
  return patterns.some((p) => blob.includes(p));
}

function extractObjectStringValues(fileRel) {
  const p = path.join(root, fileRel);
  if (!fs.existsSync(p)) return [];
  const text = fs.readFileSync(p, 'utf8');
  return [...text.matchAll(/:\s*'([a-z][a-z0-9_]*)'/g)].map((m) => m[1]);
}

function extractModErrorTKeys(fileRel) {
  const p = path.join(root, fileRel);
  if (!fs.existsSync(p)) return [];
  const text = fs.readFileSync(p, 'utf8');
  return [...text.matchAll(/return t\('([a-z][a-z0-9_]*)'/g)].map((m) => m[1]);
}

const mappedKeys = new Set([
  ...extractObjectStringValues('client/src/lib/apiErrorUtils.ts'),
  ...extractObjectStringValues('client/src/lib/historyOpsUtils.ts'),
  ...extractObjectStringValues('client/src/lib/webUserUtils.ts'),
  ...extractObjectStringValues('client/src/hooks/useProgramSettings.ts'),
  ...extractObjectStringValues('client/src/lib/modErrorUtils.ts'),
  ...extractModErrorTKeys('client/src/lib/modErrorUtils.ts'),
  ...extractModErrorTKeys('client/src/lib/modpackUtils.ts'),
  ...extractModErrorTKeys('client/src/lib/modSettingsUtils.ts'),
]);

for (const m of blob.matchAll(/error:\s*'([a-z][a-z0-9_]*)'/g)) mappedKeys.add(m[1]);
for (const m of blob.matchAll(/throw new Error\('([a-z][a-z0-9_]*)'\)/g)) mappedKeys.add(m[1]);
for (const m of blob.matchAll(/(?:\.line|logLine|formatLocale)\('([a-z][a-z0-9_]*)'/g)) mappedKeys.add(m[1]);
for (const m of blob.matchAll(/message_key:\s*'([a-z][a-z0-9_]*)'/g)) mappedKeys.add(m[1]);

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
    `.line('${k}'`,
    `.line("${k}"`,
    `logLine('${k}'`,
    `formatLocale('${k}'`,
    `formatLocale("${k}"`,
  ];
  if (literals.some((p) => blob.includes(p))) return true;
  if (mappedKeys.has(k)) return true;
  for (const prefix of DYNAMIC_PREFIXES) {
    if (k.startsWith(prefix) && prefixUsedDynamically(prefix)) return true;
  }
  return false;
}

const enPath = path.join(root, 'locale/server_lang_en.json');
const ruPath = path.join(root, 'locale/server_lang_ru.json');
const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const unused = Object.keys(en).filter((k) => !keyReferenced(k)).sort();

console.log('Orphan keys:', unused.length);

const outPath = path.join(root, 'scripts/locale-orphan-keys.json');
fs.writeFileSync(outPath, JSON.stringify({ count: unused.length, keys: unused }, null, 2) + '\n');

if (process.argv.includes('--remove')) {
  const ru = JSON.parse(fs.readFileSync(ruPath, 'utf8'));
  for (const k of unused) {
    delete en[k];
    delete ru[k];
  }
  fs.writeFileSync(enPath, JSON.stringify(en, null, 2) + '\n');
  fs.writeFileSync(ruPath, JSON.stringify(ru, null, 2) + '\n');
  console.log('Removed', unused.length, 'keys from en/ru');
} else {
  unused.forEach((k) => console.log(k));
  console.log('Written to', outPath);
}
