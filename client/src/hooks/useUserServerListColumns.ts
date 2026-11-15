import { useEffect, useState } from 'react';
import {
  readUserServerListColumns,
  setUserServerListColumns,
  readUserServerListColumnOrder,
  setUserServerListColumnOrder,
  DEFAULT_SERVER_LIST_COLUMNS,
  DEFAULT_SERVER_LIST_COLUMN_ORDER,
  USER_PREFS_CHANGED_EVENT,
  type ServerListColumnKey,
  type ServerListColumnVisibility,
} from '../lib/userPrefs';

export function useUserServerListColumns(): {
  columns: ServerListColumnVisibility;
  order: ServerListColumnKey[];
  setColumn: (key: ServerListColumnKey, visible: boolean) => void;
  moveColumn: (key: ServerListColumnKey, direction: 'up' | 'down') => void;
  resetColumns: () => void;
  selectAllColumns: () => void;
} {
  const [columns, setColumns] = useState<ServerListColumnVisibility>(
    readUserServerListColumns,
  );
  const [order, setOrder] = useState<ServerListColumnKey[]>(
    readUserServerListColumnOrder,
  );

  useEffect(() => {
    const sync = () => {
      setColumns(readUserServerListColumns());
      setOrder(readUserServerListColumnOrder());
    };
    window.addEventListener(USER_PREFS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(USER_PREFS_CHANGED_EVENT, sync);
  }, []);

  const setColumn = (key: ServerListColumnKey, visible: boolean) => {
    const next = { ...columns, [key]: visible };
    setColumns(next);
    setUserServerListColumns(next);
  };

  const moveColumn = (key: ServerListColumnKey, direction: 'up' | 'down') => {
    const index = order.indexOf(key);
    const target = direction === 'up' ? index - 1 : index + 1;
    if (index < 0 || target < 0 || target >= order.length) return;
    const next = [...order];
    next[index] = order[target];
    next[target] = key;
    setOrder(next);
    setUserServerListColumnOrder(next);
  };

  const resetColumns = () => {
    const next = { ...DEFAULT_SERVER_LIST_COLUMNS };
    const nextOrder = [...DEFAULT_SERVER_LIST_COLUMN_ORDER];
    setColumns(next);
    setOrder(nextOrder);
    setUserServerListColumns(next);
    setUserServerListColumnOrder(nextOrder);
  };

  const selectAllColumns = () => {
    const next: ServerListColumnVisibility = {
      save: true,
      access: true,
      port: true,
      rconPort: true,
      version: true,
      mods: true,
      online: true,
      uptime: true,
      status: true,
    };
    setColumns(next);
    setUserServerListColumns(next);
  };

  return {
    columns,
    order,
    setColumn,
    moveColumn,
    resetColumns,
    selectAllColumns,
  };
}
