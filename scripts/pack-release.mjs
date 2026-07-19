#!/usr/bin/env node
/**
 * Build production bundle and platform release archives.
 * Run from project:  npm run pack:release
 * Output:
 *   release/factorio-control-center-win.zip
 *   release/factorio-control-center-linux.tar.gz
 */
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { execFileSync, execSync } from 'child_process';

const nestRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clientRoot = join(nestRoot, 'client');
const stagingRoot = join(nestRoot, '.release-staging');

function readConstantsFile() {
  return join(nestRoot, 'src/constants/fcc.constants.ts');
}

function readVersion() {
  const pkg = JSON.parse(readFileSync(join(nestRoot, 'package.json'), 'utf8'));
  return String(pkg.version || '0.0.0');
}

function formatReleaseBuildId(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}.` +
    `${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}`
  );
}

function readBuildNumber(constantsPath) {
  const src = readFileSync(constantsPath, 'utf8');
  const m = /export const APP_BUILD_NUMBER\s*=\s*(\d+)\s*;/.exec(src);
  return m ? parseInt(m[1], 10) : 0;
}

function writeBuildNumber(constantsPath, n) {
  const src = readFileSync(constantsPath, 'utf8');
  const next = src.replace(
    /export const APP_BUILD_NUMBER\s*=\s*\d+\s*;/,
    `export const APP_BUILD_NUMBER = ${n};`,
  );
  if (next === src) {
    throw new Error('APP_BUILD_NUMBER constant not found in fcc.constants.ts');
  }
  writeFileSync(constantsPath, next, 'utf8');
}

function stampReleaseBuild(constantsPath, buildId) {
  const src = readFileSync(constantsPath, 'utf8');
  const next = src.replace(
    /export const APP_BUILD\s*=\s*['"][^'"]*['"]\s*;/,
    `export const APP_BUILD = '${buildId}';`,
  );
  if (next === src) {
    throw new Error('APP_BUILD constant not found in fcc.constants.ts');
  }
  writeFileSync(constantsPath, next, 'utf8');
}

function resetDevBuildStamp(constantsPath) {
  const src = readFileSync(constantsPath, 'utf8');
  const next = src.replace(/export const APP_BUILD\s*=\s*['"][^'"]*['"]\s*;/, `export const APP_BUILD = 'dev';`);
  if (next === src) {
    throw new Error('APP_BUILD constant not found in fcc.constants.ts');
  }
  writeFileSync(constantsPath, next, 'utf8');
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function isBusyError(error) {
  const parts = [
    error?.message,
    error?.stderr,
    error?.stdout,
    ...(Array.isArray(error?.output) ? error.output : []),
    typeof error === 'string' ? error : '',
  ];
  const msg = parts.filter(Boolean).join('\n').toLowerCase();
  return (
    msg.includes('ebusy') ||
    msg.includes('eperm') ||
    msg.includes('resource busy') ||
    msg.includes('locked') ||
    msg.includes('operation not permitted') ||
    msg.includes('errno -4082')
  );
}

function tryClearNodeModules(cwd) {
  const nodeModules = join(cwd, 'node_modules');
  if (!existsSync(nodeModules)) return;
  try {
    rmSync(nodeModules, { recursive: true, force: true, maxRetries: 8, retryDelay: 500 });
  } catch {
    // Best effort — npm ci will surface any remaining lock.
  }
}

function run(cmd, cwd, opts = {}) {
  const retries = Number(opts.retries || 0);
  const retryBusy = opts.retryBusy === true;
  let attempt = 0;
  let delayMs = 800;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    attempt += 1;
    console.log(`> ${cmd}`);
    try {
      const stderr = execSync(cmd, {
        cwd,
        stdio: ['inherit', 'inherit', 'pipe'],
        encoding: 'utf8',
        env: process.env,
      });
      if (stderr) process.stderr.write(stderr);
      return;
    } catch (error) {
      if (error?.stderr) process.stderr.write(error.stderr);
      if (attempt > retries || !retryBusy || !isBusyError(error)) throw error;
      console.warn(
        `Busy/locked files detected (${attempt}/${retries}) while running "${cmd}". Retrying in ${delayMs}ms…`,
      );
      if (/^npm\s+ci\b/.test(cmd) && process.platform === 'win32') {
        tryClearNodeModules(cwd);
      }
      sleep(delayMs);
      delayMs = Math.min(delayMs * 2, 5000);
    }
  }
}

/** npm ci in a dev tree; on Windows fall back to npm install when node_modules is locked. */
function ensureDependencies(cwd, label) {
  try {
    run('npm ci', cwd, { retries: 6, retryBusy: true });
  } catch (error) {
    if (process.platform !== 'win32' || !isBusyError(error)) throw error;
    console.warn(
      `\n${label}: npm ci could not replace node_modules (files locked). Falling back to npm install…\n`,
    );
    run('npm install', cwd, { retries: 4, retryBusy: true });
  }
}

function copyIfExists(src, dest) {
  if (!existsSync(src)) return false;
  cpSync(src, dest, { recursive: true });
  return true;
}

/** Zip via system tar (-a). Windows 10+. */
function zipDir(sourceDir, zipPath) {
  const parent = dirname(sourceDir);
  const base = basename(sourceDir);
  rmSync(zipPath, { force: true });
  execFileSync('tar', ['-a', '-cf', zipPath, '-C', parent, base], {
    stdio: 'inherit',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
}

/** gzip tar for Linux releases (unpack: tar -xzf …). */
function tarGzDir(sourceDir, tarPath) {
  const parent = dirname(sourceDir);
  const base = basename(sourceDir);
  rmSync(tarPath, { force: true });
  execFileSync('tar', ['-czf', tarPath, '-C', parent, base], {
    stdio: 'inherit',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
}

function assertReleaseArtifacts() {
  const required = [
    [join(nestRoot, 'dist/main.js'), 'dist/main.js'],
    [join(clientRoot, 'dist/index.html'), 'client/dist/index.html'],
  ];
  const missing = required.filter(([path]) => !existsSync(path)).map(([, label]) => label);
  if (missing.length) {
    throw new Error(`Release build incomplete after build:all: ${missing.join(', ')} missing`);
  }
}

function copyNssmForWindows(destNest) {
  const src = join(nestRoot, 'scripts', 'nssm', 'nssm.exe');
  const dest = join(destNest, 'scripts', 'nssm', 'nssm.exe');
  if (!existsSync(src)) {
    throw new Error('scripts/nssm/nssm.exe missing (required for Windows release)');
  }
  mkdirSync(join(destNest, 'scripts', 'nssm'), { recursive: true });
  cpSync(src, dest);
}

function stageAppTree(destNest) {
  mkdirSync(destNest, { recursive: true });
  for (const dir of ['dist', 'public', 'locale']) {
    copyIfExists(join(nestRoot, dir), join(destNest, dir));
  }
  mkdirSync(join(destNest, 'client'), { recursive: true });
  copyIfExists(join(clientRoot, 'dist'), join(destNest, 'client/dist'));
  mkdirSync(join(destNest, 'scripts'), { recursive: true });
  for (const file of [
    'load-bind-port.bat',
    'read-bind-port.mjs',
    'read-app-version.mjs',
    'read-panel-log.mjs',
    'check-update.mjs',
    'run-prod-service.bat',
    'run-prod-service.sh',
    'install-service.bat',
    'install-service.sh',
    'linux-systemd.sh',
    'stop-panel.bat',
    'stop-panel.sh',
    'update-panel.bat',
    'update-panel.sh',
    'show-logs.bat',
    'show-logs.sh',
    'panel-status.bat',
    'panel-status.sh',
  ]) {
    copyIfExists(join(nestRoot, 'scripts', file), join(destNest, 'scripts', file));
  }
  for (const file of ['package.json', 'package-lock.json', 'LICENSE', 'THIRD_PARTY_NOTICES.txt', 'README.md', 'README.ru.md']) {
    copyIfExists(join(nestRoot, file), join(destNest, file));
  }
}

const version = readVersion();
const releaseBuildId = formatReleaseBuildId();
const constantsPath = readConstantsFile();
const buildNumber = readBuildNumber(constantsPath) + 1;
const bundleName = 'factorio-control-center';
const sharedNest = join(stagingRoot, '_shared', 'factorio-control-center');
const winBundleDir = join(stagingRoot, 'win', bundleName);
const linuxBundleDir = join(stagingRoot, 'linux', bundleName);

console.log(
  `\nFactorio Control Center release pack v${version} (build #${buildNumber} ${releaseBuildId})\n`,
);

