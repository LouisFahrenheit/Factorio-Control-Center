import { beforeEach, describe, expect, it } from 'vitest';
import {
  readUserServerListViewMode,
  setUserServerListViewMode,
  USER_PREFS_CHANGED_EVENT,
} from './userPrefs';

describe('userPrefs - serverListViewMode', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    const mockStorage: Storage = {
      length: 0,
      clear: () => store.clear(),
      getItem: (key: string) => store.get(key) ?? null,
      key: () => null,
      removeItem: (key: string) => store.delete(key),
      setItem: (key: string, value: string) => {
        store.set(key, String(value));
      },
    };

    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true,
    });
  });

  it('defaults to list view when nothing is in localStorage', () => {
    expect(readUserServerListViewMode()).toBe('list');
  });

  it('saves cards view and dispatches user prefs changed event', () => {
    let eventFired = false;
    const target = new EventTarget();
    Object.defineProperty(globalThis, 'window', {
      value: target,
      writable: true,
      configurable: true,
    });

    target.addEventListener(USER_PREFS_CHANGED_EVENT, () => {
      eventFired = true;
    });

    setUserServerListViewMode('cards');

    expect(readUserServerListViewMode()).toBe('cards');
    expect(eventFired).toBe(true);
  });

  it('saves list view properly', () => {
    setUserServerListViewMode('cards');
    expect(readUserServerListViewMode()).toBe('cards');

    setUserServerListViewMode('list');
    expect(readUserServerListViewMode()).toBe('list');
  });

  it('handles invalid stored value by falling back to list', () => {
    localStorage.setItem('fcc_user_server_list_view_mode', 'invalid_mode');
    expect(readUserServerListViewMode()).toBe('list');
  });
});
