import { useEffect, useState } from 'react';
import {
  readUserServerListViewMode,
  setUserServerListViewMode,
  USER_PREFS_CHANGED_EVENT,
  type ServerListViewMode,
} from '../lib/userPrefs';

export function useUserServerListViewMode(): [
  ServerListViewMode,
  (mode: ServerListViewMode) => void,
] {
  const [mode, setMode] = useState<ServerListViewMode>(
    readUserServerListViewMode,
  );

  useEffect(() => {
    const sync = () => setMode(readUserServerListViewMode());
    window.addEventListener(USER_PREFS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(USER_PREFS_CHANGED_EVENT, sync);
  }, []);

  const changeMode = (next: ServerListViewMode) => {
    setMode(next);
    setUserServerListViewMode(next);
  };

  return [mode, changeMode];
}
