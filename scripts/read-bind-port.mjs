/**
 * Prints the TCP bind port from fcc-settings.ini (same rules as WebPanelListenerService).
 * Usage: node scripts/read-bind-port.mjs
 */
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const scriptRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const root = process.env.FCC_ROOT_DIR?.trim() || scriptRoot;
const iniPath = process.env.FCC_SETTINGS_PATH?.trim() || join(root, 'fcc-settings.ini');

function parseIni(text) {
  const sections = {};
  let section = '';
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const sec = /^\[(.+)\]$/.exec(line);
    if (sec) {
      section = sec[1].trim().toLowerCase();
      sections[section] = sections[section] || {};
      continue;
    }
    const kv = /^([^=]+)=(.*)$/.exec(line);
    if (!kv || !section) continue;
    sections[section][kv[1].trim().toLowerCase()] = kv[2].trim();
  }
  return sections;
}

function parseEnv(text) {
  const env = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const kv = /^([^=]+)=(.*)$/.exec(line);
    if (!kv) continue;
    env[kv[1].trim()] = kv[2].trim();
  }
  return env;
}

function bool(v, d = false) {
  if (v === undefined || v === '') return d;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function resolveAutoPort(tls) {
  if (tls) return 8443;
  return 8080;
}

function main() {
  // 1. Check .env first (as it overrides DB/INI settings)
  const envPath = join(root, '.env');
  if (existsSync(envPath)) {
    const env = parseEnv(readFileSync(envPath, 'utf-8'));
    if (env.PORT && env.PORT.trim()) {
      const n = parseInt(env.PORT.trim(), 10);
      if (Number.isFinite(n) && n >= 1 && n <= 65535) {
        console.log(String(n));
        return;
      }
    }
  }

  // 2. Fall back to fcc-settings.ini (legacy/DB migration)
  if (existsSync(iniPath)) {
    const wp = parseIni(readFileSync(iniPath, 'utf-8')).web_panel || {};
    const n = parseInt(String(wp.listen_port || '8080'), 10);
    if (Number.isFinite(n) && n >= 1 && n <= 65535) {
      console.log(String(n));
      return;
    }
  }

  console.log('8080');
}

main();
