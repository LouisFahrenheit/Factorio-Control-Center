import { useEffect, useState } from 'react';
import {
  readUserShowServerListSpaceAgeBadge,
  USER_PREFS_CHANGED_EVENT,
} from '../lib/userPrefs';

export function useUserShowServerListSpaceAgeBadge(): boolean {
  const [show, setShow] = useState(readUserShowServerListSpaceAgeBadge);

  useEffect(() => {
    const sync = () => setShow(readUserShowServerListSpaceAgeBadge());
    window.addEventListener(USER_PREFS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(USER_PREFS_CHANGED_EVENT, sync);
  }, []);

  return show;
}