writeBuildNumber(constantsPath, buildNumber);
stampReleaseBuild(constantsPath, releaseBuildId);
try {
  ensureDependencies(nestRoot, 'Server');
  ensureDependencies(clientRoot, 'Client');
  run('npm run build:all', nestRoot);
  assertReleaseArtifacts();
} finally {
  resetDevBuildStamp(constantsPath);
}

rmSync(stagingRoot, { recursive: true, force: true });
run('npm run notices', nestRoot);
stageAppTree(sharedNest);

console.log('\nInstalling production dependencies into staging…');
run('npm ci --omit=dev', sharedNest);

function copyBundle(targetDir, launcher, { omitNodeModules = false } = {}) {
  rmSync(targetDir, { recursive: true, force: true });
  // Dereference symlinks (npm .bin on Linux) so Windows archives do not contain
  // absolute paths like /home/runner/work/... that extractors reject.
  cpSync(sharedNest, targetDir, { recursive: true, dereference: true });
  if (omitNodeModules) {
    rmSync(join(targetDir, 'node_modules'), { recursive: true, force: true });
  }
  const launcherSrc = join(nestRoot, launcher);
  if (!copyIfExists(launcherSrc, join(targetDir, launcher))) {
    throw new Error(`Launcher not found: ${launcherSrc}`);
  }
}

