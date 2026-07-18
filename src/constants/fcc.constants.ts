import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import type { FccTab } from '../shared/fcc-tabs';

export {
  ALL_TABS,
  ENGINEER_TABS,
  MODERATOR_TABS,
  type FccTab,
} from '../shared/fcc-tabs';

function readAppVersion(): string {
  const rootDir = process.env.FCC_ROOT_DIR?.trim() || process.cwd();
  const pkgPath = join(rootDir, 'package.json');
  if (!existsSync(pkgPath)) return '0.0.0';
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
      version?: string;
    };
    return pkg.version ? String(pkg.version) : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const THEMES = [
  'fcc_classic',
  'dark_space',
  'vulcanus',
  'ion_storm',
  'cryogenics',
] as const;

export type FccTheme = (typeof THEMES)[number];

export const APP_NAME = 'Factorio Control Center';

export const APP_VERSION = readAppVersion();

/** Incremented by `npm run pack:release` (never decremented). */
export const APP_BUILD_NUMBER = 60;

/** Overwritten by `npm run pack:release`; `dev` uses git short SHA when available. */
export const APP_BUILD = 'dev';

/** Paths allowed when the user has any of the listed tabs. */
export const ENDPOINT_TAB_ANY: Record<string, FccTab[]> = {
  '/api/players/summary': ['players', 'history'],
};

export const ENDPOINT_TAB_MAP: Record<string, FccTab> = {
  '/api/server/': 'control',
  '/api/config/server': 'control',
  '/api/config/program': 'control',
  '/api/config/web-tls/': 'control',
  '/api/factorio/update': 'control',
  '/api/maintenance': 'maintenance',
  '/api/logs': 'control',
  '/api/logs/history': 'control',
  '/api/files/server-settings': 'serverSettings',
  '/api/saves': 'control',
  '/api/files/mod-list': 'mods',
  '/api/mods': 'mods',
  '/api/mod-settings/': 'mods',
  '/api/modpacks': 'modpacks',
  '/api/commands/catalog': 'commands',
  '/api/rcon': 'commands',
  '/api/players/': 'players',
  '/api/chat-log': 'players',
  '/api/chat/send': 'players',
  '/api/chat/send-announcement': 'players',
  '/api/announcements': 'players',
  '/api/files/admin-list': 'players',
  '/api/files/ban-list': 'players',
  '/api/bans/': 'players',
  '/api/moderation/': 'players',
  '/api/whitelist/': 'players',
};
