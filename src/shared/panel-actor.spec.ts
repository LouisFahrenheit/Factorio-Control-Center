import { stripPanelActorPrefix, panelActorLogLabel } from './panel-actor';

describe('panel-actor utils', () => {
  describe('stripPanelActorPrefix', () => {
    it('returns empty string for falsy/empty values', () => {
      expect(stripPanelActorPrefix(undefined)).toBe('');
      expect(stripPanelActorPrefix('')).toBe('');
      expect(stripPanelActorPrefix('   ')).toBe('');
    });

    it('strips "User:" prefix case-insensitively', () => {
      expect(stripPanelActorPrefix('User: Alice')).toBe('Alice');
      expect(stripPanelActorPrefix('user:Bob')).toBe('Bob');
      expect(stripPanelActorPrefix('USER:  Charlie ')).toBe('Charlie');
    });

    it('strips "System:" prefix case-insensitively', () => {
      expect(stripPanelActorPrefix('System: BackupWorker')).toBe(
        'BackupWorker',
      );
      expect(stripPanelActorPrefix('system: cron')).toBe('cron');
      expect(stripPanelActorPrefix('SYSTEM:maintenance')).toBe('maintenance');
    });

    it('keeps raw string if no matching prefix', () => {
      expect(stripPanelActorPrefix('Admin: Alice')).toBe('Admin: Alice');
      expect(stripPanelActorPrefix('Alice')).toBe('Alice');
    });
  });

  describe('panelActorLogLabel', () => {
    it('returns fallback when actor is empty or undefined', () => {
      expect(panelActorLogLabel(undefined)).toBe('system');
      expect(panelActorLogLabel('', 'default-fallback')).toBe(
        'default-fallback',
      );
    });

    it('returns "API" when actor name is api-token', () => {
      expect(panelActorLogLabel('api-token')).toBe('API');
      expect(panelActorLogLabel('User: api-token')).toBe('API');
    });

    it('returns stripped name for regular users', () => {
      expect(panelActorLogLabel('User: Alice')).toBe('Alice');
      expect(panelActorLogLabel('System: Updater')).toBe('Updater');
      expect(panelActorLogLabel('Bob')).toBe('Bob');
    });
  });
});
