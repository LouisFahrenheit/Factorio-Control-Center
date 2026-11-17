import { dispatchUserPrefsChanged } from './userPrefs';

export interface ColumnPrefs<K extends string> {
  defaults: Record<K, boolean>;
  defaultOrder: readonly K[];
  readColumns: () => Record<K, boolean>;
  setColumns: (cols: Record<K, boolean>) => void;
  readOrder: () => K[];
  setOrder: (order: readonly K[]) => void;
}

/** Per-user column visibility + order persisted in localStorage. */
export function createColumnPrefs<K extends string>(opts: {
  columnsKey: string;
  orderKey: string;
  defaults: Record<K, boolean>;
  defaultOrder: readonly K[];
}): ColumnPrefs<K> {
  const { columnsKey, orderKey, defaults, defaultOrder } = opts;

  /** Drops unknown/duplicate keys and appends columns missing from the stored order. */
  const normalizeOrder = (value: unknown): K[] => {
    const valid = new Set<string>(defaultOrder);
    const result: K[] = [];
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string' && valid.has(item)) {
          const key = item as K;
          if (!result.includes(key)) result.push(key);
        }
      }
    }
    for (const key of defaultOrder) {
      if (!result.includes(key)) result.push(key);
    }
    return result;
  };

  const readColumns = (): Record<K, boolean> => {
    try {
      if (typeof localStorage === 'undefined') return { ...defaults };
      const raw = localStorage.getItem(columnsKey);
      if (!raw) return { ...defaults };
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      if (typeof parsed !== 'object' || parsed === null) return { ...defaults };
      const result = { ...defaults };
      for (const key of defaultOrder) {
        const value = parsed[key];
        if (typeof value === 'boolean') result[key] = value;
      }
      return result;
    } catch {
      return { ...defaults };
    }
  };

  const readOrder = (): K[] => {
    try {
      if (typeof localStorage === 'undefined') return [...defaultOrder];
      const raw = localStorage.getItem(orderKey);
      if (!raw) return [...defaultOrder];
      return normalizeOrder(JSON.parse(raw) as unknown);
    } catch {
      return [...defaultOrder];
    }
  };

  return {
    defaults,
    defaultOrder,
    readColumns,
    readOrder,
    setColumns: (cols) => {
      try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(columnsKey, JSON.stringify(cols));
        dispatchUserPrefsChanged();
      } catch {
        /* ignore */
      }
    },
    setOrder: (order) => {
      try {
        if (typeof localStorage === 'undefined') return;
        localStorage.setItem(orderKey, JSON.stringify(normalizeOrder(order)));
        dispatchUserPrefsChanged();
      } catch {
        /* ignore */
      }
    },
  };
}

