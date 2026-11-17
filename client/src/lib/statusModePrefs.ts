import { dispatchUserPrefsChanged } from './userPrefs';

/** `column` = text column, `dot` = indicator dot next to the row title, `off` = hidden. */
export type StatusMode = 'column' | 'dot' | 'off';

export const STATUS_MODES: readonly StatusMode[] = ['column', 'dot', 'off'];

export interface StatusModePrefs {
  defaultMode: StatusMode;
  read: () => StatusMode;
  set: (mode: StatusMode) => void;
}

/** Per-user choice of how a table shows its status; persisted in localStorage. */
export function createStatusModePrefs(
  storageKey: string,
  defaultMode: StatusMode = 'column',
): StatusModePrefs {
  return {
    defaultMode,
    read: () => {
      try {
        if (typeof localStorage === 'undefined') return defaultMode;
        const raw = localStorage.getItem(storageKey);
        return STATUS_MODES.find((m) => m === raw) ?? defaultMode;
      } catch {
        return defaultMode;
      }
    },
    set: (mode) => {
      try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(storageKey, mode);
        dispatchUserPrefsChanged();
      } catch {
        /* ignore */
      }
    },
  };
}

