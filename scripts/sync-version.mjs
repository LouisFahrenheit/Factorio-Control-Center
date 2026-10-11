#!/usr/bin/env node
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rootPkgPath = join(rootDir, 'package.json');
const rootLockPath = join(rootDir, 'package-lock.json');
const clientPkgPath = join(rootDir, 'client', 'package.json');
const clientLockPath = join(rootDir, 'client', 'package-lock.json');
const noticesPath = join(rootDir, 'THIRD_PARTY_NOTICES.txt');

const rootPkg = JSON.parse(readFileSync(rootPkgPath, 'utf8'));
let targetVersion = process.argv[2];

if (!targetVersion) {
  // If no argument supplied, sync whatever version is currently in root package.json
  targetVersion = rootPkg.version;
} else if (['patch', 'minor', 'major'].includes(targetVersion)) {
  const parts = String(rootPkg.version || '1.0.0').split('.').map((p) => parseInt(p, 10) || 0);
  const major = parts[0] || 0;
  const minor = parts[1] || 0;
  const patch = parts[2] || 0;

  if (targetVersion === 'patch') targetVersion = `${major}.${minor}.${patch + 1}`;
  else if (targetVersion === 'minor') targetVersion = `${major}.${minor + 1}.0`;
  else if (targetVersion === 'major') targetVersion = `${major + 1}.0.0`;
}

// Clean any leading 'v' if supplied (e.g. v1.2.0 -> 1.2.0)
targetVersion = targetVersion.replace(/^v/, '');

if (!/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(targetVersion)) {
  console.error(`[sync-version] Invalid semantic version: "${targetVersion}"`);
  process.exit(1);
}

// 1. Root package.json
if (rootPkg.version !== targetVersion) {
  rootPkg.version = targetVersion;
  writeFileSync(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n', 'utf8');
}

// 2. Root package-lock.json
if (existsSync(rootLockPath)) {
  const rootLock = JSON.parse(readFileSync(rootLockPath, 'utf8'));
  rootLock.version = targetVersion;
  if (rootLock.packages && rootLock.packages['']) {
    rootLock.packages[''].version = targetVersion;
  }
  writeFileSync(rootLockPath, JSON.stringify(rootLock, null, 2) + '\n', 'utf8');
}

// 3. Client package.json
if (existsSync(clientPkgPath)) {
  const clientPkg = JSON.parse(readFileSync(clientPkgPath, 'utf8'));
  clientPkg.version = targetVersion;
  writeFileSync(clientPkgPath, JSON.stringify(clientPkg, null, 2) + '\n', 'utf8');
}

// 4. Client package-lock.json
if (existsSync(clientLockPath)) {
  const clientLock = JSON.parse(readFileSync(clientLockPath, 'utf8'));
  clientLock.version = targetVersion;
  if (clientLock.packages && clientLock.packages['']) {
    clientLock.packages[''].version = targetVersion;
  }
  writeFileSync(clientLockPath, JSON.stringify(clientLock, null, 2) + '\n', 'utf8');
}

// 5. THIRD_PARTY_NOTICES.txt
if (existsSync(noticesPath)) {
  const notices = readFileSync(noticesPath, 'utf8');
  const updatedNotices = notices.replace(/^Version\s+[0-9a-zA-Z.-]+/m, `Version ${targetVersion}`);
  writeFileSync(noticesPath, updatedNotices, 'utf8');
}

console.log(`[sync-version] Successfully synchronized version ${targetVersion} across all 5 project files.`);
