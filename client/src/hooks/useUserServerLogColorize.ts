import { useEffect, useState } from 'react';
import {
  readUserServerLogColorize,
  USER_PREFS_CHANGED_EVENT,
} from '../lib/userPrefs';

export function useUserServerLogColorize(): boolean {
  const [colorize, setColorize] = useState(readUserServerLogColorize);

  useEffect(() => {
    const sync = () => setColorize(readUserServerLogColorize());
    window.addEventListener(USER_PREFS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(USER_PREFS_CHANGED_EVENT, sync);
  }, []);

  return colorize;
}

