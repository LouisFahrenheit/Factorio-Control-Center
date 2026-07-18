#!/usr/bin/env node
/**
 * Regenerate THIRD_PARTY_NOTICES.txt from production npm dependencies.
 * Run: npm run notices
 */
import { execSync } from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const nestRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clientRoot = join(nestRoot, 'client');
const outPath = join(nestRoot, 'THIRD_PARTY_NOTICES.txt');

function readLicenseCsv(cwd) {
  const csv = execSync('npx --yes license-checker --production --csv', {
    cwd,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    shell: true,
  });
  const rows = [];
  for (const line of csv.trim().split(/\r?\n/).slice(1)) {
    const m = /^"([^"]*)","([^"]*)","([^"]*)"$/.exec(line);
    if (!m) continue;
    const [, name, license, repository] = m;
    if (name.startsWith('factorio-control-center@') || name.startsWith('client@')) continue;
    rows.push({ name, license, repository });
  }
  rows.sort((a, b) => a.name.localeCompare(b.name, 'en'));
  return rows;
}

function formatSection(title, rows) {
  const lines = [`${title}`, '='.repeat(title.length), ''];
  for (const { name, license, repository } of rows) {
    lines.push(`${name}`);
    lines.push(`  License: ${license}`);
    if (repository) lines.push(`  Repository: ${repository}`);
    lines.push('');
  }
  return lines;
}

const serverRows = readLicenseCsv(nestRoot);
const clientRows = readLicenseCsv(clientRoot);

const pkg = JSON.parse(readFileSync(join(nestRoot, 'package.json'), 'utf8'));
const version = String(pkg.version || '');

const body = [
  'THIRD-PARTY NOTICES',
  'Factorio Control Center',
  version ? `Version ${version}` : '',
  '',
  'This file lists third-party software included in or distributed with',
  'Factorio Control Center. See the LICENSE file for this application.',
  '',
  'Bundled components',
  '=====================================',
  '',
  'Material Symbols by Google',
  '  License: Apache License 2.0',
  '  https://fonts.google.com/icons',
  '',
  'Tabler Icons',
  '  License: MIT',
  '  https://github.com/tabler/tabler-icons',
  '',
  'NSSM (Non-Sucking Service Manager) by Iain Patterson',
  '  License: Public domain',
  '  https://nssm.cc/',
  '  Bundled in Windows releases only.',
  '',
  'Factorio game assets (icons and sprites)',
  '  Images Copyright Wube Software',
  '  Used with permission.',
  '',
  ...formatSection('Server dependencies (production node_modules)', serverRows),
  ...formatSection('Client UI bundle dependencies (production)', clientRows),
];

writeFileSync(outPath, `${body.join('\n')}\n`, 'utf8');
console.log(`Wrote ${outPath} (${serverRows.length} server + ${clientRows.length} client packages)`);
