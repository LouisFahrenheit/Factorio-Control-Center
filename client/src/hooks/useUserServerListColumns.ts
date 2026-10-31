import { useEffect, useState } from 'react';
import {
  readUserServerListColumns,
  setUserServerListColumns,
  DEFAULT_SERVER_LIST_COLUMNS,
  USER_PREFS_CHANGED_EVENT,
  type ServerListColumnKey,
  type ServerListColumnVisibility,
} from '../lib/userPrefs';

export function useUserServerListColumns(): {
  columns: ServerListColumnVisibility;
  setColumn: (key: ServerListColumnKey, visible: boolean) => void;
  resetColumns: () => void;
  selectAllColumns: () => void;
} {
  const [columns, setColumns] = useState<ServerListColumnVisibility>(
    readUserServerListColumns,
  );

  useEffect(() => {
    const sync = () => setColumns(readUserServerListColumns());
    window.addEventListener(USER_PREFS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(USER_PREFS_CHANGED_EVENT, sync);
  }, []);

  const setColumn = (key: ServerListColumnKey, visible: boolean) => {
    const next = { ...columns, [key]: visible };
    setColumns(next);
    setUserServerListColumns(next);
  };

  const resetColumns = () => {
    const next = { ...DEFAULT_SERVER_LIST_COLUMNS };
    setColumns(next);
    setUserServerListColumns(next);
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

  return { columns, setColumn, resetColumns, selectAllColumns };
}
