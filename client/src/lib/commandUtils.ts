export interface CommandRow {
  category_key: string;
  category_name: string;
  id: string;
  name: string;
  description: string;
  raw: Record<string, unknown>;
}

export interface CommandGroup {
  categoryKey: string;
  categoryName: string;
  items: CommandRow[];
}

function extractCatalogPayload(raw: unknown): {
  categories?: Record<string, { name?: string; commands?: unknown[] }>;
} {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const obj = raw as Record<string, unknown>;
  const nested = obj.data;
  if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
    const inner = nested as Record<string, unknown>;
    if (inner.categories && typeof inner.categories === 'object' && !Array.isArray(inner.categories)) {
      return inner as { categories?: Record<string, { name?: string; commands?: unknown[] }> };
    }
  }
  if (obj.categories && typeof obj.categories === 'object' && !Array.isArray(obj.categories)) {
    return obj as { categories?: Record<string, { name?: string; commands?: unknown[] }> };
  }
  return {};
}

export function flattenCommands(raw: unknown): CommandRow[] {
  const catalog = extractCatalogPayload(raw);
  const rows: CommandRow[] = [];
  const categories = catalog?.categories || {};
  Object.keys(categories).forEach((catKey) => {
    const cat = categories[catKey] || {};
    const catName = String(cat.name || catKey);
    const commands = Array.isArray(cat.commands) ? cat.commands : [];
    commands.forEach((cmd, idx) => {
      if (!cmd || typeof cmd !== 'object') return;
      const c = cmd as Record<string, unknown>;
      rows.push({
        category_key: catKey,
        category_name: catName,
        id: String(c.id || catKey + '_' + idx),
        name: String(c.name || c.id || ''),
        description: String(c.description || ''),
        raw: c,
      });
    });
  });
  return rows;
}

/** Preserves category and command order from the catalog rows. */
export function groupCommandsByCategory(rows: CommandRow[]): CommandGroup[] {
  const groups: CommandGroup[] = [];
  const indexByKey = new Map<string, number>();

  rows.forEach((row) => {
    const existingIndex = indexByKey.get(row.category_key);
    if (existingIndex === undefined) {
      indexByKey.set(row.category_key, groups.length);
      groups.push({
        categoryKey: row.category_key,
        categoryName: row.category_name || row.category_key,
        items: [row],
      });
      return;
    }
    groups[existingIndex].items.push(row);
  });

  return groups;
}

export function buildCommandText(
  row: CommandRow | null,
  params: Record<string, string>,
): string {
  if (!row) return '';
  const cmd = row.raw || {};
  let text = String(cmd.command || '');
  Object.entries(params).forEach(([token, val]) => {
    text = text.split('{' + token + '}').join(String(val ?? ''));
  });
  return text;
}

export function defaultCommandParams(row: CommandRow | null, onlinePlayers: string[]): Record<string, string> {
  if (!row) return {};
  const cmd = row.raw;
  const out: Record<string, string> = {};
  if (cmd.has_player) out.player = onlinePlayers[0] || '';
  if (cmd.has_boolean) {
    out.value = String(cmd.default_value || 'true').toLowerCase() === 'false' ? 'false' : 'true';
  } else if (cmd.has_value) {
    out.value = String(cmd.default_value || '');
  }
  if (cmd.has_item) {
    const items = cmd.items && typeof cmd.items === 'object' ? Object.keys(cmd.items as object) : [];
    const first = items[0] || '';
    out.item = first;
    if (cmd.has_count && first && (cmd.items as Record<string, unknown>)[first] != null) {
      out.count = String((cmd.items as Record<string, unknown>)[first]);
    }
  }
  if (cmd.has_count && !out.count) out.count = '1';
  if (cmd.has_quality) {
    out.quality = String(cmd.default_quality || cmd.default_value || 'normal');
  }
  return out;
}
