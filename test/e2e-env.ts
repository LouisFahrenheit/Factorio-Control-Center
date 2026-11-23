import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const prevDataDir = process.env.FCC_DATA_DIR;
const prevLogsDir = process.env.FCC_LOGS_DIR;

export const e2eTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-e2e-'));
process.env.FCC_DATA_DIR = path.join(e2eTempDir, 'data');
process.env.FCC_LOGS_DIR = path.join(e2eTempDir, 'logs');

export function cleanupE2eEnv(): void {
  if (prevDataDir === undefined) delete process.env.FCC_DATA_DIR;
  else process.env.FCC_DATA_DIR = prevDataDir;

  if (prevLogsDir === undefined) delete process.env.FCC_LOGS_DIR;
  else process.env.FCC_LOGS_DIR = prevLogsDir;

  try {
    fs.rmSync(e2eTempDir, { recursive: true, force: true });
  } catch {
    /* ignore Windows SQLite WAL handle release delay */
  }
}
