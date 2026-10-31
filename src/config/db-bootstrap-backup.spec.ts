import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { backupDbBeforeStartup } from './db-bootstrap-backup';

describe('backupDbBeforeStartup', () => {
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-db-backup-test-'));
    dbPath = path.join(tempDir, 'fcc_database.sqlite');
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('should return false if database file does not exist', () => {
    const result = backupDbBeforeStartup(dbPath, '1.2.1');
    expect(result.createdRollingBak).toBe(false);
    expect(result.createdSnapshot).toBe(false);
  });

  it('should create rolling backup and version marker on first startup', () => {
    fs.writeFileSync(dbPath, 'db-content');

    const result = backupDbBeforeStartup(dbPath, '1.2.1');
    expect(result.createdRollingBak).toBe(true);
    expect(result.createdSnapshot).toBe(false);

    expect(fs.existsSync(`${dbPath}.bak`)).toBe(true);
    expect(fs.readFileSync(`${dbPath}.bak`, 'utf8')).toBe('db-content');

    const versionFile = path.join(tempDir, '.fcc_version');
    expect(fs.existsSync(versionFile)).toBe(true);
    expect(fs.readFileSync(versionFile, 'utf8')).toBe('1.2.1');
  });

  it('should not create upgrade snapshot when version is identical', () => {
    fs.writeFileSync(dbPath, 'db-content');
    fs.writeFileSync(path.join(tempDir, '.fcc_version'), '1.2.1');

    const result = backupDbBeforeStartup(dbPath, '1.2.1');
    expect(result.createdRollingBak).toBe(true);
    expect(result.createdSnapshot).toBe(false);

    const snapshotsDir = path.join(tempDir, 'snapshots');
    expect(fs.existsSync(snapshotsDir)).toBe(false);
  });

  it('should create pre-upgrade safety snapshot when version changes', () => {
    fs.writeFileSync(dbPath, 'v1.2.1-content');
    fs.writeFileSync(path.join(tempDir, '.fcc_version'), '1.2.1');

    const result = backupDbBeforeStartup(dbPath, '1.3.0');
    expect(result.createdRollingBak).toBe(true);
    expect(result.createdSnapshot).toBe(true);

    const snapshotsDir = path.join(tempDir, 'snapshots');
    expect(fs.existsSync(snapshotsDir)).toBe(true);

    const files = fs.readdirSync(snapshotsDir);
    expect(files.length).toBe(1);
    expect(files[0]).toContain('fcc_database_pre_v1.2.1_to_v1.3.0');
    expect(fs.readFileSync(path.join(snapshotsDir, files[0]), 'utf8')).toBe(
      'v1.2.1-content',
    );

    // Verify .fcc_version updated to 1.3.0
    expect(fs.readFileSync(path.join(tempDir, '.fcc_version'), 'utf8')).toBe(
      '1.3.0',
    );
  });

  it('should copy wal and shm files when present', () => {
    fs.writeFileSync(dbPath, 'main-db');
    fs.writeFileSync(`${dbPath}-wal`, 'wal-content');
    fs.writeFileSync(`${dbPath}-shm`, 'shm-content');
    fs.writeFileSync(path.join(tempDir, '.fcc_version'), '1.0.0');

    const result = backupDbBeforeStartup(dbPath, '1.1.0');
    expect(result.createdSnapshot).toBe(true);

    expect(fs.existsSync(`${dbPath}.bak-wal`)).toBe(true);
    expect(fs.existsSync(`${dbPath}.bak-shm`)).toBe(true);

    const snapshotsDir = path.join(tempDir, 'snapshots');
    const files = fs.readdirSync(snapshotsDir);
    const walSnapshot = files.find((f) => f.endsWith('.sqlite-wal'));
    expect(walSnapshot).toBeDefined();
  });

  it('should prune old snapshots exceeding maxSnapshots limit', () => {
    fs.writeFileSync(dbPath, 'db-content');
    const snapshotsDir = path.join(tempDir, 'snapshots');
    fs.mkdirSync(snapshotsDir, { recursive: true });

    // Pre-create 3 older snapshots
    fs.writeFileSync(
      path.join(
        snapshotsDir,
        'fcc_database_pre_v0.1_to_v0.2_2026-01-01.sqlite',
      ),
      'old-1',
    );
    fs.writeFileSync(
      path.join(
        snapshotsDir,
        'fcc_database_pre_v0.2_to_v0.3_2026-01-02.sqlite',
      ),
      'old-2',
    );
    fs.writeFileSync(
      path.join(
        snapshotsDir,
        'fcc_database_pre_v0.3_to_v0.4_2026-01-03.sqlite',
      ),
      'old-3',
    );
    fs.writeFileSync(path.join(tempDir, '.fcc_version'), '0.4');

    // Run with maxSnapshots = 2
    backupDbBeforeStartup(dbPath, '0.5', { maxSnapshots: 2 });

    const remaining = fs
      .readdirSync(snapshotsDir)
      .filter((f) => f.endsWith('.sqlite'));
    expect(remaining.length).toBe(2);
    // Oldest snapshot should be pruned
    expect(remaining).not.toContain(
      'fcc_database_pre_v0.1_to_v0.2_2026-01-01.sqlite',
    );
  });
});
