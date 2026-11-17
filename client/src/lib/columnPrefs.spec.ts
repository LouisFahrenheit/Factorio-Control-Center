import { beforeEach, describe, expect, it } from 'vitest';
import { createColumnPrefs } from './columnPrefs';
import {
  DEFAULT_BACKUP_COLUMNS,
  DEFAULT_BACKUP_COLUMN_ORDER,
  backupColumnPrefs,
} from './backupColumnPrefs';
import {
  DEFAULT_MAINTENANCE_COLUMNS,
  DEFAULT_MAINTENANCE_COLUMN_ORDER,
  maintenanceColumnPrefs,
  maintenanceStatusPrefs,
} from './maintenanceColumnPrefs';
import {
  DEFAULT_USER_ACCESS_COLUMNS,
  DEFAULT_USER_ACCESS_COLUMN_ORDER,
  userAccessColumnPrefs,
  userAccessStatusPrefs,
} from './userAccessColumnPrefs';
import {
  DEFAULT_SERVER_LIST_COLUMNS,
  DEFAULT_SERVER_LIST_COLUMN_ORDER,
  serverListColumnPrefs,
} from './serverListColumnPrefs';
import {
  DEFAULT_PUBLIC_COLUMNS,
  DEFAULT_PUBLIC_COLUMN_ORDER,
  publicColumnPrefs,
} from './publicColumnPrefs';

