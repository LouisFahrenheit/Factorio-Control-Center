export interface JsonFieldChange {
  key: string;
  from: string;
  to: string;
}

const SECRET_KEYS = new Set([
  'token',
  'password',
  'game_password',
  'tls_key_password',
  'global_token',
]);

function summarizeValue(key: string, value: unknown): string {
  const k = String(key || '').toLowerCase();
  if (SECRET_KEYS.has(k)) {
    if (value == null || value === '') return '—';
    return '***';
  }
  if (value == null) return '—';
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

/** Shallow JSON diff with nested objects compared by JSON serialization. */
export function diffJsonObjects(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): JsonFieldChange[] {
  const b = before && typeof before === 'object' ? before : {};
  const a = after && typeof after === 'object' ? after : {};
  const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
  const out: JsonFieldChange[] = [];
  for (const key of keys) {
    const bv = b[key];
    const av = a[key];
    if (JSON.stringify(bv) === JSON.stringify(av)) continue;
    out.push({
      key,
      from: summarizeValue(key, bv),
      to: summarizeValue(key, av),
    });
  }
  return out;
}
