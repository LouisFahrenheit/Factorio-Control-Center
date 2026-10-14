import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { FileSystemController } from './filesystem.controller';

describe('FileSystemController', () => {
  let controller: FileSystemController;
  let tempDir: string;

  beforeEach(() => {
    controller = new FileSystemController();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fcc-fs-test-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup errors
    }
  });

  describe('dirs', () => {
    it('returns drives or root when path is empty', () => {
      const res = controller.dirs('') as {
        ok: boolean;
        items: Array<{ name: string; path: string; isDir: boolean }>;
      };
      expect(res.ok).toBe(true);
      expect(Array.isArray(res.items)).toBe(true);
      expect(res.items.length).toBeGreaterThan(0);
    });

    it('returns directory listing with child subfolders', () => {
      const subDir = path.join(tempDir, 'subfolder');
      fs.mkdirSync(subDir);
      fs.writeFileSync(path.join(tempDir, 'some-file.txt'), 'hello');

      const res = controller.dirs(tempDir) as {
        ok: boolean;
        current: string;
        items: Array<{ name: string; path: string; isDir: boolean }>;
      };

      expect(res.ok).toBe(true);
      expect(res.items.some((it) => it.name === 'subfolder')).toBe(true);
      // files should not be listed as directories
      expect(res.items.some((it) => it.name === 'some-file.txt')).toBe(false);
    });

    it('resolves closest existing parent if path does not exist directly', () => {
      const nonExistent = path.join(tempDir, 'does-not-exist', 'deep');
      const res = controller.dirs(nonExistent) as {
        ok: boolean;
        current: string;
      };
      expect(res.ok).toBe(true);
      expect(res.current).toBe(path.resolve(tempDir));
    });
  });

  describe('pathInfo', () => {
    it('returns path_required when path is empty or whitespace', () => {
      const res = controller.pathInfo('   ');
      expect(res).toEqual({ ok: false, error: 'path_required' });
    });

    it('returns accurate inspection for non-existing path', () => {
      const target = path.join(tempDir, 'missing');
      const res = controller.pathInfo(target);
      expect(res.ok).toBe(true);
      expect(res.exists).toBe(false);
      expect(res.is_dir).toBe(false);
      expect(res.is_empty).toBe(true);
      expect(res.is_factorio_server).toBe(false);
      expect(res.has_factorio_executable).toBe(false);
    });

    it('returns accurate inspection for existing directory', () => {
      const res = controller.pathInfo(tempDir);
      expect(res.ok).toBe(true);
      expect(res.exists).toBe(true);
      expect(res.is_dir).toBe(true);
      expect(res.is_empty).toBe(true);
      expect(res.is_factorio_server).toBe(false);
    });

    it('detects factorio server info.json structure', () => {
      const dataBaseDir = path.join(tempDir, 'data', 'base');
      fs.mkdirSync(dataBaseDir, { recursive: true });
      fs.writeFileSync(
        path.join(dataBaseDir, 'info.json'),
        JSON.stringify({ name: 'base', version: '2.0.0' }),
      );

      const res = controller.pathInfo(tempDir);
      expect(res.ok).toBe(true);
      expect(res.is_factorio_server).toBe(true);
      expect(res.is_empty).toBe(false);
    });
  });

  describe('mkdir', () => {
    it('validates invalid folder names', () => {
      expect(controller.mkdir({ path: tempDir, name: '' })).toEqual({
        ok: false,
        error: 'folder_name_invalid',
      });
      expect(controller.mkdir({ path: tempDir, name: '.' })).toEqual({
        ok: false,
        error: 'folder_name_invalid',
      });
      expect(controller.mkdir({ path: tempDir, name: '..' })).toEqual({
        ok: false,
        error: 'folder_name_invalid',
      });
      expect(controller.mkdir({ path: tempDir, name: 'bad/name' })).toEqual({
        ok: false,
        error: 'folder_name_invalid',
      });
      expect(controller.mkdir({ path: tempDir, name: 'bad\\name' })).toEqual({
        ok: false,
        error: 'folder_name_invalid',
      });
    });

    it('returns path_not_found if base path is non-existent', () => {
      const res = controller.mkdir({
        path: path.join(tempDir, 'no_such_dir', 'really_none'),
        name: 'test',
      });
      expect(res).toEqual({ ok: false, error: 'path_not_found' });
    });

    it('creates directory and fails on duplicates', () => {
      const created = controller.mkdir({ path: tempDir, name: 'new-folder' });
      const targetPath = path.join(tempDir, 'new-folder');
      expect(created).toEqual({
        ok: true,
        path: targetPath,
      });
      expect(fs.existsSync(targetPath)).toBe(true);

      const duplicate = controller.mkdir({
        path: tempDir,
        name: 'new-folder',
      });
      expect(duplicate).toEqual({ ok: false, error: 'folder_exists' });
    });
  });
});
