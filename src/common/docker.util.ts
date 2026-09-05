import { existsSync, readFileSync } from 'fs';

const IGNORE_MOUNT_PREFIXES = [
  '/proc',
  '/sys',
  '/dev',
  '/etc',
  '/run',
  '/tmp',
  '/var/lib/docker',
];

/**
 * Returns true if running inside a Docker container.
 */
export function isDockerContainer(): boolean {
  return existsSync('/.dockerenv');
}

/**
 * Parses /proc/mounts to find persistent mount points (volumes / bind mounts) attached to this container.
 */
export function getDockerVolumes(): string[] {
  if (process.platform !== 'linux') return [];
  if (!isDockerContainer()) return [];

  const volumes: string[] = [];
  try {
    const mounts = readFileSync('/proc/mounts', 'utf8');
    const lines = mounts.split('\n');
    for (const line of lines) {
      const parts = line.split(' ');
      if (parts.length >= 2) {
        const target = parts[1];
        if (!target || target === '/') continue;
        if (
          IGNORE_MOUNT_PREFIXES.some(
            (p) => target === p || target.startsWith(p + '/'),
          )
        ) {
          continue;
        }
        if (!volumes.includes(target) && existsSync(target)) {
          volumes.push(target);
        }
      }
    }
  } catch {
    // ignore error reading /proc/mounts
  }
  return volumes;
}

/**
 * Returns the best candidate volume for server data (prioritizing volumes named 'data' or 'server').
 */
export function getPrimaryDockerVolume(): string | null {
  const volumes = getDockerVolumes();
  if (volumes.length === 0) return null;
  const preferred = volumes.find(
    (v) =>
      v.toLowerCase().includes('data') || v.toLowerCase().includes('server'),
  );
  return preferred || volumes[0];
}