// CI builds on Linux: omit Linux node_modules; Start.bat runs npm ci --omit=dev on Windows.
copyBundle(winBundleDir, 'Start.bat', { omitNodeModules: process.platform !== 'win32' });
copyNssmForWindows(winBundleDir);
copyBundle(linuxBundleDir, 'Start.sh');

for (const rel of [
  'Start.sh',
  'scripts/run-prod-service.sh',
  'scripts/install-service.sh',
  'scripts/stop-panel.sh',
  'scripts/update-panel.sh',
  'scripts/show-logs.sh',
  'scripts/panel-status.sh',
]) {
  const p = join(linuxBundleDir, rel);
  if (existsSync(p)) chmodSync(p, 0o755);
}

const releaseDir = join(nestRoot, 'release');
mkdirSync(releaseDir, { recursive: true });
const zipPath = join(releaseDir, 'factorio-control-center-win.zip');
const tarPath = join(releaseDir, 'factorio-control-center-linux.tar.gz');

console.log(`\nCreating ${zipPath} …`);
zipDir(winBundleDir, zipPath);

console.log(`\nCreating ${tarPath} …`);
tarGzDir(linuxBundleDir, tarPath);

rmSync(stagingRoot, { recursive: true, force: true });

console.log(`\nDone:`);
console.log(`  Windows: ${zipPath}`);
console.log(`  Linux:   ${tarPath}`);
console.log('\nEach archive: factorio-control-center/ with Start.bat / Start.sh, dist, client/dist, public, locale');
console.log('Linux archive includes prod node_modules; Windows archive omits node_modules when packed on Linux (npm ci on first Start.bat).');
console.log('Not included: data/, fcc-settings.ini, src/, dev node_modules — created on first run.\n');
