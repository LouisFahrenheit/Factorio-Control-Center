import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { resetServerModsDir } from '../ops/mod-deps';
import {
  ensureServerSettingsFile,
  type EnsureServerSettingsOptions,
} from '../ops/ops-utils';

export type InitializeInstanceServerMode = 'if_needed' | 'bootstrap';

export interface InitializeInstanceServerPartResult {
  attempted: boolean;
  ok: boolean;
  error?: string;
}

export interface InitializeInstanceServerResult {
  serverSettings: InitializeInstanceServerPartResult;
  mods: InitializeInstanceServerPartResult;
}

/** True when mods/ is missing or contains no entries. */
export function isModsDirEmpty(serverPath: string): boolean {
  const modsDir = join(serverPath, 'mods');
  if (!existsSync(modsDir)) return true;
  try {
    return readdirSync(modsDir).length === 0;
  } catch {
    return true;
  }
}

/**
 * Prepare server-settings.json and default mod-list after instance creation.
 * - if_needed: settings when missing; mods when mods/ is missing or empty
 * - bootstrap: always recreate settings and reset mods (fresh Factorio package)
 */
export function initializeInstanceServerFiles(
  serverPath: string,
  settingsOpts?: EnsureServerSettingsOptions,
  mode: InitializeInstanceServerMode = 'if_needed',
): InitializeInstanceServerResult {
  const root = String(serverPath || '').trim();
  const idle: InitializeInstanceServerPartResult = {
    attempted: false,
    ok: true,
  };
  if (!root) {
    return {
      serverSettings: {
        attempted: false,
        ok: false,
        error: 'invalid_server_path',
      },
      mods: idle,
    };
  }

  const result: InitializeInstanceServerResult = {
    serverSettings: { ...idle },
    mods: { ...idle },
  };

  const settingsPath = join(root, 'server-settings.json');
  const shouldInitSettings = mode === 'bootstrap' || !existsSync(settingsPath);
  if (shouldInitSettings) {
    result.serverSettings.attempted = true;
    try {
      const ensured = ensureServerSettingsFile(
        root,
        settingsOpts,
        mode === 'bootstrap',
      );
      result.serverSettings.ok = ensured.ok;
      if (!ensured.ok) result.serverSettings.error = 'missing_server_settings';
    } catch (e) {
      result.serverSettings.ok = false;
      result.serverSettings.error = e instanceof Error ? e.message : String(e);
    }
  }

  const shouldInitMods = mode === 'bootstrap' || isModsDirEmpty(root);
  if (shouldInitMods) {
    result.mods.attempted = true;
    try {
      resetServerModsDir(root);
      result.mods.ok = true;
    } catch (e) {
      result.mods.ok = false;
      result.mods.error = e instanceof Error ? e.message : String(e);
    }
  }

  return result;
}
