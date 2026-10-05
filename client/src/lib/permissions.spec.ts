import { describe, it, expect } from 'vitest';
import {
  isAdmin,
  userHasTab,
  canEditServerAdminList,
  allowedPanelTabs,
} from './permissions';
import type { AuthUser } from '../types/instance';

describe('permissions lib', () => {
  describe('isAdmin', () => {
    it('should return true if user role is administrator', () => {
      const user = { role: 'administrator' } as AuthUser;
      expect(isAdmin(user)).toBe(true);
    });

    it('should return false for moderator or viewer or null', () => {
      expect(isAdmin({ role: 'moderator' } as AuthUser)).toBe(false);
      expect(isAdmin({ role: 'viewer' } as AuthUser)).toBe(false);
      expect(isAdmin(null)).toBe(false);
      expect(isAdmin(undefined)).toBe(false);
    });
  });

  describe('userHasTab', () => {
    it('should return true if user tabs include specified tab', () => {
      const user = { tabs: ['control', 'mods'] } as AuthUser;
      expect(userHasTab(user, 'control')).toBe(true);
      expect(userHasTab(user, 'mods')).toBe(true);
      expect(userHasTab(user, 'players')).toBe(false);
    });

    it('should return false if user is null or tabs is not an array', () => {
      expect(userHasTab(null, 'control')).toBe(false);
      expect(userHasTab({} as AuthUser, 'control')).toBe(false);
    });
  });

  describe('canEditServerAdminList', () => {
    it('should return false if user is null', () => {
      expect(canEditServerAdminList(null)).toBe(false);
    });

    it('should return true for administrator', () => {
      expect(canEditServerAdminList({ role: 'administrator' } as AuthUser)).toBe(true);
    });

    it('should return true for moderator only if commands tab is permitted', () => {
      expect(
        canEditServerAdminList({ role: 'moderator', tabs: ['control'] } as AuthUser),
      ).toBe(false);
      expect(
        canEditServerAdminList({ role: 'moderator', tabs: ['commands'] } as AuthUser),
      ).toBe(true);
    });
  });

  describe('allowedPanelTabs', () => {
    it('should return only tabs that user has permission for', () => {
      const user = { tabs: ['control', 'mods'] } as AuthUser;
      const tabs = allowedPanelTabs(user);
      const keys = tabs.map((t) => t.key);

      expect(keys).toContain('main'); // perm 'control'
      expect(keys).toContain('saves'); // perm 'control'
      expect(keys).toContain('mods'); // perm 'mods'
      expect(keys).not.toContain('commands'); // perm 'commands'
      expect(keys).not.toContain('monitoring'); // perm 'monitoring'
    });
  });
});
