import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const localeDir = path.join(root, 'locale');

function readLangKeys(file) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  return Object.keys(data).sort();
}

const enPath = path.join(localeDir, 'server_lang_en.json');
if (!fs.existsSync(enPath)) {
  console.error('Missing reference locale:', enPath);
  process.exit(1);
}

const enKeys = readLangKeys(enPath);
const enSet = new Set(enKeys);
let failed = false;

const langFiles = fs
  .readdirSync(localeDir)
  .filter((f) => /^server_lang_[a-z]{2}(?:-[a-z]+)?\.json$/i.test(f))
  .sort();

for (const file of langFiles) {
  if (file === 'server_lang_en.json') continue;
  const keys = readLangKeys(path.join(localeDir, file));
  const keySet = new Set(keys);
  const missing = enKeys.filter((k) => !keySet.has(k));
  const extra = keys.filter((k) => !enSet.has(k));
  if (missing.length || extra.length) {
    failed = true;
    console.error(`\n${file}:`);
    if (missing.length) {
      console.error(`  missing ${missing.length} key(s) from en:`);
      missing.slice(0, 20).forEach((k) => console.error(`    - ${k}`));
      if (missing.length > 20) console.error(`    ... and ${missing.length - 20} more`);
    }
    if (extra.length) {
      console.error(`  extra ${extra.length} key(s) not in en:`);
      extra.slice(0, 20).forEach((k) => console.error(`    + ${k}`));
      if (extra.length > 20) console.error(`    ... and ${extra.length - 20} more`);
    }
  } else {
    console.log(`${file}: OK (${keys.length} keys)`);
  }
}

console.log(`Reference en: ${enKeys.length} keys, ${langFiles.length - 1} translation file(s) checked`);
if (failed) {
  console.error('\nLocale sync check failed. Translation files must have exactly the same keys as server_lang_en.json.');
  process.exit(1);
}

console.log('Locale sync check passed.');
