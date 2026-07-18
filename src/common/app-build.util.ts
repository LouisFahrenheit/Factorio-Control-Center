import { execSync } from 'child_process';
import { APP_BUILD, APP_BUILD_NUMBER } from '../constants/fcc.constants';

function tryGitBuildId(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (!sha) return '';
    let dirty = false;
    try {
      dirty = !!execSync('git status --porcelain', {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch {
      /* ignore */
    }
    return dirty ? `${sha}+` : sha;
  } catch {
    return '';
  }
}

function formatBuildDisplay(number: number, stamp: string): string {
  const n = Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
  const id = String(stamp || '').trim();
  if (n > 0 && id) return `${n} · ${id}`;
  if (n > 0) return String(n);
  return id || 'dev';
}

/** Unique build label: sequential number + stamp (release) or number + git SHA (dev). */
export function resolveAppBuild(): string {
  const number = Number(APP_BUILD_NUMBER) || 0;
  const baked = String(APP_BUILD || '').trim();
  if (baked && baked !== 'dev') {
    return formatBuildDisplay(number, baked);
  }
  const git = tryGitBuildId();
  if (git) return formatBuildDisplay(number, git);
  return formatBuildDisplay(number, 'dev');
}