describe('createColumnPrefs', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        length: 0,
        clear: () => store.clear(),
        getItem: (k: string) => store.get(k) ?? null,
        key: () => null,
        removeItem: (k: string) => store.delete(k),
        setItem: (k: string, v: string) => {
          store.set(k, String(v));
        },
      } satisfies Storage,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(globalThis, 'window', {
      value: new EventTarget(),
      writable: true,
      configurable: true,
    });
  });

  it('returns defaults when nothing is stored', () => {
    expect(publicColumnPrefs.readColumns()).toEqual(DEFAULT_PUBLIC_COLUMNS);
    expect(publicColumnPrefs.readOrder()).toEqual([
      ...DEFAULT_PUBLIC_COLUMN_ORDER,
    ]);
  });

  it('keeps live metric columns that are not enabled by default hidden', () => {
    const cols = publicColumnPrefs.readColumns();
    expect(cols.online).toBe(true);
    expect(cols.version).toBe(true);
    expect(cols.mods).toBe(false);
    expect(cols.uptime).toBe(false);
  });

  it('saves visibility and ignores non-boolean stored values', () => {
    publicColumnPrefs.setColumns({ ...DEFAULT_PUBLIC_COLUMNS, mods: true });
    expect(publicColumnPrefs.readColumns().mods).toBe(true);

    store.set(
      'fcc_user_public_columns',
      JSON.stringify({ status: 'x', mods: true }),
    );
    const cols = publicColumnPrefs.readColumns();
    expect(cols.status).toBe(true);
    expect(cols.mods).toBe(true);
  });

  it('normalizes order: drops unknown/duplicates and appends missing keys', () => {
    publicColumnPrefs.setOrder([
      'description',
      'bogus' as never,
      'description',
      'status',
    ]);
    const order = publicColumnPrefs.readOrder();
    expect(order.slice(0, 2)).toEqual(['description', 'status']);
    expect([...order].sort()).toEqual([...DEFAULT_PUBLIC_COLUMN_ORDER].sort());
  });

  it('falls back to defaults on invalid JSON', () => {
    store.set('fcc_user_public_columns', '{nope');
    store.set('fcc_user_public_column_order', '{nope');
    expect(publicColumnPrefs.readColumns()).toEqual(DEFAULT_PUBLIC_COLUMNS);
    expect(publicColumnPrefs.readOrder()).toEqual([
      ...DEFAULT_PUBLIC_COLUMN_ORDER,
    ]);
  });

  it('works for any key set', () => {
    const prefs = createColumnPrefs<'a' | 'b'>({
      columnsKey: 'k_cols',
      orderKey: 'k_order',
      defaults: { a: true, b: false },
      defaultOrder: ['a', 'b'],
    });
    prefs.setOrder(['b']);
    expect(prefs.readOrder()).toEqual(['b', 'a']);
  });

  it('shows every backup column by default, age included', () => {
    expect(backupColumnPrefs.readColumns()).toEqual(DEFAULT_BACKUP_COLUMNS);
    expect(backupColumnPrefs.readColumns().age).toBe(true);
    expect(backupColumnPrefs.readOrder()).toEqual([
      ...DEFAULT_BACKUP_COLUMN_ORDER,
    ]);
  });

  it('keeps backup prefs independent from other tables', () => {
    backupColumnPrefs.setColumns({ ...DEFAULT_BACKUP_COLUMNS, age: false });
    expect(backupColumnPrefs.readColumns().age).toBe(false);
    expect(userAccessColumnPrefs.readColumns()).toEqual(
      DEFAULT_USER_ACCESS_COLUMNS,
    );
    expect(publicColumnPrefs.readColumns()).toEqual(DEFAULT_PUBLIC_COLUMNS);
  });

  it('shows every user table column by default and normalizes stored order', () => {
    expect(userAccessColumnPrefs.readColumns()).toEqual(
      DEFAULT_USER_ACCESS_COLUMNS,
    );
    userAccessColumnPrefs.setOrder(['created', 'bogus' as never, 'role']);
    const order = userAccessColumnPrefs.readOrder();
    expect(order.slice(0, 2)).toEqual(['created', 'role']);
    expect([...order].sort()).toEqual(
      [...DEFAULT_USER_ACCESS_COLUMN_ORDER].sort(),
    );
  });

  it('keeps server list prefs under their original storage keys', () => {
    store.set(
      'fcc_user_server_list_columns',
      JSON.stringify({ port: 'not-a-boolean', mods: false }),
    );
    const cols = serverListColumnPrefs.readColumns();
    expect(cols.port).toBe(true);
    expect(cols.mods).toBe(false);

    store.set(
      'fcc_user_server_list_column_order',
      JSON.stringify(['status', 'bogus', 'status', 42, 'port']),
    );
    const order = serverListColumnPrefs.readOrder();
    expect(order.slice(0, 2)).toEqual(['status', 'port']);
    expect([...order].sort()).toEqual(
      [...DEFAULT_SERVER_LIST_COLUMN_ORDER].sort(),
    );
  });

  it('shows every server list column by default and survives invalid JSON', () => {
    expect(serverListColumnPrefs.readColumns()).toEqual(
      DEFAULT_SERVER_LIST_COLUMNS,
    );
    expect(serverListColumnPrefs.readOrder()).toEqual([
      ...DEFAULT_SERVER_LIST_COLUMN_ORDER,
    ]);
    store.set('fcc_user_server_list_columns', 'not valid json');
    store.set('fcc_user_server_list_column_order', '{not json');
    expect(serverListColumnPrefs.readColumns()).toEqual(
      DEFAULT_SERVER_LIST_COLUMNS,
    );
    expect(serverListColumnPrefs.readOrder()).toEqual([
      ...DEFAULT_SERVER_LIST_COLUMN_ORDER,
    ]);
  });

  it('dispatches the user prefs changed event when saving', () => {
    let fired = 0;
    (globalThis.window as EventTarget).addEventListener(
      'fcc-user-prefs-changed',
      () => {
        fired += 1;
      },
    );
    serverListColumnPrefs.setColumns({
      ...DEFAULT_SERVER_LIST_COLUMNS,
      port: false,
    });
    serverListColumnPrefs.setOrder(
      [...DEFAULT_SERVER_LIST_COLUMN_ORDER].reverse(),
    );
    expect(fired).toBe(2);
  });

  it('shows the status as a dot by default in maintenance and keeps timezone hidden', () => {
    const cols = maintenanceColumnPrefs.readColumns();
    expect(cols).toEqual(DEFAULT_MAINTENANCE_COLUMNS);
    expect(cols.timezone).toBe(false);
    expect(maintenanceColumnPrefs.readOrder()).toEqual([
      ...DEFAULT_MAINTENANCE_COLUMN_ORDER,
    ]);
    expect(maintenanceStatusPrefs.read()).toBe('dot');
  });

  it('defaults the users table status to a column', () => {
    expect(userAccessStatusPrefs.read()).toBe('column');
  });

  it('saves the status mode per table and rejects unknown stored values', () => {
    maintenanceStatusPrefs.set('off');
    expect(maintenanceStatusPrefs.read()).toBe('off');
    expect(userAccessStatusPrefs.read()).toBe('column');

    store.set('fcc_user_access_status_mode', 'bogus');
    expect(userAccessStatusPrefs.read()).toBe('column');
    store.set('fcc_user_maintenance_status_mode', 'bogus');
    expect(maintenanceStatusPrefs.read()).toBe('dot');
  });
});
