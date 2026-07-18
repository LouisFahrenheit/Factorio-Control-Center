/**
 * Prints APP_VERSION from package.json (same source as pack:release).
 * Usage: node scripts/read-app-version.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const scriptRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = process.env.FCC_ROOT_DIR?.trim() || scriptRoot;

function readVersion() {
  const pkgPath = join(root, 'package.json');
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (pkg.version) return String(pkg.version);
  }
  const distConstants = join(root, 'dist/constants/fcc.constants.js');
  if (existsSync(distConstants)) {
    const m = /APP_VERSION\s*=\s*['"]([^'"]+)['"]/.exec(readFileSync(distConstants, 'utf8'));
    if (m?.[1]) return m[1];
  }
  return '0.0.0';
}

process.stdout.write(readVersion());
