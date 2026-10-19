import { useEffect, useState } from 'react';
import {
  readUserAccessViewMode,
  setUserAccessViewMode,
  USER_PREFS_CHANGED_EVENT,
  type UserAccessViewMode,
} from '../lib/userPrefs';

export function useUserAccessViewMode(): [
  UserAccessViewMode,
  (mode: UserAccessViewMode) => void,
] {
  const [mode, setMode] = useState<UserAccessViewMode>(readUserAccessViewMode);

  useEffect(() => {
    const sync = () => setMode(readUserAccessViewMode());
    window.addEventListener(USER_PREFS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(USER_PREFS_CHANGED_EVENT, sync);
  }, []);

  const changeMode = (next: UserAccessViewMode) => {
    setMode(next);
    setUserAccessViewMode(next);
  };

  return [mode, changeMode];
}
