import { useEffect, useState } from 'react';
import {
  readUserWebDisableEffects,
  USER_PREFS_CHANGED_EVENT,
} from '../lib/userPrefs';

export function useUserWebDisableEffects(): boolean {
  const [disabled, setDisabled] = useState(readUserWebDisableEffects);

  useEffect(() => {
    const sync = () => setDisabled(readUserWebDisableEffects());
    window.addEventListener(USER_PREFS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(USER_PREFS_CHANGED_EVENT, sync);
  }, []);

  return disabled;
}
