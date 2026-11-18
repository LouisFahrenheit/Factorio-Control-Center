import { useEffect, useState } from 'react';
import {
  readUserInterfaceHintsEnabled,
  USER_PREFS_CHANGED_EVENT,
} from '../lib/userPrefs';

export function useUserInterfaceHintsEnabled(): boolean {
  const [enabled, setEnabled] = useState(readUserInterfaceHintsEnabled);

  useEffect(() => {
    const sync = () => setEnabled(readUserInterfaceHintsEnabled());
    window.addEventListener(USER_PREFS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(USER_PREFS_CHANGED_EVENT, sync);
  }, []);

  return enabled;
}

