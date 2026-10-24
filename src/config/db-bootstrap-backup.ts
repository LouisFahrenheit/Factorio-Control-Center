import {
  existsSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  unlinkSync,
} from 'fs';
import { join, dirname } from 'path';

export interface DbBackupOptions {
  maxSnapshots?: number;
}

export function backupDbBeforeStartup(
  databasePath: string,
  currentVersion: string,
  options: DbBackupOptions = {},
): { createdSnapshot: boolean; createdRollingBak: boolean } {
  if (!existsSync(databasePath)) {
    return { createdSnapshot: false, createdRollingBak: false };
  }

  const maxSnapshots = options.maxSnapshots ?? 5;
  const dbDirectory = dirname(databasePath);
  const versionFile = join(dbDirectory, '.fcc_version');
  const rollingBak = `${databasePath}.bak`;

  let createdRollingBak = false;
  let createdSnapshot = false;

  // 1. Create rolling backup of the last known working state
  try {
    copyFileSync(databasePath, rollingBak);
    for (const ext of ['-wal', '-shm']) {
      const aux = `${databasePath}${ext}`;
      if (existsSync(aux)) {
        try {
          copyFileSync(aux, `${rollingBak}${ext}`);
        } catch {
          /* ignore */
        }
      }
    }
    createdRollingBak = true;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[Bootstrap] Warning: Could not create rolling backup: ${msg}`,
    );
  }

  // 2. Check if this is a version upgrade
  let previousVersion: string | null = null;
  if (existsSync(versionFile)) {
    try {
      previousVersion = readFileSync(versionFile, 'utf8').trim();
    } catch {
      /* ignore */
    }
  }

  if (previousVersion && previousVersion !== currentVersion) {
    const snapshotsDir = join(dbDirectory, 'snapshots');
    if (!existsSync(snapshotsDir)) {
      try {
        mkdirSync(snapshotsDir, { recursive: true });
      } catch {
        /* ignore */
      }
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, '-')
      .replace('T', '_');
    const snapshotName = `fcc_database_pre_v${previousVersion}_to_v${currentVersion}_${timestamp}.sqlite`;
    const snapshotPath = join(snapshotsDir, snapshotName);

    try {
      copyFileSync(databasePath, snapshotPath);
      for (const ext of ['-wal', '-shm']) {
        const aux = `${databasePath}${ext}`;
        if (existsSync(aux)) {
          try {
            copyFileSync(aux, `${snapshotPath}${ext}`);
          } catch {
            /* ignore */
          }
        }
      }
      console.log(
        `[Bootstrap] Created safety snapshot before upgrade from v${previousVersion} to v${currentVersion}: ${snapshotName}`,
      );
      createdSnapshot = true;

      // Clean up old snapshots (retain maxSnapshots most recent)
      const existing = readdirSync(snapshotsDir)
        .filter(
          (f) => f.startsWith('fcc_database_pre_') && f.endsWith('.sqlite'),
        )
        .sort();

      if (existing.length > maxSnapshots) {
        const toDelete = existing.slice(0, existing.length - maxSnapshots);
        for (const file of toDelete) {
          try {
            unlinkSync(join(snapshotsDir, file));
            for (const ext of ['-wal', '-shm']) {
              const aux = join(snapshotsDir, `${file}${ext}`);
              if (existsSync(aux)) unlinkSync(aux);
            }
          } catch {
            /* ignore */
          }
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(
        `[Bootstrap] Failed to create pre-upgrade safety snapshot: ${msg}`,
      );
    }
  }

  // Update or initialize version marker
  try {
    writeFileSync(versionFile, currentVersion, 'utf8');
  } catch {
    /* ignore */
  }

  return { createdSnapshot, createdRollingBak };
}
