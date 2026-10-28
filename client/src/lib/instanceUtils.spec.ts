import { describe, it, expect } from 'vitest';
import {
  formatUptime,
  formatInstanceGameVersion,
  findInstanceByServerPath,
  runningInstanceBlocked,
  instanceMaintenanceManualMode,
  isGamePortBusyByAnotherInstance,
  formatRamGb,
  syncInstancesDashboard,
} from './instanceUtils';
import type { InstanceItem } from '../types/instance';

describe('instanceUtils lib', () => {
  describe('formatUptime', () => {
    it('returns placeholder for null, undefined, or negative seconds', () => {
      expect(formatUptime(null, '-')).toBe('-');
      expect(formatUptime(undefined, 'N/A')).toBe('N/A');
      expect(formatUptime(-10, '—')).toBe('—');
    });

    it('formats seconds into days and hh:mm:ss without leading 0d when under 24h', () => {
      expect(formatUptime(0, '-')).toBe('00:00:00');
      expect(formatUptime(59, '-')).toBe('00:00:59');
      expect(formatUptime(3665, '-')).toBe('01:01:05');
      // 1 day = 86400 sec. 86400 + 7200 + 180 + 4 = 93784
      expect(formatUptime(93784, '-')).toBe('1:02:03:04');
    });
  });

  describe('formatInstanceGameVersion', () => {
    it('returns trimmed version or placeholder', () => {
      expect(formatInstanceGameVersion('2.0.15', '-')).toBe('2.0.15');
      expect(formatInstanceGameVersion('  1.1.110  ', '-')).toBe('1.1.110');
      expect(formatInstanceGameVersion('', 'unknown')).toBe('unknown');
      expect(formatInstanceGameVersion(undefined, '—')).toBe('—');
    });
  });

  describe('findInstanceByServerPath', () => {
    const rows = [
      { id: '1', serverPath: 'C:\\Factorio\\Server1' } as InstanceItem,
      { id: '2', serverPath: '/opt/factorio/server2' } as InstanceItem,
    ];

    it('matches path case-insensitively on Windows', () => {
      const found = findInstanceByServerPath(
        rows,
        'c:/factorio/server1/',
        'windows',
      );
      expect(found?.id).toBe('1');
    });

    it('respects excludeId', () => {
      const found = findInstanceByServerPath(
        rows,
        'C:\\Factorio\\Server1',
        'windows',
        '1',
      );
      expect(found).toBeUndefined();
    });

    it('matches case-sensitively on Linux', () => {
      const found = findInstanceByServerPath(
        rows,
        '/opt/factorio/server2',
        'linux',
      );
      expect(found?.id).toBe('2');

      const notFound = findInstanceByServerPath(
        rows,
        '/OPT/factorio/server2',
        'linux',
      );
      expect(notFound).toBeUndefined();
    });
  });

  describe('runningInstanceBlocked', () => {
    const inst = { id: '1' } as InstanceItem;

    it('returns true for running, starting, and stopping states', () => {
      expect(runningInstanceBlocked(inst, () => 'running')).toBe(true);
      expect(runningInstanceBlocked(inst, () => 'starting')).toBe(true);
      expect(runningInstanceBlocked(inst, () => 'stopping')).toBe(true);
    });

    it('returns false for stopped or error states', () => {
      expect(runningInstanceBlocked(inst, () => 'stopped')).toBe(false);
      expect(runningInstanceBlocked(inst, () => 'error')).toBe(false);
      expect(runningInstanceBlocked(inst, () => 'ready')).toBe(false);
    });
  });

  describe('instanceMaintenanceManualMode', () => {
    it('returns true when status is maintenance_manual or manual pending without lock', () => {
      const inst1 = { id: '1' } as InstanceItem;
      expect(instanceMaintenanceManualMode(inst1, () => 'maintenance_manual')).toBe(true);

      const inst2 = {
        id: '2',
        maintenanceManualPending: true,
        maintenanceLock: false,
      } as InstanceItem;
      expect(instanceMaintenanceManualMode(inst2, () => 'stopped')).toBe(true);
    });

    it('returns false otherwise', () => {
      const inst = {
        id: '3',
        maintenanceManualPending: false,
        maintenanceLock: false,
      } as InstanceItem;
      expect(instanceMaintenanceManualMode(inst, () => 'stopped')).toBe(false);
    });
  });

  describe('isGamePortBusyByAnotherInstance', () => {
    const rows = [
      { id: 'inst-1', port: '34197' } as InstanceItem,
      { id: 'inst-2', port: '34198' } as InstanceItem,
    ];

    it('returns true if another instance with the same port is running', () => {
      const busy = isGamePortBusyByAnotherInstance(
        rows,
        'inst-2',
        '34197',
        (it) => (it.id === 'inst-1' ? 'running' : 'stopped'),
      );
      expect(busy).toBe(true);
    });

    it('returns false if same port belongs to same instance or other instance is stopped', () => {
      const sameInst = isGamePortBusyByAnotherInstance(
        rows,
        'inst-1',
        '34197',
        () => 'running',
      );
      expect(sameInst).toBe(false);

      const otherStopped = isGamePortBusyByAnotherInstance(
        rows,
        'inst-2',
        '34197',
        () => 'stopped',
      );
      expect(otherStopped).toBe(false);
    });
  });

  describe('syncInstancesDashboard', () => {
    it('aggregates total, running, stopped and online counts', () => {
      const rows = [
        { id: '1', status: 'running', onlineCount: 5 } as InstanceItem,
        { id: '2', status: 'ready', onlineCount: 0 } as InstanceItem,
        { id: '3', status: 'running', onlineCount: 2 } as InstanceItem,
      ];

      const dashboard = syncInstancesDashboard(rows);
      expect(dashboard).toEqual({
        total: 3,
        running: 2,
        stopped: 1,
        online: 7,
      });
    });

    it('includes hostRam, hostCpu, and hostDisk when provided', () => {
      const rows = [{ id: '1', status: 'running', onlineCount: 1 } as InstanceItem];
      const hostMemory = {
        total: 16 * 1024 * 1024 * 1024,
        free: 8 * 1024 * 1024 * 1024,
        used: 8 * 1024 * 1024 * 1024,
      };
      const hostCpu = {
        percent: 42.5,
        cores: 8,
      };
      const hostDisk = {
        total: 500 * 1024 * 1024 * 1024,
        free: 350 * 1024 * 1024 * 1024,
        used: 150 * 1024 * 1024 * 1024,
      };
      const hostUptime = 123456;

      const dashboard = syncInstancesDashboard(
        rows,
        hostMemory,
        hostCpu,
        hostDisk,
        hostUptime,
      );
      expect(dashboard.hostRam).toEqual(hostMemory);
      expect(dashboard.hostCpu).toEqual(hostCpu);
      expect(dashboard.hostDisk).toEqual(hostDisk);
      expect(dashboard.hostUptime).toBe(123456);
    });
  });

  describe('formatRamGb', () => {
    it('formats bytes into gigabytes with 1 decimal place', () => {
      expect(formatRamGb(undefined)).toBe('0');
      expect(formatRamGb(-100)).toBe('0');
      expect(formatRamGb(0)).toBe('0');
      expect(formatRamGb(8 * 1024 * 1024 * 1024)).toBe('8.0');
      expect(formatRamGb(16.5 * 1024 * 1024 * 1024)).toBe('16.5');
    });
  });
});
