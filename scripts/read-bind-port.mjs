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

function bool(v, d = false) {
  if (v === undefined || v === '') return d;
  return ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase());
}

function unixNonRootNoPrivilegedBind() {
  if (process.platform === 'win32') return false;
  const uid = process.getuid?.();
  return uid !== undefined && uid !== 0;
}

function resolveAutoPort(tls) {
  const hi = unixNonRootNoPrivilegedBind();
  if (tls) return hi ? 8443 : 443;
  return hi ? 8080 : 80;
}

function main() {
  if (!existsSync(iniPath)) {
    // Match FccConfigService defaults when fcc-settings.ini is missing (port_mode=auto).
    console.log(String(resolveAutoPort(false)));
    return;
  }
  const wp = parseIni(readFileSync(iniPath, 'utf-8')).web_panel || {};
  const mode = String(wp.port_mode || 'auto').toLowerCase();
  const tls = bool(wp.tls_enabled);
  if (mode === 'auto') {
    console.log(String(resolveAutoPort(tls)));
    return;
  }
  const n = parseInt(String(wp.listen_port || '80'), 10);
  console.log(String(Number.isFinite(n) && n >= 1 && n <= 65535 ? n : 80));
}

main();
