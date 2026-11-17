import { useEffect, useState } from 'react';
import type { ColumnPrefs } from '../lib/columnPrefs';
import type { StatusMode, StatusModePrefs } from '../lib/statusModePrefs';
import { USER_PREFS_CHANGED_EVENT } from '../lib/userPrefs';

/**
 * React state for a `createColumnPrefs` store, kept in sync across the app.
 * Pass `statusPrefs` for tables whose status can be a column, a dot, or hidden.
 */
export function useColumnPrefs<K extends string>(
  prefs: ColumnPrefs<K>,
  statusPrefs?: StatusModePrefs,
) {
  const [columns, setColumnsState] = useState<Record<K, boolean>>(
    prefs.readColumns,
  );
  const [order, setOrderState] = useState<K[]>(prefs.readOrder);
  const [statusMode, setStatusModeState] = useState<StatusMode>(
    () => statusPrefs?.read() ?? 'column',
  );

  useEffect(() => {
    const sync = () => {
      setColumnsState(prefs.readColumns());
      setOrderState(prefs.readOrder());
      if (statusPrefs) setStatusModeState(statusPrefs.read());
    };
    window.addEventListener(USER_PREFS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(USER_PREFS_CHANGED_EVENT, sync);
  }, [prefs, statusPrefs]);

  const setColumn = (key: K, visible: boolean) => {
    const next = { ...columns, [key]: visible };
    setColumnsState(next);
    prefs.setColumns(next);
  };

  const setStatusMode = (mode: StatusMode) => {
    setStatusModeState(mode);
    statusPrefs?.set(mode);
  };

  const moveColumn = (key: K, direction: 'up' | 'down') => {
    const index = order.indexOf(key);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= order.length) return;
    const next = [...order];
    next[index] = order[target];
    next[target] = key;
    setOrderState(next);
    prefs.setOrder(next);
  };

  const resetColumns = () => {
    const next = { ...prefs.defaults };
    const nextOrder = [...prefs.defaultOrder];
    setColumnsState(next);
    setOrderState(nextOrder);
    prefs.setColumns(next);
    prefs.setOrder(nextOrder);
    if (statusPrefs) setStatusMode(statusPrefs.defaultMode);
  };

  return {
    columns,
    order,
    statusMode,
    setColumn,
    setStatusMode,
    moveColumn,
    resetColumns,
  };
}
