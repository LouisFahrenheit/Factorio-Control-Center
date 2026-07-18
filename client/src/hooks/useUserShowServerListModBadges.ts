import { useEffect, useState } from 'react';
import {
  readUserShowServerListModBadges,
  USER_PREFS_CHANGED_EVENT,
} from '../lib/userPrefs';

export function useUserShowServerListModBadges(): boolean {
  const [show, setShow] = useState(readUserShowServerListModBadges);

  useEffect(() => {
    const sync = () => setShow(readUserShowServerListModBadges());
    window.addEventListener(USER_PREFS_CHANGED_EVENT, sync);
    return () => window.removeEventListener(USER_PREFS_CHANGED_EVENT, sync);
  }, []);

  return show;
}
