import { existsSync, rmSync } from 'fs';
import { join } from 'path';
import { PathsService } from './paths.service';

describe('PathsService', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses default paths relative to process.cwd() when env vars are unset', () => {
    delete process.env.FCC_ROOT_DIR;
    delete process.env.FCC_DATA_DIR;
    delete process.env.FCC_LOCALE_DIR;
    delete process.env.FCC_PUBLIC_DIR;
    delete process.env.FCC_LOGS_DIR;

    const paths = new PathsService();
    const cwd = process.cwd();

    expect(paths.rootDir).toBe(cwd);
    expect(paths.envFilePath).toBe(join(cwd, '.env'));
    expect(paths.dataDir).toBe(join(cwd, 'data'));
    expect(paths.dbDir).toBe(join(cwd, 'data', 'db'));
    expect(paths.storageDir).toBe(join(cwd, 'data', 'storage'));
    expect(paths.securityDir).toBe(join(cwd, 'data', 'security'));
    expect(paths.backupsDir).toBe(join(cwd, 'data', 'backups'));
    expect(paths.instanceLogsDir).toBe(join(cwd, 'data', 'logs', 'instances'));
    expect(paths.databasePath).toBe(
      join(cwd, 'data', 'db', 'fcc_database.sqlite'),
    );
    expect(paths.metricsDatabasePath).toBe(
      join(cwd, 'data', 'db', 'fcc_metrics.sqlite'),
    );
  });

  it('respects FCC_ROOT_DIR and other environment overrides', () => {
    const testDir = join(process.cwd(), 'node_modules', '.tmp', 'test-paths');
    process.env.FCC_ROOT_DIR = testDir;
    process.env.FCC_DATA_DIR = join(testDir, 'custom-data');
    process.env.FCC_LOGS_DIR = join(testDir, 'custom-logs');

    const paths = new PathsService();

    expect(paths.rootDir).toBe(testDir);
    expect(paths.dataDir).toBe(join(testDir, 'custom-data'));
    expect(paths.logsDir).toBe(join(testDir, 'custom-logs'));
    expect(paths.dbDir).toBe(join(testDir, 'custom-data', 'db'));
    expect(existsSync(paths.dataDir)).toBe(true);

    try {
      rmSync(testDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup error
    }
  });

  it('returns formatted helper paths for instances and logs', () => {
    delete process.env.FCC_ROOT_DIR;
    delete process.env.FCC_DATA_DIR;
    delete process.env.FCC_LOGS_DIR;

    const paths = new PathsService();

    expect(paths.instanceLogPath('srv-1')).toBe(
      join(paths.instanceLogsDir, 'srv-1', 'server.log'),
    );
    expect(paths.webPanelLogPath()).toBe(join(paths.logsDir, 'web_panel.log'));
    expect(paths.maintenanceSchedulerLogPath()).toBe(
      join(paths.logsDir, 'maintenance_scheduler.log'),
    );
    expect(paths.auditLogPath()).toBe(join(paths.logsDir, 'audit.log'));
    expect(paths.announcementsPath('srv-1')).toBe(
      join(paths.announcementsDir, 'srv-1.json'),
    );
  });
});
