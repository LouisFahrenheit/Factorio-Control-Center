import { describe, it, expect } from 'vitest';
import {
  instanceSortDefaultAsc,
  filterInstanceRows,
  sortInstanceRows,
} from './instanceListUtils';
import type { InstanceItem } from '../types/instance';

describe('instanceListUtils', () => {
  const dummyT = (key: string) => key;
  const dummyStatus = (it: InstanceItem) => it.status || 'ready';

  describe('instanceSortDefaultAsc', () => {
    it('returns false for online, uptime, mods', () => {
      expect(instanceSortDefaultAsc('online')).toBe(false);
      expect(instanceSortDefaultAsc('uptime')).toBe(false);
      expect(instanceSortDefaultAsc('mods')).toBe(false);
    });

    it('returns true for name, port, rconPort, version, save, status', () => {
      expect(instanceSortDefaultAsc('name')).toBe(true);
      expect(instanceSortDefaultAsc('port')).toBe(true);
      expect(instanceSortDefaultAsc('rconPort')).toBe(true);
      expect(instanceSortDefaultAsc('version')).toBe(true);
      expect(instanceSortDefaultAsc('save')).toBe(true);
      expect(instanceSortDefaultAsc('status')).toBe(true);
    });
  });

  describe('filterInstanceRows', () => {
    const rows: InstanceItem[] = [
      { id: '1', name: 'Server A', activeSave: 'space_exploration.zip', port: 34197 },
      { id: '2', name: 'Server B', launchSave: 'vanilla_world.zip', port: 34198 },
      { id: '3', name: 'Server C', activeSave: 'deathworld.zip', port: 34199 },
    ];

    it('returns all rows when query is empty', () => {
      expect(filterInstanceRows(rows, '', dummyStatus, dummyT)).toEqual(rows);
      expect(filterInstanceRows(rows, '   ', dummyStatus, dummyT)).toEqual(rows);
    });

    it('filters by activeSave', () => {
      const res = filterInstanceRows(rows, 'space', dummyStatus, dummyT);
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('1');
    });

    it('filters by launchSave', () => {
      const res = filterInstanceRows(rows, 'vanilla', dummyStatus, dummyT);
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('2');
    });

    it('filters by name', () => {
      const res = filterInstanceRows(rows, 'Server C', dummyStatus, dummyT);
      expect(res).toHaveLength(1);
      expect(res[0].id).toBe('3');
    });

    it('filters by statusFilter', () => {
      const statusRows: InstanceItem[] = [
        { id: '1', name: 'Server A', status: 'running' },
        { id: '2', name: 'Server B', status: 'ready' },
        { id: '3', name: 'Server C', status: 'maintenance' },
      ];
      const getStatus = (it: InstanceItem) => String(it.status || 'ready');

      expect(filterInstanceRows(statusRows, '', getStatus, dummyT, 'running')).toHaveLength(1);
      expect(filterInstanceRows(statusRows, '', getStatus, dummyT, 'running')[0].id).toBe('1');
      expect(filterInstanceRows(statusRows, '', getStatus, dummyT, 'ready')).toHaveLength(1);
      expect(filterInstanceRows(statusRows, '', getStatus, dummyT, 'ready')[0].id).toBe('2');
      expect(filterInstanceRows(statusRows, '', getStatus, dummyT, 'maintenance')).toHaveLength(1);
      expect(filterInstanceRows(statusRows, '', getStatus, dummyT, 'maintenance')[0].id).toBe('3');
      expect(filterInstanceRows(statusRows, '', getStatus, dummyT, 'all')).toHaveLength(3);
    });
  });

  describe('sortInstanceRows with save column', () => {
    const rows: InstanceItem[] = [
      { id: '1', name: 'Alpha', activeSave: 'zeta_save.zip' },
      { id: '2', name: 'Beta', activeSave: 'alpha_save.zip' },
      { id: '3', name: 'Gamma', launchSave: 'middle_save.zip' },
    ];

    it('sorts ascending by save name', () => {
      const res = sortInstanceRows(rows, 'save', true, dummyStatus);
      expect(res.map((r) => r.id)).toEqual(['2', '3', '1']);
    });

    it('sorts descending by save name', () => {
      const res = sortInstanceRows(rows, 'save', false, dummyStatus);
      expect(res.map((r) => r.id)).toEqual(['1', '3', '2']);
    });
  });
});
