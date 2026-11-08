import { useEffect, useState } from 'react';
import {
  readUserCircuitWireEnabled,
  USER_PREFS_CHANGED_EVENT,
} from '../lib/userPrefs';

export function useUserCircuitWireEnabled(): boolean {
  const [enabled, setEnabled] = useState(readUserCircuitWireEnabled);

  useEffect(() => {
    const sync = () => setEnabled(readUserCircuitWireEnabled());
    window.addEventListener(USER_PREFS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(USER_PREFS_CHANGED_EVENT, sync);
  }, []);

  return enabled;
}

