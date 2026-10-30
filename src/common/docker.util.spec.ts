import * as fs from 'fs';
import {
  isDockerContainer,
  getDockerVolumes,
  getPrimaryDockerVolume,
} from './docker.util';

jest.mock('fs', () => ({
  ...jest.requireActual<Record<string, unknown>>('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
}));

describe('docker.util', () => {
  const originalPlatform = process.platform;
  const mockExistsSync = fs.existsSync as unknown as jest.Mock;
  const mockReadFileSync = fs.readFileSync as unknown as jest.Mock;

  afterEach(() => {
    Object.defineProperty(process, 'platform', {
      value: originalPlatform,
    });
    jest.clearAllMocks();
  });

  describe('isDockerContainer', () => {
    it('returns true when /.dockerenv exists', () => {
      mockExistsSync.mockReturnValue(true);
      expect(isDockerContainer()).toBe(true);
      expect(mockExistsSync).toHaveBeenCalledWith('/.dockerenv');
    });

    it('returns false when /.dockerenv does not exist', () => {
      mockExistsSync.mockReturnValue(false);
      expect(isDockerContainer()).toBe(false);
    });
  });

  describe('getDockerVolumes', () => {
    it('returns empty array when platform is not linux', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      mockExistsSync.mockReturnValue(true);

      expect(getDockerVolumes()).toEqual([]);
    });

    it('returns empty array when not in docker container', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockExistsSync.mockReturnValue(false);

      expect(getDockerVolumes()).toEqual([]);
    });

    it('parses /proc/mounts and filters out system mount prefixes', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockExistsSync.mockImplementation((p: unknown) => {
        const pathStr = String(p);
        if (pathStr === '/.dockerenv') return true;
        if (pathStr === '/factorio/data') return true;
        if (pathStr === '/opt/factorio/saves') return true;
        return false;
      });

      const mockMounts = [
        'overlay / overlay rw,relatime 0 0',
        'proc /proc proc rw,nosuid,nodev,noexec,relatime 0 0',
        'sysfs /sys sysfs rw,nosuid,nodev,noexec,relatime 0 0',
        'tmpfs /dev tmpfs rw,nosuid,size=65536k 0 0',
        '/dev/sda1 /factorio/data ext4 rw,relatime 0 0',
        '/dev/sda2 /opt/factorio/saves ext4 rw,relatime 0 0',
        '/dev/sda3 /var/lib/docker/overlay2 ext4 rw 0 0',
        '/dev/sda4 /nonexistent/dir ext4 rw 0 0',
      ].join('\n');

      mockReadFileSync.mockReturnValue(mockMounts);

      const volumes = getDockerVolumes();
      expect(volumes).toEqual(['/factorio/data', '/opt/factorio/saves']);
    });

    it('handles readFileSync throwing an error', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockExistsSync.mockImplementation((p: unknown) => {
        return String(p) === '/.dockerenv';
      });
      mockReadFileSync.mockImplementation(() => {
        throw new Error('EACCES: permission denied');
      });

      expect(getDockerVolumes()).toEqual([]);
    });
  });

  describe('getPrimaryDockerVolume', () => {
    it('returns null when there are no volumes', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      expect(getPrimaryDockerVolume()).toBeNull();
    });

    it('prioritizes volume containing "data" or "server"', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockExistsSync.mockReturnValue(true);

      const mockMounts = [
        '/dev/sda1 /opt/configs ext4 rw 0 0',
        '/dev/sda2 /factorio/server-storage ext4 rw 0 0',
        '/dev/sda3 /factorio/general ext4 rw 0 0',
      ].join('\n');
      mockReadFileSync.mockReturnValue(mockMounts);

      expect(getPrimaryDockerVolume()).toBe('/factorio/server-storage');
    });

    it('falls back to first volume if neither data nor server in name', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      mockExistsSync.mockReturnValue(true);

      const mockMounts = [
        '/dev/sda1 /mnt/volumeA ext4 rw 0 0',
        '/dev/sda2 /mnt/volumeB ext4 rw 0 0',
      ].join('\n');
      mockReadFileSync.mockReturnValue(mockMounts);

      expect(getPrimaryDockerVolume()).toBe('/mnt/volumeA');
    });
  });
});
