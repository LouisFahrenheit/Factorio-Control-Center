import { useEffect, useState } from 'react';
import {
  readUserMaintenanceViewMode,
  setUserMaintenanceViewMode,
  USER_PREFS_CHANGED_EVENT,
  type MaintenanceViewMode,
} from '../lib/userPrefs';

export function useUserMaintenanceViewMode(): [
  MaintenanceViewMode,
  (mode: MaintenanceViewMode) => void,
] {
  const [mode, setMode] = useState<MaintenanceViewMode>(
    readUserMaintenanceViewMode,
  );

  useEffect(() => {
    const sync = () => setMode(readUserMaintenanceViewMode());
    window.addEventListener(USER_PREFS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(USER_PREFS_CHANGED_EVENT, sync);
  }, []);

  const changeMode = (next: MaintenanceViewMode) => {
    setMode(next);
    setUserMaintenanceViewMode(next);
  };

  return [mode, changeMode];
}
